// functions/api/routes/ai.js

const express = require('express');
const router = express.Router();

// Local dependencies
const { logger } = require('../../config');
const { loadGeminiSDK, getSafetySettings, getGeminiSDK, buildGenerateContentRequest } = require('../../utils');

// This route handles the AI Agent response generation via a standard POST request.
router.post('/generateAIAgentResponse', async (req, res) => {
  try {
    logger.info('AI Agent HTTP endpoint (/generateAIAgentResponse) called');
    
    // Using Vertex AI credentials via Application Default Credentials
    const sdkLoaded = await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK(); // Destructure the loaded SDK

    if (!sdkLoaded || !GoogleGenAI) {
      logger.error("AI Agent HTTP: GoogleGenAI SDK not loaded.");
      return res.status(500).json({ error: "Core AI SDK failed to load", success: false });
    }

    const { prompt: userQuery, conversationHistory, context } = req.body;

    if (!userQuery || typeof userQuery !== 'string' || userQuery.trim() === '') {
      return res.status(400).json({ error: "A non-empty prompt is required.", success: false });
    }

    const genAI = new GoogleGenAI({ vertexai: { project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' } });

    // --- DYNAMIC PROMPT CONSTRUCTION ---
    let fullPrompt = `You are a helpful and highly context-aware AI assistant for TrendingTechDaily.com, a tech news website.\n`;
    fullPrompt += `Your primary goal is to assist users based on their current activity on the site and their questions.\n`;

    // 1. Page-Specific Context
    if (context && context.pageSpecificContext) {
      const { type, url, title: pageTitle, articleTitle, articleContentSample } = context.pageSpecificContext;
      fullPrompt += `\nThe user is currently on the page: "${pageTitle || 'Untitled Page'}" (URL: ${url}). This page is identified as a '${type}' page.\n`;
      if (type === 'article' && articleTitle) {
          fullPrompt += `They are viewing an article titled: "${articleTitle}".\n`;
          if (articleContentSample) {
              fullPrompt += `Here is a brief sample of its content: "${articleContentSample.substring(0, 500)}..."\n\n`;
          }
          fullPrompt += `Given this article context, you can offer to:
- Provide a concise summary of THIS article.
- List key takeaways or main points of THIS article.
- Help the user share THIS article (mention available methods: Twitter/X, Facebook, LinkedIn, Email, Copy Link - just list them if asked, the user has buttons for these actions).
- Answer specific questions about THIS article's content.
Be proactive in offering these options if the user's query is related to "this article" or seems to seek such actions.\n`;
      } else if (type === 'homepage') {
          fullPrompt += `They are on the homepage. You can help them find specific news, discover trending topics, explain tech concepts, or discuss recent articles.\n`;
      } else if (type === 'podcasts_page') {
          fullPrompt += `They are on our Podcasts page (https://trendingtechdaily.com/podcasts.html). This page features Spotify-recommended tech podcasts. You can inform them about this and help them find specific types of tech podcasts, or remind them to explore the page for direct Spotify links.\n`;
      }
    }

    // 2. General Site Context
    if (context && context.latestArticles && context.latestArticles.length > 0) {
      fullPrompt += `\nSome general recent articles from the site (for your reference if the query is not page-specific, each with title and slug):\n`;
      const generalArticleContext = context.latestArticles
        .map(a => JSON.stringify({ title: a.title, slug: a.slug }))
        .join('\n');
      fullPrompt += `${generalArticleContext}\n`;
    }

    // 3. Conversation History
    if (conversationHistory && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        fullPrompt += "\nPrevious conversation turns (user and assistant):\n";
        conversationHistory.forEach(msg => {
          if (msg && typeof msg.role === 'string' && typeof msg.content === 'string') {
            fullPrompt += `${msg.role}: ${msg.content}\n`;
          }
        });
    }
    
    // 4. Current User Query
    fullPrompt += `\nUser's current question: "${userQuery}"\n\n`;
    
    // 5. General Instructions
    fullPrompt += `General Instructions:
- Provide helpful, concise, and friendly responses.
- **Article Links**: When you mention ANY article from TrendingTechDaily.com, you MUST format it as a full, clickable Markdown link. Use the article's slug (available in the context if it's a recent article) to construct the URL in this exact format: '[Article Title](https://trendingtechdaily.com/article/THE_ACTUAL_SLUG_HERE)'.
- **Podcast Page Link**: If relevant, refer to the podcast page as: '[Trending Tech Daily Podcasts](https://trendingtechdaily.com/podcasts.html)'.
- **Sharing**: If asked to help share an article the user is currently viewing, list the available methods (Twitter/X, Facebook, LinkedIn, Email, Copy Link). Do not attempt to perform the share yourself; the user has buttons for this.
- **Summaries/Takeaways**: If on an article page and asked for a summary or takeaways, base it on the provided content sample and title. Keep summaries to 2-3 concise sentences unless asked for more detail.
- **Be Aware of Page Context**: Tailor your suggestions and responses to the type of page the user is on.
- **Do NOT use placeholders** like '(link_to_article)'. Always construct full, real URLs.
- If you don't have enough information from the context to fully answer, say so politely and offer to search or discuss general topics.`;
    
    // --- END OF DYNAMIC PROMPT CONSTRUCTION ---

    logger.info("AI Agent HTTP: Sending final prompt to Gemini (first 500 chars):", fullPrompt.substring(0,500));
    const result = await genAI.models.generateContent(
      buildGenerateContentRequest(fullPrompt, {
        model: "gemini-1.5-flash",
        safetySettings: getSafetySettings(),
      }),
    );
    const responseText = (typeof result.text === 'function' ? result.text() : result.text) || '';
    logger.info("AI Agent HTTP: Received response from Gemini.");

    return res.status(200).json({  
      message: responseText,
      success: true  
    });

  } catch (error) {
    logger.error("AI Agent HTTP Error in /generateAIAgentResponse:", error);
    if (error.response?.promptFeedback?.blockReason) {
      return res.status(400).json({  
        error: "Content blocked by safety filters.",  
        message: `Content blocked: ${error.response.promptFeedback.blockReason}`,
        success: false  
      });
    }
    return res.status(500).json({
      error: "Failed to generate response",
      message: error.message || "Unknown error",
      success: false
    });
  }
});

module.exports = router;