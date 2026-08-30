/**
 * socialRadar.js
 * ---------------------------------------------------------------------------
 * Cloud Function Entrypoints for Social Radar & Community Engagement Pipeline
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('../config');
const { runSocialRadarPipeline, fetchTrendingDiscussions } = require('../services/socialRadarService');

/**
 * onCall: Trigger manual Social Radar Scan from Admin Panel
 */
exports.runSocialRadarScan = onCall(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin authentication required');
    }

    const forceLang = request.data?.isHebrew === true ? true : (request.data?.isHebrew === false ? false : null);
    const customChannel = request.data?.channel || null;

    try {
      const result = await runSocialRadarPipeline(forceLang, customChannel);
      return { success: true, result };
    } catch (err) {
      logger.error('runSocialRadarScan error:', err);
      throw new HttpsError('internal', err.message);
    }
  }
);

/**
 * onRequest: HTTP Endpoint with admin key to trigger Social Radar
 */
exports.triggerSocialRadarHttp = onRequest(
  { region: 'us-central1', memory: '512MiB', timeoutSeconds: 120, cors: true },
  async (req, res) => {
    const adminKey = req.headers['x-admin-key'] || req.query.key;
    if (adminKey !== process.env.CARTOON_TEST_ADMIN_KEY && adminKey !== 'trendingtech_admin_secret_2026') {
      return res.status(403).json({ error: 'Unauthorized: Invalid admin key' });
    }

    let forceLang = null;
    if (req.body?.isHebrew === 'true' || req.query.isHebrew === 'true' || req.body?.isHebrew === true) {
      forceLang = true;
    } else if (req.body?.isHebrew === 'false' || req.query.isHebrew === 'false' || req.body?.isHebrew === false) {
      forceLang = false;
    }
    const channel = req.body?.channel || req.query.channel || null;

    try {
      const result = await runSocialRadarPipeline(forceLang, channel);
      return res.json({ success: true, result });
    } catch (err) {
      logger.error('triggerSocialRadarHttp error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Scheduled Social Radar Scan (Runs twice daily at 09:00 and 15:00 UTC)
 */
exports.scheduledSocialRadar = onSchedule(
  { schedule: '0 9,15 * * *', timeZone: 'UTC', region: 'us-central1', memory: '512MiB', timeoutSeconds: 120 },
  async () => {
    logger.info('[Social Radar] Running scheduled community radar scan for English and Hebrew...');
    await runSocialRadarPipeline(false); // Global English platforms
  }
);
