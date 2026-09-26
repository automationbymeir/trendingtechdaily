// functions/scheduledArticles.js

const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { logger, db } = require('./config');
const aiCallables = require('./callable/ai');
const articlesAdmin = require('./admin/articles');
const twitterService = require('./services/twitterService');
const mediaRelevance = require('./services/mediaRelevanceService');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');
const contentStrategy = require('./services/contentStrategy');

/** Lazy-construct a Gemini client. Returns null if SDK / key unavailable. */
async function _getGenAIForMedia() {
  try {
    if (!process.env.GEMINI_API_KEY) return null;
    await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK();
    if (!GoogleGenAI) return null;
    return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  } catch (err) {
    logger.warn('media: failed to init Gemini for relevance check:', err.message);
    return null;
  }
}

const CONFIG_DOC = 'settings/autoArticleSchedule';

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

function estimateReadingTime(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 225));
}

async function fetchTechHeadline(newsApiKey) {
  try {
    const res = await fetch(`https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=1&apiKey=${newsApiKey}`);
    const data = await res.json();
    if (data && data.articles && data.articles.length > 0) {
      return data.articles[0].title;
    }
  } catch (err) {
    logger.error('Failed to fetch tech headline:', err);
  }
  return 'latest technology news';
}

async function fetchTechQuote() {
  try {
    const res = await fetch('https://api.quotable.io/random?tags=technology');
    const data = await res.json();
    if (data && data.content) {
      return `${data.content} — ${data.author}`;
    }
  } catch (err) {
    logger.error('Failed to fetch tech quote:', err);
  }
  return '';
}

async function determineArticleTopic(newsApiKey) {
  if (Math.random() < 0.5) {
    try {
      const suggestion = await aiCallables.suggestArticleTopic({
        auth: { uid: 'scheduler' },
        data: { prompt: 'technology news, tech guides, company overviews, or stock market updates' }
      });
      if (suggestion && suggestion.topic) {
        return suggestion.topic;
      }
    } catch (err) {
      logger.error('Failed to get topic from Grok:', err);
    }
  }
  return await fetchTechHeadline(newsApiKey);
}

async function shouldGenerateArticle(defaultFrequency, defaultArticlesPerRun = 1) {
  const docRef = db.doc(CONFIG_DOC);
  const snap = await docRef.get();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let data = snap.exists ? snap.data() : {};
  const frequency = data.frequency || defaultFrequency || 1;
  const articlesPerRun = data.articlesPerRun || defaultArticlesPerRun;
  const last = data.lastGeneratedAt
    ? (data.lastGeneratedAt.toMillis ? data.lastGeneratedAt.toMillis() : new Date(data.lastGeneratedAt).getTime())
    : 0;
  const shouldGenerate = now - last >= oneDay / frequency;
  if (shouldGenerate) {
    await docRef.set({ lastGeneratedAt: new Date(now), frequency, articlesPerRun }, { merge: true });
  }
  return { shouldGenerate, articlesPerRun };
}

async function sendNotificationEmail(articleId, article) {
  const to = process.env.ARTICLE_NOTIFY_EMAIL || 'info@trendingtechdaily.com';
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    logger.error('SMTP credentials not configured; skipping notification email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const approvalUrl = `https://trendingtechdaily.com/admin/articles/${articleId}`;
  const mailOptions = {
    from: user,
    to,
    subject: `New Auto-Generated Article: ${article.title}`,
    html: `<p>A new article has been generated and is awaiting approval.</p><p><strong>${article.title}</strong></p><p><a href="${approvalUrl}">Review Article</a></p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Notification email sent for article ${articleId}`);
  } catch (err) {
    logger.error('Failed to send notification email:', err);
  }
}

async function writeSchedulerLog(data) {
  try {
    await db.collection('schedulerLogs').add({
      ...data,
      createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('Failed to write scheduler log:', err);
  }
}

async function generateArticle(newsApiKey, trigger = 'scheduled') {
  const logRef = await db.collection('schedulerLogs').add({
    type: 'auto',
    trigger,
    status: 'started',
    startedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
    articles: [],
  });

  try {
    const headline = await determineArticleTopic(newsApiKey);
    const aiContent = await aiCallables.generateArticleContent({ auth: { uid: 'scheduler' }, data: { prompt: headline } });
    if (aiContent.error) {
      logger.error('AI content generation failed:', aiContent.message);
      await logRef.update({ status: 'error', error: aiContent.message, completedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() });
      return;
    }
    const imageData = await aiCallables.generateArticleImage({ auth: { uid: 'scheduler' }, data: { prompt: aiContent.imagePrompt, articleTitle: aiContent.title } });
    const quote = await fetchTechQuote();
    let content = aiContent.content;
    if (quote) content += `<blockquote>${quote}</blockquote>`;
    const readingTime = estimateReadingTime(content);
    // Verified tweets + YouTube videos (Gemini-checked, only same-story items)
    const genAIForMedia = await _getGenAIForMedia();
    const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
      genAIForMedia,
      { title: aiContent.title, excerpt: aiContent.excerpt, slug: aiContent.slug },
      'en'
    );
    const article = await articlesAdmin.createArticle({
      title: aiContent.title,
      slug: aiContent.slug,
      excerpt: aiContent.excerpt,
      category: aiContent.category || 'news',
      tags: aiContent.tags || [],
      featuredImage: imageData.imageUrl,
      imageAltText: imageData.imageAltText,
      content,
      published: false,
      readingTimeMinutes: readingTime,
      tweetUrls,
      youtubeVideos,
    });
    await logRef.update({
      status: 'success',
      articles: [{ id: article.id, title: aiContent.title }],
      completedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    logger.error('generateArticle failed:', err);
    await logRef.update({ status: 'error', error: err.message || String(err), completedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() });
  }
}

async function generateTrendingArticles(count = 2, trigger = 'scheduled') {
  const newsApiKey = process.env.NEWS_API_KEY;
  const gnewsApiKey = process.env.GNEWS_API_KEY;
  if (!newsApiKey && !gnewsApiKey) logger.warn("No news APIs configured. Falling back to public APIs only.");

  // Create a Firestore log entry for this run
  const logRef = await db.collection('schedulerLogs').add({
    type: 'trending',
    trigger,
    status: 'started',
    count,
    articles: [],
    startedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
  });

  logger.info(`Starting trending articles generation (goal: ${count}). Crawler initiating...`);

  const allArticles = [];

  // ── RSS Feed Parser ────────────────────────────────────────────────────────
  // Extracts <item> blocks and parses title, link and description from RSS/Atom XML.
  function parseRssItems(xml, sourceName, limit = 8) {
    const items = [];
    // Match both <item> (RSS) and <entry> (Atom)
    const itemRegex = /<(?:item|entry)[\s>]([\s\S]*?)<\/(?:item|entry)>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
      const block = match[1];
      // Title: handle plain text and CDATA
      const titleMatch = block.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
      // Link: RSS <link>, or Atom <link href="...">
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/i) ||
                        block.match(/<link[^>]*>(https?:\/\/[^<]+)<\/link>/i);
      // Description / summary
      const descMatch = block.match(/<(?:description|summary)[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:description|summary)>/i);

      const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const url   = linkMatch  ? linkMatch[1].trim() : '';
      const desc  = descMatch  ? descMatch[1].replace(/<[^>]+>/g, '').slice(0, 200).trim() : '';

      if (title && url && title.length > 10) {
        items.push({ title, url, description: desc, source: sourceName });
      }
    }
    return items;
  }

  // ── Live RSS crawl of major tech news sites ────────────────────────────────
  const RSS_SOURCES = [
    { url: 'https://techcrunch.com/feed/',                    name: 'TechCrunch' },
    { url: 'https://www.theverge.com/rss/index.xml',          name: 'The Verge' },
    { url: 'https://feeds.arstechnica.com/arstechnica/index', name: 'Ars Technica' },
    { url: 'https://www.wired.com/feed/rss',                  name: 'Wired' },
    { url: 'https://venturebeat.com/feed/',                   name: 'VentureBeat' },
    { url: 'https://www.engadget.com/rss.xml',                name: 'Engadget' },
    { url: 'https://www.zdnet.com/news/rss.xml',              name: 'ZDNet' },
    { url: 'https://hnrss.org/frontpage',                     name: 'Hacker News' },
    // Content strategy: additional AI-coding focused sources
    ...contentStrategy.getAdditionalRssSources().map(s => ({ url: s.url, name: s.name })),
  ];

  const rssResults = await Promise.allSettled(
    RSS_SOURCES.map(async ({ url, name }) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TrendingTechDaily-Crawler/1.0 (news aggregator)' },
        timeout: 10000,
      });
      if (!res.ok) throw new Error(`${name} returned ${res.status}`);
      const xml = await res.text();
      const items = parseRssItems(xml, name, 6);
      logger.info(`RSS ${name}: scraped ${items.length} items`);
      return items;
    })
  );

  rssResults.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
    } else {
      logger.warn(`RSS crawl failed for ${RSS_SOURCES[i].name}: ${result.reason?.message}`);
    }
  });

  logger.info(`RSS crawl total: ${allArticles.length} raw items from ${RSS_SOURCES.length} sites`);

  // ── Fallback: NewsAPI (if RSS yielded less than 10 items) ──────────────────
  if (allArticles.length < 10 && newsApiKey) {
    try {
      const res = await fetch(`https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=10&apiKey=${newsApiKey}`);
      const data = await res.json();
      if (data && data.articles) {
        data.articles.forEach(a => {
          if (a.title && a.title !== '[Removed]') {
            allArticles.push({ title: a.title, description: a.description || '', url: a.url, source: 'NewsAPI' });
          }
        });
        logger.info(`NewsAPI fallback: added ${data.articles.length} items`);
      }
    } catch(err) {
      logger.error("NewsAPI fallback crawl failed:", err);
    }
  }

  // ── Fallback: GNews ────────────────────────────────────────────────────────
  if (allArticles.length < 10 && gnewsApiKey) {
    try {
      const res = await fetch(`https://gnews.io/api/v4/top-headlines?category=technology&lang=en&max=10&apikey=${gnewsApiKey}`);
      const data = await res.json();
      if (data && data.articles) {
        data.articles.forEach(a => {
          if (a.title) {
            allArticles.push({ title: a.title, description: a.description || '', url: a.url, source: 'GNews' });
          }
        });
        logger.info(`GNews fallback: added ${data.articles.length} items`);
      }
    } catch(err) {
      logger.error("GNews fallback crawl failed:", err);
    }
  }

  if (allArticles.length === 0) {
    await logRef.update({ status: 'error', error: 'No trending articles found from any source.', completedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp() });
    throw new Error("No trending articles found from any source.");
  }

  // Deduplicate using title ignoring case
  const uniqueArticles = [];
  const seenTitles = new Set();
  for (const art of allArticles) {
    const norm = art.title.toLowerCase().trim();
    if (!seenTitles.has(norm)) {
      seenTitles.add(norm);
      uniqueArticles.push(art);
    }
  }

  logger.info(`Found ${uniqueArticles.length} unique trending items across sources.`);

  // Shuffle to avoid picking the exact same ones every time
  let shuffled = uniqueArticles.sort(() => 0.5 - Math.random());

  // Content Strategy: boost AI coding / skills topics to 60%
  shuffled = contentStrategy.boostFocusTopics(shuffled, count, 'en');

  // Load recently published articles from DB to prevent cross-run duplicates
  const recentPublishedSnap = await db.collection('articles')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();
  const publishedSlugs = new Set();
  const publishedTitles = new Set();
  const publishedSourceUrls = new Set();
  recentPublishedSnap.forEach(doc => {
    const d = doc.data();
    if (d.slug) publishedSlugs.add(d.slug);
    if (d.title) publishedTitles.add(d.title.toLowerCase().trim());
    if (d.sourceUrl) publishedSourceUrls.add(d.sourceUrl.trim());
  });

  // Build topic keyword fingerprints from recently published articles
  const existingTopicKws = [];
  recentPublishedSnap.forEach(doc => {
    const d = doc.data();
    if (d.title) existingTopicKws.push(extractTopicKeywords(d.title));
    if (d.slug) existingTopicKws.push(
      d.slug.split('-').filter(w => w.length >= 4 && !_DEDUP_STOP_WORDS.has(w)).slice(0, 5)
    );
  });

  // Fetch sections once (outside loop) for category mapping
  // Also try categories collection (nav uses it as fallback)
  const [sectionsSnapshot, categoriesSnapshot] = await Promise.all([
    db.collection('sections').get(),
    db.collection('categories').get().catch(() => ({ empty: true, forEach: () => {} })),
  ]);

  const CATEGORY_MAP = {};
  const availableSections = []; // for injecting into the AI prompt
  let fallbackCategoryId = null;

  const registerSection = (doc) => {
    const slug = (doc.data().slug || '').toLowerCase().trim();
    const name = (doc.data().name || '').toLowerCase().trim();
    if (slug) CATEGORY_MAP[slug] = doc.id;
    if (name) CATEGORY_MAP[name] = doc.id;
    if (slug) availableSections.push(slug);
    else if (name) availableSections.push(name);
    if (slug === 'ai' || name === 'ai') fallbackCategoryId = doc.id;
  };

  sectionsSnapshot.forEach(registerSection);
  // Also register categories collection docs (for sites using that collection)
  categoriesSnapshot.forEach(doc => {
    const slug = (doc.data().slug || doc.data().name || '').toLowerCase().replace(/\s+/g, '-').trim();
    const name = (doc.data().name || '').toLowerCase().trim();
    // Only register if not already mapped (sections take priority)
    if (slug && !CATEGORY_MAP[slug]) CATEGORY_MAP[slug] = doc.id;
    if (name && !CATEGORY_MAP[name]) CATEGORY_MAP[name] = doc.id;
    if ((slug === 'ai' || name === 'ai') && !fallbackCategoryId) fallbackCategoryId = doc.id;
  });

  // Build aliases: map common Gemini category words → closest available section
  const ALIASES = {
    'technology': ['tech', 'technology'],
    'artificial intelligence': ['ai'],
    'machine learning': ['ai'],
    'cybersecurity': ['security', 'cybersecurity'],
    'cryptocurrency': ['crypto', 'cryptocurrency'],
    'gadgets': ['gadgets', 'technology', 'tech'],
    'software': ['software', 'tech', 'technology'],
    'finance': ['stock-market', 'finance', 'stocks'],
    'stocks': ['stock-market', 'stocks'],
    'world': ['world'],
    'guides': ['guides'],
    'websites': ['websites'],
  };
  for (const [alias, candidates] of Object.entries(ALIASES)) {
    if (!CATEGORY_MAP[alias]) {
      for (const c of candidates) {
        if (CATEGORY_MAP[c]) { CATEGORY_MAP[alias] = CATEGORY_MAP[c]; break; }
      }
    }
  }

  if (!fallbackCategoryId) fallbackCategoryId = sectionsSnapshot.docs[0]?.id;

  // Unique sorted list of category options to pass to AI prompt
  const categoryOptions = [...new Set(availableSections)].sort().join(', ');

  // Try to generate up to 'count' articles, skipping failed ones
  const results = [];
  const publishedArticles = [];

  // ── Content Strategy: Weekly Antigravity feature article ──────────────────
  if (await contentStrategy.shouldGenerateAntigravityArticle()) {
    logger.info('[contentStrategy] Generating weekly Antigravity feature article...');
    try {
      const topic = await contentStrategy.pickAntigravityTopic('en');
      if (topic) {
        const aiContent = await aiCallables.generateArticleContent({
          auth: { uid: 'scheduler', token: { admin: true } },
          data: { prompt: topic.prompt, availableCategories: categoryOptions },
        });
        if (!aiContent.error) {
          const imageData = await aiCallables.generateArticleImage({
            auth: { uid: 'scheduler', token: { admin: true } },
            data: { prompt: aiContent.imagePrompt || topic.title, articleTitle: aiContent.title || topic.title },
          });
          const genAIForMedia = await _getGenAIForMedia();
          const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
            genAIForMedia,
            { title: aiContent.title || topic.title, excerpt: aiContent.excerpt, slug: aiContent.slug },
            'en'
          );
          const rawCat = (aiContent.category || '').toLowerCase().trim();
          const categoryId = rawCat ? (CATEGORY_MAP[rawCat] || CATEGORY_MAP['ai'] || fallbackCategoryId) : (CATEGORY_MAP['ai'] || fallbackCategoryId);
          const readingTime = estimateReadingTime(aiContent.content);
          const article = await articlesAdmin.createArticle({
            title: aiContent.title || topic.title,
            slug: aiContent.slug,
            excerpt: aiContent.excerpt,
            category: categoryId,
            tags: [...(aiContent.tags || []), 'antigravity', 'ai-coding'],
            featuredImage: imageData.imageUrl || '',
            imageAltText: imageData.imageAltText || '',
            content: aiContent.content,
            published: true,
            readingTimeMinutes: Math.max(1, readingTime),
            sourceUrl: '',
            tweetUrls,
            youtubeVideos,
            isAntigravityFeature: true,
          });
          await contentStrategy.markAntigravityArticleGenerated();
          results.push(article);
          publishedArticles.push({
            id: article.id,
            title: aiContent.title || topic.title,
            slug: aiContent.slug,
            sources: [{ name: 'Antigravity Feature', url: '', title: topic.title }],
            isAntigravityFeature: true,
          });
          await logRef.update({ articles: publishedArticles });
          logger.info(`[contentStrategy] Antigravity feature article published: ${article.id}`);
          if (aiContent.slug) publishedSlugs.add(aiContent.slug);
          if (aiContent.title) publishedTitles.add(aiContent.title.toLowerCase().trim());
        }
      }
    } catch (err) {
      logger.error('[contentStrategy] Antigravity article generation failed:', err.message);
    }
  }

  for (let i = 0; i < shuffled.length && results.length < count; i++) {
     const sourceArticle = shuffled[i];

     // Pre-flight: skip if this source story or title was already published
     const normTitle = (sourceArticle.title || '').toLowerCase().trim();
     const sourceUrl = (sourceArticle.url || '').trim();
     if (sourceUrl && publishedSourceUrls.has(sourceUrl)) {
       logger.info(`Skipping duplicate source URL: "${sourceUrl}"`);
       continue;
     }
     if (normTitle && publishedTitles.has(normTitle)) {
       logger.info(`Skipping duplicate title: "${sourceArticle.title}"`);
       continue;
     }

     // Topic-level duplicate check
     const candidateKws = extractTopicKeywords(sourceArticle.title);
     if (existingTopicKws.some(eks => topicsOverlap(candidateKws, eks))) {
       logger.info(`Topic already covered: "${sourceArticle.title}", skipping.`);
       continue;
     }

     const prompt = `Write a completely new, professional tech news article based on the following trending subject: "${sourceArticle.title}". Context/Description: "${sourceArticle.description || ''}". Ensure it is entirely original, factual, and not a direct copy. Do NOT mention this is based on another article. Use <h3> tags for 2-3 logical sub-headers and <strong> for key terms to make the format visually interesting. AVAILABLE CATEGORIES (pick the most relevant one): ${categoryOptions}.`;

     logger.info(`Generating trending AI article ${results.length+1}/${count}: ${sourceArticle.title}`);

     try {
       const aiContent = await aiCallables.generateArticleContent({ auth: { uid: 'scheduler', token: { admin: true } }, data: { prompt: prompt, availableCategories: categoryOptions } });
       if (aiContent.error) {
         logger.error('AI content generation failed:', aiContent.message);
         continue;
       }

       const imageData = await aiCallables.generateArticleImage({ auth: { uid: 'scheduler', token: { admin: true } }, data: { prompt: aiContent.imagePrompt, articleTitle: aiContent.title } });

       // Gather VERIFIED tweets + YouTube videos. Each candidate is checked by
       // Gemini to ensure it's about the same specific story as this article.
       const genAIForMedia = await _getGenAIForMedia();
       const { tweetUrls, youtubeVideos } = await mediaRelevance.gatherRelevantMedia(
         genAIForMedia,
         { title: aiContent.title, excerpt: aiContent.excerpt, slug: aiContent.slug },
         'en'
       );

       // --- Category resolution (3-tier) ---
       // Tier 1: Use Gemini-returned category
       const rawCat = (aiContent.category || '').toLowerCase().trim();
       let categoryId = rawCat
         ? (CATEGORY_MAP[rawCat]
            || CATEGORY_MAP[rawCat.replace(/[-_\s]+/g, '')]
            || CATEGORY_MAP[rawCat.replace(/[-_\s]+/g, '-')])
         : null;

       // Tier 2: Content-based keyword classification using article title + source title
       if (!categoryId) {
         const textForClassify = ((aiContent.title || '') + ' ' + (sourceArticle.title || '') + ' ' + (sourceArticle.description || '')).toLowerCase();
         const KEYWORD_RULES = [
           { slugs: ['crypto', 'cryptocurrency'],         keywords: ['bitcoin', 'ethereum', 'crypto', 'blockchain', 'defi', 'nft', 'web3', 'token', 'binance', 'coinbase', 'solana', 'stablecoin'] },
           { slugs: ['security', 'cybersecurity'],         keywords: ['hack', 'cyber', 'ransomware', 'malware', 'vulnerability', 'breach', 'phishing', 'exploit', 'firewall', 'encryption', 'cve'] },
           { slugs: ['startups', 'startup'],               keywords: ['startup', 'funding', 'seed round', 'series a', 'series b', 'venture capital', 'vc', 'unicorn', 'ipo', 'acquisition', 'yc ', 'y combinator'] },
           { slugs: ['gadgets', 'gadget'],                 keywords: ['iphone', 'ipad', 'macbook', 'pixel', 'galaxy', 'headphones', 'smartwatch', 'earbuds', 'laptop', 'tablet', 'camera', 'drone', 'wearable', 'hardware', 'device'] },
           { slugs: ['stock-market', 'stocks', 'finance'], keywords: ['stock', 'shares', 'nasdaq', 'nyse', 's&p', 'dow jones', 'earnings', 'revenue', 'market cap', 'ipo', 'hedge fund', 'wall street', 'fed', 'interest rate', 'inflation'] },
           { slugs: ['ai', 'artificial-intelligence'],     keywords: ['chatgpt', 'openai', 'llm', 'large language', 'generative ai', 'gemini', 'claude', 'gpt-', 'mistral', 'llama', 'diffusion', 'image generation', 'deepmind', 'anthropic'] },
           { slugs: ['technology', 'tech'],                keywords: ['software', 'app', 'cloud', 'saas', 'api', 'developer', 'open source', 'github', 'google', 'microsoft', 'amazon', 'apple', 'meta', 'tesla'] },
         ];
         for (const rule of KEYWORD_RULES) {
           if (rule.keywords.some(kw => textForClassify.includes(kw))) {
             for (const slug of rule.slugs) {
               if (CATEGORY_MAP[slug]) { categoryId = CATEGORY_MAP[slug]; break; }
             }
             if (categoryId) break;
           }
         }
         if (categoryId) {
           logger.info(`Category resolved via keyword fallback for "${aiContent.title}": was "${rawCat || 'empty'}"`);
         }
       }

       // Tier 3: Hard fallback
       if (!categoryId) {
         logger.warn(`Category "${rawCat}" not found in CATEGORY_MAP, using fallback. Available: ${Object.keys(CATEGORY_MAP).join(', ')}`);
         categoryId = fallbackCategoryId;
       }

       let content = aiContent.content;
       if (sourceArticle.url) {
         content += `<p><br><em><small>Background info inspired by trending reports. <a href="${sourceArticle.url}" target="_blank" rel="noopener">Read the original source</a>.</small></em></p>`;
       }

       const readingTime = estimateReadingTime(content);

       // Post-generation slug check
       if (aiContent.slug && publishedSlugs.has(aiContent.slug)) {
         logger.info(`Slug already exists: "${aiContent.slug}", skipping.`);
         continue;
       }
       const aiNormTitle = (aiContent.title || '').toLowerCase().trim();
       if (aiNormTitle && publishedTitles.has(aiNormTitle)) {
         logger.info(`AI title already exists: "${aiContent.title}", skipping.`);
         continue;
       }

       const article = await articlesAdmin.createArticle({
         title: aiContent.title,
         slug: aiContent.slug,
         excerpt: aiContent.excerpt,
         category: categoryId,
         tags: aiContent.tags || [],
         featuredImage: imageData.imageUrl || "",
         imageAltText: imageData.imageAltText || "",
         content,
         published: true,
         readingTimeMinutes: Math.max(1, readingTime),
         sourceUrl: sourceUrl || '',
         tweetUrls,
         youtubeVideos,
       });

       // Track in-run sets so back-to-back articles from same session don't clash
       if (aiContent.slug) publishedSlugs.add(aiContent.slug);
       if (aiNormTitle) publishedTitles.add(aiNormTitle);
       if (sourceUrl) publishedSourceUrls.add(sourceUrl);

       existingTopicKws.push(candidateKws);
       if (aiContent && aiContent.title) existingTopicKws.push(extractTopicKeywords(aiContent.title));

       results.push(article);
       publishedArticles.push({
         id: article.id,
         title: aiContent.title,
         slug: aiContent.slug,
         sources: [{
           name: sourceArticle.source && sourceArticle.source.name ? sourceArticle.source.name : (sourceArticle.sourceName || 'Unknown'),
           url: sourceUrl,
           title: sourceArticle.title,
         }],
       });
       logger.info(`Trending AI Article published: ${article.id} (source: ${sourceUrl || 'none'})`);

       // Update log progressively
       await logRef.update({ articles: publishedArticles });

       // Optionally notify via email
       await sendNotificationEmail(article.id, { ...article, title: `[TRENDING AUTO-PUBLISHED] ${article.title}` });
     } catch(err) {
       logger.error(`Error generating article for ${sourceArticle.title}:`, err);
     }
  }

  await logRef.update({
    status: results.length > 0 ? 'success' : 'error',
    error: results.length === 0 ? 'All article generation attempts failed.' : null,
    articles: publishedArticles,
    completedAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
  });

  return results;
}

module.exports = { shouldGenerateArticle, generateArticle, generateTrendingArticles };
