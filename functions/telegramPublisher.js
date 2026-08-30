/**
 * telegramPublisher.js
 * ---------------------------------------------------------------------------
 * Real-Time Automated Telegram Publishing & Engagement Pipeline for TrendingTech Daily
 *
 * Posts newly published articles in real-time to:
 * - Hebrew Channel (@TrendingTechDaily_HE or configured channel)
 * - English Channel (@TrendingTechDaily_EN or configured channel)
 *
 * Features:
 * - High-res photo upload with rich HTML caption
 * - Category-aware emojis and hashtags
 * - Interactive multi-action buttons (Read Article + One-Tap Share to Telegram)
 * - Automated Gemini-powered Interactive Polls (sendPoll) to maximize community engagement
 * - Deduplication guard (telegramPosted flag in Firestore)
 * - Daily Intelligence Digest compiler
 * - Fallback to sendMessage if image upload fails
 * - Manual test endpoint (onCall & HTTP with admin key)
 */

const fetch = require('node-fetch');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger, db } = require('./config');
const { loadGeminiSDK, getSafetySettings, getGeminiSDK, buildGenerateContentRequest } = require('./utils');
const { resolveEditorialArticleImage } = require('./services/editorialImageService');
const admin = require('firebase-admin');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8777608982:AAFG-sJayjNKjygzu-GUEUbUmWtwQmzqbEY';
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const DEFAULT_HEBREW_CHANNEL = process.env.TELEGRAM_HEBREW_CHANNEL || '-1003974217518';
const DEFAULT_ENGLISH_CHANNEL = process.env.TELEGRAM_ENGLISH_CHANNEL || '-1004492428380';
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
        enablePolls: data.enablePolls !== false,
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
    enablePolls: true,
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
 * Determine whether a poll should be attached to this article.
 * Rule: Only once every few articles (minimum 2-article cooldown) AND only when there is a real, interesting debate angle.
 */
async function shouldArticleHavePoll(article, isHe) {
  try {
    const colName = isHe ? 'he_articles' : 'articles';
    const recentPosts = await db.collection(colName)
      .where('telegramPosted', '==', true)
      .orderBy('telegramPostTime', 'desc')
      .limit(3)
      .get();

    let consecutiveRecentPolls = 0;
    let idx = 0;
    recentPosts.forEach(doc => {
      const data = doc.data();
      if (idx < 2 && data.telegramPollId) {
        consecutiveRecentPolls++;
      }
      idx++;
    });

    // If any of the last 2 articles posted had a poll, skip this one to prevent poll fatigue
    if (consecutiveRecentPolls > 0) {
      logger.info(`[Telegram Poll] Skipping poll for article due to recent poll cooldown.`);
      return false;
    }

    // Check if article is explicitly marked as breaking, featured, or lead story
    if (article.breaking === true || article.isFeatured === true || article.isLeadStory === true) {
      return true;
    }

    // Selective probabilistic cadence: roughly 1 in 3 articles
    return Math.random() < 0.40;
  } catch (err) {
    logger.warn('[Telegram Poll] Error in shouldArticleHavePoll check:', err.message);
    return false;
  }
}

/**
 * Generate a bespoke, story-specific Telegram poll using Gemini AI (Zero cookie-cutter templates)
 */
async function generateInteractivePoll(article, isHe) {
  const title = cleanText(article.title || '');
  const excerpt = cleanText(article.excerpt || article.summary || article.content || '');
  const category = cleanText(article.category || '');
  
  try {
    const loaded = await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK();
    if (loaded && GoogleGenAI) {
      const genAI = new GoogleGenAI({
        project: process.env.GCLOUD_PROJECT || 'automationbymeir',
        location: process.env.GCLOUD_LOCATION || 'us-central1'
      });
      const prompt = `You are an expert tech journalist and community engagement editor for TrendingTech Daily.
Your task is to create a dynamic, highly specific single-choice community poll based on this EXACT news story.

Article Title: "${title}"
Category: "${category}"
Summary / Content: "${excerpt.slice(0, 800)}"
Language: ${isHe ? 'HEBREW (Natural, native Israeli tech community tone)' : 'ENGLISH (Fluent, engaging Silicon Valley tech community tone)'}

CRITICAL RULES FOR RELEVANCE & UNIQUENESS:
1. SPECIFIC TO THE STORY: The question must mention the actual technology, company, feature, architectural decision, or market dilemma described in the article.
2. NO GENERIC BOILERPLATE: NEVER use generic, formulaic answers like:
   - "מהלך מהפכני שישנה את השוק" / "Game changer"
   - "משמעותי אבל דורש עוד הוכחות" / "Promising but needs proof"
   - "הייפ מוגזם ללא ערך אמיתי" / "Overhyped"
   - "עוקב בעניין" / "Watching closely"
3. AUTHENTIC TECH OPTIONS: Provide 3 to 4 distinct, concrete, realistic options that represent actual technical, business, or developer stances related to the article.
4. LENGTH CONSTRAINTS: Question max 250 chars. Each option max 80 chars.
5. Return ONLY a valid JSON object in this format:
{
  "question": "Story-specific question",
  "options": ["Specific option 1", "Specific option 2", "Specific option 3", "Specific option 4"]
}`;

      const result = await genAI.models.generateContent(
        buildGenerateContentRequest(prompt, {
          model: 'gemini-1.5-flash',
          safetySettings: getSafetySettings(),
          generationConfig: { responseMimeType: 'application/json' }
        })
      );

      let raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
      raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(raw);
      if (parsed.question && Array.isArray(parsed.options) && parsed.options.length >= 2) {
        return {
          question: parsed.question.slice(0, 255),
          options: parsed.options.slice(0, 4).map(o => String(o).slice(0, 85))
        };
      }
    }
  } catch (err) {
    logger.warn('[Telegram Poll] Gemini bespoke poll error:', err.message);
  }

  // Domain-specific smart fallback if AI call fails
  const shortTitle = title.slice(0, 100);
  const catLower = category.toLowerCase();

  if (catLower.includes('chip') || catLower.includes('computing') || catLower.includes('שבב') || catLower.includes('חומרה')) {
    return isHe ? {
      question: `מה עמדתכם לגבי ההשלכות הטכנולוגיות של ${shortTitle}?`,
      options: [
        '⚡ קפיצת ביצועים משמעותית לארכיטקטורה',
        '🔍 ממתינים למבחני ביצועים (Benchmarks) עצמאיים',
        '💰 שיקולי עלות/תועלת ו-TCO יכריעו את האימוץ',
        '🛑 פתרונות הדור הנוכחי מספקים לצרכים הקיימים'
      ]
    } : {
      question: `What is your take on the hardware implications of ${shortTitle}?`,
      options: [
        '⚡ Major architectural performance breakthrough',
        '🔍 Awaiting independent benchmark metrics',
        '💰 Cost-efficiency and TCO will decide adoption',
        '🛑 Current generation hardware remains sufficient'
      ]
    };
  }

  if (catLower.includes('ai') || catLower.includes('בינה') || catLower.includes('agent')) {
    return isHe ? {
      question: `איך המהלך סביב ${shortTitle} ישפיע על סביבת העבודה שלכם?`,
      options: [
        '🤖 בוחנים אינטגרציה מיידית ב-Pipeline',
        '⚖️ אתגרי אבטחה, פרטיות ודיוק עדיין מהווים חסם',
        '📈 יגביר את התחרות מול המודלים המובילים בשוק',
        '💡 נמתין לתוצאות מעשיות מהקהילה'
      ]
    } : {
      question: `How will the development around ${shortTitle} impact your workflow?`,
      options: [
        '🤖 Evaluating immediate pipeline integration',
        '⚖️ Security, privacy and reliability remain key hurdles',
        '📈 Increases competition among frontier models',
        '💡 Waiting for community validation and benchmarks'
      ]
    };
  }

  return isHe ? {
    question: `כיצד אתם מעריכים את ההשפעה של ${shortTitle}?`,
    options: [
      '🚀 מהלך אסטרטגי חיובי לתעשייה',
      '📋 דורש התאמות תשתית ופיתוח בסביבות העבודה',
      '🔍 מוקדם לקבוע - עוקבים אחר היישום בשטח',
      '🛡️ מעורר שאלות לגבי תקינה ורגולציה'
    ]
  } : {
    question: `How do you assess the industry impact of ${shortTitle}?`,
    options: [
      '🚀 Strategic positive shift for the ecosystem',
      '📋 Requires infrastructure and workflow adjustments',
      '🔍 Too early to tell - tracking real-world implementation',
      '🛡️ Raises key governance and standardization questions'
    ]
  };
}

/**
 * Send interactive Telegram poll
 */
async function sendTelegramPoll(channelTarget, pollData, botToken = TELEGRAM_BOT_TOKEN) {
  if (!pollData || !pollData.question || !Array.isArray(pollData.options) || pollData.options.length < 2) {
    return { skipped: true, reason: 'No poll data available' };
  }

  const apiBase = `https://api.telegram.org/bot${botToken}`;
  try {
    const payload = {
      chat_id: channelTarget,
      question: pollData.question,
      options: JSON.stringify(pollData.options),
      is_anonymous: true,
      allows_multiple_answers: false
    };

    const res = await fetch(`${apiBase}/sendPoll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 15000
    });

    const data = await res.json();
    if (data.ok) {
      logger.info(`[Telegram Poll] Successfully sent poll to ${channelTarget}:`, data.result?.poll?.id);
      return { success: true, pollId: data.result?.poll?.id, messageId: data.result?.message_id };
    } else {
      logger.warn(`[Telegram Poll] sendPoll error (${data.description})`);
      return { success: false, error: data.description };
    }
  } catch (err) {
    logger.warn('[Telegram Poll] sendPoll exception:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Post single article payload to Telegram Bot API with enhanced interactive buttons
 */
async function postToTelegramApi(channelTarget, article, isHe, botToken = TELEGRAM_BOT_TOKEN) {
  const slug = article.slug || article.id;
  const articleUrl = isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`;

  const caption = formatTelegramCaption(article, isHe);
  const readBtnText = isHe ? '🌐 לקריאת הכתבה המלאה' : '🌐 Read Full Article';
  const shareBtnText = isHe ? '🚀 שתף מבזק' : '🚀 Share Dispatch';
  const shareText = isHe ? `⚡ חדשות טכנולוגיה: ${cleanText(article.title)}` : `⚡ Breaking Tech: ${cleanText(article.title)}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(articleUrl)}&text=${encodeURIComponent(shareText)}`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: readBtnText, url: articleUrl }
      ],
      [
        { text: shareBtnText, url: shareUrl }
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
 * Master dispatcher for publishing an article and poll to Telegram
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

    // Optional selective interactive poll generation (once every few articles, bespoke content)
    let pollResult = null;
    if (config.enablePolls) {
      try {
        const eligibleForPoll = await shouldArticleHavePoll(articleData, isHe);
        if (eligibleForPoll) {
          const pollData = await generateInteractivePoll(articleData, isHe);
          if (pollData && pollData.question && Array.isArray(pollData.options) && pollData.options.length >= 2) {
            pollResult = await sendTelegramPoll(targetChannel, pollData, config.botToken);
          }
        }
      } catch (pollErr) {
        logger.warn('[Telegram] Non-critical poll failure:', pollErr.message);
      }
    }

    // Mark as posted in Firestore
    await docRef.update({
      telegramPosted: true,
      telegramPostTime: admin.firestore.FieldValue.serverTimestamp(),
      telegramChannel: targetChannel,
      telegramMessageId: result.messageId || null,
      telegramPollId: pollResult?.pollId || null
    });

    return { success: true, channel: targetChannel, messageId: result.messageId, pollId: pollResult?.pollId };
  } catch (err) {
    logger.error(`[Telegram] Failed to post article ${docRef.id} to ${targetChannel}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Compile and broadcast Daily Intelligence Digest to Telegram
 */
async function publishDailyDigest(isHe = true) {
  const config = await getTelegramConfig();
  if (!config.enabled) return { skipped: true };

  const colName = isHe ? 'he_articles' : 'articles';
  const targetChannel = isHe ? config.hebrewChannel : config.englishChannel;
  const snap = await db.collection(colName)
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(4)
    .get();

  if (snap.empty) return { skipped: true, reason: 'No articles found' };

  const articles = [];
  snap.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));

  const now = new Date();
  const dateFormatted = now.toLocaleDateString(isHe ? 'he-IL' : 'en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  let digestText = isHe 
    ? `🌙 <b>מבזק ערב יומי — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nריכזנו עבורכם את 4 הידיעות הטכנולוגיות המרכזיות של היום:\n\n`
    : `🌙 <b>Evening Intelligence Digest — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nTop tech developments and research breakdowns from today:\n\n`;

  articles.forEach((art, idx) => {
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][idx] || '🔹';
    const slug = art.slug || art.id;
    const artUrl = isHe 
      ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`
      : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`;
    
    digestText += `${numEmoji} <a href="${artUrl}"><b>${escapeHtml(art.title)}</b></a>\n${escapeHtml(cleanText(art.excerpt || '').slice(0, 100))}...\n\n`;
  });

  digestText += isHe 
    ? `🌐 לכל הכתבות והניתוחים: <a href="${SITE_BASE_URL}/he/">TrendingTech Daily</a>\n📢 שתפו את הערוץ: @TrendingTechDaily_HE`
    : `🌐 Explore all research dispatches: <a href="${SITE_BASE_URL}">TrendingTech Daily</a>\n📢 Share our channel: @TrendingTechDaily_EN`;

  const apiBase = `https://api.telegram.org/bot${config.botToken}`;
  const res = await fetch(`${apiBase}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChannel,
      text: digestText,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
      reply_markup: {
        inline_keyboard: [
          [{ text: isHe ? '🚀 פתח מגזין מלא' : '🚀 Open Full Magazine', url: isHe ? `${SITE_BASE_URL}/he/` : SITE_BASE_URL }]
        ]
      }
    }),
    timeout: 15000
  });

  const data = await res.json();
  return { success: data.ok, messageId: data.result?.message_id };
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

// ── Scheduled Daily Intelligence Digest (Daily at 20:00 IL time) ────────────
exports.dailyTelegramDigest = onSchedule(
  { schedule: '0 17 * * *', timeZone: 'UTC', region: 'us-central1', memory: '256MiB' },
  async () => {
    logger.info('[Telegram] Running daily digest scheduled task');
    await publishDailyDigest(true);
    await publishDailyDigest(false);
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
    const action = req.body?.action || req.query?.action || 'post';

    if (action === 'digest') {
      const digestRes = await publishDailyDigest(isHe);
      return res.json({ success: true, digestRes });
    }

    const title = req.body?.title || (isHe ? '🚀 שידור ראשון: ערוץ הטלגרם של TrendingTech Daily פעיל!' : '🚀 First Broadcast: TrendingTech Daily Telegram Channel is LIVE!');
    const category = req.body?.category || 'ai';
    let resolvedImage = req.body?.featuredImage || req.body?.imageUrl;
    if (!resolvedImage) {
      try {
        resolvedImage = await resolveEditorialArticleImage({
          title,
          category,
          imagePrompt: title
        });
      } catch (imgErr) {
        logger.warn('Failed to resolve dynamic editorial image:', imgErr.message);
      }
    }

    const testArticle = {
      id: req.body?.articleId || 'test-article-http',
      title,
      excerpt: req.body?.excerpt || (isHe ? 'ברוכים הבאים לערוץ הרשמי! כאן תקבלו בזמן אמת ניתוחים מעמיקים, עדכוני בינה מלאכותית, שבבים, שוק ההון ומערכות עיצוב ישירות מהמגזין.' : 'Welcome to our official Telegram channel! Get real-time AI updates, semiconductor breakthroughs, market watch, and design systems analysis.'),
      category,
      author: 'TrendingTech Bot',
      slug: req.body?.slug || 'welcome-telegram',
      featuredImage: resolvedImage || 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1400&auto=format&fit=crop&q=85',
      readingTimeMinutes: 2
    };

    try {
      const result = await postToTelegramApi(channel, testArticle, isHe, TELEGRAM_BOT_TOKEN);
      const pollData = await generateInteractivePoll(testArticle, isHe);
      const pollRes = await sendTelegramPoll(channel, pollData, TELEGRAM_BOT_TOKEN);
      return res.json({ success: true, channel, result, pollRes });
    } catch (err) {
      logger.error('triggerTelegramPostHttp error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

exports.publishDailyDigest = publishDailyDigest;
exports.generateInteractivePoll = generateInteractivePoll;
exports.sendTelegramPoll = sendTelegramPoll;
exports.postToTelegramApi = postToTelegramApi;
