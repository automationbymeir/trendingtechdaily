const { logger, db } = require('./config');
const { loadGeminiSDK, getGeminiSDK, getSafetySettings } = require('./utils');
const { generateContentWithRetry } = require('./callable/ai');
const comparisons = require('./callable/comparisons');

async function suggestComparisonPairs() {
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) throw new Error('Gemini SDK unavailable');

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const randomizer = Math.floor(Math.random() * 1000000);
  
  const prompt = `You are an expert tech journalist assistant. Suggest 5 highly searched, trending tech comparisons (e.g., competing smartphones, AI models, software tools, laptops, frameworks) that would make great "X vs Y" articles. Make sure they are currently relevant. Randomizer: ${randomizer}.
  
Return JSON only in exactly this shape:
{
  "pairs": [
    { "itemA": "Product 1", "itemB": "Product 2", "category": "slug (e.g., ai, gadgets, software)" }
  ]
}`;

  const result = await generateContentWithRetry(genAI, prompt, getSafetySettings());
  const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Gemini returned no JSON');
  
  return JSON.parse(match[0]).pairs;
}

async function generateScheduledComparison(pairs) {
  for (const pair of pairs) {
    logger.info(`Trying to generate comparison: ${pair.itemA} vs ${pair.itemB}`);
    
    // We construct the request object mimicking how onCall functions receive it in Firebase v2
    const request = {
      auth: { uid: 'scheduler', token: { admin: true } },
      data: {
        itemA: pair.itemA,
        itemB: pair.itemB,
        category: pair.category || 'general',
        alsoGenerateHebrew: true, // generates both EN and HE!
        language: 'en',
        generateImage: true,
        publish: true
      }
    };

    try {
      // Call the inner function of the v2 onCall wrapper or fallback to calling it directly if supported
      const result = await (comparisons.generateComparison.run ? comparisons.generateComparison.run(request) : comparisons.generateComparison(request));
      logger.info(`Successfully generated comparison: ${result.slug}`);
      return result; // return on first success
    } catch (err) {
      if (err.code === 'already-exists') {
         logger.info(`Comparison ${pair.itemA} vs ${pair.itemB} already exists, trying next...`);
         continue;
      }
      logger.error(`Error generating comparison ${pair.itemA} vs ${pair.itemB}:`, err);
    }
  }
  throw new Error('Could not generate any comparison from the suggested pairs.');
}

async function dailyComparisonsCron() {
  logger.info("Scheduled comparisons generation triggered.");
  try {
    const pairs = await suggestComparisonPairs();
    if (!pairs || pairs.length === 0) {
      logger.error("No pairs suggested by Gemini.");
      return;
    }
    await generateScheduledComparison(pairs);
    logger.info("Scheduled comparisons generation completed.");
  } catch (error) {
    logger.error("Error in dailyComparisonsCron:", error);
  }
}

module.exports = { dailyComparisonsCron };
