// functions/callable/proxies.js

const fetch = require('node-fetch');
const { HttpsError } = require("firebase-functions/v2/https");
const { logger, db, admin } = require('../config');
const { getSafe } = require('../utils');

/**
 * Acts as a proxy to the NewsAPI.
 */
async function getNewsApiArticles({ data }) {
  const query = data.query || 'technology';
  const endpoint = data.endpoint === 'everything' ? 'everything' : 'top-headlines';
  const category = data.category;
  const pageSize = 6;
  
  logger.info(`Proxy: Fetching NewsAPI: endpoint=${endpoint}, query=${query}, category=${category}`);
  
  let apiUrl = `https://newsapi.org/v2/${endpoint}?language=en&pageSize=${pageSize}`;
  if (endpoint === 'top-headlines') {
    apiUrl += category ? `&category=${category}` : '&category=technology';
  } else {
    apiUrl += `&q=${encodeURIComponent(query)}&sortBy=publishedAt`;
  }
  
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) {
      throw new HttpsError("internal", "NewsAPI Key is not configured.");
    }
    apiUrl += `&apiKey=${apiKey}`;
    
    const response = await fetch(apiUrl);
    const responseData = await response.json();
    
    if (!response.ok) {
      const err = getSafe(() => responseData.message, `HTTP ${response.status}`);
      throw new HttpsError("internal", `NewsAPI fail: ${err}`);
    }
    if (responseData.status !== "ok") {
      throw new HttpsError("internal", `NewsAPI error: ${responseData.message || 'Unknown'}`);
    }
    
    return { articles: responseData.articles || [] };
    
  } catch (error) {
    logger.error("Error calling NewsAPI via proxy:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to fetch NewsAPI articles.");
  }
}

/**
 * Acts as a proxy to the GNews API.
 */
async function getGnewsArticles({ data }) {
  const query = data.query;
  if (!query || typeof query !== 'string' || query.trim() === '') {
    throw new HttpsError("invalid-argument", "A non-empty 'query' is required.");
  }
  const maxArticles = 6;
  
  logger.info(`Proxy: Fetching GNews: query=${query}`);
  
  try {
    const apiKey = process.env.GNEWS_API_KEY;
    if (!apiKey) {
      throw new HttpsError("internal", "GNews API Key is not configured.");
    }
    
    const apiUrl = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=${maxArticles}&token=${apiKey}`;
    const response = await fetch(apiUrl);
    const responseData = await response.json();
    
    if (!response.ok) {
      const err = getSafe(() => responseData.errors[0], `HTTP ${response.status}`);
      throw new HttpsError("internal", `GNews fail: ${err}`);
    }
    if (responseData.errors) {
      throw new HttpsError("internal", `GNews error: ${responseData.errors[0]}`);
    }
    
    return { articles: responseData.articles || [] };

  } catch (error) {
    logger.error("Error calling GNews API via proxy:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to fetch GNews articles.");
  }
}

/**
 * Fetches recommended videos from YouTube, with caching.
 */
async function getRecommendedVideos({ data }) {
  const keywords = data.keywords || ['latest technology', 'ai news', 'gadget review'];
  const maxResults = data.maxResults || 6;
  const query = keywords.join('|');
  const cacheDurationHours = 4;
  const cacheKey = `youtube_videos_${query.replace(/\W/g, '_')}`;

  const cacheRef = db.collection('cache').doc(cacheKey);
  const now = new Date();

  // --- Caching Logic ---
  try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
          const cacheData = cacheDoc.data();
          const cacheTime = cacheData.timestamp.toDate();
          const hoursDiff = (now.getTime() - cacheTime.getTime()) / 3600000;
          if (hoursDiff < cacheDurationHours) {
              logger.info(`YouTube Proxy: Serving videos from cache for query: "${query}"`);
              return { videos: cacheData.videos };
          }
      }
  } catch (cacheError) {
      logger.error("Error reading from cache, proceeding to fetch from API", cacheError);
  }

  logger.info(`YouTube Proxy: Cache stale or empty. Fetching fresh videos for query: "${query}"`);

  try {
      const apiKey = process.env.YOUTUBE_API_KEY;
      if (!apiKey) {
          throw new HttpsError("internal", "YouTube API Key not configured.");
      }
      
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&order=relevance&maxResults=${maxResults}&key=${apiKey}`;
      const response = await fetch(searchUrl);
      const responseData = await response.json();

      if (!response.ok || responseData.error) {
          throw new HttpsError("internal", `Failed to fetch videos from YouTube: ${responseData.error?.message || response.statusText}`);
      }

      const videos = (responseData.items || []).map(item => ({
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url,
          channel: item.snippet.channelTitle
      })).filter(video => video.id);

      // --- Save fresh results to cache ---
      if (videos.length > 0) {
          await cacheRef.set({
              videos: videos,
              timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
          logger.info(`YouTube Proxy: Saved fresh video results to cache.`);
      }
      return { videos };

  } catch (error) {
      logger.error("Error calling YouTube API via proxy:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to fetch recommended videos.");
  }
}

module.exports = {
  getNewsApiArticles,
  getGnewsArticles,
  getRecommendedVideos
};