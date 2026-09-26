// functions/api/routes/ai.js

const express = require('express');
const router = express.Router();

// Local dependencies
const { logger } = require('../../config');
const { loadGeminiSDK, getSafetySettings, getGeminiSDK, buildGenerateContentRequest } = require('../../utils');

// Retry config — mirrors the callable/ai.js pattern
const GEMINI_MODELS        = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const GEMINI_MAX_RETRIES   = 4;       // attempts per model on 503
const GEMINI_RETRY_DELAY   = 4000;    // ms between retries

/**
 * Generates content with automatic 503-retry and model-fallback.
 */
async function generateWithRetry(genAI, prompt, safetySettings) {
  let lastErr;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < GEMINI_MAX_RETRIES; attempt++) {
      try {
        logger.info(`generateWithRetry: ${model} attempt ${attempt + 1}/${GEMINI_MAX_RETRIES}`);
        const result = await genAI.models.generateContent(
          buildGenerateContentRequest(prompt, { model, safetySettings }),
        );
        return result;
      } catch (err) {
        const msg = err.message || '';
        const isOverloaded = msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded');
        const isModelGone  = msg.includes('404') || msg.includes('NOT_FOUND') ||
                             msg.includes('no longer available') || msg.includes('deprecated');
        lastErr = err;
        if (isModelGone) {
          logger.warn(`API route: Gemini ${model} unavailable for this key, skipping.`);
          break;
        } else if (isOverloaded) {
          logger.warn(`API route: Gemini ${model} overloaded (attempt ${attempt + 1}), retrying in ${GEMINI_RETRY_DELAY}ms…`);
          await new Promise(r => setTimeout(r, GEMINI_RETRY_DELAY));
        } else {
          throw err;
        }
      }
    }
  }
  throw lastErr;
}

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

    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const isHebrew = context && (context.language === 'he' || context.systemNote);

    // --- DYNAMIC PROMPT CONSTRUCTION ---
    let fullPrompt = '';
    if (isHebrew) {
      // Hebrew system prompt
      fullPrompt = `${context.systemNote || 'אתה עוזר AI בעברית לאתר חדשות טכנולוגיה TrendingTech Daily. ענה תמיד בעברית.'}\n`;
      fullPrompt += `המטרה שלך לסייע למשתמשים בהתבסס על הפעילות הנוכחית שלהם באתר.\n`;
    } else {
      fullPrompt = `You are a helpful and highly context-aware AI assistant for TrendingTechDaily.com, a tech news website.\n`;
      fullPrompt += `Your primary goal is to assist users based on their current activity on the site and their questions.\n`;
    }

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
      }
    }

    // 2. General Site Context
    if (context && context.latestArticles && context.latestArticles.length > 0) {
      if (isHebrew) {
        // For Hebrew: pass full verified URLs so Gemini never has to guess
        fullPrompt += `\nרשימת הכתבות האחרונות הקיימות באתר (השתמש אך ורק בקישורים אלה — אל תמציא קישורים אחרים):\n`;
        context.latestArticles.forEach(a => {
          if (a.url) {
            fullPrompt += `- [${a.title}](${a.url})\n`;
          }
        });
        fullPrompt += `\nחשוב: אסור להמציא קישורים שאינם ברשימה זו. אם כתבה לא מופיעה ברשימה — אל תקשר אליה.\n`;
      } else {
        fullPrompt += `\nSome general recent articles from the site (for your reference if the query is not page-specific, each with title and slug):\n`;
        const generalArticleContext = context.latestArticles
          .map(a => JSON.stringify({ title: a.title, slug: a.slug }))
          .join('\n');
        fullPrompt += `${generalArticleContext}\n`;
      }
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
    if (isHebrew) {
      fullPrompt += `הוראות כלליות:
- ענה תמיד בעברית, בצורה ידידותית וקצרה.
- **קישורים לכתבות**: השתמש אך ורק בקישורים שסופקו ברשימת הכתבות למעלה. כתוב אותם בפורמט Markdown: [כותרת הכתבה](הקישור המלא). אסור בהחלט להמציא קישורים, slugs, או URLs שאינם ברשימה — הם יהיו שגויים ומתים.
- **אם אין כתבה מתאימה ברשימה**: אמור "לא מצאתי כתבה ספציפית בנושא זה, אבל אוכל לעזור לך בכל שאלה."
- **סיכומים**: אם המשתמש על עמוד כתבה ומבקש סיכום, בסס על תוכן הכתבה שסופק. 2-3 משפטים תמציתיים בעברית.
- **שיתוף**: אם שואלים על שיתוף, פרט את האפשרויות: WhatsApp, Twitter/X, Facebook, העתק קישור.
- אל תכתוב לעולם URL גולמי — תמיד עטוף בפורמט Markdown [שם](כתובת).
- אל תמציא לעולם כתבות שאינן ברשימה שסופקה.`;
    } else {
      fullPrompt += `General Instructions:
- Provide helpful, concise, and friendly responses.
- **Article Links**: When you mention ANY article from TrendingTechDaily.com, you MUST format it as a full, clickable Markdown link. Use the article's slug (available in the context if it's a recent article) to construct the URL in this exact format: '[Article Title](https://trendingtechdaily.com/article/THE_ACTUAL_SLUG_HERE)'.
- **Sharing**: If asked to help share an article the user is currently viewing, list the available methods (Twitter/X, Facebook, LinkedIn, Email, Copy Link). Do not attempt to perform the share yourself; the user has buttons for this.
- **Summaries/Takeaways**: If on an article page and asked for a summary or takeaways, base it on the provided content sample and title. Keep summaries to 2-3 concise sentences unless asked for more detail.
- **Be Aware of Page Context**: Tailor your suggestions and responses to the type of page the user is on.
- **Do NOT use placeholders** like '(link_to_article)'. Always construct full, real URLs.
- If you don't have enough information from the context to fully answer, say so politely and offer to search or discuss general topics.`;
    }
    
    // --- END OF DYNAMIC PROMPT CONSTRUCTION ---

    logger.info("AI Agent HTTP: Sending final prompt to Gemini (first 500 chars):", fullPrompt.substring(0,500));
    const result = await generateWithRetry(genAI, fullPrompt, getSafetySettings());
    // Extract text safely — handles both plain and thinking-model responses
    let responseText = '';
    if (result.candidates?.[0]?.content?.parts) {
      responseText = result.candidates[0].content.parts
        .filter(p => !p.thought && p.text)
        .map(p => p.text)
        .join('');
    }
    if (!responseText) {
      responseText = (typeof result.text === 'function' ? result.text() : result.text) || '';
    }
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
      error: error.message || "Failed to generate response",
      message: error.message || "Unknown error",
      success: false
    });
  }
});

module.exports = router;