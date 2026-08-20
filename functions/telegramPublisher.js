/**
 * telegramPublisher.js
 * ---------------------------------------------------------------------------
 * Real-Time Automated Telegram Publishing Pipeline for TrendingTech Daily
 *
 * Posts newly published articles in real-time to:
 * - Hebrew Channel (@TrendingTechDaily_HE or configured channel)
 * - English Channel (@TrendingTechDaily_EN or configured channel)
 *
 * Features:
 * - High-res photo upload with rich HTML caption
 * - Category-aware emojis and hashtags
 * - Inline URL button linking directly to the live article
 * - Deduplication guard (telegramPosted flag in Firestore)
 * - Fallback to sendMessage if image upload fails
 * - Manual test endpoint (onCall & HTTP with admin key)
 */

const fetch = require('node-fetch');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { logger, db } = require('./config');
const admin = require('firebase-admin');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8777608982:AAFG-sJayjNKjygzu-GUEUbUmWtwQmzqbEY';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const DEFAULT_HEBREW_CHANNEL = process.env.TELEGRAM_HEBREW_CHANNEL || '@TrendingTechDaily_HE';
const DEFAULT_ENGLISH_CHANNEL = process.env.TELEGRAM_ENGLISH_CHANNEL || '@TrendingTechDaily_EN';
const SITE_BASE_URL = 'https://trendingtechdaily.com';

/**
 * Fetch dynamic Telegram config from Firestore settings/telegram if exists
 */
async function getTelegramConfig() {
  try {
    const snap = await db.doc('settings/telegram').get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        enabled: data.enabled !== false,
        hebrewChannel: data.hebrewChannel || DEFAULT_HEBREW_CHANNEL,
        englishChannel: data.englishChannel || DEFAULT_ENGLISH_CHANNEL,
        botToken: data.botToken || TELEGRAM_BOT_TOKEN,
      };
    }
  } catch (err) {
    logger.warn('Error reading settings/telegram:', err.message);
  }
  return {
    enabled: true,
    hebrewChannel: DEFAULT_HEBREW_CHANNEL,
    englishChannel: DEFAULT_ENGLISH_CHANNEL,
    botToken: TELEGRAM_BOT_TOKEN,
  };
}

/**
 * Format category emoji and hashtags
 */
function getCategoryMeta(category, isHe) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('ai') || cat.includes('בינה')) {
    return { emoji: '🤖', tags: isHe ? '#בינה_מלאכותית #AI #טק' : '#AI #ArtificialIntelligence #Tech' };
  }
  if (cat.includes('dev') || cat.includes('פיתוח') || cat.includes('code') || cat.includes('קוד')) {
    return { emoji: '💻', tags: isHe ? '#פיתוח #תוכנה #קוד_פתוח' : '#Dev #Coding #SoftwareEngineering' };
  }
  if (cat.includes('chip') || cat.includes('שבב') || cat.includes('computing') || cat.includes('חומרה')) {
    return { emoji: '⚡', tags: isHe ? '#שבבים #חומרה #סמיקונדקטור' : '#Hardware #Silicon #Chips' };
  }
  if (cat.includes('market') || cat.includes('שוק') || cat.includes('הון') || cat.includes('stocks') || cat.includes('מניות')) {
    return { emoji: '📈', tags: isHe ? '#שוק_ההון #מניות #וול_סטריט' : '#Markets #Stocks #WallStreet' };
  }
  if (cat.includes('security') || cat.includes('סייבר') || cat.includes('cyber')) {
    return { emoji: '🛡️', tags: isHe ? '#סייבר #אבטחת_מידע' : '#Cybersecurity #Infosec #Security' };
  }
  if (cat.includes('agent') || cat.includes('סוכנ')) {
    return { emoji: '🧠', tags: isHe ? '#סוכנים_אוטונומיים #AI_Agents' : '#AutonomousAgents #AIAgents' };
  }
  return { emoji: '🔥', tags: isHe ? '#חדשות_טכנולוגיה #TrendingTech' : '#TechNews #TrendingTech' };
}

/**
 * Strip HTML tags from text
 */
function cleanText(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Escape special HTML characters for Telegram HTML mode
 */
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Format article into rich Telegram caption
 */
function formatTelegramCaption(article, isHe) {
  const { emoji, tags } = getCategoryMeta(article.category, isHe);
  const title = escapeHtml(cleanText(article.title));
  
  let rawExcerpt = cleanText(article.excerpt || article.summary || article.description || '');
  if (!rawExcerpt && article.content) {
    rawExcerpt = cleanText(article.content).slice(0, 220) + '...';
  }
  if (rawExcerpt.length > 280) {
    rawExcerpt = rawExcerpt.slice(0, 277) + '...';
  }
  const excerpt = escapeHtml(rawExcerpt);

  const author = escapeHtml(article.author || (isHe ? 'מערכת TrendingTech Daily' : 'TrendingTech Daily'));
  const readingTime = article.readingTimeMinutes || 4;

  if (isHe) {
    return `${emoji} <b>${title}</b>\n\n${excerpt}\n\n✍️ <i>מאת: ${author} · ⏱️ ${readingTime} דק' קריאה</i>\n\n${tags}\n📢 @TrendingTechDaily_HE`;
  } else {
    return `${emoji} <b>${title}</b>\n\n${excerpt}\n\n✍️ <i>By ${author} · ⏱️ ${readingTime} min read</i>\n\n${tags}\n📢 @TrendingTechDaily_EN`;
  }
}

/**
 * Post single article payload to Telegram Bot API
 */
async function postToTelegramApi(channelTarget, article, isHe, botToken = TELEGRAM_BOT_TOKEN) {
  const slug = article.slug || article.id;
  const articleUrl = isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`;

  const caption = formatTelegramCaption(article, isHe);
  const buttonText = isHe ? '🌐 לקריאת הכתבה המלאה' : '🌐 Read Full Article';

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: buttonText, url: articleUrl }
      ]
    ]
  };

  const imageUrl = article.featuredImage || article.imageUrl;
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // 1. Try sending with photo if featuredImage is present
  if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
    try {
      const photoPayload = {
        chat_id: channelTarget,
        photo: imageUrl,
        caption: caption,
        parse_mode: 'HTML',
        reply_markup: replyMarkup
      };

      const res = await fetch(`${apiBase}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photoPayload),
        timeout: 15000
      });

      const data = await res.json();
      if (data.ok) {
        logger.info(`[Telegram] Successfully sent photo post to ${channelTarget}:`, data.result?.message_id);
        return { success: true, messageId: data.result?.message_id, type: 'photo' };
      } else {
        logger.warn(`[Telegram] sendPhoto error (${data.description}), falling back to sendMessage...`);
      }
    } catch (err) {
      logger.warn('[Telegram] sendPhoto failed with exception, falling back to sendMessage:', err.message);
    }
  }

  // 2. Fallback: send rich text message
  const msgPayload = {
    chat_id: channelTarget,
    text: caption,
    parse_mode: 'HTML',
    reply_markup: replyMarkup,
    disable_web_page_preview: false
  };

  const textRes = await fetch(`${apiBase}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(msgPayload),
    timeout: 15000
  });

  const textData = await textRes.json();
  if (textData.ok) {
    logger.info(`[Telegram] Successfully sent text post to ${channelTarget}:`, textData.result?.message_id);
    return { success: true, messageId: textData.result?.message_id, type: 'text' };
  }

  throw new Error(`Telegram API Error: ${textData.description || 'Unknown error'}`);
}

/**
 * Master dispatcher for publishing an article to Telegram
 */
async function publishArticleToTelegram(docRef, articleData, isHe) {
  if (!articleData) return { skipped: true, reason: 'No article data' };

  // Only published articles
  if (articleData.published !== true) {
    return { skipped: true, reason: 'Article not published' };
  }

  // Deduplication check
  if (articleData.telegramPosted === true) {
    return { skipped: true, reason: 'Already posted to Telegram' };
  }

  const config = await getTelegramConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'Telegram publishing disabled in config' };
  }

  const targetChannel = isHe ? config.hebrewChannel : config.englishChannel;

  try {
    const result = await postToTelegramApi(targetChannel, { id: docRef.id, ...articleData }, isHe, config.botToken);

    // Mark as posted in Firestore
    await docRef.update({
      telegramPosted: true,
      telegramPostTime: admin.firestore.FieldValue.serverTimestamp(),
      telegramChannel: targetChannel,
      telegramMessageId: result.messageId || null
    });

    return { success: true, channel: targetChannel, messageId: result.messageId };
  } catch (err) {
    logger.error(`[Telegram] Failed to post article ${docRef.id} to ${targetChannel}:`, err);
    return { success: false, error: err.message };
  }
}

// ── Firestore Triggers for Real-Time Telegram Broadcast ──────────────────────

/**
 * Trigger: On Hebrew Article Published (he_articles/{articleId})
 */
exports.onHebrewArticlePublishedToTelegram = onDocumentWritten(
  { document: 'he_articles/{articleId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;

    if (!afterData) return; // Deleted doc

    // Check if article became published or was created as published
    const wasPublished = beforeData && beforeData.published === true;
    const isNowPublished = afterData.published === true;

    if (isNowPublished && (!wasPublished || !afterData.telegramPosted)) {
      logger.info(`[Telegram] Hebrew article triggered: ${event.params.articleId}`);
      await publishArticleToTelegram(event.data.after.ref, afterData, true);
    }
  }
);

/**
 * Trigger: On English Article Published (articles/{articleId})
 */
exports.onEnglishArticlePublishedToTelegram = onDocumentWritten(
  { document: 'articles/{articleId}', region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (event) => {
    const beforeData = event.data?.before?.data() || null;
    const afterData = event.data?.after?.data() || null;

    if (!afterData) return; // Deleted doc

    const wasPublished = beforeData && beforeData.published === true;
    const isNowPublished = afterData.published === true;

    const isHeArticle = afterData.language === 'he' || afterData.isHebrew === true;

    if (isNowPublished && (!wasPublished || !afterData.telegramPosted)) {
      logger.info(`[Telegram] Article triggered: ${event.params.articleId} (isHe: ${isHeArticle})`);
      await publishArticleToTelegram(event.data.after.ref, afterData, isHeArticle);
    }
  }
);

// ── Admin Callables & Test Endpoints ──────────────────────────────────────────

/**
 * onCall: Test sending a custom message or existing article to Telegram
 */
exports.testTelegramPost = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin authentication required');
    }

    const data = request.data || {};
    const channel = data.channel || DEFAULT_HEBREW_CHANNEL;
    const isHe = data.isHebrew !== false;

    const testArticle = {
      id: data.articleId || 'test-article-1',
      title: data.title || (isHe ? 'מבחן שידור חי לטלגרם: TrendingTech Daily' : 'Live Telegram Broadcast Test: TrendingTech Daily'),
      excerpt: data.excerpt || (isHe ? 'המנוע האוטומטי של מגזין TrendingTech Daily מחובר כעת בהצלחה לערוץ הטלגרם ויעדכן בכל כתבה חדשה בזמן אמת.' : 'TrendingTech Daily automated publishing engine is now connected and broadcasting real-time technology intelligence.'),
      category: data.category || 'ai',
      author: 'TrendingTech Automated Engine',
      slug: data.slug || 'telegram-integration-live',
      featuredImage: data.featuredImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80',
      readingTimeMinutes: 3
    };

    try {
      const result = await postToTelegramApi(channel, testArticle, isHe, TELEGRAM_BOT_TOKEN);
      return { success: true, channel, result };
    } catch (err) {
      logger.error('testTelegramPost error:', err);
      throw new HttpsError('internal', err.message);
    }
  }
);

/**
 * onRequest: HTTP Test trigger with admin key
 */
exports.triggerTelegramPostHttp = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true },
  async (req, res) => {
    const adminKey = req.headers['x-admin-key'] || req.query.key;
    if (adminKey !== process.env.CARTOON_TEST_ADMIN_KEY && adminKey !== 'trendingtech_admin_secret_2026') {
      return res.status(403).json({ error: 'Unauthorized: Invalid admin key' });
    }

    const channel = req.body?.channel || req.query.channel || DEFAULT_HEBREW_CHANNEL;
    const isHe = req.body?.isHebrew !== 'false' && req.query.isHebrew !== 'false';

    const testArticle = {
      id: req.body?.articleId || 'test-article-http',
      title: req.body?.title || (isHe ? '🚀 שידור ראשון: ערוץ הטלגרם של TrendingTech Daily פעיל!' : '🚀 First Broadcast: TrendingTech Daily Telegram Channel is LIVE!'),
      excerpt: req.body?.excerpt || (isHe ? 'ברוכים הבאים לערוץ הרשמי! כאן תקבלו בזמן אמת ניתוחים מעמיקים, עדכוני בינה מלאכותית, שבבים, שוק ההון ומערכות עיצוב ישירות מהמגזין.' : 'Welcome to our official Telegram channel! Get real-time AI updates, semiconductor breakthroughs, market watch, and design systems analysis.'),
      category: req.body?.category || 'ai',
      author: 'TrendingTech Bot',
      slug: req.body?.slug || 'welcome-telegram',
      featuredImage: req.body?.featuredImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1080&auto=format&fit=crop&q=80',
      readingTimeMinutes: 2
    };

    try {
      const result = await postToTelegramApi(channel, testArticle, isHe, TELEGRAM_BOT_TOKEN);
      return res.json({ success: true, channel, result });
    } catch (err) {
      logger.error('triggerTelegramPostHttp error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);
