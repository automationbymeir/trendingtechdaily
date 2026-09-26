// functions/services/newsService.js

const fetch = require("node-fetch");
const { db, admin, logger, CONFIG } = require("../config");
const { getSafe } = require("../utils");
const { saveToFirestore } = require("./firestoreService");

// --- START: Individual Fetcher Functions ---

async function fetchAINews(apiKey) {
  // ... (Your full fetchAINews function code here)
}

async function fetchGadgetsNews() {
  // ... (Your full fetchGadgetsNews function code here)
}

async function fetchStartupsNews() {
  // ... (Your full fetchStartupsNews function code here)
}

async function fetchCryptoNews() {
  // ... (Your full fetchCryptoNews function code here)
}

async function fetchStockData() {
  // ... (Your full fetchStockData function code here)
}

// --- END: Individual Fetcher Functions ---

/**
 * Main function to trigger all background data fetching tasks in parallel.
 * @param {Object} apiKeys Contains necessary API keys, e.g., { newsApiKey: '...' }.
 */
async function fetchAllNews(apiKeys = {}) {
  logger.info("Starting all background news fetch tasks.");
  
  const newsPromises = [
    fetchAINews(apiKeys.newsApiKey),
    fetchGadgetsNews(),
    fetchStartupsNews(),
    fetchCryptoNews(),
    fetchStockData(),
  ];

  const results = await Promise.allSettled(newsPromises);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      // Log the specific task that failed.
      const taskName = ["AI", "Gadgets", "Startups", "Crypto", "Stocks"][index];
      logger.error(`Error in background fetch for ${taskName}:`, result.reason);
    }
  });

  logger.info("Finished attempting all background news fetch tasks.");
}

module.exports = {
  fetchAllNews,
  // We don't need to export the individual fetchers if they are only used by fetchAllNews
};