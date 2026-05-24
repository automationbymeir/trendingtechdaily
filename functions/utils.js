// functions/utils.js

const { logger } = require("./config");
let GoogleGenAI, HarmCategory, HarmBlockThreshold;

/**
 * Safely gets a value from a function, returning a default if it throws an error.
 */
function getSafe(fn, defaultValue = "") {
  try {
    const value = fn();
    return (value !== null && value !== undefined) ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Lazily loads the Google Generative AI SDK to improve startup performance.
 */
async function loadGeminiSDK() {
  if (!GoogleGenAI) {
    try {
      const generativeAIModule = require("@google/genai");
      GoogleGenAI = generativeAIModule.GoogleGenAI;
      HarmCategory = generativeAIModule.HarmCategory;
      HarmBlockThreshold = generativeAIModule.HarmBlockThreshold;
      logger.info("Gemini SDK (@google/genai) loaded successfully");
      return true;
    } catch (e) {
      logger.error("Failed to load @google/genai:", e.message);
      return false;
    }
  }
  return true;
}

/**
 * Returns safety settings for Gemini, requires the SDK to be loaded first.
 */
function getSafetySettings() {
  if (HarmCategory && HarmBlockThreshold) {
    return [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    ];
  }
  return [];
}

/**
 * Dynamically determines cache duration for stock data.
 */
function getStockMappingCacheDuration() {
  const now = new Date();
  const day = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const hoursUtc = now.getUTCHours() + now.getUTCMinutes() / 60;
  const isWeekend = (day === 0 || day === 6);
  if (isWeekend) {
    return 72 * 60 * 60 * 1000; // 72 hours
  }
  // US market hours ~13:30 to 20:00 UTC
  if (hoursUtc >= 13.5 && hoursUtc < 20) {
    return 1 * 60 * 60 * 1000; // 1 hour
  }
  return 24 * 60 * 60 * 1000; // 24 hours
}

function buildGenerateContentRequest(prompt, options = {}) {
  if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
    if (prompt.contents) {
      return { ...prompt, ...options };
    }
    if (prompt.messages) {
      const contents = prompt.messages.map((message) => ({
        role: message.role || "user",
        parts: message.parts || [{ text: message.content }],
      }));
      return { contents, ...options };
    }
  }

  if (Array.isArray(prompt)) {
    return { contents: prompt, ...options };
  }

  const text = prompt !== undefined && prompt !== null ? String(prompt) : "";
  return {
    contents: [
      {
        role: "user",
        parts: [{ text }],
      },
    ],
    ...options,
  };
}

module.exports = {
  getSafe,
  loadGeminiSDK,
  getSafetySettings,
  getStockMappingCacheDuration,
  buildGenerateContentRequest,
  getGeminiSDK: () => ({ GoogleGenAI, HarmCategory, HarmBlockThreshold }),
};