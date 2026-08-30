/**
 * socialRadarService.js
 * ---------------------------------------------------------------------------
 * Intelligent Social Listening, Technical Discussion Radar, and Contextual
 * Value-First Growth Generator for TrendingTech Daily.
 *
 * Features:
 * - Scans top tech discussions (Hacker News, Reddit tech feeds, Developer forums)
 * - Semantic topic matching against live Firestore article library
 * - Gemini AI expert response generator (Value-First technical insight with natural contextual citation)
 * - Telegram Admin Radar alerts for one-tap copy & distribution
 */

const fetch = require('node-fetch');
const { logger, db } = require('../config');
const { loadGeminiSDK, getSafetySettings, getGeminiSDK, buildGenerateContentRequest } = require('../utils');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8777608982:AAFG-sJayjNKjygzu-GUEUbUmWtwQmzqbEY';
const DEFAULT_ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_CHAT_ID || '1041616345';
const DEFAULT_ADMIN_CHANNEL = process.env.TELEGRAM_HEBREW_CHANNEL || '-1003974217518';
const SITE_BASE_URL = 'https://trendingtechdaily.com';

/**
 * Fetch dynamic Telegram & Admin configuration from Firestore
 */
async function getRadarConfig() {
  try {
    const snap = await db.doc('settings/telegram').get();
    if (snap.exists) {
      const data = snap.data() || {};
      return {
        adminChatId: data.adminChatId || data.adminChannel || DEFAULT_ADMIN_CHAT_ID,
        botToken: data.botToken || TELEGRAM_BOT_TOKEN
      };
    }
  } catch (err) {
    logger.warn('Error reading settings/telegram:', err.message);
  }
  return {
    adminChatId: DEFAULT_ADMIN_CHAT_ID,
    botToken: TELEGRAM_BOT_TOKEN
  };
}

/**
 * Fetch latest tech discussions from Hacker News & Reddit
 */
async function fetchTrendingDiscussions() {
  const discussions = [];

  // 1. Fetch Hacker News Top Stories
  try {
    const hnRes = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 8000 });
    if (hnRes.ok) {
      const topIds = await hnRes.json();
      const selectedIds = (topIds || []).slice(0, 10);
      
      const itemPromises = selectedIds.map(id => 
        fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      );

      const items = await Promise.all(itemPromises);
      items.filter(Boolean).forEach(item => {
        if (item.title && (item.score > 20 || item.descendants > 5)) {
          discussions.push({
            id: `hn-${item.id}`,
            platform: 'Hacker News',
            title: item.title,
            url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
            discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`,
            score: item.score || 0,
            commentsCount: item.descendants || 0,
            author: item.by || 'HN User',
            text: item.text || item.title
          });
        }
      });
    }
  } catch (err) {
    logger.warn('[Social Radar] Hacker News fetch error:', err.message);
  }

  // 2. Fetch Reddit Tech / AI discussions (JSON feed)
  try {
    const redditRes = await fetch('https://www.reddit.com/r/artificial+hardware+technology/hot.json?limit=10', {
      headers: { 'User-Agent': 'TrendingTechDaily-Radar/1.0' },
      timeout: 8000
    });
    if (redditRes.ok) {
      const data = await redditRes.json();
      const posts = data?.data?.children || [];
      posts.forEach(p => {
        const post = p.data;
        if (post && !post.stickied && post.title) {
          discussions.push({
            id: `reddit-${post.id}`,
            platform: `Reddit (r/${post.subreddit})`,
            title: post.title,
            url: post.url,
            discussionUrl: `https://reddit.com${post.permalink}`,
            score: post.score || 0,
            commentsCount: post.num_comments || 0,
            author: post.author || 'Redditor',
            text: post.selftext ? post.selftext.slice(0, 300) : post.title
          });
        }
      });
    }
  } catch (err) {
    logger.warn('[Social Radar] Reddit fetch error:', err.message);
  }

  return discussions;
}

/**
 * Tokenize and match keywords between discussion and articles
 */
function calculateMatchScore(discTitle, discText, article) {
  const query = `${discTitle} ${discText}`.toLowerCase();
  const target = `${article.title} ${article.excerpt || ''} ${article.category || ''} ${(article.tags || []).join(' ')}`.toLowerCase();

  const stopWords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'what', 'about', 'של', 'על', 'עם', 'את', 'זה']);
  const words = query.split(/[\s,.:;!?"'()\[\]{}]+/).filter(w => w.length > 3 && !stopWords.has(w));

  let matchedWords = 0;
  words.forEach(w => {
    if (target.includes(w)) matchedWords++;
  });

  if (words.length === 0) return 0;
  return matchedWords / Math.min(words.length, 8);
}

/**
 * Match trending discussions against Firestore articles
 */
async function findDiscussionMatches(discussions, isHe = true) {
  const colName = isHe ? 'he_articles' : 'articles';
  const snap = await db.collection(colName)
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  if (snap.empty) return [];

  const articles = [];
  snap.forEach(doc => articles.push({ id: doc.id, ...doc.data() }));

  const matchedResults = [];

  for (const disc of discussions) {
    let bestArticle = null;
    let highestScore = 0;

    for (const art of articles) {
      const score = calculateMatchScore(disc.title, disc.text, art);
      if (score > highestScore && score >= 0.25) {
        highestScore = score;
        bestArticle = art;
      }
    }

    if (bestArticle) {
      matchedResults.push({
        discussion: disc,
        matchedArticle: bestArticle,
        matchScore: highestScore
      });
    }
  }

  return matchedResults.slice(0, 5); // Return top 5 opportunities
}

/**
 * Generate Value-First Expert Response with Gemini AI
 */
async function generateExpertCommunityResponse(discussion, article, isHe = true) {
  const slug = article.slug || article.id;
  const articleUrl = isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id)}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id)}`;

  try {
    const loaded = await loadGeminiSDK();
    if (loaded) {
      const genAI = getGeminiSDK();
      if (genAI) {
        const prompt = `You are a distinguished senior technology researcher & engineer writing an authoritative, highly respectful, value-first response to an online tech discussion.

Discussion Title: "${discussion.title}"
Discussion Platform: "${discussion.platform}"
Context: "${discussion.text}"

Relevant Deep-Dive Article from TrendingTech Daily:
Title: "${article.title}"
Summary: "${article.excerpt || article.description || ''}"
URL: "${articleUrl}"

Rules for the response:
1. Provide GENUINE TECHNICAL VALUE: Directly answer the question or analyze the architectural trade-offs in 2 clear, insightful paragraphs.
2. Tone: Highly professional, objective, collegial, and non-promotional.
3. Natural Citation: At the very end of the second paragraph, naturally mention the source:
   ${isHe 
     ? `(הרחבה טכנית ומבחני בנצ'מרק מלאים פורסמו בניתוח המקיף ב-TrendingTech Daily: ${articleUrl})` 
     : `(For a detailed architectural breakdown and benchmark metrics, see the deep-dive analysis on TrendingTech Daily: ${articleUrl})`}
4. Language: ${isHe ? 'Hebrew' : 'English'}

Output ONLY the plain text response without code blocks or meta notes.`;

        const result = await genAI.models.generateContent(
          buildGenerateContentRequest(prompt, {
            model: 'gemini-1.5-flash',
            safetySettings: getSafetySettings(),
          })
        );

        const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
        return text.trim();
      }
    }
  } catch (err) {
    logger.warn('[Social Radar] Gemini expert answer error:', err.message);
  }

  // Fallback template
  if (isHe) {
    return `נקודה מעניינת מאוד לדיון. בניתוח הארכיטקטורה של הנושא הזה עולים מספר היבטים קריטיים של ביצועים ושיהוי מערכתי.\n\nהרחבה וניתוח מעמיק בנושא פורסמו במאמר ב-TrendingTech Daily: ${articleUrl}`;
  } else {
    return `An insightful angle on this development. When examining the architectural trade-offs, compute efficiency and latency scaling remain the core constraints.\n\nA full breakdown is available on TrendingTech Daily: ${articleUrl}`;
  }
}

/**
 * Dispatch Social Radar Alert to Admin Telegram Channel / Chat
 */
async function sendRadarAlertToTelegram(opportunity, expertResponse, isHe = true, targetChannel = DEFAULT_ADMIN_CHANNEL) {
  const { discussion, matchedArticle } = opportunity;
  const slug = matchedArticle.slug || matchedArticle.id;
  const articleUrl = isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(matchedArticle.id)}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(matchedArticle.id)}`;

  const alertText = isHe 
    ? `🎯 <b>Social Radar — הזדמנות אינטראקציה חדשה</b>\n\n` +
      `📍 <b>פלטפורמה:</b> ${discussion.platform}\n` +
      `💬 <b>דיון חם:</b> <i>${discussion.title}</i>\n` +
      `🔥 <b>תגובות / ציון:</b> ${discussion.commentsCount} תגובות · ${discussion.score} נקודות\n\n` +
      `📰 <b>כתבה תואמת באתר:</b> <a href="${articleUrl}">${matchedArticle.title}</a>\n\n` +
      `💡 <b>טיוטת תגובת מומחה מוכנה (מבוססת Gemini):</b>\n` +
      `<blockquote>${expertResponse.slice(0, 500)}...</blockquote>\n\n` +
      `⚡ לחצו להלן למעבר ישיר לדיון כדי לפרסם את התגובה:`
    : `🎯 <b>Social Radar — Community Engagement Opportunity</b>\n\n` +
      `📍 <b>Platform:</b> ${discussion.platform}\n` +
      `💬 <b>Discussion:</b> <i>${discussion.title}</i>\n` +
      `🔥 <b>Engagement:</b> ${discussion.commentsCount} comments · ${discussion.score} score\n\n` +
      `📰 <b>Matched Dispatch:</b> <a href="${articleUrl}">${matchedArticle.title}</a>\n\n` +
      `💡 <b>AI Expert Response Draft:</b>\n` +
      `<blockquote>${expertResponse.slice(0, 500)}...</blockquote>\n\n` +
      `⚡ Click below to navigate directly to discussion and share value:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: isHe ? '🔗 פתח את הדיון המקורי' : '🔗 Open Original Discussion', url: discussion.discussionUrl }
      ],
      [
        { text: isHe ? '🌐 פתח כתבה באתר' : '🌐 View Article on Site', url: articleUrl }
      ]
    ]
  };

  const apiBase = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
  const res = await fetch(`${apiBase}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: targetChannel,
      text: alertText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: replyMarkup
    }),
    timeout: 15000
  });

  const data = await res.json();
  return { success: data.ok, messageId: data.result?.message_id };
}

/**
 * Full Pipeline Execution
 */
async function runSocialRadarPipeline(isHe = true, customChannel = null) {
  const config = await getRadarConfig();
  const targetChannel = customChannel || config.adminChatId || DEFAULT_ADMIN_CHANNEL;
  logger.info(`[Social Radar] Starting discussion scan pipeline targeting ${targetChannel}...`);

  const discussions = await fetchTrendingDiscussions();
  logger.info(`[Social Radar] Fetched ${discussions.length} active discussions`);

  const matches = await findDiscussionMatches(discussions, isHe);
  logger.info(`[Social Radar] Found ${matches.length} high-confidence matches with site articles`);

  const alertsSent = [];

  for (const match of matches) {
    const expertResponse = await generateExpertCommunityResponse(match.discussion, match.matchedArticle, isHe);
    const alertRes = await sendRadarAlertToTelegram(match, expertResponse, isHe, targetChannel);
    alertsSent.push({
      discussionTitle: match.discussion.title,
      articleTitle: match.matchedArticle.title,
      platform: match.discussion.platform,
      success: alertRes.success
    });
  }

  return {
    discussionsFound: discussions.length,
    matchesCount: matches.length,
    alertsSent
  };
}

module.exports = {
  fetchTrendingDiscussions,
  findDiscussionMatches,
  generateExpertCommunityResponse,
  sendRadarAlertToTelegram,
  runSocialRadarPipeline
};
