// functions/index.js

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger, admin } = require("./config");
const cors = require("cors")({ origin: true });
const { requireAdmin } = require("./middleware/auth");

// === API (Express App) ===
const apiApp = require("./api");
exports.api = onRequest(
  {
    region: "us-central1",
    // Grant the 'api' function access to all secrets its routes might need
    secrets: [
      "NEWS_API_KEY",
      "GNEWS_API_KEY",
      "FINNHUB_API_KEY",
      "YOUTUBE_API_KEY",
      "SPOTIFY_CLIENT_ID",
      "SPOTIFY_CLIENT_SECRET",
      "UNSPLASH_ACCESS_KEY",
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

exports.yahooFinanceHistory = onRequest({ cors: true }, legacyProxies.yahooFinanceHistory);
exports.yahooFinance = onRequest({ cors: true }, legacyProxies.yahooFinance);

// Export search callable functions
exports.searchArticles = onCall({ region: 'us-central1' }, searchCallables.searchArticles);
exports.getSearchSuggestions = onCall({ secrets: [], region: 'us-central1' }, searchCallables.getSearchSuggestions);
exports.enhancedSearch = onCall({ secrets: ["GROK_API_KEY"], region: 'us-central1', timeoutSeconds: 60 }, searchCallables.enhancedSearch);

// === Callable Functions ===
const aiCallables = require("./callable/ai");
const adminCallables = require("./callable/admin");
const proxyCallables = require("./callable/proxies");
const toolCallables = require("./callable/tools");
const { getTechPodcastsHandler } = require("./services/spotifyService");

// AI Callables
exports.generateArticleContent = onCall({ secrets: [], timeoutSeconds: 180, region: "us-central1" }, aiCallables.generateArticleContent);
exports.rephraseText = onCall({ secrets: [], region: "us-central1" }, aiCallables.rephraseText);
exports.suggestArticleTopic = onCall({ secrets: ["GROK_API_KEY"], region: "us-central1" }, aiCallables.suggestArticleTopic);
exports.generateArticleImage = onCall({ secrets: ["UNSPLASH_ACCESS_KEY"], region: "us-central1", timeoutSeconds: 60 }, aiCallables.generateArticleImage);

exports.generateTopTenArticle = onRequest({
  secrets: ["UNSPLASH_ACCESS_KEY"],
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
  secrets: ["UNSPLASH_ACCESS_KEY"],
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
exports.readArticleAloud = onCall({ secrets: [], region: "us-central1", timeoutSeconds: 60 }, aiCallables.readArticleAloud);
exports.generateAIAgentResponse = onCall({ secrets: [], region: "us-central1", timeoutSeconds: 120 }, toolCallables.generateAIAgentResponse);

// Admin Callables
exports.createAdmin = onCall(adminCallables.createAdmin);

// Proxy Callables
exports.getNewsApiArticles = onCall({ secrets: ["NEWS_API_KEY"], region: "us-central1" }, proxyCallables.getNewsApiArticles);
exports.getGnewsArticles = onCall({ secrets: ["GNEWS_API_KEY"], region: "us-central1" }, proxyCallables.getGnewsArticles);
exports.getRecommendedVideos = onCall({ secrets: ["YOUTUBE_API_KEY"], region: "us-central1" }, proxyCallables.getRecommendedVideos);
exports.getTechPodcasts = onCall({ secrets: ["SPOTIFY_CLIENT_ID", "SPOTIFY_CLIENT_SECRET"], region: "us-central1" }, getTechPodcastsHandler);

// Tool Callables
exports.searchWeb = onCall({ secrets: [], region: "us-central1" }, toolCallables.searchWeb);
exports.getFinnhubStockData = onCall({ secrets: ["FINNHUB_API_KEY", ], region: "us-central1" }, toolCallables.getFinnhubStockData);

// === Scheduled Functions ===
const { fetchAllNews } = require("./services/newsService");
const { shouldGenerateArticle, generateArticle } = require("./scheduledArticles");
exports.scheduledNewsFetch = onSchedule({ schedule: "every 4 hours", region: "us-central1", secrets: ["NEWS_API_KEY"] }, async () => {
  logger.info("Scheduled news fetch triggered.");
  try {
    await fetchAllNews({ newsApiKey: process.env.NEWS_API_KEY });
    logger.info("Scheduled news fetch completed successfully.");
  } catch (error) {
    logger.error("Error in scheduled news fetch:", error);
  }
});

exports.autoGenerateArticle = onSchedule({ schedule: "every 1 hours", region: "us-central1", secrets: ["NEWS_API_KEY", "GROK_API_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL"] }, async () => {
  try {
    const freqEnv = parseInt(process.env.AUTO_ARTICLE_FREQUENCY, 10);
    const frequency = isNaN(freqEnv) ? 3 : Math.min(Math.max(freqEnv, 1), 3);
    const { shouldGenerate, articlesPerRun } = await shouldGenerateArticle(frequency, 1);
    if (!shouldGenerate) return;
    for (let i = 0; i < articlesPerRun; i++) {
      await generateArticle(process.env.NEWS_API_KEY);
    }
    logger.info(`Auto-generated ${articlesPerRun} tech article(s) successfully.`);
  } catch (error) {
    logger.error("Error auto-generating article:", error);
  }
});

// === Batch Article Generation (Gemini Batch API — 50% cost savings) ===
const { submitDailyArticleBatch, processPendingBatches } = require("./batchArticleGenerator");

// Runs once per day: collects 24 topics and submits them as a single Gemini batch job.
exports.scheduledBatchArticleSubmit = onSchedule({
  schedule: "0 0 * * *", // midnight UTC daily
  region: "us-central1",
  secrets: ["NEWS_API_KEY", "GROK_API_KEY"],
  timeoutSeconds: 300,
}, async () => {
  try {
    const result = await submitDailyArticleBatch(process.env.NEWS_API_KEY);
    logger.info(`Batch job submitted: ${result.jobName} (${result.topicCount} topics)`);
  } catch (err) {
    logger.error("scheduledBatchArticleSubmit failed:", err);
  }
});

// Runs every 4 hours: picks up any completed batch jobs and creates articles from results.
exports.scheduledBatchArticleProcessor = onSchedule({
  schedule: "0 */4 * * *",
  region: "us-central1",
  secrets: ["UNSPLASH_ACCESS_KEY"],
  timeoutSeconds: 540,
}, async () => {
  try {
    const result = await processPendingBatches(process.env.UNSPLASH_ACCESS_KEY);
    logger.info(`Batch processor: created ${result.processed} articles`);
  } catch (err) {
    logger.error("scheduledBatchArticleProcessor failed:", err);
  }
});

exports.testGenerateArticle = onCall({ secrets: ["NEWS_API_KEY", "GROK_API_KEY", "SMTP_USER", "SMTP_PASS", "SMTP_HOST", "SMTP_PORT", "ARTICLE_NOTIFY_EMAIL"], region: "us-central1" }, async (request) => {
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

logger.info("All active function modules loaded and exported successfully.");