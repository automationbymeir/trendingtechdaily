// functions/http/legacy.js

const fetch = require("node-fetch");
const { logger } = require("../config");

/**
 * A helper function to generate mock stock data on API failure.
 * @param {string} symbol The stock symbol.
 * @returns {object} A mock data object.
 */
function generateMockStockData(symbol) {
  const basePrice = Math.floor(Math.random() * 500) + 50;
  const change = (Math.random() * 20 - 10);
  const changePercent = (change / basePrice) * 100;
  return {
    quoteResponse: {
      result: [{
        symbol,
        shortName: `${symbol} Inc. (Mock)`,
        regularMarketPrice: basePrice,
        regularMarketChange: change,
        regularMarketChangePercent: changePercent,
        regularMarketPreviousClose: basePrice - change,
      }],
    },
  };
}

/**
 * Legacy proxy for Yahoo Finance quote data.
 */
async function yahooFinance(req, res) {
  try {
    const symbol = req.path.slice(1) || req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: "Stock symbol is required" });
    }
    logger.info(`(Legacy) Fetching Yahoo Finance data for symbol: ${symbol}`);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
    const headers = { "User-Agent": "Mozilla/5.0" }; // Simple user-agent
    
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yahoo API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    logger.error("(Legacy) Error fetching stock data:", error.message);
    const symbol = req.path.slice(1) || req.query.symbol;
    const mockData = generateMockStockData(symbol);
    logger.warn("(Legacy) Returning mock data as fallback");
    return res.status(200).json(mockData);
  }
}

/**
 * Legacy proxy for Yahoo Finance historical chart data.
 */
async function yahooFinanceHistory(req, res) {
  try {
    const symbol = req.path.slice(1) || req.query.symbol;
    if (!symbol) {
      return res.status(400).json({ error: "Stock symbol is required" });
    }
    logger.info(`(Legacy) Fetching Yahoo Finance history for symbol: ${symbol}`);
    
    // Default to last 30 days
    const period1 = req.query.period1 || Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
    const period2 = req.query.period2 || Math.floor(Date.now() / 1000);
    const interval = req.query.interval || "1d";
    
    const url = `https://query1.finance.yahoo.com/v7/finance/chart/${symbol}?period1=${period1}&period2=${period2}&interval=${interval}&indicators=quote&includeTimestamps=true`;
    const headers = { "User-Agent": "Mozilla/5.0" };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Yahoo Finance API error (${response.status}): ${errorText}`);
    }
    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    logger.error("(Legacy) Error fetching stock history data:", error.message);
    return res.status(500).json({ error: error.message });
  }
}

module.exports = {
  yahooFinance,
  yahooFinanceHistory,
};