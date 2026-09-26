// functions/hebrewArticles.js
// Hebrew article crawler and generator for TrendingTech Daily

const fetch = require('node-fetch');
const { logger, db } = require('./config');
const aiCallables = require('./callable/ai');
const admin = require('firebase-admin');
const twitterService = require('./services/twitterService');
const mediaRelevance = require('./services/mediaRelevanceService');
const { loadGeminiSDK, getGeminiSDK, getSafetySettings, buildGenerateContentRequest } = require('./utils');
const contentStrategy = require('./services/contentStrategy');

// ── Topic deduplication helpers ────────────────────────────────────────────────

const _DEDUP_STOP_WORDS = new Set([
  // English
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was',
  'has', 'have', 'had', 'will', 'can', 'how', 'why', 'what', 'when',
  'new', 'not', 'its', 'into', 'also', 'about', 'more', 'says', 'said',
  // Hebrew particles
  'את', 'של', 'על', 'עם', 'אל', 'כי', 'לא', 'כל', 'יש', 'אם', 'גם',
  'זה', 'כך', 'עוד', 'כבר', 'היה', 'הוא', 'היא', 'הם', 'הן', 'הכי',
]);

/**
 * Extracts 4-5 meaningful keywords from a title for topic deduplication.
 */
function extractTopicKeywords(title) {
  return (title || '')
    .toLowerCase()
    .split(/[\s\-–—:,;!?()[\]/|"']+/)
    .filter(w => w.length >= 4 && !_DEDUP_STOP_WORDS.has(w) && /[\u0590-\u05FFa-z0-9]/.test(w))
    .slice(0, 5);
}

/**
 * Returns true if two keyword arrays share at least 2 words (same topic).
 */
function topicsOverlap(kws1, kws2) {
  const s1 = new Set(kws1);
  let shared = 0;
  for (const w of kws2) {
    if (s1.has(w) && ++shared >= 2) return true;
  }
  return false;
}

// Hebrew tech RSS sources
const HE_RSS_SOURCES = [
  { url: 'https://www.geektime.co.il/feed/', name: 'Geektime', lang: 'he' },
  { url: 'https://www.calcalistech.com/rss/', name: 'Calcalist Tech', lang: 'he' },
  { url: 'https://rss.walla.co.il/feed/22', name: 'Walla Tech', lang: 'he' },
  { url: 'https://www.ynet.co.il/Integration/StoryRss3048.xml', name: 'Ynet Tech', lang: 'he' },
  { url: 'https://www.themarker.com/srv/rss-feeds/main-feed', name: 'TheMarker', lang: 'he' },
  { url: 'https://rss.mako.co.il/rss/internet.xml', name: 'Mako Tech', lang: 'he' },
  { url: 'https://www.globes.co.il/rss/rss.aspx?cat=1', name: 'Globes', lang: 'he' },
  { url: 'https://www.techtime.co.il/feed/', name: 'TechTime', lang: 'he' },
];

// English tech RSS sources — fed into the same clustering + corroboration
// pipeline so the Hebrew site can also translate/synthesize global tech news.
// Mixed EN+HE clusters are valid: a cluster of "TechCrunch + The Verge + Geektime"
// counts as 3 distinct sources just like an all-Hebrew cluster does.
const EN_RSS_SOURCES = [
  { url: 'https://techcrunch.com/feed/', name: 'TechCrunch', lang: 'en' },
  { url: 'https://www.theverge.com/rss/index.xml', name: 'The Verge', lang: 'en' },
  { url: 'https://www.wired.com/feed/rss', name: 'Wired', lang: 'en' },
  { url: 'https://arstechnica.com/feed/', name: 'Ars Technica', lang: 'en' },
  { url: 'https://www.engadget.com/rss.xml', name: 'Engadget', lang: 'en' },
  { url: 'https://feeds.feedburner.com/venturebeat/SZYF', name: 'VentureBeat', lang: 'en' },
  { url: 'https://www.zdnet.com/news/rss.xml', name: 'ZDNet', lang: 'en' },
  { url: 'https://www.bleepingcomputer.com/feed/', name: 'Bleeping Computer', lang: 'en' },
  { url: 'https://www.androidpolice.com/feed/', name: 'Android Police', lang: 'en' },
  { url: 'https://9to5mac.com/feed/', name: '9to5Mac', lang: 'en' },
];

const ALL_RSS_SOURCES = [
  ...HE_RSS_SOURCES,
  ...EN_RSS_SOURCES,
  // Content strategy: additional AI-coding focused sources
  ...contentStrategy.getAdditionalRssSources(),
];

// Default Hebrew sections used if seedHebrewSections hasn't run yet
const HE_DEFAULT_SECTIONS = [
  { name: 'בינה מלאכותית', slug: 'ai', active: true, order: 1 },
  { name: 'טכנולוגיה', slug: 'technology', active: true, order: 2 },
  { name: 'סטארטאפים', slug: 'startups', active: true, order: 3 },
  { name: 'גאדג\'טים', slug: 'gadgets', active: true, order: 4 },
  { name: 'אבטחה', slug: 'security', active: true, order: 5 },
  { name: 'קריפטו', slug: 'crypto', active: true, order: 6 },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function estimateReadingTime(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 225));
}

function createSlug(text) {
  if (!text) return 'article-' + Date.now();
  return text
    .toLowerCase()
    .replace(/[^\w\u0590-\u05FF\s-]/g, '')  // preserve Hebrew characters
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')  // trim leading/trailing hyphens
    .substring(0, 80) || 'article-' + Date.now();
}

/**
 * Parse RSS/Atom XML and extract items
 */
function parseRssItems(xml, sourceName, limit = 8) {
  const items = [];
  const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch =
      block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
      block.match(/<link[^>]*>(https?:\/\/[^<]+)<\/link>/i);
    const descMatch = block.match(
      /<(?:description|summary)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary)>/i
    );

    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
    const url = linkMatch ? linkMatch[1].trim() : '';
    const desc = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').slice(0, 200).trim() : '';

    if (title && url && title.length > 5) {
      items.push({ title, url, description: desc, source: sourceName });
    }
  }
  return items;
}

// ── Seed Hebrew Sections ───────────────────────────────────────────────────────

/**
 * Creates he_sections documents if the collection is empty.
 */
async function seedHebrewSections() {
  try {
    const snapshot = await db.collection('he_sections').limit(1).get();
    if (!snapshot.empty) {
      logger.info('he_sections already seeded, skipping.');
      return;
    }

    logger.info('Seeding he_sections collection...');
    const batch = db.batch();
    HE_DEFAULT_SECTIONS.forEach(section => {
      const docRef = db.collection('he_sections').doc();
      batch.set(docRef, {
        ...section,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
    logger.info('he_sections seeded successfully.');
  } catch (err) {
    logger.error('seedHebrewSections failed:', err);
    throw err;
  }
}

// ── Build Category Map ─────────────────────────────────────────────────────────

async function buildHeCategoryMap() {
  const snapshot = await db.collection('he_sections').where('active', '==', true).get();
  const categoryMap = {};

  if (snapshot.empty) {
    logger.warn('No active he_sections found; using default category map.');
    // Use a generic fallback — article will be assigned to first available section
    return categoryMap;
  }

  snapshot.forEach(doc => {
    const data = doc.data();
    categoryMap[data.slug] = doc.id;
  });

  return categoryMap;
}

/**
 * Determine the best category ID for a given article title.
 * Uses keyword matching similar to the English scheduler.
 */
function assignHeCategory(title, categoryMap) {
  const t = (title || '').toLowerCase();

  // Hebrew and English keyword mapping
  const patterns = [
    { keywords: ['ai', 'artificial intelligence', 'machine learning', 'llm', 'gpt', 'בינה מלאכותית', 'למידת מכונה', 'צ\'אט', 'גנרטיבי'], slug: 'ai' },
    { keywords: ['startup', 'funding', 'venture', 'vc', 'סטארטאפ', 'השקעה', 'מיזם', 'גיוס'], slug: 'startups' },
    { keywords: ['crypto', 'bitcoin', 'blockchain', 'ethereum', 'defi', 'קריפטו', 'ביטקוין', 'בלוקצ\'יין'], slug: 'crypto' },
    { keywords: ['security', 'hack', 'breach', 'malware', 'cyber', 'אבטחה', 'סייבר', 'פריצה', 'נוזקה'], slug: 'security' },
    { keywords: ['gadget', 'device', 'phone', 'laptop', 'iphone', 'גאדג\'ט', 'מכשיר', 'טלפון', 'מחשב'], slug: 'gadgets' },
  ];

  for (const pattern of patterns) {
    if (pattern.keywords.some(kw => t.includes(kw))) {
      const catId = categoryMap[pattern.slug];
      if (catId) return catId;
    }
  }

  // Default to 'technology'
  return categoryMap['technology'] || Object.values(categoryMap)[0] || null;
}

// ── Multi-source clustering & corroboration ───────────────────────────────────

/**
 * Group RSS items into topic clusters. Two items belong together if their
 * extracted keyword sets share ≥2 meaningful words. Clusters expand by union
 * so a third item just needs to overlap with the growing cluster keyword set.
 *
 * Limitation: works only within a language — Hebrew and English titles share
 * no tokens. Used as the fallback path when the Gemini-based cluster call fails.
 */
function clusterByTopic(items) {
  const clusters = [];
  for (const item of items) {
    const kws = extractTopicKeywords(item.title);
    if (kws.length < 2) continue;
    let placed = false;
    for (const cluster of clusters) {
      const shared = kws.filter(k => cluster.keywords.includes(k)).length;
      if (shared >= 2) {
        cluster.items.push(item);
        for (const k of kws) if (!cluster.keywords.includes(k)) cluster.keywords.push(k);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ keywords: [...kws], items: [item] });
  }
  return clusters;
}

/**
 * Use Gemini to cluster RSS items across languages. The model receives the
 * full list of EN+HE titles and groups items reporting on the same news event,
 * regardless of language. This is what lets a TechCrunch story and a Geektime
 * story about the same OpenAI announcement actually merge into one cluster.
 *
 * Returns: [{ items: [item, ...], keywords: [string, ...] }, ...]
 * On failure, callers should fall back to clusterByTopic().
 */
async function clusterByGemini(genAI, items) {
  if (!items.length) return [];

  // Number every item so the model can reference them by index.
  const lines = items.map((it, i) =>
    `[${i}] (${it.source}, ${it.lang}) ${it.title}${it.description ? ' — ' + it.description.slice(0, 160) : ''}`
  ).join('\n');

  const prompt = `You are a news editor grouping headlines that report on the SAME specific news event. Headlines may be in English or Hebrew — translate mentally and group across languages.

Headlines:
${lines}

Return ONLY a JSON object of this shape:
{
  "clusters": [
    { "indexes": [0, 5, 12], "topic": "short English topic phrase" },
    { "indexes": [3, 9],     "topic": "..." }
  ]
}

Rules:
- Group by SAME event/announcement/incident, not just same general topic ("Apple news" is too broad — but "Apple announces M5 chip" is a valid cluster).
- Only include clusters with 2 or more indexes. Drop singletons.
- Each index appears in at most one cluster.
- BE GENEROUS: aim to surface AS MANY valid multi-source clusters as you can find. With ~70 headlines you should typically find 5–12 clusters, not 1–2. If two outlets cover the same product launch, security incident, regulatory action, earnings report, lawsuit, or feature release — group them.
- Headlines in different languages (Hebrew/English) about the same event MUST be grouped together.`;

  try {
    const result = await aiCallables.generateContentWithRetry(genAI, prompt, getSafetySettings());
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      logger.warn('clusterByGemini: no JSON in response, falling back to keyword clustering');
      return null;
    }
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed.clusters)) return null;

    const clusters = [];
    const used = new Set();
    for (const c of parsed.clusters) {
      if (!Array.isArray(c.indexes) || c.indexes.length < 2) continue;
      const seen = new Set();
      const clusterItems = [];
      for (const idx of c.indexes) {
        const i = Number(idx);
        if (Number.isNaN(i) || i < 0 || i >= items.length) continue;
        if (used.has(i) || seen.has(i)) continue;
        seen.add(i); used.add(i);
        clusterItems.push(items[i]);
      }
      if (clusterItems.length >= 2) {
        clusters.push({
          items: clusterItems,
          keywords: extractTopicKeywords((c.topic || '') + ' ' + clusterItems[0].title),
          topic: c.topic || '',
        });
      }
    }
    logger.info(`clusterByGemini: produced ${clusters.length} multi-source clusters from ${items.length} items`);
    return clusters;
  } catch (err) {
    logger.warn('clusterByGemini failed:', err.message);
    return null;
  }
}

/**
 * Best-effort fetch of an article URL — extracts og:description, meta description,
 * and the first ~5 paragraphs of body text. Returns '' on any failure.
 * Used to give Gemini grounded facts (not just RSS headlines) for synthesis.
 */
async function fetchSourceSummary(url) {
  if (!url) return '';
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TrendingTechDaily-Crawler/1.0)' },
      timeout: 8000,
      redirect: 'follow',
    });
    if (!res.ok) return '';
    const html = await res.text();

    // Prefer og:description / twitter:description
    let summary = '';
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["']/i)
                || html.match(/<meta[^>]+name=["']twitter:description["'][^>]*content=["']([^"']+)["']/i)
                || html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
    if (ogDesc) summary += ogDesc[1].trim();

    // Then grab the first few <p> paragraphs from the article body
    const paras = [];
    const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m, count = 0;
    while ((m = pRegex.exec(html)) !== null && count < 6) {
      const txt = m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      if (txt.length >= 40 && txt.length <= 600) {
        paras.push(txt);
        count++;
      }
    }
    if (paras.length) summary += '\n' + paras.join('\n');

    return summary.slice(0, 2500); // cap to keep prompt small
  } catch (err) {
    logger.warn('fetchSourceSummary failed for', url, err.message);
    return '';
  }
}

/**
 * Ask Gemini to verify that all items in a cluster are reporting on the same
 * news event. Returns { sameStory: boolean, confidence: number, reason: string }.
 * Rejects clusters where confidence < 85 so we never publish on shaky grounding.
 */
async function verifyClusterCoherence(genAI, sources) {
  const list = sources.map((s, i) => `[${i + 1}] (${s.source}) ${s.title}\n    ${(s.summary || s.description || '').slice(0, 400)}`).join('\n\n');
  const prompt = `You are a senior news editor verifying that multiple articles are reporting on the EXACT SAME news event (not just the same general topic).

Sources:
${list}

Respond with ONLY a JSON object:
{
  "sameStory": true | false,
  "confidence": 0-100,
  "reason": "one sentence explanation in English"
}

Rules:
- "sameStory" must be true ONLY if all sources discuss the same specific event/announcement/incident.
- If sources are about the same company but different products/events, sameStory = false.
- If unsure, sameStory = false.
- Be strict: false negatives are fine, false positives are not.`;

  try {
    const result = await aiCallables.generateContentWithRetry(genAI, prompt, getSafetySettings());
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { sameStory: false, confidence: 0, reason: 'no JSON in verification response' };
    const parsed = JSON.parse(m[0]);
    return {
      sameStory: parsed.sameStory === true,
      confidence: Number(parsed.confidence) || 0,
      reason: String(parsed.reason || ''),
    };
  } catch (err) {
    logger.warn('verifyClusterCoherence failed:', err.message);
    return { sameStory: false, confidence: 0, reason: err.message };
  }
}

// ── Generate Hebrew Article from MULTIPLE corroborated sources ───────────────

/**
 * Generates a Hebrew article from a cluster of ≥2 sources, all verified to be
 * about the same news event. Gemini is instructed to:
 *   • Only state facts present in at least 2 sources
 *   • Note disagreements explicitly when they exist
 *   • Cite source outlets in the body when natural
 * Returns the parsed article JSON plus the list of sources actually used.
 */
async function generateHebrewArticleFromSources(genAI, sources) {
  const sourcesBlock = sources.map((s, i) =>
    `מקור ${i + 1}: ${s.source} [שפה: ${s.lang === 'en' ? 'אנגלית' : 'עברית'}]
כותרת: ${s.title}
URL: ${s.url}
תקציר/תוכן: ${(s.summary || s.description || '').slice(0, 1800)}`
  ).join('\n\n---\n\n');

  const hasEnglish = sources.some(s => s.lang === 'en');
  const hasHebrew = sources.some(s => s.lang === 'he');

  const hebrewPrompt = `אתה עורך טכנולוגי בכיר. הוטלה עליך משימה לכתוב כתבה חדשותית **בעברית** המבוססת על ${sources.length === 1 ? 'מקור יחיד שמדווח' : sources.length + ' מקורות שונים שמדווחים כולם'} על אותו אירוע חדשותי.${hasEnglish && hasHebrew ? '\nהמקורות מערבבים אנגלית ועברית — תרגם את כל העובדות מהמקורות באנגלית לעברית בעיתונאית טבעית, אל תשאיר ביטויים באנגלית מעבר למה שנהוג (שמות חברות/מוצרים).' : hasEnglish ? '\nכל המקורות באנגלית — אתה צריך לתרגם את החדשה לעברית עיתונאית רהוטה. אל תשאיר משפטים שלמים באנגלית. שמות מוצרים/חברות (Apple, OpenAI וכו\') שמור באנגלית, מונחים טכניים תרגם או הסבר בעברית.' : ''}

המקורות:
${sourcesBlock}

חוקים מחייבים — חובה לציית:
1. **כתוב הכל בעברית בלבד** — כותרת, תקציר, תוכן. גם אם המקורות באנגלית, התוצר חייב להיות עברית טבעית ועיתונאית.
${sources.length > 1 ? `2. **רק עובדות שמופיעות בלפחות 2 מקורות שונים** ייכללו בכתבה. עובדה שמופיעה במקור אחד בלבד — אל תזכיר אותה.
3. אם מקורות שונים נותנים מספרים/פרטים שונים על אותו דבר (למשל סכום השקעה שונה) — ציין את שני הערכים והסבר שיש דיווחים סותרים.
4. אם לא ניתן לבסס לפחות 3 עובדות עיקריות שמשותפות לרוב המקורות — החזר {"insufficient": true} בלבד.` : `2. התבסס באופן עובדתי על המקור שסופק כדי לכתוב כתבה מקיפה ומדויקת.
3. אם לא ניתן להפיק לפחות 3 עובדות מהמקור שסופק — החזר {"insufficient": true} בלבד.`}
5. שלב באופן טבעי שמות של ${sources.length > 1 ? 'חלק מהמקורות' : 'המקור'} בגוף הכתבה (לפי דיווח ${sources.length > 1 ? 'TechCrunch' : sources[0].source} / על-פי ${sources.length > 1 ? 'The Verge' : sources[0].source} / לפי ${sources.length > 1 ? 'Geektime' : sources[0].source} וכו').
6. אורך: 450-650 מילים. סגנון עיתונאי מקצועי, ניתוחי, אובייקטיבי.
7. השתמש בתגיות HTML: <p>, <h3>, <strong>. ללא markdown.
8. **כללי כתיבה תקנית (Hebrew Content Writer Skill)**: 
   - כתיב מלא: חובה לכתוב תמיד בכתיב מלא עם וא"ו ויו"ד (למשל: תוכנה, שירות, ולא תכנה, שרות).
   - סמיכות: ה' הידיעה תבוא רק בשם השני (בית הספר ולא הבית הספר).
   - מושא ישיר: חובה להשתמש ב"את" לפני מושא ישיר מיודע.
   - שפה: ניסוח עיתונאי מקצועי, ניטרלי מגדרית (למשל: אפשר לבחור במקום אתה יכול). 
   - הימנע מתרגום מילולי של ניבים וביטויים (idioms) מאנגלית. השתמש בעברית טבעית ורהוטה.
   - פיסוק: גרש (') וגרשיים (") מיועדים לראשי תיבות וקיצורים בלבד (כמו מנכ"ל, צה"ל). לציטוטים השתמש במרכאות.

החזר JSON בלבד (ללא \`\`\`):
{
  "title": "כותרת בעברית — מקסימום 75 תווים",
  "slug": "english-lowercase-hyphenated-slug",
  "excerpt": "תקציר בעברית — 2-3 משפטים, עד 200 תווים",
  "content": "תוכן HTML מלא בעברית",
  "tags": ["תג1", "תג2", "תג3"],
  "imagePrompt": "Short English description (4-6 words) for Unsplash search — keep it specific to the news event",
  "imageAltText": "English alt text for the article image",
  "sourcesUsed": [1${sources.length > 1 ? ', 2, 3' : ''}]
}

או אם אין מספיק עובדות משותפות:
{ "insufficient": true, "reason": "why" }`;

  const result = await aiCallables.generateContentWithRetry(genAI, hebrewPrompt, getSafetySettings());
  const rawText = (typeof result.text === 'function' ? result.text() : result.text) || '';
  const m = rawText.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in Gemini response for multi-source Hebrew article');
  const parsed = JSON.parse(m[0]);

  if (parsed.insufficient) {
    logger.info('Gemini reported insufficient overlap:', parsed.reason);
    return { insufficient: true, reason: parsed.reason };
  }
  if (!parsed.title || !parsed.content) throw new Error('Multi-source response missing title/content');
  logger.info(`generateHebrewArticleFromSources: success — "${parsed.title}" from ${(parsed.sourcesUsed || []).length} sources`);
  return parsed;
}

// ── Generate Hebrew Articles ───────────────────────────────────────────────────

/**
 * Main function: crawls Hebrew RSS sources, generates AI articles, saves to he_articles.
 * @param {number} count - Number of articles to generate
 * @param {string} trigger - 'scheduled' | 'manual'
 */
async function generateHebrewArticles(count = 2, trigger = 'scheduled') {
  logger.info(`generateHebrewArticles: Starting (goal: ${count}, trigger: ${trigger})`);

  // Create log entry
  const logRef = await db.collection('schedulerLogs').add({
    type: 'hebrew',
    trigger,
    status: 'started',
    count,
    articles: [],
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    // 1. Crawl Hebrew RSS feeds
    const allItems = [];

    const rssResults = await Promise.allSettled(
      ALL_RSS_SOURCES.map(async ({ url, name, lang }) => {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'TrendingTechDaily-Crawler/1.0 (news aggregator)' },
          timeout: 10000,
        });
        if (!res.ok) throw new Error(`${name} returned ${res.status}`);
        const xml = await res.text();
        const items = parseRssItems(xml, name, 6).map(it => ({ ...it, lang }));
        logger.info(`RSS ${name} (${lang}): scraped ${items.length} items`);
        return items;
      })
    );

    rssResults.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        allItems.push(...result.value);
      } else {
        logger.warn(`RSS crawl failed for ${ALL_RSS_SOURCES[i].name}: ${result.reason?.message}`);
      }
    });

    const heItemCount = allItems.filter(i => i.lang === 'he').length;
    const enItemCount = allItems.filter(i => i.lang === 'en').length;
    logger.info(`RSS total: ${allItems.length} raw items (${heItemCount} HE + ${enItemCount} EN)`);

    if (allItems.length === 0) {
      throw new Error('No Hebrew RSS items found from any source.');
    }

    // 2. Deduplicate
    const seen = new Set();
    let unique = [];
    for (const item of allItems) {
      const key = item.title.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    }

    // Content Strategy: boost AI coding / skills topics to 60%
    unique = contentStrategy.boostFocusTopics(unique, count, 'he');

    // 3. Build category map
    const categoryMap = await buildHeCategoryMap();

    // 4. Check for duplicates already in DB — slugs, normalized titles, and source URLs
    //    URL dedup uses only the LAST 14 DAYS — older articles shouldn't block new news
    //    that happens to share an outlet URL pattern.
    const recentSnapshot = await db.collection('he_articles')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const existingSlugs = new Set();
    const existingTitles = new Set();   // normalized titles
    const existingUrls = new Set();     // original source URLs (last 14 days only)
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    recentSnapshot.forEach(doc => {
      const d = doc.data();
      if (d.slug) existingSlugs.add(d.slug);
      if (d.title) existingTitles.add(d.title.toLowerCase().trim());

      const createdMs = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
      if (createdMs >= fourteenDaysAgo) {
        // Index ALL source URLs from recent articles, not just the legacy `originalUrl`
        if (d.originalUrl) existingUrls.add(d.originalUrl.trim());
        if (Array.isArray(d.sources)) {
          d.sources.forEach(s => { if (s && s.url) existingUrls.add(String(s.url).trim()); });
        }
      }
    });

    // Build topic keyword fingerprints from RECENT (≤14 days) articles to prevent
    // topic-level duplicates. Older articles shouldn't block fresh news that happens
    // to share keywords (e.g. "Apple iPhone").
    const existingTopicKws = [];
    recentSnapshot.forEach(doc => {
      const d = doc.data();
      const createdMs = d.createdAt && d.createdAt.toMillis ? d.createdAt.toMillis() : 0;
      if (createdMs < fourteenDaysAgo) return;
      if (d.title) existingTopicKws.push(extractTopicKeywords(d.title));
      // Also use slug (always English) as a topic fingerprint
      if (d.slug) existingTopicKws.push(
        d.slug.split('-').filter(w => w.length >= 4 && !_DEDUP_STOP_WORDS.has(w)).slice(0, 5)
      );
    });

    // 5. Cluster items across sources. Gemini handles cross-language matching
    //    (HE+EN about the same story); fall back to keyword clustering if Gemini fails.
    const sdkLoaded = await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK();
    if (!sdkLoaded || !GoogleGenAI) throw new Error('Gemini SDK unavailable');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    let clusters = await clusterByGemini(genAI, unique);
    if (!clusters || clusters.length === 0) {
      logger.info('Falling back to keyword-based clustering.');
      clusters = clusterByTopic(unique);
    } else {
      // ALWAYS supplement Gemini's strict clusters with keyword clusters so we
      // have more candidates to fall back on after dedup eliminates today's
      // most-obvious stories. Merge: keep all Gemini clusters first, then add
      // keyword clusters whose items aren't already covered.
      const usedItems = new Set();
      for (const c of clusters) for (const it of c.items) usedItems.add(it.url || it.title);
      const kwClusters = clusterByTopic(unique);
      for (const kc of kwClusters) {
        const fresh = kc.items.filter(it => !usedItems.has(it.url || it.title));
        if (fresh.length >= 2 && new Set(fresh.map(i => i.source)).size >= 2) {
          clusters.push({ items: fresh, keywords: kc.keywords, topic: '' });
          for (const it of fresh) usedItems.add(it.url || it.title);
        }
      }
      logger.info(`Cluster pool after keyword supplement: ${clusters.length}`);
    }

    // Keep only multi-source clusters: ≥2 DISTINCT outlets must report the story.
    // This is the user's hard requirement: never generate from a single source.
    const multiSourceClusters = clusters
      .filter(c => new Set(c.items.map(i => i.source)).size >= 2)
      .map(c => ({
        ...c,
        sourceCount: new Set(c.items.map(i => i.source)).size,
      }))
      .sort((a, b) => b.sourceCount - a.sourceCount); // most-corroborated first

    logger.info(`Multi-source clusters: ${multiSourceClusters.length} (from ${clusters.length} total clusters)`);
    if (multiSourceClusters.length === 0) {
      logger.warn('No multi-source clusters found in this RSS pull — skipping run rather than generating from a single source.');
    }

    const generatedArticles = [];

    // ── Content Strategy: Weekly Antigravity feature article (Hebrew) ────────
    if (await contentStrategy.shouldGenerateAntigravityArticle()) {
      logger.info('[contentStrategy] Generating weekly Antigravity feature article (HE)...');
      try {
        const topic = await contentStrategy.pickAntigravityTopic('he');
        if (topic) {
          const aiContent = await generateHebrewArticleFromSources(genAI, [{
            title: topic.title,
            url: '',
            description: topic.prompt,
            summary: topic.prompt,
            source: 'Antigravity Feature',
            lang: 'he',
          }]);
          if (!aiContent.insufficient && aiContent.title && aiContent.content) {
            const slug = aiContent.slug || createSlug(aiContent.title);
            let imageData = { imageUrl: '', imageAltText: aiContent.title };
            try {
              imageData = await aiCallables.generateArticleImage({
                auth: { uid: 'he-scheduler', token: { admin: true } },
                data: {
                  prompt: aiContent.imagePrompt || topic.title,
                  articleTitle: aiContent.title,
                  articleSlug: slug,
                },
              });
            } catch (imgErr) {
              logger.warn('[contentStrategy] HE Antigravity image failed:', imgErr.message);
            }
            const categoryId = categoryMap['ai'] || assignHeCategory(aiContent.title, categoryMap);
            const readingTime = estimateReadingTime(aiContent.content);
            const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
              genAI, { title: aiContent.title, excerpt: aiContent.excerpt, slug }, 'he'
            );
            const article = await db.collection('he_articles').add({
              title: aiContent.title,
              slug,
              excerpt: aiContent.excerpt || '',
              category: categoryId,
              tags: [...(aiContent.tags || []), 'antigravity', 'כלי AI'],
              featuredImage: imageData.imageUrl || '',
              imageAltText: imageData.imageAltText || aiContent.title,
              content: aiContent.content,
              published: true,
              readingTimeMinutes: Math.max(1, readingTime),
              lang: 'he',
              sources: [{ name: 'Antigravity Feature', url: '', title: topic.title }],
              sourceCount: 1,
              isAntigravityFeature: true,
              tweetUrls,
              youtubeVideos,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            await contentStrategy.markAntigravityArticleGenerated();
            generatedArticles.push({
              id: article.id, title: aiContent.title, slug,
              sourceCount: 1, isAntigravityFeature: true,
              sources: [{ name: 'Antigravity Feature', url: '', title: topic.title }],
            });
            existingSlugs.add(slug);
            if (aiContent.title) existingTitles.add(aiContent.title.toLowerCase().trim());
            logger.info(`[contentStrategy] HE Antigravity feature published: ${article.id}`);
          }
        }
      } catch (err) {
        logger.error('[contentStrategy] HE Antigravity article failed:', err.message);
      }
    }

    const candidateClusters = multiSourceClusters.slice(0, count * 4);

    for (const cluster of candidateClusters) {
      if (generatedArticles.length >= count) break;

      // Use up to 5 distinct-source items from the cluster
      const seenSources = new Set();
      const distinctItems = [];
      for (const it of cluster.items) {
        if (seenSources.has(it.source)) continue;
        seenSources.add(it.source);
        distinctItems.push(it);
        if (distinctItems.length >= 5) break;
      }
      const representativeTitle = distinctItems[0].title;

      try {
        // ── Pre-flight duplicate checks against existing DB ─────────────────
        // Only skip if a MAJORITY of the cluster's distinct source URLs were already
        // used in the last 14 days. A single overlap is fine — it just means one
        // outlet covered both this news and a related one earlier.
        const repTitleLc = (representativeTitle || '').toLowerCase().trim();
        const matchedUrlCount = distinctItems.filter(it => existingUrls.has((it.url || '').trim())).length;
        if (matchedUrlCount > distinctItems.length / 2) {
          logger.info(`Cluster skipped — ${matchedUrlCount}/${distinctItems.length} source URLs already in DB: "${representativeTitle}"`);
          continue;
        }
        if (existingTitles.has(repTitleLc)) {
          logger.info(`Cluster skipped — title already exists: "${representativeTitle}"`);
          continue;
        }
        const clusterKws = cluster.keywords;
        if (existingTopicKws.some(eks => topicsOverlap(clusterKws, eks))) {
          logger.info(`Cluster skipped — topic already covered: "${representativeTitle}"`);
          continue;
        }

        logger.info(`Cluster candidate (${distinctItems.length} sources: ${distinctItems.map(i => i.source).join(', ')}): "${representativeTitle}"`);

        // ── Step A: enrich each source by fetching its og:description / paragraphs ─
        for (const it of distinctItems) {
          if (!it.summary) it.summary = await fetchSourceSummary(it.url);
        }

        // ── Step B: verify all sources are about the SAME story (Gemini check) ──
        const coherence = await verifyClusterCoherence(genAI, distinctItems);
        logger.info(`Coherence check for "${representativeTitle}": sameStory=${coherence.sameStory} confidence=${coherence.confidence} (${coherence.reason})`);
        // sameStory must be true. Confidence applies only to that positive answer:
        // if Gemini says "yes, same story" with ≥75 confidence, we proceed.
        if (!coherence.sameStory || coherence.confidence < 75) {
          logger.info(`Cluster rejected — not same story or low confidence (${coherence.confidence}).`);
          continue;
        }

        // ── Step C: synthesize Hebrew article from corroborated facts ───────
        const aiContent = await generateHebrewArticleFromSources(genAI, distinctItems);
        if (aiContent.insufficient) {
          logger.info(`Insufficient overlapping facts: ${aiContent.reason}`);
          continue;
        }

        // ── Post-generation duplicate checks ─────────────────────────────────
        const slug = aiContent.slug || createSlug(aiContent.title || representativeTitle);
        const aiTitleLc = (aiContent.title || '').toLowerCase().trim();
        if (existingSlugs.has(slug)) {
          logger.info(`Slug collision for "${slug}", skipping.`);
          continue;
        }
        if (aiTitleLc && existingTitles.has(aiTitleLc)) {
          logger.info(`AI title duplicate: "${aiContent.title}", skipping.`);
          continue;
        }
        existingSlugs.add(slug);
        if (aiTitleLc) existingTitles.add(aiTitleLc);
        for (const it of distinctItems) if (it.url) existingUrls.add(it.url.trim());

        // ── Generate image (English keywords for Unsplash) ───────────────────
        let imageData = { imageUrl: '', imageAltText: aiContent.title || representativeTitle };
        try {
          imageData = await aiCallables.generateArticleImage({
            auth: { uid: 'he-scheduler', token: { admin: true } },
            data: {
              prompt: aiContent.imagePrompt || aiContent.title || representativeTitle,
              articleTitle: aiContent.title || representativeTitle,
              articleSlug: slug,
            },
          });
        } catch (imgErr) {
          logger.warn('Hebrew image generation failed:', imgErr.message);
        }

        const categoryId = assignHeCategory(aiContent.title || representativeTitle, categoryMap);
        const readingTime = estimateReadingTime(aiContent.content);

        // Verified tweets + YouTube videos — Gemini checks every candidate
        // against the article so we only embed items about the same story.
        const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
          genAI,
          { title: aiContent.title || representativeTitle, excerpt: aiContent.excerpt, slug },
          'he'
        );

        // Build sources array — only the ones Gemini said it actually used (1-indexed)
        const used = Array.isArray(aiContent.sourcesUsed) && aiContent.sourcesUsed.length
          ? aiContent.sourcesUsed.map(i => distinctItems[i - 1]).filter(Boolean)
          : distinctItems;
        const sourcesArr = used.map(it => ({ name: it.source, url: it.url, title: it.title }));

        const article = await db.collection('he_articles').add({
          title: aiContent.title || representativeTitle,
          slug,
          excerpt: aiContent.excerpt || '',
          category: categoryId,
          tags: aiContent.tags || [],
          featuredImage: imageData.imageUrl || '',
          imageAltText: imageData.imageAltText || aiContent.title || '',
          content: aiContent.content || '',
          published: true,
          readingTimeMinutes: Math.max(1, readingTime),
          lang: 'he',
          // Multi-source provenance
          sources: sourcesArr,                     // [{name,url,title}]
          sourceCount: sourcesArr.length,
          coherenceConfidence: coherence.confidence,
          // Backwards-compat: keep first source on the legacy fields
          sourceUrl: sourcesArr[0]?.url || '',
          sourceName: sourcesArr[0]?.name || '',
          originalUrl: sourcesArr[0]?.url || '',
          tweetUrls,
          youtubeVideos,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        logger.info(`Hebrew article saved: ${article.id} — "${aiContent.title}" (corroborated by ${sourcesArr.length} sources: ${sourcesArr.map(s => s.name).join(', ')})`);
        generatedArticles.push({
          id: article.id,
          title: aiContent.title || representativeTitle,
          slug,
          sourceCount: sourcesArr.length,
          coherenceConfidence: coherence.confidence,
          sources: sourcesArr,    // [{name,url,title}] — full provenance in the log
        });

        // Register topic keywords to prevent within-run duplicates
        existingTopicKws.push(clusterKws);
        const aiKws = extractTopicKeywords(aiContent.title || '');
        if (aiKws.length) existingTopicKws.push(aiKws);
      } catch (clusterErr) {
        logger.error(`Failed to generate Hebrew article for cluster "${representativeTitle}":`, clusterErr.message);
      }
    }

    // ── Single-source fallback ─────────────────────────────────────────────
    // If multi-source clustering produced nothing publishable (every cluster was
    // already covered, or there were no multi-source clusters at all), fall
    // back to single-source articles so the run isn't a total miss. We still
    // skip URLs already published in the last 14 days and topic-overlap dupes.
    if (generatedArticles.length < count) {
      logger.warn(`Multi-source loop produced ${generatedArticles.length}/${count} — falling back to single-source items.`);
      // Prefer English (more reliable summaries), prefer fresh URLs, randomize.
      const candidates = unique
        .filter(it => it.url && !existingUrls.has(it.url.trim()))
        .filter(it => {
          const titleLc = (it.title || '').toLowerCase().trim();
          if (existingTitles.has(titleLc)) return false;
          const kws = extractTopicKeywords(it.title || '');
          if (existingTopicKws.some(eks => topicsOverlap(kws, eks))) return false;
          return true;
        })
        .sort(() => Math.random() - 0.5);

      for (const item of candidates) {
        if (generatedArticles.length >= count) break;
        try {
          if (!item.summary) item.summary = await fetchSourceSummary(item.url);
          const aiContent = await generateHebrewArticleFromSources(genAI, [item]);
          if (aiContent.insufficient) {
            logger.info(`Single-source skip (insufficient): "${item.title}"`);
            continue;
          }
          const slug = aiContent.slug || createSlug(aiContent.title || item.title);
          const aiTitleLc = (aiContent.title || '').toLowerCase().trim();
          if (existingSlugs.has(slug) || (aiTitleLc && existingTitles.has(aiTitleLc))) continue;
          existingSlugs.add(slug);
          if (aiTitleLc) existingTitles.add(aiTitleLc);
          existingUrls.add(item.url.trim());

          let imageData = { imageUrl: '', imageAltText: aiContent.title || item.title };
          try {
            imageData = await aiCallables.generateArticleImage({
              auth: { uid: 'he-scheduler', token: { admin: true } },
              data: {
                prompt: aiContent.imagePrompt || aiContent.title || item.title,
                articleTitle: aiContent.title || item.title,
                articleSlug: slug,
              },
            });
          } catch (imgErr) {
            logger.warn('Hebrew single-source image failed:', imgErr.message);
          }

          const categoryId = assignHeCategory(aiContent.title || item.title, categoryMap);
          const readingTime = estimateReadingTime(aiContent.content);
          const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
            genAI,
            { title: aiContent.title || item.title, excerpt: aiContent.excerpt, slug },
            'he'
          );

          const sourcesArr = [{ name: item.source, url: item.url, title: item.title }];
          const article = await db.collection('he_articles').add({
            title: aiContent.title || item.title,
            slug,
            excerpt: aiContent.excerpt || '',
            category: categoryId,
            tags: aiContent.tags || [],
            featuredImage: imageData.imageUrl || '',
            imageAltText: imageData.imageAltText || aiContent.title || '',
            content: aiContent.content || '',
            published: true,
            readingTimeMinutes: Math.max(1, readingTime),
            lang: 'he',
            sources: sourcesArr,
            sourceCount: 1,
            singleSource: true,
            sourceUrl: item.url,
            sourceName: item.source,
            originalUrl: item.url,
            tweetUrls,
            youtubeVideos,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          logger.info(`Hebrew article saved (single-source fallback): ${article.id} — "${aiContent.title}" from ${item.source}`);
          generatedArticles.push({
            id: article.id,
            title: aiContent.title || item.title,
            slug,
            sourceCount: 1,
            singleSource: true,
            sources: sourcesArr,
          });
          const aiKws = extractTopicKeywords(aiContent.title || '');
          if (aiKws.length) existingTopicKws.push(aiKws);
        } catch (singleErr) {
          logger.error(`Single-source generation failed for "${item.title}":`, singleErr.message);
        }
      }
    }

    // Update log
    await logRef.update({
      status: generatedArticles.length > 0 ? 'success' : 'error',
      articles: generatedArticles,
      error: generatedArticles.length === 0 ? 'No articles were successfully generated.' : null,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`generateHebrewArticles complete: ${generatedArticles.length}/${count} articles generated.`);
    return generatedArticles;
  } catch (err) {
    logger.error('generateHebrewArticles fatal error:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw err;
  }
}

module.exports = { generateHebrewArticles, seedHebrewSections };
