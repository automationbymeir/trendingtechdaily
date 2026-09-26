/**
 * weeklyDigestContent.js
 * ---------------------------------------------------------------------------
 * Pulls the 5 most recent stories that have an attached article video from
 * the `stories` collection (populated by youtubePipeline.js), then has
 * Gemini write a "cartoon news anchor" script for BIT to deliver.
 *
 * Each story keeps its 15s highlight video URL so we can drop it onto the
 * studio monitor (PIP) and full-screen during BIT's reporting.
 *
 * Public API:
 *   buildWeeklyDigest(genAI, { language, limit? }) →
 *     {
 *       language: 'he'|'en',
 *       stories: [{ id, articleId, title, videoUrl, thumbnail, articleUrl }],
 *       intro:   string,
 *       outro:   string,
 *       perStory: [{ headline, bitLine }, ...]   // matched 1-to-1 to stories
 *     }
 */

const { logger, db } = require('../config');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_STORIES = 5;

// ─── Fetch stories from Firestore ─────────────────────────────────────────
// The `stories` collection stores the 15-second HIGHLIGHT video. For the
// digest we want the FULL article Reel (30s ArticleVideoV2) instead — that
// video lives in `video_logs/{articleId}.videoDownloadUrl`. Highlight URL
// is kept as a graceful fallback if the main one isn't available.
async function pickStories(language, limit = MAX_STORIES) {
  const cutoff = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const snap = await db.collection('stories')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  const stories = [];
  const fallback = [];

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.language !== language || !d.videoUrl) return;
    const entry = {
      id: doc.id,
      articleId: d.articleId,
      title: d.title || '',
      highlightVideoUrl: d.videoUrl,    // 15s highlight, used as fallback
      thumbnail: d.thumbnail || '',
      articleUrl: d.articleUrl || '',
      createdAt: d.createdAt,
    };
    if (d.createdAt && d.createdAt >= cutoff && stories.length < limit) {
      stories.push(entry);
    } else if (fallback.length < limit) {
      fallback.push(entry);
    }
  });

  while (stories.length < limit && fallback.length) {
    stories.push(fallback.shift());
  }

  // Resolve each entry's MAIN Reel URL from `video_logs/{articleId}`.
  await Promise.all(stories.map(async (s) => {
    try {
      if (!s.articleId) return;
      const logSnap = await db.collection('video_logs').doc(s.articleId).get();
      if (logSnap.exists) {
        const data = logSnap.data();
        const main = data.videoDownloadUrl || data.videoUrl;
        if (main) s.videoUrl = main;
      }
    } catch (err) {
      logger.warn(`weeklyDigestContent: video_logs lookup failed for ${s.articleId}:`, err.message);
    }
    if (!s.videoUrl) s.videoUrl = s.highlightVideoUrl;
  }));

  return stories.filter((s) => s.videoUrl);
}

// ─── Gemini script writer ─────────────────────────────────────────────────
function fallbackScript(stories, language) {
  const ctaText = language === 'en'
    ? `If you enjoy our content, don't forget to subscribe to the channel and follow us on Instagram.`
    : `אם אתם אוהבים את התכנים שלנו, אל תשכחו להירשם כמנויים לערוץ ולעשות follow באינסטגרם.`;
  if (language === 'en') {
    return {
      intro: `Hi, I'm BIT — and this is the TrendingTechDaily week in tech.`,
      outro: `That's the week. More at TrendingTechDaily.com.`,
      ctaText,
      perStory: stories.map((s) => ({
        headline: s.title,
        bitLine: `Up next: ${s.title}. Here's what you need to know.`,
      })),
    };
  }
  return {
    intro: `שלום, אני BIT. זו מהדורת השבוע של TrendingTechDaily.`,
    outro: `זה הסיכום. עוד באתר — TrendingTechDaily.com.`,
    ctaText,
    perStory: stories.map((s) => ({
      headline: s.title,
      bitLine: `הסיפור הבא: ${s.title}. הנה מה שצריך לדעת.`,
    })),
  };
}

function fallbackSingleStoryScript(story, language) {
  const ctaText = language === 'en'
    ? `If you enjoy our content, don't forget to subscribe to the channel and follow us on Instagram.`
    : `אם אתם אוהבים את התכנים שלנו, אל תשכחו להירשם כמנויים לערוץ ולעשות follow באינסטגרם.`;
  if (language === 'en') {
    return {
      intro: `Hot off the press from TrendingTechDaily — here's what just happened.`,
      outro: `Read the full story at TrendingTechDaily.com.`,
      ctaText,
      perStory: [{ headline: story.title, bitLine: `Big story: ${story.title}. Here's the rundown.` }],
    };
  }
  return {
    intro: `חם מהתנור ב-TrendingTechDaily — הנה מה שקרה עכשיו.`,
    outro: `הסיפור המלא מחכה לכם באתר — TrendingTechDaily.com.`,
    ctaText,
    perStory: [{ headline: story.title, bitLine: `סיפור גדול: ${story.title}. הנה התמצית.` }],
  };
}

async function buildScriptWithGemini(genAI, stories, language, singleStory = false) {
  if (!genAI || !stories.length) {
    return singleStory ? fallbackSingleStoryScript(stories[0], language) : fallbackScript(stories, language);
  }
  const inLang = language === 'en' ? 'English' : 'Hebrew (כתיב מלא)';
  const list = stories.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  if (singleStory) {
    const s = stories[0];
    const singlePrompt = `You're writing a 30-second anchor segment for "BIT" — the cartoon robot mascot of TrendingTechDaily — featuring ONE breaking tech story.

LANGUAGE: ${inLang}. Punchy, friendly, tech-savvy tone.

Story:
${s.title}

Write:
- "intro" — what BIT says to open (1 short sentence, ≤15 words, hint at "big news" / "fresh story")
- "perStory[0].bitLine" — BIT's continuous narration of the story. Plays while BIT is on-screen AND while we cut to the article footage. 3-4 sentences, 35-55 words, ~16-20 seconds spoken. Start with a hook, then 2-3 concrete details (what, why it matters, closing thought), like a real anchor narrating over B-roll.
- "outro" — closing line (1 short sentence, mentions TrendingTechDaily.com)

Return JSON only:
{
  "intro": "...",
  "perStory": [
    { "headline": "echo title exactly", "bitLine": "..." }
  ],
  "outro": "..."
}`;
    try {
      const result = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: singlePrompt }] }],
      });
      const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
      const m = String(raw).match(/\{[\s\S]*\}/);
      if (!m) return fallbackSingleStoryScript(s, language);
      const parsed = JSON.parse(m[0]);
      if (!parsed.intro || !parsed.outro || !Array.isArray(parsed.perStory) || !parsed.perStory[0]) {
        return fallbackSingleStoryScript(s, language);
      }
      return {
        intro: String(parsed.intro).trim(),
        outro: String(parsed.outro).trim(),
        ctaText: language === 'en'
          ? `If you enjoy our content, don't forget to subscribe to the channel and follow us on Instagram.`
          : `אם אתם אוהבים את התכנים שלנו, אל תשכחו להירשם כמנויים לערוץ ולעשות follow באינסטגרם.`,
        perStory: [{ headline: s.title, bitLine: String(parsed.perStory[0].bitLine || `${s.title}`).trim() }],
      };
    } catch (err) {
      logger.warn('weeklyDigestContent.single failed:', err.message);
      return fallbackSingleStoryScript(s, language);
    }
  }

  const prompt = `You are writing the on-camera anchor script for "BIT" — the cartoon robot mascot of TrendingTechDaily — delivering this week's tech-news roundup.

LANGUAGE: ${inLang}. Voice: punchy, friendly, tech-savvy, slightly playful — like a smart younger cousin breaking down the news.

This week's 5 stories (in order):
${list}

Write:
- "intro" — opening greeting BIT says on camera (1 short clear sentence, 9-14 words). Must START with an attention-grabber that's immediately understandable (e.g. "Hi, I'm BIT" / "שלום, אני BIT"). Then mention "TrendingTechDaily" and that this is the week's roundup. Avoid any throat-clearing or filler.
- "perStory[i].bitLine" — for each story (in the same order), continuous narration that plays both while BIT is on-screen AND while we cut to the article footage. 3-4 sentences, 40-65 words, 18-22 seconds spoken. Start with a hook, then 2-3 concrete details (what, why it matters, closing thought), like a real anchor narrating over B-roll.
- "outro" — closing line. MUST be a single short sentence, ≤12 words (HE) / ≤14 words (EN), short enough to comfortably fit in 6 SECONDS of spoken audio. End with a clear period. Mention "TrendingTechDaily.com" but keep the rest tight.

Return JSON ONLY (no markdown):
{
  "intro": "...",
  "perStory": [
    { "headline": "echo the headline exactly", "bitLine": "..." }
    // one entry per story, in order
  ],
  "outro": "..."
}`;

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) return fallbackScript(stories, language);
    const parsed = JSON.parse(m[0]);
    if (!parsed.intro || !parsed.outro || !Array.isArray(parsed.perStory)) {
      return fallbackScript(stories, language);
    }
    const perStory = stories.map((s, i) => {
      const slot = parsed.perStory[i] || {};
      return {
        headline: s.title,
        bitLine: (slot.bitLine && String(slot.bitLine).trim()) || `Up next: ${s.title}`,
      };
    });
    return {
      intro: String(parsed.intro).trim(),
      outro: String(parsed.outro).trim(),
      ctaText: language === 'en'
        ? `If you enjoy our content, don't forget to subscribe to the channel and follow us on Instagram.`
        : `אם אתם אוהבים את התכנים שלנו, אל תשכחו להירשם כמנויים לערוץ ולעשות follow באינסטגרם.`,
      perStory,
    };
  } catch (err) {
    logger.warn('weeklyDigestContent.gemini failed:', err.message);
    return fallbackScript(stories, language);
  }
}

// ─── Single-article mode ──────────────────────────────────────────────────
// Fetches the latest `stories` entry that matches the given articleId,
// then resolves the main Reel URL from `video_logs`. Used when admin picks
// a specific story to feature in a short anchor video.
async function pickSingleStory(language, articleId) {
  const snap = await db.collection('stories')
    .where('articleId', '==', articleId)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
  if (snap.empty) {
    throw new Error(`weeklyDigest: no story found for articleId=${articleId}`);
  }
  const doc = snap.docs[0];
  const d = doc.data();
  if (d.language && d.language !== language) {
    // Allow override but warn — single-story mode shouldn't usually cross languages
    logger.warn(`weeklyDigest: requested language=${language} but story is ${d.language}`);
  }
  const entry = {
    id: doc.id,
    articleId: d.articleId,
    title: d.title || '',
    highlightVideoUrl: d.videoUrl,
    thumbnail: d.thumbnail || '',
    articleUrl: d.articleUrl || '',
    createdAt: d.createdAt,
  };
  try {
    const logSnap = await db.collection('video_logs').doc(articleId).get();
    if (logSnap.exists) {
      const data = logSnap.data();
      entry.videoUrl = data.videoDownloadUrl || data.videoUrl || entry.highlightVideoUrl;
    }
  } catch (err) {
    logger.warn(`weeklyDigest: video_logs lookup failed for ${articleId}:`, err.message);
  }
  if (!entry.videoUrl) entry.videoUrl = entry.highlightVideoUrl;
  if (!entry.videoUrl) throw new Error(`weeklyDigest: article ${articleId} has no video`);
  return entry;
}

// ─── Public ────────────────────────────────────────────────────────────────
async function buildWeeklyDigest(genAI, { language = 'he', limit = MAX_STORIES, articleId } = {}) {
  const lang = language === 'en' ? 'en' : 'he';
  const stories = articleId
    ? [await pickSingleStory(lang, articleId)]
    : await pickStories(lang, limit);
  if (!stories.length) {
    throw new Error(`weeklyDigest: no ${lang} stories with video found`);
  }
  const script = await buildScriptWithGemini(genAI, stories, lang, !!articleId);
  return { language: lang, stories, singleStory: !!articleId, ...script };
}

module.exports = { buildWeeklyDigest };
