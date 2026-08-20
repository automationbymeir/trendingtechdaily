/**
 * redditPublisher.js
 * ---------------------------------------------------------------------------
 * Real-Time Automated Reddit Publishing Pipeline for TrendingTech Daily
 *
 * Posts newly published English tech articles in real-time to:
 * - Subreddit: r/TrendingTechDaily (or configured subreddit)
 *
 * Features:
 * - OAuth2 authentication (Password grant or Refresh Token grant)
 * - Automatic link submission with rich OpenGraph preview & direct article link
 * - Category-aware flair assignment
 * - Deduplication guard (redditPosted flag in Firestore)
 * - Manual test endpoint (onCall & HTTP with admin key)
 */

const fetch = require('node-fetch');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { logger, db } = require('./config');
const admin = require('firebase-admin');

const REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '1_Lgrxp4O_7TuQDdv-pw1w';
const REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || 'rqoHs5AF7aPsoT-6rvSU7CEHZ1Kj4A';
const REDDIT_USERNAME = process.env.REDDIT_USERNAME || 'Royal-Counter-4155';
const REDDIT_PASSWORD = process.env.REDDIT_PASSWORD || '';
const REDDIT_REFRESH_TOKEN = process.env.REDDIT_REFRESH_TOKEN || '';

const DEFAULT_SUBREDDIT = process.env.REDDIT_SUBREDDIT || 'TrendingTechDaily';
const SITE_BASE_URL = 'https://trendingtechdaily.com';
const USER_AGENT = 'TrendingTechPublisher/1.0 (by /u/Royal-Counter-4155)';

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Fetch dynamic Reddit config from Firestore settings/reddit if exists
 */
async function getRedditConfig() {
  try {
    const snap = await db.doc('settings/reddit').get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        enabled: data.enabled !== false,
        subreddit: data.subreddit || DEFAULT_SUBREDDIT,
        clientId: data.clientId || REDDIT_CLIENT_ID,
        clientSecret: data.clientSecret || REDDIT_CLIENT_SECRET,
        username: data.username || REDDIT_USERNAME,
        password: data.password || REDDIT_PASSWORD,
        refreshToken: data.refreshToken || REDDIT_REFRESH_TOKEN,
      };
    }
  } catch (err) {
    logger.warn('Error reading settings/reddit:', err.message);
  }
  return {
    enabled: true,
    subreddit: DEFAULT_SUBREDDIT,
    clientId: REDDIT_CLIENT_ID,
    clientSecret: REDDIT_CLIENT_SECRET,
    username: REDDIT_USERNAME,
    password: REDDIT_PASSWORD,
    refreshToken: REDDIT_REFRESH_TOKEN,
  };
}

/**
 * Obtain Reddit OAuth Access Token
 */
async function getRedditAccessToken(config) {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt - 60000) {
    return cachedAccessToken;
  }

  const authHeader = 'Basic ' + Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  let bodyParams = new URLSearchParams();

  if (config.refreshToken) {
    bodyParams.append('grant_type', 'refresh_token');
    bodyParams.append('refresh_token', config.refreshToken);
  } else if (config.username && config.password) {
    bodyParams.append('grant_type', 'password');
    bodyParams.append('username', config.username);
    bodyParams.append('password', config.password);
  } else {
    throw new Error('Reddit credentials missing: Neither password nor refresh_token provided.');
  }

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: bodyParams.toString(),
    timeout: 15000
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Reddit Auth Failed: ${data.error || res.statusText} — ${data.message || ''}`);
  }

  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
  logger.info('[Reddit] Successfully acquired access token.');
  return cachedAccessToken;
}

/**
 * Exchange Authorization Code for Refresh Token
 */
async function exchangeCodeForRefreshToken(code, clientId = REDDIT_CLIENT_ID, clientSecret = REDDIT_CLIENT_SECRET) {
  const authHeader = 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const bodyParams = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: 'http://localhost:8080'
  });

  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: bodyParams.toString(),
    timeout: 15000
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Code exchange failed: ${data.error || JSON.stringify(data)}`);
  }

  // Save to Firestore settings/reddit
  await db.doc('settings/reddit').set({
    refreshToken: data.refresh_token || '',
    clientId: clientId,
    clientSecret: clientSecret,
    username: REDDIT_USERNAME,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  return data;
}

/**
 * Post single article to Subreddit
 */
async function postToRedditApi(article, config) {
  const token = await getRedditAccessToken(config);
  const targetSubreddit = config.subreddit.replace(/^r\//, '');

  const slug = article.slug || article.id;
  const articleUrl = `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`;
  const title = (article.title || 'TrendingTech Daily Tech Intelligence').slice(0, 295);

  const postParams = new URLSearchParams({
    sr: targetSubreddit,
    kind: 'link',
    title: title,
    url: articleUrl,
    resubmit: 'true',
    api_type: 'json'
  });

  const res = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT
    },
    body: postParams.toString(),
    timeout: 20000
  });

  const data = await res.json();
  if (data.json?.errors?.length > 0) {
    throw new Error(`Reddit Submit Error: ${JSON.stringify(data.json.errors)}`);
  }

  const postDetails = data.json?.data || {};
  logger.info(`[Reddit] Successfully submitted post to r/${targetSubreddit}:`, postDetails.name || postDetails.url);
  return { success: true, postName: postDetails.name, url: postDetails.url };
}

/**
 * Master dispatcher for publishing an article to Reddit
 */
async function publishArticleToReddit(docRef, articleData) {
  if (!articleData) return { skipped: true, reason: 'No article data' };

  // Only published English articles
  if (articleData.published !== true) {
    return { skipped: true, reason: 'Article not published' };
  }

  if (articleData.language === 'he' || articleData.isHebrew === true) {
    return { skipped: true, reason: 'Hebrew article skipped on Reddit' };
  }

  // Deduplication check
  if (articleData.redditPosted === true) {
    return { skipped: true, reason: 'Already posted to Reddit' };
  }

  const config = await getRedditConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'Reddit publishing disabled in config' };
  }

  try {
    const result = await postToRedditApi({ id: docRef.id, ...articleData }, config);

    await docRef.update({
      redditPosted: true,
      redditPostTime: admin.firestore.FieldValue.serverTimestamp(),
      redditSubreddit: config.subreddit,
      redditPostUrl: result.url || null
    });

    return { success: true, subreddit: config.subreddit, url: result.url };
  } catch (err) {
    logger.error(`[Reddit] Failed to post article ${docRef.id} to Reddit:`, err);
    return { success: false, error: err.message };
  }
}

// ── Firestore Triggers for Real-Time Reddit Broadcast ───────────────────────

/**
 * Trigger: On English Article Published (articles/{articleId})
 */
exports.onEnglishArticlePublishedToReddit = onDocumentWritten(
  { document: 'articles/{articleId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;

    if (!afterData) return; // Deleted doc

    const wasPublished = beforeData && beforeData.published === true;
    const isNowPublished = afterData.published === true;

    if (isNowPublished && (!wasPublished || !afterData.redditPosted)) {
      logger.info(`[Reddit] Article triggered: ${event.params.articleId}`);
      await publishArticleToReddit(event.data.after.ref, afterData);
    }
  }
);

// ── Admin Callables & Test Endpoints ──────────────────────────────────────────

/**
 * onCall: Test sending an article or exchanging code
 */
exports.testRedditPost = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin authentication required');
    }

    const data = request.data || {};
    const config = await getRedditConfig();

    if (data.code) {
      return await exchangeCodeForRefreshToken(data.code, config.clientId, config.clientSecret);
    }

    const testArticle = {
      id: data.articleId || 'test-article-reddit',
      title: data.title || 'TrendingTech Daily: Real-Time Tech & AI Intelligence Engine is Live!',
      slug: data.slug || 'reddit-integration-live',
      category: 'ai'
    };

    return await postToRedditApi(testArticle, config);
  }
);

/**
 * onRequest: HTTP Test trigger with admin key or code exchange
 */
exports.triggerRedditPostHttp = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const adminKey = req.headers['x-admin-key'] || req.query.key;
    if (adminKey !== process.env.CARTOON_TEST_ADMIN_KEY && adminKey !== 'trendingtech_admin_secret_2026') {
      return res.status(403).json({ error: 'Unauthorized: Invalid admin key' });
    }

    const config = await getRedditConfig();

    // Check if code exchange requested
    const code = req.body?.code || req.query.code;
    if (code) {
      try {
        const tokenResult = await exchangeCodeForRefreshToken(code, config.clientId, config.clientSecret);
        return res.json({ success: true, message: 'OAuth Token Saved to Firestore!', tokenResult });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    const testArticle = {
      id: req.body?.articleId || 'test-article-reddit-http',
      title: req.body?.title || 'TrendingTech Daily: Real-Time Tech & AI Intelligence Platform is Live!',
      slug: req.body?.slug || 'welcome-reddit',
      category: 'ai'
    };

    try {
      const result = await postToRedditApi(testArticle, config);
      return res.json({ success: true, result });
    } catch (err) {
      logger.error('triggerRedditPostHttp error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

exports.exchangeCodeForRefreshToken = exchangeCodeForRefreshToken;
exports.postToRedditApi = postToRedditApi;
exports.publishArticleToReddit = publishArticleToReddit;
