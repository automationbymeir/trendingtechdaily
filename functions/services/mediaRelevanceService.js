/**
 * mediaRelevanceService.js
 * ---------------------------------------------------------------------------
 * Gathers tweets + YouTube videos that are GENUINELY about the same news
 * story as an article, then has Gemini verify each candidate before we
 * embed it on the article page.
 *
 * Pipeline per source:
 *   1. extract search keywords from article title/slug
 *   2. fetch a wide pool of candidates (~10) from the API
 *   3. ask Gemini "which of these are about the same specific story as the
 *      article?" — keep only the ones the model returns with ≥75% confidence
 *   4. return a small clean list (max 3 per source)
 *
 * Public API:
 *   gatherRelevantMedia(genAI, article, lang) →
 *     { tweetUrls: string[], youtubeVideos: [{videoId,title,channelTitle,thumbnailUrl,url}] }
 *
 * Required env / secrets:
 *   - TWITTER_BEARER_TOKEN
 *   - YOUTUBE_API_KEY      (Google Cloud project, YouTube Data API v3 enabled,
 *                           cost: 100 quota units per search.list call →
 *                           ~100 articles/day on the free 10k daily quota)
 *   - GEMINI_API_KEY       (used for relevance verification)
 *
 * Never throws — always returns an object so article publishing never blocks.
 */

const fetch = require('node-fetch');
const { logger } = require('../config');
const twitterService = require('./twitterService');

// ── Tunables ───────────────────────────────────────────────────────────────
const MAX_TWEETS = 3;
const MAX_YT_VIDEOS = 2;
const POOL_SIZE_TWEETS = 10;
const POOL_SIZE_YT = 10;
const RELEVANCE_THRESHOLD = 75;          // 0-100 — confidence required to keep

// ── YouTube ────────────────────────────────────────────────────────────────
/**
 * Search YouTube Data API v3 for recent, relevant videos.
 * Returns an array of candidate objects (raw metadata for the verifier).
 */
async function searchYouTubeVideos(query, lang = 'en', maxResults = POOL_SIZE_YT, opts = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    logger.warn('mediaRelevance: YOUTUBE_API_KEY not set — skipping YT search');
    return [];
  }
  if (!query || !query.trim()) return [];

  const params = new URLSearchParams({
    part: 'snippet',
    q: query.trim(),
    type: 'video',
    maxResults: String(Math.min(maxResults, 20)),
    order: opts.order || 'relevance',
    videoEmbeddable: 'true',
    safeSearch: 'moderate',
    key: apiKey,
  });
  // Recency filter is optional. For Hebrew articles where the English slug
  // is our best query, dropping recency widens the candidate pool a lot.
  if (opts.recentDays) {
    params.set(
      'publishedAfter',
      new Date(Date.now() - opts.recentDays * 24 * 60 * 60 * 1000).toISOString()
    );
  }
  // Only hint relevanceLanguage when explicitly requested — the YT search
  // index is dominated by English tech content, so leaving it unset lets us
  // surface English coverage of a Hebrew-titled story.
  if (opts.relevanceLanguage) {
    params.set('relevanceLanguage', opts.relevanceLanguage);
  }

  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`YouTube search ${res.status} for "${query}": ${text.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      logger.info(`YouTube: zero results for "${query}" (opts: ${JSON.stringify(opts)})`);
    }
    return items.map((it) => ({
      videoId: it.id && it.id.videoId,
      title: it.snippet && it.snippet.title,
      description: (it.snippet && it.snippet.description) || '',
      channelTitle: it.snippet && it.snippet.channelTitle,
      publishedAt: it.snippet && it.snippet.publishedAt,
      thumbnailUrl:
        (it.snippet && it.snippet.thumbnails && (
          (it.snippet.thumbnails.high && it.snippet.thumbnails.high.url) ||
          (it.snippet.thumbnails.medium && it.snippet.thumbnails.medium.url) ||
          (it.snippet.thumbnails.default && it.snippet.thumbnails.default.url)
        )) || '',
    })).filter((v) => v.videoId && v.title);
  } catch (err) {
    logger.warn('YouTube search error:', err.message);
    return [];
  }
}

// ── Twitter pool ──────────────────────────────────────────────────────────
/**
 * Like twitterService.searchRelevantTweets but also returns the tweet TEXT so
 * Gemini can verify relevance. (The existing helper drops everything except
 * the URL.)
 */
async function searchTweetPool(keywords, lang = 'en', maxResults = POOL_SIZE_TWEETS) {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    logger.warn('mediaRelevance: TWITTER_BEARER_TOKEN not set — skipping tweets');
    return [];
  }
  if (!keywords || !keywords.trim()) return [];

  try {
    const query = `${keywords.trim()} -is:retweet -is:reply lang:${lang}`;
    const url = `https://api.twitter.com/2/tweets/search/recent` +
      `?query=${encodeURIComponent(query)}` +
      `&max_results=${Math.min(Math.max(maxResults, 10), 100)}` +
      `&tweet.fields=author_id,created_at,public_metrics,lang` +
      `&expansions=author_id` +
      `&user.fields=username,name,verified`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${bearerToken}` } });
    if (res.status === 429) {
      logger.warn('Twitter API rate limit hit — skipping tweets');
      return [];
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`Twitter API ${res.status} for "${keywords}": ${text.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    const tweets = Array.isArray(data.data) ? data.data : [];
    const userMap = {};
    if (data.includes && data.includes.users) {
      data.includes.users.forEach((u) => { userMap[u.id] = u.username; });
    }
    return tweets
      .filter((t) => !t.text.startsWith('RT '))
      .map((t) => ({
        id: t.id,
        text: t.text,
        username: userMap[t.author_id] || 'twitter',
        url: `https://twitter.com/${userMap[t.author_id] || 'twitter'}/status/${t.id}`,
        engagement:
          (t.public_metrics && (t.public_metrics.retweet_count || 0) + (t.public_metrics.like_count || 0)) || 0,
      }))
      .sort((a, b) => b.engagement - a.engagement);
  } catch (err) {
    logger.warn('searchTweetPool error:', err.message);
    return [];
  }
}

// ── Gemini relevance verifier ─────────────────────────────────────────────
/**
 * Ask Gemini: for each candidate, is it about the same specific story as the
 * article? Returns indexes that pass with confidence ≥ RELEVANCE_THRESHOLD.
 *
 * @param {object} genAI                    @google/genai client
 * @param {{title:string,excerpt:string}} article
 * @param {string} kind                     'tweet' | 'youtube' (for prompt)
 * @param {Array<string>} candidateLines    "[N] title — text" lines (1-indexed)
 * @returns {Promise<{keep:number[], reasoning?:string}>}
 */
async function verifyRelevance(genAI, article, kind, candidateLines, lang = 'en') {
  if (!genAI || !candidateLines.length) return { keep: [] };

  const articleTitle = article.title || '';
  const articleExcerpt = (article.excerpt || article.summary || '').slice(0, 600);

  // Hard language rule for YT — tweets are usually language-agnostic links
  // so we only enforce strict language matching for videos.
  const langRule =
    kind === 'youtube'
      ? lang === 'he'
        ? `\n- LANGUAGE: The article is in Hebrew. Reject any video whose title or description is primarily in English (or any other non-Hebrew language). We only embed Hebrew-narrated videos on the Hebrew site.`
        : `\n- LANGUAGE: The article is in English. Reject any video whose title or description is primarily not in English. We only embed English-narrated videos on the English site.`
      : '';

  const prompt = `You are a strict editorial relevance checker for a tech news site. The site is about to embed ${kind === 'tweet' ? 'tweets' : 'YouTube videos'} alongside an article. Your job: keep ONLY items that are clearly about the SAME specific news event/announcement as the article — not just the same general topic, not just the same company, not "related" content.

ARTICLE:
Title: ${articleTitle}
Summary: ${articleExcerpt}

CANDIDATES (1-indexed):
${candidateLines.join('\n')}

Reply with JSON only, this exact shape:
{
  "items": [
    { "index": 1, "sameStory": true|false, "confidence": 0-100, "reason": "short explanation" }
    // one entry per candidate, in order
  ]
}

Rules:
- sameStory must be true ONLY if the candidate is clearly about the exact same announcement / product launch / incident / lawsuit / report as the article.
- "About the same company" is NOT enough. "About the same general technology" is NOT enough.
- Different timeframes (item is about an older release, article is about a newer one) → sameStory:false.
- Generic commentary, reaction tweets, unrelated promos → sameStory:false.${langRule}
- When uncertain, prefer false. We'd rather show zero items than an irrelevant one.`;

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) {
      logger.warn(`mediaRelevance.verify(${kind}): no JSON in response`);
      return { keep: [] };
    }
    const parsed = JSON.parse(m[0]);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const keep = [];
    for (const it of items) {
      const idx = Number(it.index);
      if (!Number.isInteger(idx) || idx < 1 || idx > candidateLines.length) continue;
      if (it.sameStory === true && Number(it.confidence) >= RELEVANCE_THRESHOLD) {
        keep.push(idx);
      }
    }
    return { keep };
  } catch (err) {
    logger.warn(`mediaRelevance.verify(${kind}) failed:`, err.message);
    return { keep: [] };
  }
}

// ── Public ────────────────────────────────────────────────────────────────
/**
 * Find tweets + YouTube videos relevant to an article. Each candidate is
 * verified by Gemini before being returned.
 *
 * @param {object} genAI                        @google/genai client (REQUIRED for verification)
 * @param {{title:string,excerpt?:string,slug?:string}} article
 * @param {string} lang                         'en' | 'he'
 * @returns {Promise<{tweetUrls:string[], youtubeVideos:object[]}>}
 */
async function gatherRelevantMedia(genAI, article, lang = 'en') {
  const empty = { tweetUrls: [], youtubeVideos: [] };
  if (!article || !article.title) return empty;

  // Build search queries.
  // Tweets: English keywords work best on X (most tech tweets in English).
  const tweetKeywords =
    twitterService.extractKeywordsFromSlug(article.slug) ||
    twitterService.extractTweetKeywords(article.title);

  // YouTube — search in the article's OWN language. We never cross
  // languages: a Hebrew article gets Hebrew videos only, an English
  // article gets English videos only. If nothing exists in that language
  // we'd rather embed zero videos than mismatched ones.
  const isHebrew = lang === 'he';
  const ytQueryPrimary = isHebrew
    ? String(article.title || '').slice(0, 80)
    : twitterService.extractKeywordsFromSlug(article.slug) ||
      String(article.title || '').slice(0, 80);
  const ytRelLang = isHebrew ? 'he' : 'en';

  // Search both APIs in parallel.
  let [tweetPool, ytPool] = await Promise.all([
    searchTweetPool(tweetKeywords, 'en', POOL_SIZE_TWEETS),
    searchYouTubeVideos(ytQueryPrimary, lang, POOL_SIZE_YT, {
      relevanceLanguage: ytRelLang,
    }),
  ]);

  // YT fallback within the SAME language only — for HE, retry with the
  // slug (English nouns of products/companies often surface Hebrew videos
  // that cover the same product). Still relevanceLanguage:he so we only
  // get Hebrew-narrated content.
  if (!ytPool.length && isHebrew) {
    const slugQuery = twitterService.extractKeywordsFromSlug(article.slug);
    if (slugQuery && slugQuery.trim()) {
      ytPool = await searchYouTubeVideos(slugQuery, 'he', POOL_SIZE_YT, {
        relevanceLanguage: 'he',
      });
    }
  }

  // Final language filter — drop any item whose title clearly has the
  // wrong script before we even ask Gemini to verify. Cheap belt-and-
  // suspenders on top of YT's relevanceLanguage hint (which is just a
  // hint, not a hard filter).
  const HEBREW_RE = /[֐-׿]/;
  const containsHebrew = (s) => HEBREW_RE.test(String(s || ''));
  ytPool = ytPool.filter((v) => {
    const t = v.title || '';
    return isHebrew ? containsHebrew(t) : !containsHebrew(t);
  });

  logger.info(
    `mediaRelevance: pool sizes — tweets=${tweetPool.length}, youtube=${ytPool.length} for "${(article.title || '').slice(0, 60)}"`
  );

  // Verify in parallel.
  const verifyJobs = [];

  if (tweetPool.length) {
    const lines = tweetPool.map((t, i) => `[${i + 1}] @${t.username}: ${String(t.text).replace(/\s+/g, ' ').slice(0, 280)}`);
    verifyJobs.push(verifyRelevance(genAI, article, 'tweet', lines, lang).then((r) => ({ kind: 'tweet', keep: r.keep })));
  } else {
    verifyJobs.push(Promise.resolve({ kind: 'tweet', keep: [] }));
  }

  if (ytPool.length) {
    const lines = ytPool.map((v, i) =>
      `[${i + 1}] ${v.channelTitle || 'unknown channel'} — "${String(v.title).replace(/\s+/g, ' ').slice(0, 160)}" — ${String(v.description).replace(/\s+/g, ' ').slice(0, 220)}`
    );
    verifyJobs.push(verifyRelevance(genAI, article, 'youtube', lines, lang).then((r) => ({ kind: 'youtube', keep: r.keep })));
  } else {
    verifyJobs.push(Promise.resolve({ kind: 'youtube', keep: [] }));
  }

  const results = await Promise.all(verifyJobs);

  let tweetUrls = [];
  let youtubeVideos = [];
  for (const r of results) {
    if (r.kind === 'tweet') {
      tweetUrls = r.keep.map((i) => tweetPool[i - 1].url).slice(0, MAX_TWEETS);
    } else if (r.kind === 'youtube') {
      youtubeVideos = r.keep.map((i) => {
        const v = ytPool[i - 1];
        return {
          videoId: v.videoId,
          title: v.title,
          channelTitle: v.channelTitle || '',
          thumbnailUrl: v.thumbnailUrl || '',
          url: `https://www.youtube.com/watch?v=${v.videoId}`,
        };
      }).slice(0, MAX_YT_VIDEOS);
    }
  }

  logger.info(`mediaRelevance: verified — tweets=${tweetUrls.length}, youtube=${youtubeVideos.length}`);
  return { tweetUrls, youtubeVideos };
}

module.exports = {
  gatherRelevantMedia,
  // exported for testing
  _internal: { searchYouTubeVideos, searchTweetPool, verifyRelevance },
};
