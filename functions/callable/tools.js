// functions/callable/tools.js

const fetch = require("node-fetch");
const { HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("../config");
const { loadGeminiSDK, getSafetySettings, getGeminiSDK, buildGenerateContentRequest } = require("../utils");

/**
 * The main AI Agent handler with tool-calling capabilities.
 */
async function generateAIAgentResponse(request) {
  const { prompt, conversationHistory, context, tool_outputs } = request.data;
  logger.info("AI Agent invoked with tool capabilities", { prompt, has_tool_outputs: !!tool_outputs });

  try {
    const sdkLoaded = await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK();
    if (!sdkLoaded || !GoogleGenAI) {
      throw new HttpsError("internal", "Core AI SDK failed to load");
    }

    const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

    // Tools definition
    const tools = {
      functionDeclarations: [
        { name: "searchWeb", description: "Search the web for current tech news and real-time information", parameters: { type: "object", properties: { query: { type: "string", description: "The search query" }, timeRange: { type: "string", enum: ["past_hour", "past_24h", "past_week"], description: "Time range for search" } }, required: ["query"] } },
        { name: "getFinnhubStockData", description: "Gets real-time stock quote data with optional technical analysis", parameters: { type: "object", properties: { symbols: { type: "array", items: { type: "string" }, description: "Stock ticker symbols" }, includeAnalysis: { type: "boolean", description: "Whether to include AI-powered analysis" } }, required: ["symbols"] } },
        // Add other tools like generateArticleImage if needed
      ],
    };

    const systemInstruction = `You are an advanced AI assistant for TrendingTech Daily with access to real-time web search and data analysis tools. When a user asks a question, first decide if you need a tool. If so, call the tool. If not, answer directly. Context: ${JSON.stringify(context, null, 2)}`;
    
    const normalizedHistory = (conversationHistory || []).map((message) => {
      if (message?.parts) {
        return message;
      }
      const textContent = message?.content ?? message?.text ?? "";
      return {
        role: message?.role || "user",
        parts: [{ text: textContent }],
      };
    });

    const history = [
      { role: "user", parts: [{ text: systemInstruction }] },
      { role: "model", parts: [{ text: "I'm ready to assist with real-time data and tools." }] },
      ...normalizedHistory,
    ];
    
    // Add the current prompt or tool results to the history
    if (tool_outputs && tool_outputs.length > 0) {
      const functionResponses = tool_outputs.map(output => ({ functionResponse: { name: output.tool_name, response: output.output } }));
      history.push({ role: "user", parts: functionResponses });
    } else {
      history.push({ role: "user", parts: [{ text: prompt }] });
    }

    const result = await genAI.models.generateContent(
      buildGenerateContentRequest({ contents: history }, {
        model: "gemini-1.5-flash",
        safetySettings: getSafetySettings(),
        tools,
      }),
    );
    const firstCandidate = result.candidates?.[0];
    const responseParts = firstCandidate?.content?.parts || [];
    const functionCalls = responseParts.filter(p => p.functionCall);

    if (functionCalls.length > 0) {
      logger.info(`AI requested ${functionCalls.length} tool calls`);
      return {
        success: true,
        tools_to_call: functionCalls.map(fc => ({
          name: fc.functionCall.name,
          parameters: fc.functionCall.args,
        })),
      };
    } else {
      const textResponse = (typeof result.text === "function" ? result.text() : result.text) || "";
      logger.info("AI provided a direct response.");
      return { success: true, message: textResponse };
    }

  } catch (error) {
    logger.error("Enhanced AI Agent error:", error);
    throw new HttpsError("internal", `AI processing error: ${error.message}`);
  }
}

/**
 * Implementation of the 'searchWeb' tool.
 */
async function searchWeb({ data }) {
  // This is a placeholder. A real implementation would use a service like
  // Google Custom Search API, SerpAPI, or another web search provider.
  const { query, timeRange = "past_24h" } = data;
  logger.info(`TOOL: Executing web search for "${query}" in ${timeRange}`);

  const searchResults = {
    results: [
      { title: `Placeholder result for "${query}"`, source: "Mock Search Engine", url: "http://example.com", snippet: "This is a mock search result.", publishedDate: new Date().toISOString() },
    ],
    summary: `Found one mock result for your query about ${query}.`,
  };
  return { success: true, data: searchResults };
}

/**
 * Implementation of the enhanced Finnhub stock data tool.
 */
async function getFinnhubStockData({ data }) {
  const { symbols, includeAnalysis = false } = data;
  if (!Array.isArray(symbols) || symbols.length === 0) {
    throw new HttpsError("invalid-argument", "Symbols array is required.");
  }
  
  logger.info(`TOOL: Fetching Finnhub data for ${symbols.join(", ")} with analysis: ${includeAnalysis}`);
  
  try {
    const finnhubKey = process.env.FINNHUB_API_KEY;
    if (!finnhubKey) throw new HttpsError("internal", "Finnhub API Key not configured.");
    
    const promises = symbols.map(async (symbol) => {
      const [quoteRes, profileRes] = await Promise.all([
        fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${finnhubKey}`),
        fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${finnhubKey}`),
      ]);
      const [quote, profile] = await Promise.all([quoteRes.json(), profileRes.json()]);
      return { symbol, quote, profile };
    });
    
    const stockData = await Promise.all(promises);

    if (includeAnalysis) {
      const sdkLoadedForAnalysis = await loadGeminiSDK();
      const { GoogleGenAI } = getGeminiSDK();
      if (!sdkLoadedForAnalysis || !GoogleGenAI) {
        throw new HttpsError("internal", "Core AI SDK failed to load");
      }

      const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

      const analysisPrompt = `Analyze the following stock data and provide a brief summary of market sentiment and key trends:\n\n${JSON.stringify(stockData, null, 2)}`;
      const analysisResult = await genAI.models.generateContent(
        buildGenerateContentRequest(analysisPrompt, {
          model: "gemini-1.5-flash",
        }),
      );
      const analysisText = (typeof analysisResult.text === "function" ? analysisResult.text() : analysisResult.text) || "";

      return { stockData, analysis: analysisText };
    }
    
    return { stockData };

  } catch (error) {
    logger.error("Enhanced stock data tool error:", error);
    throw new HttpsError("internal", "Failed to fetch enhanced stock data");
  }
}

module.exports = {
  generateAIAgentResponse,
  searchWeb,
  getFinnhubStockData,
};