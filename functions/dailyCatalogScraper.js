const dailyScraper = require('/Users/meir.horwitz/Documents/Projects/my-firebase-project/functions/dailyCatalogScraper.js');

module.exports = {
  dailyCatalogScraper: dailyScraper.dailyCatalogScraper,
  triggerDailyCatalogScraper: dailyScraper.triggerDailyCatalogScraper,
  runDailyCatalogScraper: dailyScraper.runDailyCatalogScraper,
};
