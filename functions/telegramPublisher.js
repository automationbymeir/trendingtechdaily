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
  if (cat.includes('iran') || cat.includes('איראן') || cat.includes('warfare') || cat.includes('defense') || cat.includes('לוחמ')) {
    return { emoji: '🚨', tags: isHe ? '#סייבר #איראן #מלחמת_סייבר #מודיעין #טכנולוגיה' : '#CyberWarfare #Iran #DefenseTech #Intelligence #Tech' };
  }
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
    return { emoji: '🛡️', tags: isHe ? '#סייבר #אבטחת_מידע #סייבר_ישראל' : '#Cybersecurity #Infosec #Security' };
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
 * Format article into rich, high-engagement Telegram caption with hooks
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
  const readingTime = article.readingTimeMinutes || 3;

  const isCyberOrIran = (article.category || '').toLowerCase().includes('iran') || 
                        (article.category || '').toLowerCase().includes('warfare') ||
                        (article.title || '').includes('איראן') ||
                        (article.title || '').toLowerCase().includes('cyber');

  const hookPrefix = isCyberOrIran 
    ? (isHe ? '🚨 <b>מבזק סייבר וביטחון טכנולוגי</b>' : '🚨 <b>Cyber & Defense Tech Alert</b>') 
    : '';

  if (isHe) {
    const header = hookPrefix ? `${hookPrefix}\n\n${emoji} <b>${title}</b>` : `${emoji} <b>${title}</b>`;
    return `${header}\n\n${excerpt}\n\n✍️ <i>מאת: ${author} · ⏱️ ${readingTime} דק' קריאה</i>\n\n${tags}\n📢 @TrendingTechDaily_HE`;
  } else {
    const header = hookPrefix ? `${hookPrefix}\n\n${emoji} <b>${title}</b>` : `${emoji} <b>${title}</b>`;
    return `${header}\n\n${excerpt}\n\n✍️ <i>By ${author} · ⏱️ ${readingTime} min read</i>\n\n${tags}\n📢 @TrendingTechDaily_EN`;
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

async function postToTelegramApi(channelTarget, article, isHe, botToken = TELEGRAM_BOT_TOKEN) {
  const slug = article.slug || article.id;
  const articleUrl = article.url || article.externalUrl || (isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id || '')}`);

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

  let imageUrl = article.featuredImage || article.imageUrl;
  if (imageUrl && typeof imageUrl === 'object') {
    imageUrl = imageUrl.imageUrl || imageUrl.url || null;
  }
  const apiBase = `https://api.telegram.org/bot${botToken}`;

  // 1. Try sending with photo if featuredImage is present
  if (typeof imageUrl === 'string' && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
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
async function publishArticleToTelegram(docRef, articleData, isHe, channelOverride = null) {
  if (!articleData) return { skipped: true, reason: 'No article data' };

  // Only published articles
  if (articleData.published !== true) {
    return { skipped: true, reason: 'Article not published' };
  }

  // Deduplication check
  if (articleData.telegramPosted === true && !channelOverride) {
    return { skipped: true, reason: 'Already posted to Telegram' };
  }

  const config = await getTelegramConfig();
  if (!config.enabled) {
    return { skipped: true, reason: 'Telegram publishing disabled in config' };
  }

  const targetChannel = channelOverride || (isHe ? config.hebrewChannel : config.englishChannel);

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
 * Compile and broadcast Morning Intelligence Briefing to Telegram (08:00 Israel time)
 */
async function publishMorningDigest(isHe = true, channelOverride = null) {
  const config = await getTelegramConfig();
  if (!config.enabled) return { skipped: true };

  const colName = isHe ? 'he_articles' : 'articles';
  const targetChannel = channelOverride || (isHe ? config.hebrewChannel : config.englishChannel);
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
    ? `☀️ <b>כותרות הבוקר — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nבוקר טוב! ריכזנו עבורכם את 4 הכותרות הטכנולוגיות, הסייבר ונעילת השווקים של הבוקר:\n\n`
    : `☀️ <b>Morning Intelligence Briefing — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nGood morning! Top technology, AI, and cybersecurity developments to start your day:\n\n`;

  articles.forEach((art, idx) => {
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][idx] || '🔹';
    const slug = art.slug || art.id;
    const artUrl = isHe 
      ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`
      : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`;
    
    digestText += `${numEmoji} <a href="${artUrl}"><b>${escapeHtml(art.title)}</b></a>\n${escapeHtml(cleanText(art.excerpt || '').slice(0, 105))}...\n\n`;
  });

  digestText += isHe 
    ? `🌐 לכל הכתבות והניתוחים בזמן אמת: <a href="${SITE_BASE_URL}/he/">TrendingTech Daily</a>\n📢 שתפו את הערוץ: @TrendingTechDaily_HE`
    : `🌐 Real-time technology intelligence: <a href="${SITE_BASE_URL}">TrendingTech Daily</a>\n📢 Share our channel: @TrendingTechDaily_EN`;

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

/**
 * Compile and broadcast Daily Evening Intelligence Digest to Telegram (20:00 Israel time)
 */
async function publishDailyDigest(isHe = true, channelOverride = null) {
  const config = await getTelegramConfig();
  if (!config.enabled) return { skipped: true };

  const colName = isHe ? 'he_articles' : 'articles';
  const targetChannel = channelOverride || (isHe ? config.hebrewChannel : config.englishChannel);
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
    ? `🌙 <b>מבזק ערב יומי — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nערב טוב! ריכזנו עבורכם את 4 הידיעות הטכנולוגיות והסייבר המרכזיות של היום:\n\n`
    : `🌙 <b>Evening Intelligence Digest — TrendingTech Daily</b>\n📅 <i>${dateFormatted}</i>\n\nGood evening! Top tech developments and research breakdowns from today:\n\n`;

  articles.forEach((art, idx) => {
    const numEmoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'][idx] || '🔹';
    const slug = art.slug || art.id;
    const artUrl = isHe 
      ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`
      : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(art.id)}`;
    
    digestText += `${numEmoji} <a href="${artUrl}"><b>${escapeHtml(art.title)}</b></a>\n${escapeHtml(cleanText(art.excerpt || '').slice(0, 105))}...\n\n`;
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

/**
 * Fetch OpenGraph description or first paragraph from article URL
 */
async function fetchPageSummary(url) {
  if (!url || !url.startsWith('http')) return '';
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 4500
    });
    if (!res.ok) return '';
    const html = await res.text();
    // 1. Check og:description
    const ogDesc = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
                   html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
    if (ogDesc && ogDesc[1]) {
      return cleanText(ogDesc[1]).slice(0, 500);
    }
    // 2. Check meta name=description
    const metaDesc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
                     html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (metaDesc && metaDesc[1]) {
      return cleanText(metaDesc[1]).slice(0, 500);
    }
    // 3. Check first paragraph
    const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (pMatches && pMatches.length > 0) {
      for (const p of pMatches) {
        const cleanedP = cleanText(p);
        if (cleanedP.length > 60) {
          return cleanedP.slice(0, 500);
        }
      }
    }
  } catch (err) {
    logger.warn('[Page Summary] fetch error for ' + url + ':', err.message);
  }
  return '';
}

/**
 * Generates and saves a complete, high-quality, full-length article directly to Firestore (he_articles or articles)
 */
async function generateAndSaveFullArticle(topicInfo, isHe = true) {
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) {
    throw new Error('Gemini SDK unavailable');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = apiKey
    ? new GoogleGenAI({ apiKey })
    : new GoogleGenAI({
        project: process.env.GCLOUD_PROJECT || 'automationbymeir',
        location: process.env.GCLOUD_LOCATION || 'us-central1'
      });

  const rawTitle = typeof topicInfo === 'string' ? topicInfo : (topicInfo.title || '');
  let rawText = typeof topicInfo === 'object' ? (topicInfo.text || topicInfo.description || '') : '';
  const rawUrl = typeof topicInfo === 'object' ? (topicInfo.url || '') : '';

  if (!rawText && rawUrl) {
    rawText = await fetchPageSummary(rawUrl);
  }

  let prompt = '';
  if (isHe) {
    prompt = `אתה כתב ועורך טכנולוגי בכיר במגזין הטכנולוגיה והסייבר המוביל TrendingTech Daily.
עליך לכתוב כתבה עיתונאית מלאה, מעמיקה, סוחפת ומקצועית ביותר שתתפרסם באתר בעברית.
נושא הידיעה / כותרת: "${rawTitle}"
רקע / מקור מהאינטרנט: "${rawText.slice(0, 800)}" ${rawUrl}

דרישות קריטיות:
1. כותרת (title): כותרת עיתונאית חדה, ברורה, מושכת ומדויקת בעברית (עד 75 תווים).
2. סלאג (slug): סלאג באנגלית באותיות קטנות עם מקפים בלבד (למשל: cyber-threat-satellite-networks או open-source-audio-tools).
3. תקציר (excerpt): תקציר אינפורמטיבי וממצה בן 2-3 משפטים המסביר את עיקרי הכתבה והמשמעויות (130-220 תווים). אסור להשתמש במשפטי מילוי גנריים כגון "התפתחות משמעותית בקהילה".
4. גוף הכתבה (content): כתבה עיתונאית מלאה, עשירה ומעמיקה בת 400-600 מילים המחולקת לפסקאות HTML עם תגיות <p>. כלול רקע, ניתוח טכני של הארכיטקטורה או המוצר, השלכות על השוק ותובנות מומחים.
5. קטגוריה (category): בדיוק אחת מתוך: ai, dev, cyber-warfare, chips, computing, markets.
6. תגיות (tags): מערך של 4-6 תגיות בעברית (למשל: ["סייבר", "מודיעין", "טכנולוגיה", "אבטחת_מידע"]).
7. מחבר (author): שם הדסק המתאים (למשל: "דסק סייבר וביטחון", "דסק תוכנה וקוד פתוח", "דסק בינה מלאכותית", "דסק שוק ההון").
8. מילות חיפוש לתמונה (imagePrompt): 3-5 מילים באנגלית מדויקות עבור Unsplash.

החזר אך ורק אובייקט JSON תקין במבנה הבא:
{
  "title": "כותרת הכתבה",
  "slug": "english-slug",
  "excerpt": "תקציר איכותי ומפורט",
  "content": "<p>פסקה ראשונה...</p><p>פסקה שנייה...</p>",
  "category": "dev",
  "tags": ["תגית1", "תגית2"],
  "author": "דסק תוכנה וקוד פתוח",
  "imagePrompt": "audio studio mixing console software",
  "readingTimeMinutes": 3
}`;
  } else {
    prompt = `You are a senior technology and cybersecurity editor at TrendingTech Daily.
Write a full-length, in-depth, highly engaging news analysis article to be published on the magazine.
Topic / Headline: "${rawTitle}"
Context / Source: "${rawText.slice(0, 800)}" ${rawUrl}

Requirements:
1. Title: Authoritative, punchy, engaging headline (max 75 chars).
2. Slug: Lowercase hyphenated english slug.
3. Excerpt: Informative 2-3 sentence overview (130-220 chars).
4. Content: Full in-depth 450-600 word article in HTML with <p> tags, including background, technical architecture, industry impact, and analysis.
5. Category: Exactly one of: ai, dev, cyber-warfare, chips, computing, markets.
6. Tags: Array of 4-6 relevant tags.
7. Author: Editorial desk (e.g., "TrendingTech Cyber Desk", "TrendingTech AI Intelligence").
8. imagePrompt: 3-5 precise english photography keywords for Unsplash.

Return ONLY a valid JSON object:
{
  "title": "string",
  "slug": "string",
  "excerpt": "string",
  "content": "string",
  "category": "string",
  "tags": ["string"],
  "author": "string",
  "imagePrompt": "string",
  "readingTimeMinutes": 3
}`;
  }

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

  let featuredImage = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=85';
  try {
    const imgObj = await resolveEditorialArticleImage({
      title: parsed.title,
      category: parsed.category,
      imagePrompt: parsed.imagePrompt || parsed.title
    });
    featuredImage = (typeof imgObj === 'object' ? imgObj?.imageUrl : imgObj) || featuredImage;
  } catch (err) {
    logger.warn('Image resolution error:', err.message);
  }

  const articlePayload = {
    title: parsed.title,
    slug: parsed.slug || `story-${Date.now()}`,
    excerpt: parsed.excerpt,
    content: parsed.content,
    category: parsed.category || 'ai',
    tags: Array.isArray(parsed.tags) ? parsed.tags : [parsed.category || 'טכנולוגיה'],
    author: parsed.author || (isHe ? 'דסק טכנולוגיה וסייבר' : 'TrendingTech Editorial'),
    featuredImage,
    imageAltText: parsed.title,
    readingTimeMinutes: parsed.readingTimeMinutes || 3,
    language: isHe ? 'he' : 'en',
    published: true,
    views: 0,
    likes: 0,
    telegramPosted: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const colName = isHe ? 'he_articles' : 'articles';
  const newDocRef = await db.collection(colName).add(articlePayload);
  logger.info(`[Full Article Generator] Saved full article to ${colName}/${newDocRef.id}: ${parsed.title}`);

  return { id: newDocRef.id, ref: newDocRef, ...articlePayload };
}

/**
 * Hourly Telegram Intelligence Dispatcher
 * Checks for unposted published articles in Firestore, or generates a full fresh article on TrendingTech Daily and broadcasts it
 */
async function dispatchHourlyTelegramNews(isHe = true, channelOverride = null) {
  const config = await getTelegramConfig();
  if (!config.enabled) return { skipped: true, reason: 'Telegram disabled in config' };

  const targetChannel = channelOverride || (isHe ? config.hebrewChannel : config.englishChannel);
  const colName = isHe ? 'he_articles' : 'articles';

  // 1. Check for any unpublished-to-telegram article in Firestore
  try {
    const unpostedSnap = await db.collection(colName)
      .where('published', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    for (const doc of unpostedSnap.docs) {
      const data = doc.data();
      if (!data.telegramPosted) {
        logger.info(`[Hourly Dispatch] Posting unposted Firestore article: ${doc.id}`);
        return await publishArticleToTelegram(doc.ref, data, isHe, channelOverride);
      }
    }
  } catch (err) {
    logger.warn('[Hourly Dispatch] Unposted query notice:', err.message);
  }

  // 2. Generate a full, complete new article on TrendingTech Daily and broadcast
  try {
    const hnRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 6000 });
    if (hnRes.ok) {
      const ids = (await hnRes.json()).slice(0, 15);
      for (const id of ids) {
        const itemRes = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 4000 });
        if (!itemRes.ok) continue;
        const item = await itemRes.json();
        if (item && item.title && (item.score >= 15 || item.descendants >= 3)) {
          const dispatchKey = `hn-${item.id}`;
          const dispatchRef = db.collection('telegram_dispatches').doc(dispatchKey);
          const existsSnap = await dispatchRef.get();
          if (!existsSnap.exists) {
            // Generate full article directly into Firestore
            const fullArticle = await generateAndSaveFullArticle(item, isHe);

            // Broadcast to Telegram
            const postRes = await publishArticleToTelegram(fullArticle.ref, fullArticle, isHe, channelOverride);

            // Mark in deduplication collection
            await dispatchRef.set({
              dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
              title: fullArticle.title,
              articleId: fullArticle.id,
              slug: fullArticle.slug,
              channel: targetChannel,
              messageId: postRes?.messageId || null
            });

            return {
              success: true,
              channel: targetChannel,
              type: 'full-article-dispatch',
              articleId: fullArticle.id,
              slug: fullArticle.slug,
              messageId: postRes?.messageId
            };
          }
        }
      }
    }
  } catch (err) {
    logger.warn('[Hourly Dispatch] Full article dispatch error:', err.message);
  }

  return { skipped: true, reason: 'No new unique dispatch needed this hour' };
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

// ── Scheduled Schedulers (Asia/Jerusalem Timezone) ───────────────────────────

/**
 * Morning Intelligence Briefing: 08:00 AM Israel Time
 */
exports.morningTelegramDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', memory: '256MiB', secrets: ['GEMINI_API_KEY'] },
  async () => {
    logger.info('[Telegram] Running morning digest scheduled task (08:00 IL)');
    await publishMorningDigest(true);
    await publishMorningDigest(false);
  }
);

/**
 * Evening Intelligence Digest: 20:00 PM Israel Time
 */
exports.dailyTelegramDigest = onSchedule(
  { schedule: '0 20 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', memory: '256MiB', secrets: ['GEMINI_API_KEY'] },
  async () => {
    logger.info('[Telegram] Running evening digest scheduled task (20:00 IL)');
    await publishDailyDigest(true);
    await publishDailyDigest(false);
  }
);

/**
 * Hourly Intelligence Dispatcher: Every hour between 07:00 and 23:00 Israel Time
 */
exports.hourlyTelegramDispatch = onSchedule(
  { schedule: '0 7-23 * * *', timeZone: 'Asia/Jerusalem', region: 'us-central1', memory: '256MiB', secrets: ['GEMINI_API_KEY'] },
  async () => {
    logger.info('[Telegram] Running hourly dispatch scheduled task');
    await dispatchHourlyTelegramNews(true);
    await dispatchHourlyTelegramNews(false);
  }
);

// ── Admin Callables & Test Endpoints ──────────────────────────────────────────

/**
 * onCall: Test sending a custom message or existing article to Telegram
 */
exports.testTelegramPost = onCall(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, secrets: ['GEMINI_API_KEY'] },
  async (request) => {
    if (!request.auth || !request.auth.token || request.auth.token.admin !== true) {
      throw new HttpsError('permission-denied', 'Admin authentication required');
    }

    const data = request.data || {};
    const channel = data.channel || DEFAULT_ADMIN_CHAT_ID;
    const isHe = data.isHebrew !== false;

    const testArticle = {
      id: data.articleId || 'test-article-1',
      title: data.title || (isHe ? 'מבחן שידור חי לטלגרם: TrendingTech Daily' : 'Live Telegram Broadcast Test: TrendingTech Daily'),
      excerpt: data.excerpt || (isHe ? 'המנוע האוטומטי של מגזין TrendingTech Daily מחובר כעת בהצלחה לערוץ הטלגרם ויעדכן בכל כתבה חדשה בזמן אמת.' : 'TrendingTech Daily automated publishing engine is now connected and broadcasting real-time technology intelligence.'),
      category: data.category || 'ai',
      author: 'TrendingTech Automated Engine',
      slug: data.slug || 'telegram-integration-live',
      featuredImage: data.featuredImage || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=85',
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
 * onRequest: HTTP Test trigger with admin key (supports morning, evening, hourly, and post actions)
 */
exports.triggerTelegramPostHttp = onRequest(
  { region: 'us-central1', memory: '256MiB', timeoutSeconds: 60, cors: true, secrets: ['GEMINI_API_KEY'] },
  async (req, res) => {
    const adminKey = req.headers['x-admin-key'] || req.query.key;
    if (adminKey !== process.env.CARTOON_TEST_ADMIN_KEY && adminKey !== 'trendingtech_admin_secret_2026') {
      return res.status(403).json({ error: 'Unauthorized: Invalid admin key' });
    }

    const channel = req.body?.channel || req.query.channel || DEFAULT_ADMIN_CHAT_ID;
    const isHe = req.body?.isHebrew !== 'false' && req.query.isHebrew !== 'false';
    const action = req.body?.action || req.query?.action || 'post';

    if (action === 'morning-digest') {
      const digestRes = await publishMorningDigest(isHe, channel);
      return res.json({ success: true, action, digestRes });
    }

    if (action === 'digest' || action === 'evening-digest') {
      const digestRes = await publishDailyDigest(isHe, channel);
      return res.json({ success: true, action, digestRes });
    }

    if (action === 'hourly-dispatch') {
      const hourlyRes = await dispatchHourlyTelegramNews(isHe, channel);
      return res.json({ success: true, action, hourlyRes });
    }

    const title = req.body?.title || (isHe ? '🚨 מבזק סייבר וביטחון: התקפת סייבר מתוחכמת על תשתיות תקשורת' : '🚨 Cyber & Defense Tech Alert: Advanced Infrastructure Attack Detected');
    const category = req.body?.category || 'cyber-warfare';
    let resolvedImage = req.body?.featuredImage || req.body?.imageUrl;
    if (!resolvedImage) {
      try {
        const imgObj = await resolveEditorialArticleImage({
          title,
          category,
          imagePrompt: title
        });
        resolvedImage = imgObj?.imageUrl || imgObj;
      } catch (imgErr) {
        logger.warn('Failed to resolve dynamic editorial image:', imgErr.message);
      }
    }

    const testArticle = {
      id: req.body?.articleId || 'test-article-http',
      title,
      excerpt: req.body?.excerpt || (isHe ? 'ניתוח מעמיק של דפוסי התקיפה האחרונים של קבוצות סייבר במזרח התיכון, כלי תקיפה מבוססי AI, ושיטות ההגנה של מערכי הסייבר הישראליים.' : 'In-depth intelligence breakdown of Middle East cyber warfare campaigns, AI-assisted intrusion vectors, and enterprise defense countermeasures.'),
      category,
      author: 'TrendingTech Intelligence',
      slug: req.body?.slug || 'cyber-intel-briefing',
      featuredImage: (typeof resolvedImage === 'object' ? resolvedImage?.imageUrl : resolvedImage) || 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1400&auto=format&fit=crop&q=85',
      readingTimeMinutes: 3
    };

    try {
      const result = await postToTelegramApi(channel, testArticle, isHe, TELEGRAM_BOT_TOKEN);
      const pollData = await generateInteractivePoll(testArticle, isHe);
      let pollRes = null;
      if (pollData && pollData.question) {
        pollRes = await sendTelegramPoll(channel, pollData, TELEGRAM_BOT_TOKEN);
      }
      return res.json({ success: true, channel, result, pollRes });
    } catch (err) {
      logger.error('triggerTelegramPostHttp error:', err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

exports.publishMorningDigest = publishMorningDigest;
exports.publishDailyDigest = publishDailyDigest;
exports.dispatchHourlyTelegramNews = dispatchHourlyTelegramNews;
exports.generateInteractivePoll = generateInteractivePoll;
exports.sendTelegramPoll = sendTelegramPoll;
exports.postToTelegramApi = postToTelegramApi;
