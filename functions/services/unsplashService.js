const fetch = require('node-fetch');
const { logger } = require('../config');

async function fetchImageFromUnsplash(query, accessKey) {
  if (!accessKey) return null;
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1&order_by=relevant&client_id=${accessKey}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      logger.error('Unsplash API error:', res.status, text);
      return null;
    }
    const data = await res.json();
    const photo = data.results && data.results[0];
    if (!photo) {
      logger.warn('Unsplash search returned no results for query:', query);
      return null;
    }
    return {
      imageUrl: photo.urls && (photo.urls.regular || photo.urls.full || photo.urls.raw),
      altText: photo.alt_description || photo.description || query,
    };
  } catch (err) {
    logger.error('Unsplash fetch error:', err);
    return null;
  }
}

module.exports = { fetchImageFromUnsplash };

