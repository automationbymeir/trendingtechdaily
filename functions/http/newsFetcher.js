// functions/http/newsFetcher.js

const { logger } = require("../config");
const { fetchAllNews } = require("../services/newsService");

/**
 * An HTTP-triggered function to manually start the news fetching process.
 */
async function fetchNewsManually(req, res) {
  logger.info("Manual news fetch triggered (v2).");
  try {
    // Note: process.env.NEWS_API_KEY is automatically populated by the 'secrets' option.
    await fetchAllNews({ newsApiKey: process.env.NEWS_API_KEY });
    logger.info("Manual news fetch completed successfully (v2).");
    res.status(200).send("News fetch triggered successfully (v2)");
  } catch (error) {
    logger.error("Error in manual news fetch (v2):", error);
    res.status(500).send(`Error fetching news (v2): ${error.message}`);
  }
}

module.exports = { fetchNewsManually };