// functions/index.js

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger, admin, db } = require("./config");
const cors = require("cors")({ origin: true });
const { requireAdmin } = require("./middleware/auth");

// === API (Express App) ===
const apiApp = require("./api");
exports.api = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    // Grant the 'api' function access to all secrets its routes might need
    secrets: [
      "NEWS_API_KEY",
      "GNEWS_API_KEY",
      "FINNHUB_API_KEY",
      "YOUTUBE_API_KEY",
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "UNSPLASH_ACCESS_KEY",
      "GEMINI_API_KEY",
    ],
  },
  apiApp,
);

// === HTTP Triggers ===
const searchCallables = require('./callable/search');
const { fetchNewsManually } = require("./http/newsFetcher");
const { serveSitemap } = require("./http/sitemap");
const legacyProxies = require("./http/legacy");
const { handleArticleRouting, handleLegacyRedirects, handleDynamicRouting } = require("./http/routing");
const { handleComparison, handleHeComparison } = require("./http/comparisons");
const comparisonCallables = require("./callable/comparisons");
const {
  handleAiToolsLanding,
  handleAiToolDetail,
  handleHeAiToolsLanding,
  handleHeAiToolDetail,
  handleAiToolsGlossary,
  handleHeAiToolsGlossary,
  handleAiToolsGuide,
  handleHeAiToolsGuide,
} = require("./http/aiTools");
//const { debugRouting } = require("./debug-routing");

// Routing functions
exports.handleArticleRouting = onRequest({
  region: "us-central1",
  maxInstances: 10,
  memory: "256MiB",
}, handleArticleRouting);

exports.handleLegacyRedirects = onRequest({ region: "us-central1" }, handleLegacyRedirects);

exports.handleDynamicRouting = onRequest({ region: "us-central1" }, handleDynamicRouting);

// Debug function
//exports.debugRouting = onRequest({ region: "us-central1" }, debugRouting);

// Wrap the fetchNewsManually function with CORS
exports.fetchNewsManually = onRequest({ secrets: ["NEWS_API_KEY"], region: "us-central1" }, (req, res) => {
  cors(req, res, () => fetchNewsManually(req, res));
});

exports.serveSitemap = onRequest({ region: "us-central1" }, serveSitemap);

// Comparison SSR routes ("X vs Y" pages)
exports.handleComparison = onRequest({ region: "us-central1", memory: "256MiB" }, handleComparison);
exports.handleHeComparison = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeComparison);

// AI Tools Pulse SSR routes (/ai-tools, /ai-tools/:slug, plus HE mirrors)
exports.aiToolsLanding = onRequest({ region: "us-central1", memory: "256MiB" }, handleAiToolsLanding);
exports.aiToolDetail   = onRequest({ region: "us-central1", memory: "256MiB" }, handleAiToolDetail);
exports.heAiToolsLanding = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeAiToolsLanding);
exports.heAiToolDetail   = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeAiToolDetail);

// Design Systems Decoded SSR routes (/design-systems, /design-systems/:slug, + HE mirrors)
const {
  handleDesignSystemsLanding,
  handleDesignSystemDetail,
  handleHeDesignSystemsLanding,
  handleHeDesignSystemDetail,
} = require("./http/designSystems");
exports.designSystemsLanding   = onRequest({ region: "us-central1", memory: "256MiB" }, handleDesignSystemsLanding);
exports.designSystemDetail     = onRequest({ region: "us-central1", memory: "256MiB" }, handleDesignSystemDetail);
exports.heDesignSystemsLanding = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeDesignSystemsLanding);
exports.heDesignSystemDetail   = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeDesignSystemDetail);

// AI Tools Pulse glossary + guide SSR
exports.aiToolsGlossary   = onRequest({ region: "us-central1", memory: "256MiB" }, handleAiToolsGlossary);
exports.heAiToolsGlossary = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeAiToolsGlossary);
exports.aiToolsGuide      = onRequest({ region: "us-central1", memory: "256MiB" }, handleAiToolsGuide);
exports.heAiToolsGuide    = onRequest({ region: "us-central1", memory: "256MiB" }, handleHeAiToolsGuide);

// Comparison admin callables
exports.generateComparison = comparisonCallables.generateComparison;
exports.bulkGenerateComparisons = comparisonCallables.bulkGenerateComparisons;

exports.yahooFinanceHistory = onRequest({ cors: true }, legacyProxies.yahooFinanceHistory);
exports.yahooFinance = onRequest({ cors: true }, legacyProxies.yahooFinance);

// Export search callable functions
exports.searchArticles = onCall({ secrets: ["GEMINI_API_KEY"], region: 'us-central1' }, searchCallables.searchArticles);
exports.getSearchSuggestions = onCall({ secrets: ["GEMINI_API_KEY"], region: 'us-central1' }, searchCallables.getSearchSuggestions);
exports.enhancedSearch = onCall({ secrets: ["GROK_API_KEY", "GEMINI_API_KEY"], region: 'us-central1', timeoutSeconds: 60 }, searchCallables.enhancedSearch);

// === Callable Functions ===
const aiCallables = require("./callable/ai");
const adminCallables = require("./callable/admin");
const proxyCallables = require("./callable/proxies");
const toolCallables = require("./callable/tools");
const { getTechPodcastsHandler } = require("./services/spotifyService");

// AI Callables
exports.generateArticleContent = onCall({ secrets: ["GEMINI_API_KEY"], timeoutSeconds: 180, region: "us-central1" }, aiCallables.generateArticleContent);
exports.rephraseText = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, aiCallables.rephraseText);
exports.suggestArticleTopic = onCall({ secrets: ["GROK_API_KEY", "GEMINI_API_KEY"], region: "us-central1" }, aiCallables.suggestArticleTopic);
exports.generateArticleImage = onCall({ secrets: ["UNSPLASH_ACCESS_KEY", "GEMINI_API_KEY"], region: "us-central1", timeoutSeconds: 60 }, aiCallables.generateArticleImage);

exports.generateTopTenArticle = onRequest({
  secrets: ["UNSPLASH_ACCESS_KEY", "GEMINI_API_KEY"],
  region: "us-central1",
  timeoutSeconds: 300,
  cors: ["https://trendingtech-daily.web.app"],
}, async (req, res) => {
  // The built-in cors option handles preflight (OPTIONS) requests automatically.
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (err) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const data = typeof req.body === "object" ? req.body : {};
    const result = await aiCallables.generateTopTenArticle({ data, auth: { uid: decoded.uid, token: decoded } });
    res.json(result);
  } catch (err) {
    logger.error("generateTopTenArticle HTTP error:", err);
    res.status(500).json({ error: err.message || "Failed to generate top list article" });
  }
});

exports.generateHowToArticle = onRequest({
  secrets: ["UNSPLASH_ACCESS_KEY", "GEMINI_API_KEY"],
  region: "us-central1",
  timeoutSeconds: 300,
  cors: ["https://trendingtech-daily.web.app"],
}, async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(match[1]);
    } catch (err) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const data = typeof req.body === "object" ? req.body : {};
    const result = await aiCallables.generateHowToArticle({ data, auth: { uid: decoded.uid, token: decoded } });
    res.json(result);
  } catch (err) {
    logger.error("generateHowToArticle HTTP error:", err);
    res.status(500).json({ error: err.message || "Failed to generate how-to article" });
  }
});

exports.getStockDataForCompanies = onCall({ secrets: ["FINNHUB_API_KEY"], region: "us-central1" }, aiCallables.getStockDataForCompanies);
exports.readArticleAloud = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1", timeoutSeconds: 60 }, aiCallables.readArticleAloud);
exports.generateAIAgentResponse = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1", timeoutSeconds: 120 }, toolCallables.generateAIAgentResponse);

// Admin Callables
exports.createAdmin = onCall(adminCallables.createAdmin);

// Proxy Callables
exports.getNewsApiArticles = onCall({ secrets: ["NEWS_API_KEY"], region: "us-central1" }, proxyCallables.getNewsApiArticles);
exports.getGnewsArticles = onCall({ secrets: ["GNEWS_API_KEY"], region: "us-central1" }, proxyCallables.getGnewsArticles);
exports.getRecommendedVideos = onCall({ secrets: ["YOUTUBE_API_KEY"], region: "us-central1" }, proxyCallables.getRecommendedVideos);
exports.getTechPodcasts = onCall({ secrets: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"], region: "us-central1" }, getTechPodcastsHandler);

// Tool Callables
exports.searchWeb = onCall({ secrets: ["GEMINI_API_KEY"], region: "us-central1" }, toolCallables.searchWeb);
exports.getFinnhubStockData = onCall({ secrets: ["FINNHUB_API_KEY", "GEMINI_API_KEY"], region: "us-central1" }, toolCallables.getFinnhubStockData);

// === Scheduled Functions ===
const { fetchAllNews } = require("./services/newsService");
const { shouldGenerateArticle, generateArticle, generateTrendingArticles } = require("./scheduledArticles");
exports.scheduledNewsFetch = onSchedule({ schedule: "every 4 hours", region: "us-central1", secrets: ["NEWS_API_KEY"] }, async () => {
  logger.info("Scheduled news fetch triggered.");
  try {
    await fetchAllNews({ newsApiKey: process.env.NEWS_API_KEY });
    logger.info("Scheduled news fetch completed successfully.");
  } catch (error) {
    logger.error("Error in scheduled news fetch:", error);
  }
});

exports.autoGenerateArticle = onSchedule({ schedule: "every 1 hours", region: "us-central1", timeoutSeconds: 300, memory: "1GiB", secrets: ["NEWS_API_KEY", "GROK_API_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "TWITTER_BEARER_TOKEN", "YOUTUBE_API_KEY"] }, async () => {
  try {
    const freqEnv = parseInt(process.env.AUTO_ARTICLE_FREQUENCY, 10);
    const frequency = isNaN(freqEnv) ? 3 : Math.min(Math.max(freqEnv, 1), 3);
    const { shouldGenerate, articlesPerRun } = await shouldGenerateArticle(frequency, 1);
    if (!shouldGenerate) return;
    for (let i = 0; i < articlesPerRun; i++) {
      await generateArticle(process.env.NEWS_API_KEY, 'scheduled');
    }
    logger.info(`Auto-generated ${articlesPerRun} tech article(s) successfully.`);
  } catch (error) {
    logger.error("Error auto-generating article:", error);
  }
});

exports.testGenerateArticle = onCall({ secrets: ["NEWS_API_KEY", "GROK_API_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY"], region: "us-central1", memory: "1GiB" }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  try {
    await generateArticle(process.env.NEWS_API_KEY);
    return { success: true };
  } catch (error) {
    logger.error('Error in testGenerateArticle:', error);
    throw new HttpsError('internal', 'Failed to generate article');
  }
});

exports.dailyTrendingArticles = onSchedule({ schedule: "0 8,20 * * *", region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: ["NEWS_API_KEY", "GNEWS_API_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL", "TWITTER_BEARER_TOKEN", "YOUTUBE_API_KEY"] }, async () => {
  logger.info("Scheduled trending articles fetch triggered (Twice daily).");
  try {
    await generateTrendingArticles(2, 'scheduled');
    logger.info("Scheduled trending articles fetch completed successfully.");
  } catch (error) {
    logger.error("Error in scheduled trending articles:", error);
  }
});

exports.triggerTrendingArticles = onCall({ secrets: ["NEWS_API_KEY", "GNEWS_API_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL", "TWITTER_BEARER_TOKEN", "YOUTUBE_API_KEY"], region: "us-central1", timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  try {
    const count = request.data.count || 2;
    await generateTrendingArticles(count, 'manual');
    return { success: true };
  } catch (error) {
    logger.error('Error in triggerTrendingArticles:', error);
    throw new HttpsError('internal', 'Failed to generate trending articles');
  }
});

// HTTP shim (admin-key gated) — same as triggerTrendingArticles but callable
// from curl. Useful for quick smoke tests / verifying the cover thumbnail flow.
exports.triggerTrendingArticlesHttp = onRequest({
  secrets: ["NEWS_API_KEY", "GNEWS_API_KEY", "GEMINI_API_KEY", "UNSPLASH_ACCESS_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL", "TWITTER_BEARER_TOKEN", "YOUTUBE_API_KEY", "CARTOON_TEST_ADMIN_KEY"],
  region: "us-central1", timeoutSeconds: 540, memory: "1GiB", cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const count = Math.min(Math.max(parseInt(req.body?.count, 10) || 2, 1), 5);
    logger.info(`[triggerTrendingArticlesHttp] generating ${count} article(s)`);
    await generateTrendingArticles(count, 'manual-http');
    return res.json({ success: true, count });
  } catch (error) {
    logger.error('triggerTrendingArticlesHttp failed:', error);
    return res.status(500).json({ error: error.message || String(error) });
  }
});

// === Instagram Comparison Carousel Automation ===
// Posts a Hebrew carousel summarising 4 fresh "X vs Y" comparisons.
// Runs twice daily at 10:00 & 18:00 Asia/Jerusalem — offset from the
// existing twice-daily video pushes so the feed gets a steadier drip.
const { postComparisonCarousel } = require('./instagramCarousel');

exports.dailyComparisonCarousel = onSchedule({
  schedule: '0 10,18 * * *',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',                                   // sharp + Gemini image-gen
  secrets: ['GEMINI_API_KEY', 'REMOTION_AWS_ACCESS_KEY_ID', 'REMOTION_AWS_SECRET_ACCESS_KEY'],
}, async () => {
  logger.info('[dailyComparisonCarousel] cron fired');
  const result = await postComparisonCarousel({ trigger: 'scheduled' });
  logger.info('[dailyComparisonCarousel] result:', JSON.stringify(result));
});

exports.triggerInstagramCarousel = onCall({
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: ['GEMINI_API_KEY', 'REMOTION_AWS_ACCESS_KEY_ID', 'REMOTION_AWS_SECRET_ACCESS_KEY'],
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const count = Math.min(Math.max(Number(request.data && request.data.count) || 4, 1), 8);
  const result = await postComparisonCarousel({ trigger: 'manual', count });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Carousel post failed');
  }
  return result;
});

// === Daily AI Tools Pulse Carousel =========================================
// Posts a bilingual daily Instagram carousel featuring 5 trending AI tools
// (mix of Claude Skills + MCP + GitHub + LLM products), each with its real
// logo, short description, Claude's Take, pricing, and trending score.
// EN goes out at 09:00 IL, HE at 09:15 IL — offset to avoid IG rate limits.
const { postDailyAiToolsCarousel } = require('./aiToolsCarouselPipeline');

// Reuses the same IG token fallback as instagramCarousel.js. CARTOON_TEST_ADMIN_KEY
// gates the HTTP variant.
const AI_TOOLS_CAROUSEL_SECRETS = [
  'GEMINI_API_KEY',
  'CARTOON_TEST_ADMIN_KEY',
  'REMOTION_AWS_ACCESS_KEY_ID',
  'REMOTION_AWS_SECRET_ACCESS_KEY',
];

exports.dailyAiToolsCarouselEn = onSchedule({
  schedule: '0 9 * * *',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: AI_TOOLS_CAROUSEL_SECRETS,
}, async () => {
  logger.info('[dailyAiToolsCarouselEn] cron fired');
  const r = await postDailyAiToolsCarousel({ trigger: 'cron', language: 'en', autoPublish: true });
  logger.info('[dailyAiToolsCarouselEn]', JSON.stringify(r).slice(0, 800));
});

exports.dailyAiToolsCarouselHe = onSchedule({
  schedule: '15 9 * * *',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: AI_TOOLS_CAROUSEL_SECRETS,
}, async () => {
  logger.info('[dailyAiToolsCarouselHe] cron fired');
  const r = await postDailyAiToolsCarousel({ trigger: 'cron', language: 'he', autoPublish: true });
  logger.info('[dailyAiToolsCarouselHe]', JSON.stringify(r).slice(0, 800));
});

exports.triggerAiToolsCarousel = onCall({
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: AI_TOOLS_CAROUSEL_SECRETS,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const data = request.data || {};
  const language = data.language === 'he' ? 'he' : 'en';
  const autoPublish = data.autoPublish !== false;
  const toolSlugs = Array.isArray(data.toolSlugs) ? data.toolSlugs : undefined;
  const result = await postDailyAiToolsCarousel({
    trigger: 'manual',
    language,
    autoPublish,
    toolSlugs,
  });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'AI tools carousel failed');
  }
  return result;
});

exports.triggerAiToolsCarouselHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: AI_TOOLS_CAROUSEL_SECRETS,
}, async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = req.body || {};
  const language = body.language === 'he' ? 'he' : 'en';
  const autoPublish = body.autoPublish !== false;
  const toolSlugs = Array.isArray(body.toolSlugs) ? body.toolSlugs : undefined;
  const result = await postDailyAiToolsCarousel({
    trigger: 'manual',
    language,
    autoPublish,
    toolSlugs,
  });
  return res.json(result);
});

// === Weekly news digest CRON — Friday evening IL, both languages ==========
// Renders BIT's weekly tech digest and auto-publishes it to TrendingTechDaily
// YouTube + Instagram. HE goes out at 18:00 IL (Friday afternoon — good for
// IL audience right before שבת); EN goes out at 19:00 IL = ~12:00 ET, which
// is a strong US slot.
const { postWeeklyDigest: _cronPostDigest } = require('./weeklyDigestPipeline');

const WEEKLY_DIGEST_CRON_SECRETS = [
  'GEMINI_API_KEY',
  'ELEVENLABS_API_KEY',
  'REMOTION_AWS_ACCESS_KEY_ID',
  'REMOTION_AWS_SECRET_ACCESS_KEY',
];

exports.weeklyDigestCronHe = onSchedule({
  schedule: '0 18 * * 5',            // Fridays 18:00
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: WEEKLY_DIGEST_CRON_SECRETS,
}, async () => {
  logger.info('[weeklyDigestCronHe] firing');
  const result = await _cronPostDigest({ trigger: 'cron', language: 'he', autoPublish: true });
  logger.info('[weeklyDigestCronHe] result:', JSON.stringify(result).slice(0, 800));
});

exports.weeklyDigestCronEn = onSchedule({
  schedule: '0 19 * * 5',            // Fridays 19:00 IL = noon ET
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: WEEKLY_DIGEST_CRON_SECRETS,
}, async () => {
  logger.info('[weeklyDigestCronEn] firing');
  const result = await _cronPostDigest({ trigger: 'cron', language: 'en', autoPublish: true });
  logger.info('[weeklyDigestCronEn] result:', JSON.stringify(result).slice(0, 800));
});

// === Weekly news digest (BIT anchor) — admin-callable wrapper ==============
// Same pipeline as the HTTP test endpoint below, but auth via Firebase Auth
// admin claim so the existing admin panels can call it directly.
const { postWeeklyDigest: _postWeeklyDigest, publishDigest: _publishDigest, buildPublishMetadata: _buildMeta } = require('./weeklyDigestPipeline');
exports.triggerWeeklyDigestAdmin = onCall({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: [
    'GEMINI_API_KEY',
    'ELEVENLABS_API_KEY',
    'REMOTION_AWS_ACCESS_KEY_ID',
    'REMOTION_AWS_SECRET_ACCESS_KEY',
  ],
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const language = (request.data && request.data.language === 'en') ? 'en' : 'he';
  const articleId = request.data && typeof request.data.articleId === 'string' && request.data.articleId.trim()
    ? request.data.articleId.trim()
    : undefined;
  const autoPublish = !!(request.data && request.data.autoPublish === true);
  const result = await _postWeeklyDigest({ trigger: 'admin', language, articleId, autoPublish });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Weekly digest failed');
  }
  return result;
});

// === Publish an existing weekly digest render to YT + IG ====================
// Takes optional { runId, language }. If runId is omitted, auto-finds the
// latest successful run for the given language (default 'he').
exports.publishExistingDigest = onCall({
  region: 'us-central1',
  timeoutSeconds: 600,
  memory: '1GiB',
  secrets: [
    'GEMINI_API_KEY',
  ],
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  let runId = request.data && request.data.runId;
  const language = (request.data && request.data.language) || 'he';

  let doc;
  if (runId) {
    // Find by explicit runId
    const snap = await db.collection('cartoon_test_runs').where('runId', '==', runId).limit(1).get();
    if (snap.empty) throw new HttpsError('not-found', `Run ${runId} not found`);
    doc = snap.docs[0];
  } else {
    // Auto-find latest successful run for this language
    const snap = await db.collection('cartoon_test_runs')
      .where('status', '==', 'success')
      .where('language', '==', language)
      .orderBy('completedAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) throw new HttpsError('not-found', `No successful ${language} run found`);
    doc = snap.docs[0];
    runId = doc.data().runId;
    logger.info(`[publishExistingDigest] auto-selected run: ${runId}`);
  }

  const run = doc.data();
  if (!run.videoUrl) throw new HttpsError('failed-precondition', 'Run has no videoUrl');

  // Reconstruct a minimal digest object for buildPublishMetadata
  const digest = {
    language: run.language || 'he',
    singleStory: run.type === 'single_story',
    stories: (run.stories || []).map(s => ({ title: s.title || '' })),
  };

  const logRef = doc.ref;
  try {
    const publishResult = await _publishDigest({ videoUrl: run.videoUrl, digest, logRef });
    await logRef.update({
      publishResult,
      publishedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: true, runId, ...publishResult };
  } catch (err) {
    logger.error('[publishExistingDigest] failed:', err.message);
    throw new HttpsError('internal', err.message || 'Publish failed');
  }
});

// === Weekly news digest (BIT anchor) — manual trigger only for now ===
// Builds the "BIT's Tech News Roundup" video from this week's published
// articles (top 5 with attached video). Returns the MP4 URL — does NOT
// publish to IG/YT until the user reviews it.
const { postWeeklyDigest } = require('./weeklyDigestPipeline');
exports.triggerWeeklyDigest = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: [
    'GEMINI_API_KEY',
    'ELEVENLABS_API_KEY',
    'REMOTION_AWS_ACCESS_KEY_ID',
    'REMOTION_AWS_SECRET_ACCESS_KEY',
    'CARTOON_TEST_ADMIN_KEY',
  ],
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const language = (req.body && req.body.language === 'en') ? 'en' : 'he';
  const articleId = req.body && typeof req.body.articleId === 'string' && req.body.articleId.trim()
    ? req.body.articleId.trim()
    : undefined;
  const autoPublish = !!(req.body && req.body.autoPublish === true);
  try {
    const result = await postWeeklyDigest({ trigger: 'manual', language, articleId, autoPublish });
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// === AI Tools Pulse — LAUNCH PROMO video (BIT-presented 50s 9:16 ad) =======
// Polished launch announcement for the new /ai-tools directory.
const { postAiToolsLaunch } = require('./aiToolsLaunchPipeline');
const AI_TOOLS_LAUNCH_SECRETS = [
  'GEMINI_API_KEY',
  'ELEVENLABS_API_KEY',
  'REMOTION_AWS_ACCESS_KEY_ID',
  'REMOTION_AWS_SECRET_ACCESS_KEY',
  'CARTOON_TEST_ADMIN_KEY',
];
exports.triggerAiToolsLaunchVideo = onCall({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_LAUNCH_SECRETS,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const language = (request.data && request.data.language === 'he') ? 'he' : 'en';
  const autoPublish = !!(request.data && request.data.autoPublish === true);
  const result = await postAiToolsLaunch({ trigger: 'admin', language, autoPublish });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'AI Tools launch video failed');
  }
  return result;
});

// HTTP variant for CLI — admin-key gated.
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"language":"en","autoPublish":false}' \
//        https://triggeraitoolslaunchvideohttp-xa54maubsa-uc.a.run.app
exports.triggerAiToolsLaunchVideoHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_LAUNCH_SECRETS,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const language = (req.body && req.body.language === 'he') ? 'he' : 'en';
  const autoPublish = !!(req.body && req.body.autoPublish === true);
  try {
    const result = await postAiToolsLaunch({ trigger: 'manual', language, autoPublish });
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// === AI Tools Explainer videos (3 topics × 2 languages = 6 videos) ===
// Builds the short BIT-anchor explainer played at the top of each AI Tools
// Pulse page. Each video is ~30-45s, 9:16, stored in Firebase Storage at
// `ai-tools-explainers/{topic}-{language}.mp4` and recorded in Firestore
// at `ai_tools_explainers/{topic}-{language}` so SSR can embed it.
const {
  renderAiToolsExplainer,
  renderAllAiToolsExplainers,
} = require('./aiToolsExplainerPipeline');
const AI_TOOLS_EXPLAINER_SECRETS = [
  'GEMINI_API_KEY',
  'ELEVENLABS_API_KEY',
  'REMOTION_AWS_ACCESS_KEY_ID',
  'REMOTION_AWS_SECRET_ACCESS_KEY',
  'CARTOON_TEST_ADMIN_KEY',
];

exports.triggerAiToolsExplainer = onCall({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_EXPLAINER_SECRETS,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const data = request.data || {};
  const topic = ['landing', 'guide', 'glossary'].includes(data.topic) ? data.topic : 'landing';
  const language = data.language === 'he' ? 'he' : 'en';
  const autoPublish = !!data.autoPublish;
  const result = await renderAiToolsExplainer({ topic, language, autoPublish });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'AI Tools explainer failed');
  }
  return result;
});

// HTTP — render ONE explainer.
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"topic":"landing","language":"en","autoPublish":false}' \
//        https://triggeraitoolsexplainerhttp-xa54maubsa-uc.a.run.app
exports.triggerAiToolsExplainerHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_EXPLAINER_SECRETS,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = req.body || {};
  const topic = ['landing', 'guide', 'glossary'].includes(body.topic) ? body.topic : 'landing';
  const language = body.language === 'he' ? 'he' : 'en';
  const autoPublish = !!body.autoPublish;
  try {
    const result = await renderAiToolsExplainer({ topic, language, autoPublish });
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// HTTP — render ALL 6 explainers sequentially (~30-60 min total).
// Note: each render ~5-10 min, six runs may exceed a single function's
// 60-min ceiling. The handler keeps going past timeout in the background;
// caller should rely on Firestore docs to know which ones landed.
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" \
//        https://renderallaitoolsexplainershttp-xa54maubsa-uc.a.run.app
exports.renderAllAiToolsExplainersHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_EXPLAINER_SECRETS,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const autoPublish = !!(req.body && req.body.autoPublish === true);
  try {
    const results = await renderAllAiToolsExplainers({ autoPublish });
    const ok = results.every((r) => r.success);
    return res.status(ok ? 200 : 207).json({ success: ok, results });
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// === PREVIEW: Design Systems Decoded sample Reel ===
// One-off endpoint to render a sample DS Reel for stakeholder approval before
// we commit to building the full Design Systems content vertical.
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
//        -d '{"designSystemName":"Material Design","primaryColor":"#1976D2"}' \
//        https://us-central1-trendingtech-daily.cloudfunctions.net/renderDsPreviewHttp
const { runDsPreview } = require('./dsExplainerPreview');
exports.renderDsPreviewHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: AI_TOOLS_EXPLAINER_SECRETS,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  try {
    const result = await runDsPreview({
      designSystemName: body.designSystemName,
      primaryColor: body.primaryColor,
      scripts: Array.isArray(body.scripts) ? body.scripts : undefined,
    });
    return res.status(200).json(result);
  } catch (err) {
    logger.error('renderDsPreviewHttp failed', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// === Design Systems Decoded — full content vertical =======================
// Mirrors AI Tools Pulse infrastructure: catalog seed, GitHub trending refresh,
// list + detail callables, daily IG carousel (EN + HE), weekly Reel (EN + HE).
const designSystems = require('./designSystems');
const { postDailyDesignSystemsCarousel } = require('./designSystemsCarouselPipeline');
const { renderDesignSystemReel } = require('./designSystemsReelPipeline');

const DESIGN_SYSTEMS_SECRETS = [
  'GEMINI_API_KEY',
  'CARTOON_TEST_ADMIN_KEY',
  'REMOTION_AWS_ACCESS_KEY_ID',
  'REMOTION_AWS_SECRET_ACCESS_KEY',
];

// ── Catalog seed (admin onCall) ──
exports.seedDesignSystems = onCall(
  { region: 'us-central1', secrets: ['GEMINI_API_KEY'], timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    try {
      return await designSystems.seedDesignSystems(request.data || {});
    } catch (err) {
      logger.error('seedDesignSystems failed:', err);
      throw new HttpsError('internal', err.message || 'seed failed');
    }
  },
);

// ── Catalog seed (admin-key HTTP) ──
exports.seedDesignSystemsHttp = onRequest(
  { region: 'us-central1', secrets: ['GEMINI_API_KEY', 'CARTOON_TEST_ADMIN_KEY'], timeoutSeconds: 3600, memory: '1GiB' },
  async (req, res) => {
    if (req.headers['x-admin-key'] !== process.env.CARTOON_TEST_ADMIN_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    try {
      const result = await designSystems.seedDesignSystems(req.body || {});
      return res.json(result);
    } catch (err) {
      logger.error('seedDesignSystemsHttp failed:', err);
      return res.status(500).json({ error: err.message || 'seed failed' });
    }
  },
);

// ── Trending refresh (admin onCall + daily cron) ──
exports.refreshDesignSystemsTrending = onCall(
  { region: 'us-central1', timeoutSeconds: 540, memory: '512MiB' },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin only');
    }
    try {
      return await designSystems.refreshDesignSystemsTrending(request.data || {});
    } catch (err) {
      logger.error('refreshDesignSystemsTrending failed:', err);
      throw new HttpsError('internal', err.message || 'refresh failed');
    }
  },
);

exports.refreshDesignSystemsTrendingCron = onSchedule(
  { region: 'us-central1', schedule: '0 3 * * *', timeZone: 'UTC', timeoutSeconds: 540, memory: '512MiB' },
  async () => {
    try {
      const result = await designSystems.refreshDesignSystemsTrending({});
      logger.info('refreshDesignSystemsTrendingCron done:', result);
    } catch (err) {
      logger.error('refreshDesignSystemsTrendingCron failed:', err);
    }
  },
);

// ── Public list + detail ──
exports.getDesignSystemsList = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    try {
      return await designSystems.getDesignSystemsList(request.data || {});
    } catch (err) {
      logger.error('getDesignSystemsList failed:', err);
      throw new HttpsError('internal', err.message || 'list failed');
    }
  },
);

exports.getDesignSystemDetail = onCall(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request) => {
    try {
      const slug = request.data && request.data.slug;
      const language = (request.data && request.data.language) || 'en';
      return await designSystems.getDesignSystemDetail(slug, language);
    } catch (err) {
      logger.error('getDesignSystemDetail failed:', err);
      throw new HttpsError('internal', err.message || 'detail failed');
    }
  },
);

// ── Daily carousel: admin onCall + admin-key HTTP + 2 cron jobs ──
exports.triggerDesignSystemsCarousel = onCall({
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const data = request.data || {};
  const language = data.language === 'he' ? 'he' : 'en';
  const autoPublish = data.autoPublish !== false;
  const slugs = Array.isArray(data.slugs) ? data.slugs : undefined;
  const result = await postDailyDesignSystemsCarousel({
    trigger: 'manual',
    language,
    autoPublish,
    slugs,
  });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Design systems carousel failed');
  }
  return result;
});

exports.triggerDesignSystemsCarouselHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '1GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async (req, res) => {
  if (req.headers['x-admin-key'] !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = req.body || {};
  const language = body.language === 'he' ? 'he' : 'en';
  const autoPublish = body.autoPublish !== false;
  const slugs = Array.isArray(body.slugs) ? body.slugs : undefined;
  const result = await postDailyDesignSystemsCarousel({
    trigger: 'manual',
    language,
    autoPublish,
    slugs,
  });
  return res.json(result);
});

exports.dailyDesignSystemsCarouselEn = onSchedule({
  schedule: '30 10 * * *',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async () => {
  logger.info('[dailyDesignSystemsCarouselEn] cron fired');
  const r = await postDailyDesignSystemsCarousel({ trigger: 'cron', language: 'en', autoPublish: true });
  logger.info('[dailyDesignSystemsCarouselEn]', JSON.stringify(r).slice(0, 800));
});

exports.dailyDesignSystemsCarouselHe = onSchedule({
  schedule: '45 10 * * *',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async () => {
  logger.info('[dailyDesignSystemsCarouselHe] cron fired');
  const r = await postDailyDesignSystemsCarousel({ trigger: 'cron', language: 'he', autoPublish: true });
  logger.info('[dailyDesignSystemsCarouselHe]', JSON.stringify(r).slice(0, 800));
});

// ── Weekly Reel: admin onCall + admin-key HTTP + 2 cron jobs (Wed) ──
exports.triggerDesignSystemsReel = onCall({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin privileges required');
  }
  const data = request.data || {};
  const language = data.language === 'he' ? 'he' : 'en';
  const autoPublish = !!data.autoPublish;
  const designSystemSlug = typeof data.designSystemSlug === 'string' ? data.designSystemSlug : undefined;
  const result = await renderDesignSystemReel({
    trigger: 'manual',
    language,
    designSystemSlug,
    autoPublish,
  });
  if (!result.success) {
    throw new HttpsError('internal', result.error || 'Design systems reel failed');
  }
  return result;
});

exports.triggerDesignSystemsReelHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const body = req.body || {};
  const language = body.language === 'he' ? 'he' : 'en';
  const autoPublish = !!body.autoPublish;
  const designSystemSlug = typeof body.designSystemSlug === 'string' ? body.designSystemSlug : undefined;
  try {
    const result = await renderDesignSystemReel({
      trigger: 'manual',
      language,
      designSystemSlug,
      autoPublish,
    });
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

exports.weeklyDesignSystemsReelEn = onSchedule({
  schedule: '0 11 * * 3',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async () => {
  logger.info('[weeklyDesignSystemsReelEn] cron fired');
  const r = await renderDesignSystemReel({ trigger: 'cron', language: 'en', autoPublish: true });
  logger.info('[weeklyDesignSystemsReelEn]', JSON.stringify(r).slice(0, 800));
});

exports.weeklyDesignSystemsReelHe = onSchedule({
  schedule: '15 11 * * 3',
  timeZone: 'Asia/Jerusalem',
  region: 'us-central1',
  timeoutSeconds: 1800,
  memory: '4GiB',
  secrets: DESIGN_SYSTEMS_SECRETS,
}, async () => {
  logger.info('[weeklyDesignSystemsReelHe] cron fired');
  const r = await renderDesignSystemReel({ trigger: 'cron', language: 'he', autoPublish: true });
  logger.info('[weeklyDesignSystemsReelHe]', JSON.stringify(r).slice(0, 800));
});

// === PREVIEW: Geist-styled article video sample ===
// One-off endpoint to render a sample of the proposed ArticleVideoGeist
// composition against a real recent article + Pexels b-roll + TTS.
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" -H "Content-Type: application/json" \
//        -d '{"language":"en"}' \
//        https://us-central1-trendingtech-daily.cloudfunctions.net/renderGeistSampleHttp
const { renderGeistSample } = require('./render-geist-sample');
exports.renderGeistSampleHttp = onRequest({
  region: 'us-central1',
  timeoutSeconds: 3600,
  memory: '4GiB',
  secrets: [...AI_TOOLS_EXPLAINER_SECRETS, 'PEXELS_API_KEY'],
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const result = await renderGeistSample({
      language: body.language === 'he' ? 'he' : 'en',
      articleId: body.articleId,
      format: ['story', 'cover'].includes(body.format) ? body.format : 'reel',
    });
    return res.status(200).json(result);
  } catch (err) {
    logger.error('renderGeistSampleHttp failed', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

// === Cartoon promo video — TEST endpoint (no admin UI yet) ===
// Renders the BIT / GLITCH cartoon promo video. Returns the MP4 URL.
// NOT published to IG / YT. Hit it once via curl when ready:
//   curl -X POST -H "x-admin-key: $ADMIN_KEY" \
//        -H "Content-Type: application/json" \
//        -d '{"language":"he"}' \
//        https://triggercartoontestvideo-xa54maubsa-uc.a.run.app
const { postCartoonTestVideo } = require('./cartoonVideoPipeline');
exports.triggerCartoonTestVideo = onRequest({
  region: 'us-central1',
  // Veo Fast clips take 60-90s each and we run ~8 in parallel, so the
  // function needs a long timeout. 2GiB to keep Veo SDK + S3 copy comfortable.
  timeoutSeconds: 3600,
  memory: '2GiB',
  secrets: [
    'GEMINI_API_KEY',
    'ELEVENLABS_API_KEY',
    'REMOTION_AWS_ACCESS_KEY_ID',
    'REMOTION_AWS_SECRET_ACCESS_KEY',
    'CARTOON_TEST_ADMIN_KEY',
  ],
  cors: true,
}, async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).send('');
  const adminKey = req.headers['x-admin-key'];
  if (!process.env.CARTOON_TEST_ADMIN_KEY || adminKey !== process.env.CARTOON_TEST_ADMIN_KEY) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const language = (req.body && req.body.language === 'en') ? 'en' : 'he';
  try {
    const result = await postCartoonTestVideo({ language, format: 'promo' });
    if (!result.success) return res.status(500).json(result);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || String(err) });
  }
});

exports.fixMyCategoriesTemporary2 = onRequest({ region: "us-central1" }, async (req, res) => {
  try {
    const snapshot = await db.collection("articles").get();
    let updated = 0;
    const batch = db.batch();
    snapshot.forEach(doc => {
      const cat = doc.data().category;
      if (!cat || cat === 'news' || cat === 'ai' || cat.toLowerCase() === 'uncategorized' || cat === 'startups' || cat === 'software' || cat === 'gadgets' || cat === 'crypto' || cat === 'security') {
        batch.update(doc.ref, { category: 'o2EUdZWBkGHIt4wPqHQj' }); // Update to 'AI' section ID
        updated++;
      }
    });
    await batch.commit();
    res.send(`Successfully updated ${updated} articles to exact ID 'o2EUdZWBkGHIt4wPqHQj' (AI Category)`);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// === Hebrew Site Functions ===
const { generateHebrewArticles, seedHebrewSections } = require('./hebrewArticles');
const { handleHebrewRouting } = require('./http/hebrew-routing');

exports.handleHebrewRouting = onRequest({
  region: 'us-central1',
  maxInstances: 10,
  memory: '256MiB',
}, handleHebrewRouting);

// Hebrew homepage SSR
const { handleHeHomepage } = require('./http/heHomeRouting');
exports.handleHeHomepage = onRequest({
  region: 'us-central1',
  memory: '256MiB',
  maxInstances: 10,
}, handleHeHomepage);

// English homepage SSR
const { handleEnHomepage } = require('./http/enHomeRouting');
exports.handleEnHomepage = onRequest({
  region: 'us-central1',
  memory: '256MiB',
  maxInstances: 10,
}, handleEnHomepage);

exports.dailyHebrewArticles = onSchedule({
  // 05:00 UTC = ~07:00 Israel winter (UTC+2) / 08:00 summer (UTC+3) — morning run
  // 16:00 UTC = ~18:00 Israel winter (UTC+2) / 19:00 summer (UTC+3) — evening run
  // 2 articles per run × 2 runs = 4 Hebrew articles per day
  schedule: '0 5,16 * * *',
  timeZone: 'UTC',
  region: 'us-central1',
  timeoutSeconds: 540,
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY', 'NEWS_API_KEY', 'TWITTER_BEARER_TOKEN', 'YOUTUBE_API_KEY'],
}, async () => {
  logger.info('Scheduled Hebrew articles generation triggered.');
  try {
    await seedHebrewSections();
    await generateHebrewArticles(2, 'scheduled');
    logger.info('Hebrew articles generation completed.');
  } catch (error) {
    logger.error('Error in dailyHebrewArticles:', error);
  }
});

exports.triggerHebrewArticles = onCall({
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY', 'NEWS_API_KEY', 'TWITTER_BEARER_TOKEN', 'YOUTUBE_API_KEY'],
  region: 'us-central1',
  timeoutSeconds: 540,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }
  try {
    const count = request.data.count || 2;
    await seedHebrewSections();
    const articles = await generateHebrewArticles(count, 'manual');
    if (!articles || articles.length === 0) {
      throw new HttpsError('internal', 'No articles were successfully generated. Check RSS sources and AI service.');
    }
    return { success: true, count: articles.length };
  } catch (error) {
    logger.error('Error in triggerHebrewArticles:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to generate Hebrew articles');
  }
});

// === Scheduled Comparisons ===
const { dailyComparisonsCron } = require('./scheduledComparisons');
exports.dailyComparisons = onSchedule({
  schedule: '0 7,19 * * *',
  timeZone: 'UTC',
  region: 'us-central1',
  timeoutSeconds: 540,
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY'],
}, dailyComparisonsCron);

exports.triggerComparisons = onCall({
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 540,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }
  try {
    await dailyComparisonsCron();
    return { success: true };
  } catch (error) {
    logger.error('Error in triggerComparisons:', error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', error.message || 'Failed to trigger comparisons');
  }
});


/**
 * retranslateHeArticle — Admin callable to fix an article whose title/excerpt
 * was generated in the wrong language. Regenerates title, excerpt and slug in
 * Hebrew using Gemini, then updates the he_articles document.
 */
exports.retranslateHeArticle = onCall({
  secrets: ['GEMINI_API_KEY', 'REMOTION_AWS_ACCESS_KEY_ID', 'REMOTION_AWS_SECRET_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }

  const { articleId } = request.data;
  if (!articleId) throw new HttpsError('invalid-argument', 'articleId required');

  const { loadGeminiSDK, getGeminiSDK, buildGenerateContentRequest, getSafetySettings } = require('./utils');
  // generateContentWithRetry already handles 503-retries + model-fallback
  const { generateContentWithRetry } = require('./callable/ai');
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) throw new HttpsError('internal', 'Gemini SDK unavailable');

  const docRef = db.collection('he_articles').doc(articleId);
  const snap = await docRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Article not found');

  const article = snap.data();
  const sourceTitle = article.title || '';
  const sourceContent = article.content || '';
  const plainText = sourceContent.replace(/<[^>]+>/g, ' ').slice(0, 300);

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Step 1 — translate title, excerpt, slug
  const metaPrompt = `הכתבה הבאה נכתבה בשפה שגויה. תרגם את הכותרת והתקציר לעברית מקצועית.

כותרת מקורית: "${sourceTitle}"
תוכן (חלקי): "${plainText}"

החזר JSON בלבד (ללא markdown):
{
  "title": "כותרת בעברית",
  "excerpt": "תקציר בעברית (2-3 משפטים, עד 200 תווים)",
  "slug": "english-lowercase-hyphenated-slug"
}`;

  let parsed = null;
  try {
    const result = await generateContentWithRetry(genAI, metaPrompt, getSafetySettings());
    const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new HttpsError('internal', 'Gemini meta translation failed: ' + (err.message || 'unknown'));
  }

  if (!parsed || !parsed.title) {
    throw new HttpsError('internal', 'Gemini did not return valid Hebrew translation for meta');
  }

  // Step 2 — translate full content HTML to Hebrew
  let translatedContent = sourceContent; // fallback: keep original
  if (sourceContent && sourceContent.length > 50) {
    const contentPrompt = `תרגם את התוכן הבא לעברית מקצועית ועיתונאית. שמור על כל תגיות ה-HTML (<p>, <h3>, <strong> וכד').
החזר אך ורק את תוכן ה-HTML המתורגם — ללא הסברים, ללא markdown, ללא JSON.

תוכן לתרגום:
${sourceContent}`;

    try {
      const contentResult = await generateContentWithRetry(genAI, contentPrompt, getSafetySettings());
      const rawContent = (typeof contentResult.text === 'function' ? contentResult.text() : contentResult.text) || '';
      // Strip any accidental markdown fences
      const cleaned = rawContent.trim().replace(/^```html?\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
      if (cleaned.length > 100) translatedContent = cleaned;
    } catch (contentErr) {
      logger.warn('retranslateHeArticle: content translation failed, keeping original:', contentErr.message);
    }
  }

  await docRef.update({
    title: parsed.title,
    excerpt: parsed.excerpt || article.excerpt,
    slug: parsed.slug || article.slug,
    content: translatedContent,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info('retranslateHeArticle: updated article', articleId, '->', parsed.title);
  return { success: true, title: parsed.title, slug: parsed.slug };
});

/**
 * generateArticleFaqs — Admin callable that uses Gemini to produce 5–7 FAQs
 * from an article's title + content. Returns { faqs: [{question, answer}, ...] }.
 * The admin UI then lets the editor accept/edit/save them onto the article document.
 * Works for both English and Hebrew articles — language is inferred from input.
 */
exports.generateArticleFaqs = onCall({
  secrets: ['GEMINI_API_KEY', 'REMOTION_AWS_ACCESS_KEY_ID', 'REMOTION_AWS_SECRET_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 120,
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }

  const { title, content, language } = request.data || {};
  if (!title || !content) {
    throw new HttpsError('invalid-argument', 'title and content are required');
  }

  const { loadGeminiSDK, getGeminiSDK, getSafetySettings } = require('./utils');
  const { generateContentWithRetry } = require('./callable/ai');
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) throw new HttpsError('internal', 'Gemini SDK unavailable');

  const plainContent = String(content).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
  const lang = (language || '').toLowerCase();
  const isHebrew = lang === 'he' || lang === 'hebrew' || /[\u0590-\u05FF]/.test(title);

  const prompt = isHebrew
    ? `הכתבה הבאה פורסמה באתר חדשות טכנולוגיה. צור 5-7 שאלות נפוצות (FAQ) שקוראים בפועל יחפשו בגוגל לאחר קריאת הכתבה. התשובות צריכות להיות קצרות (משפט עד שלושה), עובדתיות, ולשלב את המילים המרכזיות של הכתבה כדי לעזור ב-SEO.

כותרת: ${title}

תוכן: ${plainContent}

החזר JSON בלבד (ללא markdown, ללא הסברים) במבנה הבא:
{
  "faqs": [
    {"question": "שאלה 1?", "answer": "תשובה קצרה."},
    {"question": "שאלה 2?", "answer": "תשובה קצרה."}
  ]
}`
    : `The following article was published on a tech news site. Generate 5-7 FAQs that real readers would Google after reading it. Answers must be short (1-3 sentences), factual, and naturally weave in the article's key terms to help SEO. Do not repeat the headline verbatim.

Title: ${title}

Content: ${plainContent}

Return JSON only (no markdown, no explanation) in exactly this shape:
{
  "faqs": [
    {"question": "Question 1?", "answer": "Short answer."},
    {"question": "Question 2?", "answer": "Short answer."}
  ]
}`;

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let parsed = null;
  try {
    const result = await generateContentWithRetry(genAI, prompt, getSafetySettings());
    const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
  } catch (err) {
    throw new HttpsError('internal', 'Gemini FAQ generation failed: ' + (err.message || 'unknown'));
  }

  if (!parsed || !Array.isArray(parsed.faqs)) {
    throw new HttpsError('internal', 'Gemini did not return a valid FAQ list');
  }

  const faqs = parsed.faqs
    .filter(f => f && typeof f.question === 'string' && typeof f.answer === 'string')
    .map(f => ({ question: f.question.trim(), answer: f.answer.trim() }))
    .filter(f => f.question && f.answer)
    .slice(0, 10);

  if (faqs.length === 0) {
    throw new HttpsError('internal', 'Gemini returned empty FAQ list');
  }

  logger.info('generateArticleFaqs: produced', faqs.length, 'FAQs for title:', title.slice(0, 60));
  return { success: true, faqs };
});

/**
 * backfillMissingImages — Admin callable that finds published articles whose
 * featuredImage is missing, empty, or a placeholder gradient (data:image/svg+xml),
 * and re-fetches a real image from Unsplash using the improved fallback chain.
 * Processes both `articles` and `he_articles`. Returns counts per collection.
 */
exports.backfillMissingImages = onCall({
  secrets: ['UNSPLASH_ACCESS_KEY', 'GEMINI_API_KEY'],
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }

  const aiCallables = require('./callable/ai');

  function isPlaceholderImage(url) {
    if (!url || typeof url !== 'string') return true;
    const s = url.trim();
    if (!s) return true;
    if (s.startsWith('data:')) return true; // gradient SVG fallback
    if (s === '#') return true;
    return false;
  }

  const { limit = 200, dryRun = false, force = false, dedupeOnly = false } = request.data || {};
  const results = { articles: { scanned: 0, fixed: 0, failed: 0, items: [] }, he_articles: { scanned: 0, fixed: 0, failed: 0, items: [] } };

  async function processCollection(collName) {
    const snap = await db.collection(collName).orderBy('createdAt', 'desc').limit(limit).get();

    // When dedupeOnly is set, first pass computes which featuredImage URLs are duplicated.
    // Only docs whose current image appears on 2+ articles get regenerated.
    let duplicateUrls = new Set();
    if (dedupeOnly) {
      const counts = new Map();
      for (const d of snap.docs) {
        const url = (d.data().featuredImage || '').trim();
        if (!url || url.startsWith('data:')) continue;
        counts.set(url, (counts.get(url) || 0) + 1);
      }
      for (const [url, c] of counts.entries()) if (c >= 2) duplicateUrls.add(url);
      logger.info('backfillMissingImages: dedupeOnly found', duplicateUrls.size, 'duplicate URLs in', collName);
    }

    for (const doc of snap.docs) {
      const a = doc.data();
      results[collName].scanned++;
      const curUrl = (a.featuredImage || '').trim();
      // Decide whether this doc needs a new image:
      //   • default:      only if current image is missing/placeholder
      //   • force:        always regenerate
      //   • dedupeOnly:   only if current URL is shared with another doc
      if (dedupeOnly) {
        if (!duplicateUrls.has(curUrl)) continue;
      } else if (!force && !isPlaceholderImage(a.featuredImage)) {
        continue;
      }

      let title = a.title || '';
      let slug = a.slug || '';
      let promptText = a.imagePrompt || title || slug.replace(/-/g, ' ');

      // For Hebrew articles: Unsplash only understands English keywords, so look up
      // the English source article and use its slug/imagePrompt for context. This
      // prevents every HE article falling through to the generic "technology abstract"
      // fallback (which was returning the same photo for every article).
      if (collName === 'he_articles') {
        const srcId = a.sourceArticleId || a.enArticleId;
        const srcSlug = a.sourceSlug || a.enSlug;
        try {
          let enDoc = null;
          if (srcId) {
            const snap = await db.collection('articles').doc(srcId).get();
            if (snap.exists) enDoc = snap.data();
          } else if (srcSlug) {
            const q = await db.collection('articles').where('slug', '==', srcSlug).limit(1).get();
            if (!q.empty) enDoc = q.docs[0].data();
          }
          if (enDoc) {
            slug = enDoc.slug || slug;
            promptText = enDoc.imagePrompt || enDoc.title || promptText;
            logger.info('backfillMissingImages: resolved HE->EN context', { he: doc.id, enSlug: slug });
          } else {
            logger.info('backfillMissingImages: no EN source found for HE doc', { id: doc.id, srcId, srcSlug });
          }
        } catch (lookupErr) {
          logger.warn('backfillMissingImages: EN lookup failed', doc.id, lookupErr.message);
        }
      }

      if (dryRun) {
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), action: 'would-fix' });
        continue;
      }

      try {
        const imageData = await aiCallables.generateArticleImage({
          auth: { uid: 'backfill-admin', token: { admin: true } },
          data: {
            prompt: promptText,
            articleTitle: title,
            articleSlug: slug,
          },
        });
        const newUrl = imageData && imageData.imageUrl;
        if (!newUrl || isPlaceholderImage(newUrl)) {
          results[collName].failed++;
          results[collName].items.push({ id: doc.id, title: title.slice(0, 60), error: 'got placeholder' });
          continue;
        }
        await doc.ref.update({
          featuredImage: newUrl,
          imageAltText: imageData.imageAltText || a.imageAltText || title,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results[collName].fixed++;
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), source: imageData.source });
      } catch (err) {
        results[collName].failed++;
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), error: err.message });
        logger.warn('backfillMissingImages: failed for', doc.id, err.message);
      }
    }
  }

  await processCollection('articles');
  await processCollection('he_articles');

  logger.info('backfillMissingImages summary:', {
    en: { scanned: results.articles.scanned, fixed: results.articles.fixed, failed: results.articles.failed },
    he: { scanned: results.he_articles.scanned, fixed: results.he_articles.fixed, failed: results.he_articles.failed },
  });

  return { success: true, dryRun, ...results };
});

/**
 * bulkGenerateFaqs — Admin callable that iterates the top N most recent published
 * articles in both `articles` and `he_articles` collections, generates FAQs via
 * Gemini for any that don't already have a non-empty `faqs` array, and writes
 * them back to Firestore. Returns per-collection summary counts.
 *
 * Inputs: { limit?: number (default 30), dryRun?: boolean, force?: boolean }
 *   - limit: how many recent articles to scan per language
 *   - dryRun: list candidates without writing
 *   - force: regenerate FAQs even if the article already has them
 */
exports.bulkGenerateFaqs = onCall({
  secrets: ['GEMINI_API_KEY', 'REMOTION_AWS_ACCESS_KEY_ID', 'REMOTION_AWS_SECRET_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }

  const { loadGeminiSDK, getGeminiSDK, getSafetySettings } = require('./utils');
  const { generateContentWithRetry } = require('./callable/ai');
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) throw new HttpsError('internal', 'Gemini SDK unavailable');
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const { limit = 30, dryRun = false, force = false, skipOffset = 0 } = request.data || {};

  async function generateFaqsForArticle(title, content, isHebrew) {
    const plainContent = String(content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000);
    if (!title || !plainContent) return null;

    const prompt = isHebrew
      ? `הכתבה הבאה פורסמה באתר חדשות טכנולוגיה. צור 5-7 שאלות נפוצות (FAQ) שקוראים בפועל יחפשו בגוגל לאחר קריאת הכתבה. התשובות צריכות להיות קצרות (משפט עד שלושה), עובדתיות, ולשלב את המילים המרכזיות של הכתבה כדי לעזור ב-SEO.

כותרת: ${title}

תוכן: ${plainContent}

החזר JSON בלבד (ללא markdown, ללא הסברים) במבנה הבא:
{
  "faqs": [
    {"question": "שאלה 1?", "answer": "תשובה קצרה."},
    {"question": "שאלה 2?", "answer": "תשובה קצרה."}
  ]
}`
      : `The following article was published on a tech news site. Generate 5-7 FAQs that real readers would Google after reading it. Answers must be short (1-3 sentences), factual, and naturally weave in the article's key terms to help SEO. Do not repeat the headline verbatim.

Title: ${title}

Content: ${plainContent}

Return JSON only (no markdown, no explanation) in exactly this shape:
{
  "faqs": [
    {"question": "Question 1?", "answer": "Short answer."},
    {"question": "Question 2?", "answer": "Short answer."}
  ]
}`;

    const result = await generateContentWithRetry(genAI, prompt, getSafetySettings());
    const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed;
    try { parsed = JSON.parse(jsonMatch[0]); } catch (_e) { return null; }
    if (!parsed || !Array.isArray(parsed.faqs)) return null;
    const faqs = parsed.faqs
      .filter(f => f && typeof f.question === 'string' && typeof f.answer === 'string')
      .map(f => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter(f => f.question && f.answer)
      .slice(0, 10);
    return faqs.length ? faqs : null;
  }

  const results = {
    articles: { scanned: 0, skipped: 0, skipReasons: { draft: 0, hasFaqs: 0, noContent: 0 }, generated: 0, failed: 0, items: [] },
    he_articles: { scanned: 0, skipped: 0, skipReasons: { draft: 0, hasFaqs: 0, noContent: 0 }, generated: 0, failed: 0, items: [] },
  };

  async function processCollection(collName, isHebrew) {
    let q = db.collection(collName).orderBy('createdAt', 'desc');
    if (skipOffset > 0) q = q.offset(skipOffset);
    const snap = await q.limit(limit).get();
    for (const doc of snap.docs) {
      const a = doc.data();
      results[collName].scanned++;

      // Skip drafts. Treat missing `published` as true for legacy docs that pre-date the field.
      const isPublished = a.published === undefined ? true : a.published === true;
      if (!isPublished) {
        results[collName].skipped++;
        results[collName].skipReasons.draft++;
        continue;
      }

      const hasFaqs = Array.isArray(a.faqs) && a.faqs.length > 0;
      if (hasFaqs && !force) {
        results[collName].skipped++;
        results[collName].skipReasons.hasFaqs++;
        continue;
      }

      const title = a.title || '';
      const content = a.content || a.body || '';
      if (!title || !content) {
        results[collName].skipped++;
        results[collName].skipReasons.noContent++;
        continue;
      }

      if (dryRun) {
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), action: 'would-generate' });
        continue;
      }

      try {
        const faqs = await generateFaqsForArticle(title, content, isHebrew);
        if (!faqs) {
          results[collName].failed++;
          results[collName].items.push({ id: doc.id, title: title.slice(0, 60), error: 'no-valid-faqs' });
          continue;
        }
        await doc.ref.update({
          faqs,
          faqsGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        results[collName].generated++;
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), count: faqs.length });
      } catch (err) {
        results[collName].failed++;
        results[collName].items.push({ id: doc.id, title: title.slice(0, 60), error: err.message });
        logger.warn('bulkGenerateFaqs: failed for', collName, doc.id, err.message);
      }
    }
  }

  await processCollection('articles', false);
  await processCollection('he_articles', true);

  logger.info('bulkGenerateFaqs summary:', {
    en: { scanned: results.articles.scanned, generated: results.articles.generated, skipped: results.articles.skipped, failed: results.articles.failed },
    he: { scanned: results.he_articles.scanned, generated: results.he_articles.generated, skipped: results.he_articles.skipped, failed: results.he_articles.failed },
  });

  return { success: true, dryRun, force, limit, ...results };
});

// === YouTube Video Pipeline ===
const youtubePipeline = require("./youtubePipeline");
exports.onEnglishArticlePublished = youtubePipeline.onEnglishArticlePublished;
exports.onHebrewArticlePublished = youtubePipeline.onHebrewArticlePublished;

// === Newsletters ===
const newsletters = require("./newsletters");
exports.weeklyNewsletterSender = newsletters.weeklyNewsletterSender;
exports.testSendNewsletter = newsletters.testSendNewsletter;
exports.subscribeNewsletter = newsletters.subscribeNewsletter;

// === AI Tools Directory ===
const aiTools = require("./aiTools");

exports.seedAiToolsCatalog = onCall(
  { region: "us-central1", secrets: ["GEMINI_API_KEY"], timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only");
    }
    try {
      return await aiTools.seedAiToolsCatalog(request.data || {});
    } catch (err) {
      logger.error("seedAiToolsCatalog failed:", err);
      throw new HttpsError("internal", err.message || "seed failed");
    }
  },
);

exports.refreshAiToolsTrending = onCall(
  { region: "us-central1", timeoutSeconds: 540, memory: "512MiB" },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only");
    }
    try {
      return await aiTools.refreshTrendingScores(request.data || {});
    } catch (err) {
      logger.error("refreshAiToolsTrending failed:", err);
      throw new HttpsError("internal", err.message || "refresh failed");
    }
  },
);

// HTTP variant for one-off seeding from CLI (uses CARTOON_TEST_ADMIN_KEY).
exports.seedAiToolsCatalogHttp = onRequest(
  { region: "us-central1", secrets: ["GEMINI_API_KEY", "CARTOON_TEST_ADMIN_KEY"], timeoutSeconds: 3600, memory: "1GiB" },
  async (req, res) => {
    if (req.headers["x-admin-key"] !== process.env.CARTOON_TEST_ADMIN_KEY) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const result = await aiTools.seedAiToolsCatalog(req.body || {});
      return res.json(result);
    } catch (err) {
      logger.error("seedAiToolsCatalogHttp failed:", err);
      return res.status(500).json({ error: err.message || "seed failed" });
    }
  },
);

exports.refreshAiToolsTrendingCron = onSchedule(
  { region: "us-central1", schedule: "0 2 * * *", timeZone: "UTC", timeoutSeconds: 540, memory: "512MiB" },
  async () => {
    try {
      const result = await aiTools.refreshTrendingScores({});
      logger.info("refreshAiToolsTrendingCron done:", result);
    } catch (err) {
      logger.error("refreshAiToolsTrendingCron failed:", err);
    }
  },
);

exports.getAiToolsList = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    try {
      return await aiTools.getAiToolsList(request.data || {});
    } catch (err) {
      logger.error("getAiToolsList failed:", err);
      throw new HttpsError("internal", err.message || "list failed");
    }
  },
);

exports.getAiToolDetail = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    try {
      const slug = request.data && request.data.slug;
      return await aiTools.getAiToolDetail(slug);
    } catch (err) {
      logger.error("getAiToolDetail failed:", err);
      throw new HttpsError("internal", err.message || "detail failed");
    }
  },
);

exports.submitAiToolReview = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    if (!request.auth || !request.auth.uid) {
      throw new HttpsError("unauthenticated", "Sign-in required");
    }
    try {
      return await aiTools.submitToolReview(request.data || {}, request.auth);
    } catch (err) {
      logger.error("submitAiToolReview failed:", err);
      if (err.code === "unauthenticated") throw new HttpsError("unauthenticated", err.message);
      throw new HttpsError("invalid-argument", err.message || "review failed");
    }
  },
);

// === AI Glossary ===
const aiGlossary = require("./aiGlossary");

exports.seedAiGlossary = onCall(
  { region: "us-central1", secrets: ["GEMINI_API_KEY"], timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only");
    }
    try {
      return await aiGlossary.seedAiGlossary(request.data || {});
    } catch (err) {
      logger.error("seedAiGlossary failed:", err);
      throw new HttpsError("internal", err.message || "seed failed");
    }
  },
);

exports.seedAiGlossaryHttp = onRequest(
  { region: "us-central1", secrets: ["GEMINI_API_KEY", "CARTOON_TEST_ADMIN_KEY"], timeoutSeconds: 3600, memory: "1GiB" },
  async (req, res) => {
    if (req.headers["x-admin-key"] !== process.env.CARTOON_TEST_ADMIN_KEY) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const result = await aiGlossary.seedAiGlossary(req.body || {});
      return res.json(result);
    } catch (err) {
      logger.error("seedAiGlossaryHttp failed:", err);
      return res.status(500).json({ error: err.message || "seed failed" });
    }
  },
);

exports.getAiGlossary = onCall(
  { region: "us-central1", timeoutSeconds: 30, memory: "256MiB" },
  async (request) => {
    try {
      return await aiGlossary.getAiGlossary(request.data || {});
    } catch (err) {
      logger.error("getAiGlossary failed:", err);
      throw new HttpsError("internal", err.message || "glossary failed");
    }
  },
);

// === AI Tools Quick-Start Backfill ===
const aiToolsQuickStart = require("./aiToolsQuickStart");

exports.backfillAiToolQuickStarts = onCall(
  { region: "us-central1", secrets: ["GEMINI_API_KEY"], timeoutSeconds: 540, memory: "1GiB" },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError("permission-denied", "Admin only");
    }
    try {
      return await aiToolsQuickStart.backfillQuickStarts(request.data || {});
    } catch (err) {
      logger.error("backfillAiToolQuickStarts failed:", err);
      throw new HttpsError("internal", err.message || "backfill failed");
    }
  },
);

exports.backfillAiToolQuickStartsHttp = onRequest(
  { region: "us-central1", secrets: ["GEMINI_API_KEY", "CARTOON_TEST_ADMIN_KEY"], timeoutSeconds: 3600, memory: "1GiB" },
  async (req, res) => {
    if (req.headers["x-admin-key"] !== process.env.CARTOON_TEST_ADMIN_KEY) {
      return res.status(403).json({ error: "Forbidden" });
    }
    try {
      const result = await aiToolsQuickStart.backfillQuickStarts(req.body || {});
      return res.json(result);
    } catch (err) {
      logger.error("backfillAiToolQuickStartsHttp failed:", err);
      return res.status(500).json({ error: err.message || "Failed" });
    }
  },
);

// === Daily AI Tools & Design Systems Catalog Scraper ===
const dailyCatalogScraper = require("./dailyCatalogScraper");
exports.dailyCatalogScraper = dailyCatalogScraper.dailyCatalogScraper;
exports.triggerDailyCatalogScraper = dailyCatalogScraper.triggerDailyCatalogScraper;

// === Real-Time Telegram Channel Publisher ===
const telegramPublisher = require("./telegramPublisher");
exports.onHebrewArticlePublishedToTelegram = telegramPublisher.onHebrewArticlePublishedToTelegram;
exports.onEnglishArticlePublishedToTelegram = telegramPublisher.onEnglishArticlePublishedToTelegram;
exports.testTelegramPost = telegramPublisher.testTelegramPost;
exports.triggerTelegramPostHttp = telegramPublisher.triggerTelegramPostHttp;

// === Real-Time Reddit Subreddit Publisher ===
const redditPublisher = require("./redditPublisher");
exports.onEnglishArticlePublishedToReddit = redditPublisher.onEnglishArticlePublishedToReddit;
exports.testRedditPost = redditPublisher.testRedditPost;
exports.triggerRedditPostHttp = redditPublisher.triggerRedditPostHttp;

logger.info("All active function modules loaded and exported successfully.");
