/**
 * aiToolsCarouselPipeline.js
 * ---------------------------------------------------------------------------
 * DAILY Instagram carousel for "AI Tools Pulse".
 *
 *   1. Pick 5 trending tools from ai_tools (excluding ones used in the past
 *      14 days for this language) with a type-mix preference:
 *        1 claude-skill + 1 mcp-connector + 1 github-repo + 1 llm-product
 *        + 1 wildcard. Falls back to top trending if the mix is impossible.
 *   2. Fetch REAL logos (Anthropic favicon for skills, GitHub org avatar for
 *      repos, icon.horse → google s2 favicons for everyone else). On failure
 *      we generate a letter-avatar with sharp. Logos are normalized + cached
 *      to Firebase Storage so Remotion can <img src=...> them.
 *   3. Render 7 slides @ 1080x1080 PNG via Remotion Lambda compositions
 *      registered in video-generator/src/AiToolsCarouselSlides.tsx:
 *        AiToolsCoverSlide → 5×AiToolsToolSlide → AiToolsCTASlide
 *      (rendered as STILLS through services/carouselGenerator.renderSlide)
 *   4. Post the carousel to Instagram via the Graph API.
 *   5. Record `ai_tools_carousel_history` so we don't repeat tools for 14d.
 *   6. Log to `schedulerLogs` (type: 'ai_tools_carousel') for the admin UI.
 *
 * Triggered by:
 *   - cron `dailyAiToolsCarouselEn` (09:00 IL) / `dailyAiToolsCarouselHe` (09:15 IL)
 *   - onCall `triggerAiToolsCarousel`
 *   - onRequest `triggerAiToolsCarouselHttp` (admin key)
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const { logger, db } = require('./config');
const { renderSlide } = require('./services/carouselGenerator');

// ─── IG constants — mirror instagramCarousel.js ────────────────────────────
const IG_USER_ID = '17841427939019963';
const IG_TOKEN_FALLBACK =
  'EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD';

const TOOLS_PER_CAROUSEL = 5;
const HISTORY_COLL = 'ai_tools_carousel_history';
const HISTORY_LOOKBACK_DAYS = 14;
const TOOLS_COLL = 'ai_tools';
const BRAND_PRIMARY = '#2196F3';

function getIgToken() {
  return process.env.IG_ACCESS_TOKEN || IG_TOKEN_FALLBACK;
}

async function createIgChild(imageUrl) {
  const token = getIgToken();
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: token,
  });
  const res = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG child container error: ${JSON.stringify(data.error)}`);
  return data.id;
}

async function publishCarousel(childIds, caption) {
  const token = getIgToken();
  const createParams = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: token,
  });
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: createParams,
  });
  const createData = await createRes.json();
  if (createData.error) throw new Error(`IG parent error: ${JSON.stringify(createData.error)}`);
  const parentId = createData.id;

  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await (
      await fetch(`https://graph.facebook.com/v20.0/${parentId}?fields=status_code&access_token=${token}`)
    ).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('IG parent container processing error');
  }

  const publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: parentId, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG publish error: ${JSON.stringify(publishData.error)}`);
  return publishData.id;
}

/**
 * Publish a single image as an Instagram STORY.
 * Stories use media_type=STORIES and do NOT support captions.
 *
 *   POST /{IG_USER_ID}/media?image_url=...&media_type=STORIES
 *   POST /{IG_USER_ID}/media_publish?creation_id=...
 */
async function publishStory(imageUrl) {
  const token = getIgToken();
  // Step 1: create story media container
  const createParams = new URLSearchParams({
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: token,
  });
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: createParams,
  });
  const createJson = await createRes.json();
  if (!createJson.id) {
    throw new Error('Story media create failed: ' + JSON.stringify(createJson));
  }

  // Step 2: publish
  const pubRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({
      creation_id: createJson.id,
      access_token: token,
    }),
  });
  const pubJson = await pubRes.json();
  if (!pubJson.id) {
    throw new Error('Story publish failed: ' + JSON.stringify(pubJson));
  }
  return pubJson.id;
}

// ─── helpers ────────────────────────────────────────────────────────────────
function domainOf(url) {
  try { return new URL(url).hostname; } catch (_) { return null; }
}

function parseGithubOwner(repoUrl) {
  if (!repoUrl) return null;
  const m = String(repoUrl).match(/github\.com\/([^/]+)/i);
  return m ? m[1] : null;
}

function escapeXml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fmtDate(language) {
  const d = new Date();
  if (language === 'he') {
    return d.toLocaleDateString('he-IL', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// ─── logo fetcher ──────────────────────────────────────────────────────────
async function fetchWithTimeout(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (_) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function letterAvatar(name, size = 360) {
  const initials = String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <rect width="100%" height="100%" rx="${size}" ry="${size}" fill="${BRAND_PRIMARY}"/>
    <text x="50%" y="50%" font-family="Helvetica,Arial,sans-serif" font-weight="800"
          font-size="${Math.floor(size * 0.45)}" fill="#fff"
          text-anchor="middle" dominant-baseline="central">${escapeXml(initials)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const _anthropicFavCache = { buf: null, fetched: false };
async function getAnthropicFavicon() {
  if (_anthropicFavCache.fetched) return _anthropicFavCache.buf;
  _anthropicFavCache.fetched = true;
  _anthropicFavCache.buf = await fetchWithTimeout('https://www.anthropic.com/favicon.ico', 8000);
  return _anthropicFavCache.buf;
}

/**
 * Returns a 360x360 PNG buffer normalized to a transparent square canvas.
 */
async function fetchToolLogo(tool) {
  try {
    let buf = null;

    if (tool.iconUrl) {
      buf = await fetchWithTimeout(tool.iconUrl, 8000);
      if (buf) return await normalizeLogo(buf, tool.name);
    }

    if (tool.type === 'claude-skill') {
      buf = await getAnthropicFavicon();
      if (buf) return await normalizeLogo(buf, tool.name);
    } else if (tool.type === 'github-repo') {
      const owner = parseGithubOwner(tool.repoUrl || tool.homepage);
      if (owner) {
        buf = await fetchWithTimeout(`https://github.com/${owner}.png?size=400`, 8000);
        if (buf) return await normalizeLogo(buf, tool.name);
      }
    }

    // mcp-connector / llm-product / fallback
    const d = domainOf(tool.homepage || tool.repoUrl);
    if (d) {
      buf = await fetchWithTimeout(`https://icon.horse/icon/${d}`, 8000);
      if (!buf) {
        buf = await fetchWithTimeout(
          `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=256`,
          8000,
        );
      }
      if (buf) return await normalizeLogo(buf, tool.name);
    }
  } catch (err) {
    logger.warn(`[aiToolsCarousel] logo fetch failed for ${tool.slug}: ${err.message}`);
  }
  return letterAvatar(tool.name);
}

async function normalizeLogo(buf, name) {
  try {
    return await sharp(buf)
      .resize(360, 360, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toBuffer();
  } catch (_) {
    return letterAvatar(name);
  }
}

// ─── logo upload (cached by slug) ──────────────────────────────────────────
/**
 * Upload a normalized logo PNG to Firebase Storage at a stable, slug-keyed
 * path so subsequent runs reuse the same URL. Returns a public HTTPS URL.
 * If the object already exists, we skip the upload and return its URL.
 */
async function uploadToolLogo(slug, buf) {
  const bucket = admin.storage().bucket();
  const dest = `ai-tools-carousel/logos/${slug}.png`;
  const file = bucket.file(dest);
  try {
    const [exists] = await file.exists();
    if (!exists) {
      await file.save(buf, {
        contentType: 'image/png',
        resumable: false,
        public: true,
        metadata: { cacheControl: 'public, max-age=86400' },
      });
      try { await file.makePublic(); } catch (_) { /* save() already public */ }
    }
  } catch (err) {
    // Fall through and still attempt to return the canonical URL — public
    // bucket usually serves the older copy if present.
    logger.warn(`[aiToolsCarousel] logo upload skip/failed for ${slug}: ${err.message}`);
  }
  return `https://storage.googleapis.com/${bucket.name}/${dest}`;
}

// ─── tool picking ──────────────────────────────────────────────────────────
async function getUsedSlugs(language) {
  const since = new Date(Date.now() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const snap = await db.collection(HISTORY_COLL)
    .where('usedAt', '>=', admin.firestore.Timestamp.fromDate(since))
    .get()
    .catch(() => ({ forEach: () => {} }));
  const used = new Set();
  snap.forEach((doc) => {
    const d = doc.data();
    if (d && d.slug && d.language === language) used.add(d.slug);
  });
  return used;
}

async function pickTools({ language, toolSlugs }) {
  // Explicit slug list path
  if (Array.isArray(toolSlugs) && toolSlugs.length) {
    const out = [];
    for (const slug of toolSlugs.slice(0, TOOLS_PER_CAROUSEL)) {
      const d = await db.collection(TOOLS_COLL).doc(slug).get();
      if (d.exists) out.push({ id: d.id, ...d.data() });
    }
    if (out.length) return out;
  }

  const snap = await db.collection(TOOLS_COLL)
    .where('published', '==', true)
    .orderBy('trendingScore', 'desc')
    .limit(60)
    .get();
  const all = [];
  snap.forEach((doc) => all.push({ id: doc.id, ...doc.data() }));
  if (!all.length) return [];

  const used = await getUsedSlugs(language);
  const eligible = all.filter((t) => !used.has(t.slug));
  
  let pool = eligible;
  if (eligible.length < TOOLS_PER_CAROUSEL) {
    const stale = all.filter((t) => used.has(t.slug));
    stale.sort(() => Math.random() - 0.5); // Shuffle previously used ones for variety
    pool = [...eligible, ...stale];
  }

  // Type-mix preference
  const want = ['claude-skill', 'mcp-connector', 'github-repo', 'llm-product'];
  const picked = [];
  const pickedSlugs = new Set();
  for (const type of want) {
    const cand = pool.find((t) => t.type === type && !pickedSlugs.has(t.slug));
    if (cand) {
      picked.push(cand);
      pickedSlugs.add(cand.slug);
    }
  }
  // Wildcard — top remaining
  for (const t of pool) {
    if (picked.length >= TOOLS_PER_CAROUSEL) break;
    if (!pickedSlugs.has(t.slug)) {
      picked.push(t);
      pickedSlugs.add(t.slug);
    }
  }
  return picked.slice(0, TOOLS_PER_CAROUSEL);
}

// ─── caption ───────────────────────────────────────────────────────────────
function buildCaption({ tools, language }) {
  const date = fmtDate(language);
  const names = tools.map((t) => t.name).join(', ');
  if (language === 'he') {
    return [
      `🔥 דרופ הכלים היומי — ${date}`,
      '',
      `${names} — מדורגים לפי טרנדינג, נבחנו על־ידי Claude.`,
      '',
      'גללו, שמרו את המועדפים, וצללו פנימה ב־trendingtechdaily.com/he/ai-tools',
      '',
      '#בינה_מלאכותית #AI #ClaudeAI #MCP #AITools #DeveloperTools #TechTools #פרודקטיביות #StartupTools #IndieDev #AIAgents',
    ].join('\n');
  }
  return [
    `🔥 Today's AI Tools Drop — ${date}`,
    '',
    `${names} — ranked by trending score, reviewed by Claude.`,
    '',
    'Swipe through, save your favorites, then dive in at trendingtechdaily.com/ai-tools',
    '',
    '#AI #ClaudeAI #MCP #AITools #DeveloperTools #TechTools #Productivity #StartupTools #IndieDev #AIAgents',
  ].join('\n');
}

// ─── main ──────────────────────────────────────────────────────────────────
/**
 * @param {Object} opts
 * @param {'manual'|'cron'} [opts.trigger='manual']
 * @param {'en'|'he'} [opts.language='en']
 * @param {string[]} [opts.toolSlugs]
 * @param {boolean} [opts.autoPublish=true]
 */
async function postDailyAiToolsCarousel({
  trigger = 'manual',
  language = 'en',
  toolSlugs,
  autoPublish = true,
} = {}) {
  const runId = `aitools_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const startedAt = admin.firestore.FieldValue.serverTimestamp();
  const logRef = await db.collection('schedulerLogs').add({
    type: 'ai_tools_carousel',
    trigger,
    language,
    status: 'started',
    runId,
    startedAt,
  });

  try {
    // 1. pick tools
    const tools = await pickTools({ language, toolSlugs });
    if (!tools.length) throw new Error('No AI tools found to feature.');
    logger.info(`[aiToolsCarousel] picked ${tools.length}: ${tools.map((t) => t.slug).join(', ')}`);

    await logRef.update({
      status: 'fetching_logos',
      toolSlugs: tools.map((t) => t.slug),
    });

    // 2. fetch + upload all logos in parallel; attach a public URL to each tool.
    await Promise.all(tools.map(async (t) => {
      const raw = await fetchToolLogo(t);
      try {
        t._logoUrl = await uploadToolLogo(t.slug, raw);
      } catch (e) {
        logger.warn(`[aiToolsCarousel] logo URL unavailable for ${t.slug}: ${e.message}`);
        t._logoUrl = null;
      }
    }));

    await logRef.update({ status: 'rendering' });

    // 3. render slides on Remotion Lambda (single-frame stills, 1080x1080)
    const hebrew = language === 'he';
    const date = fmtDate(language);
    const lineup = tools.map((t) => ({ name: t.name, logoUrl: t._logoUrl || undefined }));

    // total tool count for CTA — best effort; falls back to a sane default
    let totalToolCount = 100;
    try {
      const agg = await db.collection(TOOLS_COLL).where('published', '==', true).count().get();
      const n = agg.data().count;
      if (Number.isFinite(n) && n > 0) totalToolCount = n;
    } catch (_) { /* keep default */ }

    const slideJobs = [];

    // Slide 0 — cover
    slideJobs.push(renderSlide('AiToolsCoverSlide', {
      date,
      lineup,
      hebrew,
    }));

    // Slides 1..5 — tool slides
    tools.forEach((t, i) => {
      const shortDesc = (hebrew ? t.shortDesc_he : t.shortDesc_en)
        || (hebrew ? t.description_he : t.description_en)
        || '';
      slideJobs.push(renderSlide('AiToolsToolSlide', {
        index: i + 1,
        total: tools.length,
        hebrew,
        tool: {
          slug: t.slug,
          name: t.name,
          type: t.type,
          category: t.category || '',
          shortDesc,
          claudeTake: t.claudeTake || '',
          claudeTakeBy: t.claudeTakeBy || 'Claude',
          bestFor: Array.isArray(t.bestFor) ? t.bestFor : [],
          pricing: t.pricing || '',
          trendingScore: Number(t.trendingScore) || 0,
          logoUrl: t._logoUrl || undefined,
        },
      }));
    });

    // Last slide — CTA
    slideJobs.push(renderSlide('AiToolsCTASlide', {
      hebrew,
      toolCount: totalToolCount,
    }));

    const slideUrls = await Promise.all(slideJobs);
    logger.info(`[aiToolsCarousel] rendered ${slideUrls.length} Remotion stills`);

    await logRef.update({ status: 'uploaded', slideUrls });

    // 4. mark history (always, even if publish skipped — slides were rendered)
    const now = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all(tools.map((t) =>
      db.collection(HISTORY_COLL).add({
        slug: t.slug,
        language,
        runId,
        usedAt: now,
      }).catch((e) => logger.warn(`history write failed for ${t.slug}: ${e.message}`))
    ));

    let mediaId = null;
    let instagramUrl = null;
    let storyUrl = null;
    let storyMediaId = null;

    if (autoPublish) {
      await logRef.update({ status: 'creating_containers' });
      const childIds = [];
      for (const url of slideUrls) {
        childIds.push(await createIgChild(url));
      }
      await logRef.update({ status: 'publishing' });
      const caption = buildCaption({ tools, language });
      mediaId = await publishCarousel(childIds, caption);
      instagramUrl = `https://www.instagram.com/p/${mediaId}/`;
      logger.info(`[aiToolsCarousel] PUBLISHED ${mediaId}`);

      // ── Story: render a single 1080x1920 still and post to IG Stories ──
      try {
        await logRef.update({ status: 'rendering_story' });
        const ctaUrl = hebrew
          ? 'trendingtechdaily.com/he/ai-tools'
          : 'trendingtechdaily.com/ai-tools';
        const storyTools = tools.map((t) => {
          const shortDesc = (hebrew ? t.shortDesc_he : t.shortDesc_en)
            || (hebrew ? t.description_he : t.description_en)
            || '';
          return {
            slug: t.slug,
            name: t.name,
            type: t.type,
            shortDesc,
            trendingScore: Number(t.trendingScore) || 0,
            logoUrl: t._logoUrl || undefined,
          };
        });
        storyUrl = await renderSlide('AiToolsStorySlide', {
          date,
          hebrew,
          tools: storyTools,
          ctaUrl,
        });
        logger.info(`[aiToolsCarousel] story rendered: ${storyUrl}`);
        await logRef.update({ status: 'publishing_story', storyUrl });
        try {
          storyMediaId = await publishStory(storyUrl);
        } catch (e) {
          logger.warn(`[aiToolsCarousel] story publish failed: ${e.message}`);
          await logRef.update({ storyError: e.message });
          storyMediaId = null;
        }
        if (storyMediaId) {
          logger.info(`[aiToolsCarousel] STORY PUBLISHED ${storyMediaId}`);
        }
      } catch (storyErr) {
        logger.warn(`[aiToolsCarousel] story step failed (non-fatal): ${storyErr.message}`);
      }
    }

    await logRef.update({
      status: 'success',
      mediaId,
      instagramUrl,
      storyUrl,
      storyMediaId,
      autoPublish,
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      runId,
      slideUrls,
      instagramUrl,
      mediaId,
      storyUrl,
      storyMediaId,
      toolSlugs: tools.map((t) => t.slug),
    };
  } catch (err) {
    logger.error('[aiToolsCarousel] FAILED:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      finishedAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    return {
      success: false,
      runId,
      error: err.message || String(err),
      toolSlugs: [],
    };
  }
}

module.exports = { postDailyAiToolsCarousel };
