// functions/services/twitterService.js
// Searches for relevant recent tweets using Twitter API v2 (read-only)

const fetch = require('node-fetch');
const { logger } = require('../config');

// Common English stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with',
  'by','from','up','about','into','over','after','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will','would',
  'could','should','may','might','can','as','its','it','how','why','what',
  'when','where','new','now','than','that','this','these','those','here',
  'just','all','amid','says','say','amid','gets','get','set','use','used',
  'launch','launches','release','releases','report','reports','shows','show',
  'plans','plan','reveals','reveal','announces','announce','amid','raises',
]);

/**
 * Extract 3-4 meaningful keywords from an article title for use as a Twitter search query.
 * Keeps proper nouns and tech terms; removes stop words.
 */
function extractTweetKeywords(title) {
  if (!title) return '';
  const words = title
    .replace(/[^\w\s'-]/g, ' ')  // keep hyphens and apostrophes
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w.toLowerCase()));
  return words.slice(0, 4).join(' ');
}

/**
 * Search Twitter API v2 for relevant recent tweets matching the given keywords.
 * Returns an array of tweet permalink URLs (empty array on any error).
 *
 * @param {string} keywords  - 3-4 word search query (e.g. "OpenAI GPT-5 reasoning")
 * @param {string} lang      - Twitter language filter: 'en', 'he', etc.
 * @param {number} maxResults - How many tweet URLs to return (max 3)
 * @returns {Promise<string[]>}
 */
/**
 * Derive search keywords from a slug (always English).
 * "flipper-zero-digital-price-tag" → "Flipper Zero Digital Price Tag"
 */
function extractKeywordsFromSlug(slug) {
  if (!slug) return '';
  return slug
    .split('-')
    .filter(w => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()))
    .slice(0, 4)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

async function searchRelevantTweets(keywords, lang = 'en', maxResults = 3) {
  const bearerToken = process.env.TWITTER_BEARER_TOKEN;
  if (!bearerToken) {
    logger.warn('twitterService: TWITTER_BEARER_TOKEN not set — skipping tweet search');
    return [];
  }
  if (!keywords || !keywords.trim()) return [];

  try {
    // Quality filters: exclude retweets, replies, and non-language content
    const rawQuery = `${keywords.trim()} -is:retweet -is:reply lang:${lang}`;
    const url = `https://api.twitter.com/2/tweets/search/recent` +
      `?query=${encodeURIComponent(rawQuery)}` +
      `&max_results=${Math.min(Math.max(maxResults + 4, 10), 10)}` +
      `&tweet.fields=author_id,created_at,public_metrics` +
      `&expansions=author_id` +
      `&user.fields=username`;

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${bearerToken}` },
    });

    if (res.status === 429) {
      logger.warn('Twitter API rate limit hit — skipping tweets for this article');
      return [];
    }
    if (!res.ok) {
      const errText = await res.text();
      logger.warn(`Twitter API ${res.status} for query "${keywords}": ${errText.substring(0, 200)}`);
      return [];
    }

    const data = await res.json();
    if (!data.data || data.data.length === 0) {
      logger.info(`No tweets found for: "${keywords}"`);
      return [];
    }

    // Build username map
    const userMap = {};
    if (data.includes && data.includes.users) {
      data.includes.users.forEach(u => { userMap[u.id] = u.username; });
    }

    // Sort by engagement (retweets + likes) and pick the best ones
    const sorted = data.data
      .filter(t => !t.text.startsWith('RT '))          // extra RT guard
      .sort((a, b) => {
        const engA = (a.public_metrics?.retweet_count || 0) + (a.public_metrics?.like_count || 0);
        const engB = (b.public_metrics?.retweet_count || 0) + (b.public_metrics?.like_count || 0);
        return engB - engA;
      })
      .slice(0, maxResults);

    const urls = sorted.map(t => {
      const username = userMap[t.author_id] || 'twitter';
      return `https://twitter.com/${username}/status/${t.id}`;
    });

    logger.info(`Twitter: found ${urls.length} tweets for "${keywords}"`);
    return urls;

  } catch (err) {
    // Non-critical — never block article publishing because of tweet search failure
    logger.error('twitterService.searchRelevantTweets error:', err.message || err);
    return [];
  }
}

module.exports = { searchRelevantTweets, extractTweetKeywords, extractKeywordsFromSlug };
