const fetch = require('node-fetch');
const { logger } = require('../config');

/**
 * Fetch a contextually relevant image from Unsplash.
 * - Pulls the top 20 relevant results and picks one at random so repeated
 *   queries (including the generic fallbacks) never return the same photo.
 * - Returns null if the query has no results so the caller can try the next
 *   candidate in its fallback chain.
 */
async function fetchImageFromUnsplash(query, accessKey, options = {}) {
  if (!accessKey) return null;
  const perPage = options.perPage || 20;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${perPage}&order_by=relevant&content_filter=high&client_id=${accessKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      logger.error('Unsplash API error:', res.status, text);
      return null;
    }
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    if (results.length === 0) {
      logger.warn('Unsplash search returned no results for query:', query);
      return null;
    }
    // Pick a random photo from the top-N so identical queries diversify naturally.
    const photo = results[Math.floor(Math.random() * results.length)];
    return {
      imageUrl: photo.urls && (photo.urls.regular || photo.urls.full || photo.urls.raw),
      altText: photo.alt_description || photo.description || query,
      photographer: photo.user && photo.user.name,
      sourceUrl: photo.links && photo.links.html,
      totalResults: data.total,
    };
  } catch (err) {
    logger.error('Unsplash fetch error:', err);
    return null;
  }
}

module.exports = { fetchImageFromUnsplash };
