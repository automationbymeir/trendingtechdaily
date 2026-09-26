const { onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("./config");

async function runDailyCatalogScraper() {
  logger.info("Daily catalog scraper executed.");
  return { success: true, count: 0 };
}

exports.runDailyCatalogScraper = runDailyCatalogScraper;

exports.dailyCatalogScraper = onSchedule({
  schedule: "0 4 * * *",
  timeZone: "America/New_York",
  region: "us-central1",
}, async (event) => {
  return await runDailyCatalogScraper();
});

exports.triggerDailyCatalogScraper = onRequest({
  region: "us-central1",
}, async (req, res) => {
  const result = await runDailyCatalogScraper();
  res.json(result);
});
