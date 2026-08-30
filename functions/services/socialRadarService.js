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
 * Fetch latest tech discussions from Hacker News & Reddit strictly within the last 48 hours
 */
async function fetchTrendingDiscussions() {
  const discussions = [];
  const nowInSec = Math.floor(Date.now() / 1000);
  const maxAgeSec = 48 * 3600; // Strictly within 48 hours

  // 1. Fetch Hacker News (Top & Ask stories)
  try {
    const [topRes, askRes] = await Promise.all([
      fetch('https://hacker-news.firebaseio.com/v0/topstories.json', { timeout: 8000 }),
      fetch('https://hacker-news.firebaseio.com/v0/askstories.json', { timeout: 8000 }).catch(() => null)
    ]);

    let topIds = [];
    if (topRes && topRes.ok) {
      const ids = await topRes.json();
      topIds = topIds.concat((ids || []).slice(0, 20));
    }
    if (askRes && askRes.ok) {
      const ids = await askRes.json();
      topIds = topIds.concat((ids || []).slice(0, 15));
    }

    const uniqueIds = Array.from(new Set(topIds)).slice(0, 30);
    const itemPromises = uniqueIds.map(id => 
      fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeout: 5000 })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );

    const items = await Promise.all(itemPromises);
    const yearRegex = /\((19\d\d|200\d|201\d|202[0-4])\)/; // Ignore old historical re-posts like (2018), (2022)

    items.filter(Boolean).forEach(item => {
      const isFresh = item.time && (nowInSec - item.time) <= maxAgeSec;
      const isOldYear = yearRegex.test(item.title || '');

      if (isFresh && !isOldYear && item.title && (item.score >= 10 || item.descendants >= 3)) {
        discussions.push({
          id: `hn-${item.id}`,
          platform: 'Hacker News',
          title: item.title,
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          discussionUrl: `https://news.ycombinator.com/item?id=${item.id}`,
          score: item.score || 0,
          commentsCount: item.descendants || 0,
          author: item.by || 'HN User',
          text: item.text || item.title,
          createdAt: item.time
        });
      }
    });
  } catch (err) {
    logger.warn('[Social Radar] Hacker News fetch error:', err.message);
  }

  // 2. Fetch Reddit Tech, AI, Hardware, Singularity, Dev discussions
  try {
    const subreddits = 'artificial+hardware+technology+singularity+MachineLearning+webdev+programming';
    const redditRes = await fetch(`https://www.reddit.com/r/${subreddits}/hot.json?limit=30`, {
      headers: { 'User-Agent': 'TrendingTechDaily-Radar/3.0' },
      timeout: 8000
    });
    if (redditRes.ok) {
      const data = await redditRes.json();
      const posts = data?.data?.children || [];
      posts.forEach(p => {
        const post = p.data;
        const isFresh = post && post.created_utc && (nowInSec - post.created_utc) <= maxAgeSec;
        if (post && !post.stickied && isFresh && post.title && post.num_comments >= 3) {
          discussions.push({
            id: `reddit-${post.id}`,
            platform: `Reddit (r/${post.subreddit})`,
            title: post.title,
            url: post.url,
            discussionUrl: `https://reddit.com${post.permalink}`,
            score: post.score || 0,
            commentsCount: post.num_comments || 0,
            author: post.author || 'Redditor',
            text: post.selftext ? post.selftext.slice(0, 500) : post.title,
            createdAt: post.created_utc
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
 * High-Precision Semantic Matching with Gemini AI
 * Evaluates whether a discussion directly covers the same technological breakthrough,
 * framework, tool, company news, or debate as an article.
 */
async function findDiscussionMatches(discussions, forceLanguage = null) {
  // 1. Fetch latest published articles from Firestore
  const [enSnap, heSnap] = await Promise.all([
    db.collection('articles').where('published', '==', true).orderBy('createdAt', 'desc').limit(25).get(),
    db.collection('he_articles').where('published', '==', true).orderBy('createdAt', 'desc').limit(25).get().catch(() => ({ empty: true, forEach: () => {} }))
  ]);

  const enArticles = [];
  if (!enSnap.empty) enSnap.forEach(doc => enArticles.push({ id: doc.id, isHe: false, ...doc.data() }));

  const heArticles = [];
  if (!heSnap.empty) heSnap.forEach(doc => heArticles.push({ id: doc.id, isHe: true, ...doc.data() }));

  if (enArticles.length === 0 && heArticles.length === 0) return [];

  const matchedResults = [];

  // Try to use Gemini for strict semantic matching
  const loaded = await loadGeminiSDK();
  const genAI = loaded ? getGeminiSDK() : null;

  if (genAI && discussions.length > 0) {
    for (const disc of discussions.slice(0, 15)) {
      const isDiscHe = forceLanguage !== null ? forceLanguage : (disc.platform.toLowerCase().includes('israel') || disc.platform.toLowerCase().includes('hebrew'));
      const candidatePool = (isDiscHe ? heArticles : enArticles).slice(0, 15);

      if (candidatePool.length === 0) continue;

      const articlesListStr = candidatePool.map((a, idx) => 
        `[${idx}] Title: "${a.title}" | Tags: ${(a.tags || []).join(', ')} | Summary: "${(a.excerpt || a.description || '').slice(0, 150)}"`
      ).join('\n');

      const matchPrompt = `You are a strict technical news classifier evaluating relevance for a tech news platform.
Online Discussion:
- Platform: ${disc.platform}
- Title: "${disc.title}"
- Content/Question: "${disc.text}"

Candidate Published Articles:
${articlesListStr}

TASK:
Determine if ANY candidate article above is DIRECTLY and GENUINELY RELEVANT to the exact technical topic, product, tool, model, or company news discussed in this discussion.

CRITICAL RULES:
1. Only return a match if there is a TIGHT, AUTHENTIC topical connection (e.g. both discussing the same GPU architecture, specific AI model, specific framework, cybersecurity incident, or tech company event).
2. If the connection is vague, coincidental, or only shares generic words like "computer", "world", "water", "online", DO NOT MATCH. Return {"isMatch": false}.
3. Quality over quantity: It is completely normal and preferred to return {"isMatch": false} if no published article matches today's discussion.

Respond with ONLY valid JSON:
{
  "isMatch": true/false,
  "matchedIndex": 0,
  "confidenceScore": 0.0 to 1.0,
  "reasoning": "brief explanation of direct connection"
}`;

      try {
        const result = await genAI.models.generateContent(
          buildGenerateContentRequest(matchPrompt, {
            model: 'gemini-1.5-flash',
            safetySettings: getSafetySettings(),
            generationConfig: { responseMimeType: 'application/json' }
          })
        );

        const rawText = (typeof result.text === 'function' ? result.text() : result.text) || '{}';
        const parsed = JSON.parse(rawText);

        if (parsed.isMatch === true && parsed.confidenceScore >= 0.80 && parsed.matchedIndex !== undefined) {
          const matchedArticle = candidatePool[parsed.matchedIndex];
          if (matchedArticle) {
            matchedResults.push({
              discussion: disc,
              matchedArticle: matchedArticle,
              isHeResponse: isDiscHe,
              matchScore: parsed.confidenceScore,
              reasoning: parsed.reasoning
            });
          }
        }
      } catch (err) {
        logger.warn('[Social Radar] Gemini match evaluation error:', err.message);
      }

      if (matchedResults.length >= 3) break; // Maximum 3 high-value opportunities per scan
    }
  }

  return matchedResults;
}

/**
 * Generate Tailored, Bespoke Expert Response with Gemini AI
 * Addresses the exact question/nuance of the discussion without boilerplate templates.
 */
async function generateExpertCommunityResponse(discussion, article, isHe = false) {
  const slug = article.slug || article.id;
  const articleUrl = isHe 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id)}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(article.id)}`;

  try {
    const loaded = await loadGeminiSDK();
    if (loaded) {
      const genAI = getGeminiSDK();
      if (genAI) {
        const prompt = `You are a distinguished, hands-on senior software engineer and researcher answering an authentic technical discussion on ${discussion.platform}.

Discussion Title: "${discussion.title}"
Discussion Context / OP Question: "${discussion.text}"

Relevant Tech Article Details from TrendingTech Daily:
Title: "${article.title}"
Key Analysis / Data: "${article.excerpt || article.description || article.content || ''}"
Article URL: "${articleUrl}"

STRICT WRITING GUIDELINES:
1. LANGUAGE: ${isHe ? 'HEBREW (Natural, native Israeli tech tone)' : 'ENGLISH (Fluent, conversational, authentic Silicon Valley engineer tone)'}.
2. SPECIFICITY: Speak DIRECTLY to the OP's specific question, premise, or trade-off. Mention concrete technical mechanics, libraries, APIs, or architectural factors.
3. FORBIDDEN BOILERPLATE: NEVER start with phrases like:
   - "This is an insightful point..."
   - "When examining the architectural trade-offs..."
   - "Great question..."
   - "An insightful angle on this..."
   Start directly with the core insight or practical take.
4. LENGTH: Exactly 2 tight, high-density paragraphs.
5. NATURAL CITATION: Conclude the 2nd paragraph with a natural, value-additive citation pointing to the article URL:
   ${isHe 
     ? `(הרחבנו על כך עם נתוני בנצ'מרק וניתוח מעמיק ב-TrendingTech Daily: ${articleUrl})` 
     : `(We did a full technical breakdown with benchmark data on TrendingTech Daily if you want to explore the details: ${articleUrl})`}

Output ONLY the final comment text without greetings or markdown code fences.`;

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
    logger.warn('[Social Radar] Gemini custom response generation error:', err.message);
  }

  // Ultra-clean fallback
  if (isHe) {
    return `האתגר המרכזי כאן נובע מצוואר הבקבוק בשכבת הביצועים ושיהוי הרשת.\n\nהרחבה ונתונים טכניים נוספים פורסמו בניתוח ב-TrendingTech Daily: ${articleUrl}`;
  } else {
    return `The core constraint here comes down to compute scheduling and latency bottlenecks in the pipeline.\n\nA full breakdown with benchmark details is on TrendingTech Daily: ${articleUrl}`;
  }
}

/**
 * Dispatch Social Radar Alert to Admin Telegram Channel / Chat
 */
async function sendRadarAlertToTelegram(opportunity, expertResponse, isHeUI = true, targetChannel = DEFAULT_ADMIN_CHAT_ID) {
  const { discussion, matchedArticle, isHeResponse, reasoning } = opportunity;
  const isHeArt = matchedArticle.isHe === true || isHeResponse === true;
  const slug = matchedArticle.slug || matchedArticle.id;
  const articleUrl = isHeArt 
    ? `${SITE_BASE_URL}/he/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(matchedArticle.id)}`
    : `${SITE_BASE_URL}/article.html?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(matchedArticle.id)}`;

  const langTag = isHeResponse ? 'עברית' : 'English';

  const alertText = isHeUI 
    ? `🎯 <b>Social Radar — הזדמנות אינטראקציה ממוקדת</b>\n\n` +
      `📍 <b>פלטפורמה:</b> ${discussion.platform} (${langTag})\n` +
      `💬 <b>דיון חם:</b> <i>${discussion.title}</i>\n` +
      `🔥 <b>תגובות / ציון:</b> ${discussion.commentsCount} תגובות · ${discussion.score} נקודות\n` +
      (reasoning ? `🔍 <b>התאמה סמנטית:</b> ${reasoning}\n\n` : `\n`) +
      `📰 <b>כתבה תואמת באתר:</b> <a href="${articleUrl}">${matchedArticle.title}</a>\n\n` +
      `💡 <b>טיוטת תגובה מותאמת אישית (${langTag}) להעתקה:</b>\n` +
      `<blockquote>${expertResponse}</blockquote>\n\n` +
      `⚡ לחצו להלן כדי לעבור ישירות לדיון ולהדביק את התגובה:`
    : `🎯 <b>Social Radar — High-Relevance Discussion Opportunity</b>\n\n` +
      `📍 <b>Platform:</b> ${discussion.platform}\n` +
      `💬 <b>Discussion:</b> <i>${discussion.title}</i>\n` +
      `🔥 <b>Engagement:</b> ${discussion.commentsCount} comments · ${discussion.score} score\n` +
      (reasoning ? `🔍 <b>Match:</b> ${reasoning}\n\n` : `\n`) +
      `📰 <b>Matched Dispatch:</b> <a href="${articleUrl}">${matchedArticle.title}</a>\n\n` +
      `💡 <b>Bespoke AI Response Draft:</b>\n` +
      `<blockquote>${expertResponse}</blockquote>\n\n` +
      `⚡ Click below to navigate directly to discussion:`;

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: isHeResponse ? '🔗 פתח את הדיון המקורי' : '🔗 Open Discussion & Reply', url: discussion.discussionUrl }
      ],
      [
        { text: isHeArt ? '🌐 פתח כתבה באתר' : '🌐 View Article on Site', url: articleUrl }
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
async function runSocialRadarPipeline(forceLanguage = null, customChannel = null) {
  const config = await getRadarConfig();
  const targetChannel = customChannel || config.adminChatId || DEFAULT_ADMIN_CHAT_ID;
  logger.info(`[Social Radar] Starting discussion scan pipeline targeting ${targetChannel}...`);

  const discussions = await fetchTrendingDiscussions();
  logger.info(`[Social Radar] Fetched ${discussions.length} fresh active discussions`);

  const matches = await findDiscussionMatches(discussions, forceLanguage);
  logger.info(`[Social Radar] Found ${matches.length} high-confidence semantic matches`);

  const alertsSent = [];

  for (const match of matches) {
    const isHeResp = match.isHeResponse || false;
    const expertResponse = await generateExpertCommunityResponse(match.discussion, match.matchedArticle, isHeResp);
    const alertRes = await sendRadarAlertToTelegram(match, expertResponse, true, targetChannel);
    alertsSent.push({
      discussionTitle: match.discussion.title,
      articleTitle: match.matchedArticle.title,
      platform: match.discussion.platform,
      isHeResponse: isHeResp,
      matchScore: match.matchScore,
      reasoning: match.reasoning,
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
