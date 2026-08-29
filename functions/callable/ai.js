const { HttpsError } = require("firebase-functions/v2/https");
const { logger, db, CONFIG } = require('../config');
const { loadGeminiSDK, getSafetySettings, getSafe, getGeminiSDK, getStockMappingCacheDuration, buildGenerateContentRequest } = require('../utils');
const fetch = require('node-fetch');
const { resolveEditorialArticleImage } = require('../services/editorialImageService');

const GEMINI_PRIMARY_MODEL = "gemini-1.5-flash";

// --- Helper function to get fallback colors for SVG generation ---
function getFallbackImagesForCategory(prompt = "") {
  // This function now returns color schemes instead of image URLs
  const promptLower = prompt.toLowerCase();
  
  if (promptLower.includes('ai') || promptLower.includes('artificial intelligence') || promptLower.includes('machine learning')) {
    return ['#4F46E5', '#7C3AED']; // Purple gradient
  } else if (promptLower.includes('crypto') || promptLower.includes('blockchain') || promptLower.includes('bitcoin')) {
    return ['#F59E0B', '#EF4444']; // Orange-red gradient
  } else if (promptLower.includes('cyber') || promptLower.includes('security') || promptLower.includes('privacy')) {
    return ['#10B981', '#059669']; // Green gradient
  } else if (promptLower.includes('cloud') || promptLower.includes('server') || promptLower.includes('infrastructure')) {
    return ['#06B6D4', '#0891B2']; // Cyan gradient
  } else if (promptLower.includes('data') || promptLower.includes('analytics') || promptLower.includes('database')) {
    return ['#3B82F6', '#1E40AF']; // Blue gradient
  } else if (promptLower.includes('mobile') || promptLower.includes('app') || promptLower.includes('smartphone')) {
    return ['#8B5CF6', '#6366F1']; // Purple-indigo gradient
  } else if (promptLower.includes('startup') || promptLower.includes('entrepreneur') || promptLower.includes('innovation')) {
    return ['#EC4899', '#BE185D']; // Pink gradient
  } else if (promptLower.includes('robot') || promptLower.includes('automation')) {
    return ['#6B7280', '#374151']; // Gray gradient
  } else if (promptLower.includes('quantum')) {
    return ['#7C3AED', '#4C1D95']; // Deep purple gradient
  } else if (promptLower.includes('network') || promptLower.includes('5g')) {
    return ['#14B8A6', '#0D9488']; // Teal gradient
  }
  
  // Default technology gradient
  return ['#6366F1', '#4F46E5']; // Indigo-purple gradient
}

// --- generateArticleContent (robust JSON parsing for code blocks) ---
async function generateArticleContent(request) { // request contains { auth, data }
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }
    
    const topic = request.data.prompt; 
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      throw new HttpsError("invalid-argument", "A non-empty 'prompt' (topic) string is required.");
    }
    logger.info(`generateArticleContent: Received topic prompt from user ${request.auth.uid}: "${topic.substring(0, 100)}..."`);

    try {
      const sdkLoaded = await loadGeminiSDK();
      const { GoogleGenAI } = getGeminiSDK();

      if (!sdkLoaded || !GoogleGenAI) {
        logger.error("generateArticleContent: GoogleGenAI SDK not loaded.");
        throw new HttpsError("internal", "Core AI SDK (@google/genai) failed to load.");
      }

      const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

      const structuredPrompt = `
Write an authoritative, high-impact tech/finance news article about "${topic}" in the style of Bloomberg, Reuters, or The Information.

Requirements:
- Write in a professional journalistic style with engaging, analytical paragraphs.
- Include factual data, technical nuances, market trends, and industry implications.
- Seamlessly integrate inline hyperlinks to authoritative sources (e.g. arXiv research papers, official corporate press releases, SEC filings, GitHub repositories, or Reuters/Bloomberg reports) using clean HTML anchor tags: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>.
- Include 1-2 insightful quotes or social discussion mentions from industry leaders, engineers, or founders on X (Twitter), LinkedIn, or GitHub.
- For all sources and social mentions, provide DIRECT DEEP LINKS (e.g. specific arXiv paper `https://arxiv.org/abs/...`, specific blog post `https://.../blog/...`, specific tweet/status `https://x.com/username/status/...`, or specific GitHub release/PR `https://github.com/.../releases`). NEVER provide homepage or root domain links.
- Length: 450-700 words.

Output MUST be ONLY a raw JSON object with these exact keys:
{
"title": "string, max 70 chars, professional headline",
"slug": "string, lowercase, hyphenated, based on title",
"content": "string, rich HTML with <p> tags and inline <a href='...'> source links, 450-700 words",
"excerpt": "string, informative summary, max 160 chars",
"tags": ["array", "of", "relevant", "tags"],
"sources": [
  { "title": "string, title of primary source or paper", "url": "string, specific canonical deep URL", "publisher": "string, e.g. arXiv, Reuters, OpenAI Blog, Bloomberg" }
],
"socialMentions": [
  { "platform": "X", "author": "string, full name", "handle": "@handle", "quote": "string, key quote or insight", "link": "string, specific direct post URL https://x.com/.../status/...", "context": "string, e.g. Lead AI Researcher" }
],
"imagePrompt": "string, professional image description for article illustration, suitable for AI image generator",
"mentionedCompanies": ["array", "of", "publicly traded company names mentioned (e.g., Apple, Microsoft, NVIDIA)"],
"imageAltText": "string, descriptive alt text for the image, based on imagePrompt"
}

Generate the article about: "${topic}". Output ONLY the JSON object.
`;

      logger.info("generateArticleContent: Sending structured prompt to Gemini...");
      const result = await genAI.models.generateContent(
        buildGenerateContentRequest(structuredPrompt, {
          model: GEMINI_PRIMARY_MODEL,
          safetySettings: getSafetySettings(),
        }),
      );
      const rawTextResponse = (typeof result.text === "function" ? result.text() : result.text) || "";
      logger.info("generateArticleContent: Raw Gemini Response (first 500 chars):", rawTextResponse.substring(0, 500));

      let generatedJson = {};
      let parseErrorOccurred = false;
      let validationErrorOccurred = false;
      let errorMessage = "";

      try {
        // Robustly extract JSON from code block or plain text
        let jsonText = rawTextResponse.trim();
        
        // Remove markdown code blocks
        if (jsonText.includes('```json')) {
            jsonText = jsonText.replace(/```json\s*/g, '');
            jsonText = jsonText.replace(/\s*```/g, '');
        } else if (jsonText.includes('```')) {
            jsonText = jsonText.replace(/```\s*/g, '');
        }
        
        // Try to find JSON object
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch || !jsonMatch[0]) {
          throw new Error("No valid JSON object found in AI response.");
        }
        
        generatedJson = JSON.parse(jsonMatch[0]);
        logger.info("generateArticleContent: Successfully parsed JSON from Gemini response.");
      } catch (parseError) {
        parseErrorOccurred = true;
        errorMessage = "AI response was not valid JSON. Parse error: " + parseError.message;
        logger.error("generateArticleContent: Failed to parse JSON.", parseError, "Raw Text:", rawTextResponse);
      }

      if (!parseErrorOccurred) {
        if (!generatedJson.title || !generatedJson.content || !generatedJson.slug) {
          validationErrorOccurred = true;
          errorMessage = "AI response missing required fields (title, content, slug).";
          logger.error("generateArticleContent: Parsed JSON missing required fields:", generatedJson);
        }
      }

      if (parseErrorOccurred || validationErrorOccurred) {
        return { error: true, message: errorMessage, rawText: rawTextResponse };
      } else {
        return {
          title: getSafe(() => generatedJson.title),
          slug: getSafe(() => generatedJson.slug),
          content: getSafe(() => generatedJson.content),
          excerpt: getSafe(() => generatedJson.excerpt),
          tags: getSafe(() => generatedJson.tags, []),
          sources: getSafe(() => generatedJson.sources, []),
          socialMentions: getSafe(() => generatedJson.socialMentions, []),
          imagePrompt: getSafe(() => generatedJson.imagePrompt),
          imageAltText: getSafe(() => generatedJson.imageAltText, getSafe(() => generatedJson.title)),
          mentionedCompanies: getSafe(() => generatedJson.mentionedCompanies, [])
        };
      }
    } catch (error) {
      logger.error("generateArticleContent General Error Caught:", error);
      let generalErrorMessage = error.message || "Unknown error during article generation.";
      if (error.response?.promptFeedback?.blockReason) {
        generalErrorMessage = `Content generation blocked: ${error.response.promptFeedback.blockReason}.`;
      }
      return { error: true, message: generalErrorMessage }; // Return error object
    }
}

// --- rephraseText (Placeholder - Implement your logic) ---
async function rephraseText(request) { 
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your rephraseText logic using Gemini
    return { rephrasedText: `Rephrased: ${request.data.text} (placeholder)` };
}

// --- suggestArticleTopic (Enhanced with better randomization) ---
async function suggestArticleTopic(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const GROK_API_KEY = process.env.GROK_API_KEY;
    if (!GROK_API_KEY) throw new HttpsError("internal", "GROK_API_KEY secret is not configured.");
    
    // Enhanced randomization with timestamp and longer random string
    const timestamp = Date.now();
    const randomizer = Math.random().toString(36).substring(2, 15);
    const userPrompt = request.data && request.data.prompt ? request.data.prompt : "trending technology";
    
    // Create a more dynamic prompt
    const prompt = `${userPrompt} [timestamp:${timestamp}] [session:${randomizer}] [unique:${Math.random()}]`;
    
    try {
        const grokResponse = await fetch("https://api.x.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROK_API_KEY}`
            },
            body: JSON.stringify({
                model: "grok-3-latest",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert tech journalist assistant. Suggest a fresh and up-to-date technology news topic based on events from the last 24 hours. Never repeat a topic during the session and vary the area of tech discussed. Respond with a JSON object: { topic: string, reason: string }`
                    },
                    { 
                        role: "user", 
                        content: prompt 
                    }
                ],
                stream: false,
                temperature: 1.2,  // Increased from 0.8 for more randomness
                max_tokens: 200,
                top_p: 0.95  // Added for more diversity
            })
        });
        
        if (!grokResponse.ok) {
            throw new Error(`Grok API error: ${grokResponse.status} ${await grokResponse.text()}`);
        }
        
        const data = await grokResponse.json();
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        let topic = "";
        let reason = "";
        
        if (content) {
            try {
                // Robustly extract JSON from code block or plain text
                let jsonText = content;
                if (jsonText.includes('```json')) {
                    jsonText = jsonText.replace(/^```json\s*/, '');
                    jsonText = jsonText.replace(/\s*```\s*$/, '');
                } else if (jsonText.startsWith('```') && jsonText.endsWith('```')) {
                    jsonText = jsonText.substring(3, jsonText.length - 3).trim();
                }
                const jsonMatch = jsonText.match(/(\{[\s\S]*\})/);
                if (!jsonMatch || !jsonMatch[0]) {
                    throw new Error("No valid JSON object found in AI response.");
                }
                const parsed = JSON.parse(jsonMatch[0]);
                topic = parsed.topic;
                reason = parsed.reason;
            } catch (e) {
                // If not valid JSON, fallback to plain text
                topic = content;
                reason = "";
            }
        }
        
        logger.info(`Suggested topic: "${topic}" with randomizer: ${randomizer}`);
        return { topic, reason };
    } catch (error) {
        logger.error("Grok API error:", error);
        throw new HttpsError("internal", `Grok API failed: ${error.message}`);
    }
}

// --- generateArticleImage (Gemini-only with generated placeholder) ---
async function generateArticleImage(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }
    
    const { prompt, articleTitle = '', style = 'tech_illustration' } = request.data;
    
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'prompt' string is required.");
    }
    
    logger.info(`generateArticleImage called for prompt: "${prompt}", title: "${articleTitle}"`);

    let imageUrl = '';
    let imageAltText = `${articleTitle || prompt} - Technology illustration`;
    let source = 'unsplash';
    let message = '';

    try {
        // High-precision editorial image resolution
        const editorialImage = await resolveEditorialArticleImage({
          topic: articleTitle || prompt,
          imagePrompt: prompt,
          category: 'tech'
        }, process.env.UNSPLASH_ACCESS_KEY);

        if (editorialImage && editorialImage.imageUrl) {
            imageUrl = editorialImage.imageUrl;
            imageAltText = editorialImage.altText || imageAltText;
            source = editorialImage.source || 'editorial';
            message = 'High-precision editorial image matched';
            return { success: true, imageUrl, imageAltText, source, message };
        }

        // Try to use Gemini to generate a base64 encoded SVG or simple image
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();

        if (!sdkLoaded || !GoogleGenAI) {
            logger.error("GoogleGenAI SDK not loaded.");
            throw new HttpsError("internal", "Core AI SDK failed to load.");
        }

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

        // Ask Gemini to create an SVG image
        const svgPrompt = `Create a simple SVG image for this article topic: "${prompt}".
        
Generate ONLY the SVG code with these requirements:
- Size: 1200x600 pixels
- Use abstract shapes and gradients
- Tech/modern style with blue, purple, or green colors
- No text in the image
- Clean, professional appearance

Output ONLY the SVG code starting with <svg and ending with </svg>. No explanation or other text.`;

        try {
            const result = await genAI.models.generateContent(
                buildGenerateContentRequest(svgPrompt, {
                    model: GEMINI_PRIMARY_MODEL,
                    safetySettings: getSafetySettings(),
                }),
            );
            const responseText = (typeof result.text === "function" ? result.text() : result.text) || "";
            
            logger.info("Gemini SVG response received");
            
            // Extract SVG from response
            const svgMatch = responseText.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
                // Convert SVG to base64
                const svgString = svgMatch[0];
                const base64Svg = Buffer.from(svgString).toString('base64');
                imageUrl = `data:image/svg+xml;base64,${base64Svg}`;
                source = 'gemini-generated-svg';
                message = 'Generated SVG image using Gemini';
                logger.info("Successfully generated SVG image");
            } else {
                logger.warn("No SVG found in Gemini response");
                throw new Error("No SVG in response");
            }
            
        } catch (geminiError) {
            logger.error("Gemini SVG generation error:", geminiError);
            
            // Fallback: Generate a simple gradient image using canvas-like approach
            logger.info("Using fallback gradient generation");
            
            // Create a simple SVG gradient based on the topic
            const colorPairs = getFallbackImagesForCategory(prompt);
            
            // Generate SVG with gradient and pattern
            const svg = `<svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${colorPairs[0]};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${colorPairs[1]};stop-opacity:1" />
    </linearGradient>
    <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
      <path d="M 50 0 L 0 0 0 50" fill="none" stroke="white" stroke-width="1" opacity="0.1"/>
    </pattern>
  </defs>
  <rect width="1200" height="600" fill="url(#grad1)" />
  <rect width="1200" height="600" fill="url(#grid)" />
  <circle cx="300" cy="200" r="150" fill="white" opacity="0.1" />
  <circle cx="900" cy="400" r="200" fill="white" opacity="0.05" />
  <rect x="100" y="250" width="200" height="100" fill="white" opacity="0.05" transform="rotate(45 200 300)" />
  <polygon points="600,100 700,300 500,300" fill="white" opacity="0.08" />
</svg>`;
            
            const base64Svg = Buffer.from(svg).toString('base64');
            imageUrl = `data:image/svg+xml;base64,${base64Svg}`;
            source = 'generated-gradient';
            message = 'Generated gradient placeholder image';
        }
        
    } catch (error) {
        logger.error("Image generation error:", error);
        
        // Ultimate fallback: Simple colored rectangle
        const fallbackSvg = `<svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="600" fill="#4F46E5" />
  <rect x="50" y="50" width="1100" height="500" fill="#6366F1" opacity="0.5" />
</svg>`;
        
        const base64Svg = Buffer.from(fallbackSvg).toString('base64');
        imageUrl = `data:image/svg+xml;base64,${base64Svg}`;
        source = 'fallback-gradient';
        message = 'Using fallback gradient image';
    }

    // Always return a valid image
    return {
        success: true,
        imageUrl,
        imageAltText,
        source,
        message
    };
}

// --- generateTopTenArticle ---
async function generateTopTenArticle(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const topic = request.data && request.data.topic;
    const count = request.data && request.data.count ? parseInt(request.data.count, 10) : 10;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'topic' string is required.");
    }

    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

        const structuredPrompt = `Create a top ${count} list article about "${topic}" for a technology news website.

Requirements:
- Provide a brief introductory paragraph (key: intro).
- Provide exactly ${count} list items (key: items) where each item has: title, a detailed paragraph of at least 80 words, imagePrompt, imageAltText, and url (the official website or resource link when applicable).
- Provide a concluding paragraph (key: conclusion).
- Provide relevant tags (key: tags) and a URL-friendly slug (key: slug).
Output ONLY JSON with keys: title, slug, intro, items, conclusion, tags. Each item should include a "url" field when recommending a website or resource.`;

        const result = await genAI.models.generateContent(
            buildGenerateContentRequest(structuredPrompt, {
                model: GEMINI_PRIMARY_MODEL,
                safetySettings: getSafetySettings(),
            }),
        );
        let rawText = (typeof result.text === "function" ? result.text() : result.text) || "";
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object in AI response");

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.title || !Array.isArray(parsed.items)) {
            throw new Error("Parsed JSON missing required fields");
        }

        for (const item of parsed.items) {
            try {
                const prompt = item.imagePrompt
                    ? `${item.imagePrompt} ${topic}`
                    : `${item.title} ${topic} technology`;
                const imgRes = await generateArticleImage({
                    auth: request.auth,
                    data: { prompt, articleTitle: item.title }
                });
                item.imageUrl = imgRes.imageUrl;
                item.imageAltText = imgRes.imageAltText;
            } catch (e) {
                logger.error("Image generation failed for item", item.title, e);
                item.imageUrl = '';
            }
        }

        let content = '';
        if (parsed.intro) content += `<p>${parsed.intro}</p>`;
        parsed.items.forEach((item, idx) => {
            const itemUrl = item.url || item.link || item.website;
            const titleWithLink = itemUrl
                ? `<a href="${itemUrl}" target="_blank" rel="noopener noreferrer">${item.title}</a>`
                : item.title;
            content += `<h2>${idx + 1}. ${titleWithLink}</h2>`;
            if (item.imageUrl) content += `<p><img src="${item.imageUrl}" alt="${item.imageAltText || ''}" class="img-fluid"></p>`;
            content += `<p>${item.paragraph}</p>`;
        });
        if (parsed.conclusion) content += `<p>${parsed.conclusion}</p>`;

        const excerpt = parsed.intro ? parsed.intro.substring(0, 157) + '...' : '';

        return {
            title: parsed.title,
            slug: parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            content,
            excerpt,
            tags: parsed.tags || [],
            items: parsed.items
        };
    } catch (err) {
        logger.error('generateTopTenArticle error:', err);
        throw new HttpsError('internal', err.message || 'Failed to generate top list article');
    }
}

// --- generateHowToArticle ---
async function generateHowToArticle(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const topic = request.data && request.data.topic;
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'topic' string is required.");
    }

    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

        const structuredPrompt = `Create a step-by-step how-to article about "${topic}" for a technology news website.

Requirements:
- Provide a brief introductory paragraph (key: intro).
- Provide an ordered list of steps (key: steps) where each step has: title, a detailed paragraph of at least 80 words, imagePrompt, imageAltText.
- Provide a concluding paragraph (key: conclusion).
- Provide relevant tags (key: tags) and a URL-friendly slug (key: slug).
Output ONLY JSON with keys: title, slug, intro, steps, conclusion, tags.`;

        const result = await genAI.models.generateContent(
          buildGenerateContentRequest(structuredPrompt, {
              model: GEMINI_PRIMARY_MODEL,
                safetySettings: getSafetySettings(),
            }),
        );
        let rawText = (typeof result.text === "function" ? result.text() : result.text) || "";
        rawText = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON object in AI response");

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.title || !Array.isArray(parsed.steps)) {
            throw new Error("Parsed JSON missing required fields");
        }

        for (const step of parsed.steps) {
            try {
                const prompt = step.imagePrompt
                    ? `${step.imagePrompt} ${topic}`
                    : `${step.title} ${topic} technology`;
                const imgRes = await generateArticleImage({
                    auth: request.auth,
                    data: { prompt, articleTitle: step.title }
                });
                step.imageUrl = imgRes.imageUrl;
                step.imageAltText = imgRes.imageAltText;
            } catch (e) {
                logger.error("Image generation failed for step", step.title, e);
                step.imageUrl = '';
            }
        }

        let content = '';
        if (parsed.intro) content += `<p>${parsed.intro}</p>`;
        parsed.steps.forEach((step, idx) => {
            content += `<h2>Step ${idx + 1}: ${step.title}</h2>`;
            if (step.imageUrl) content += `<p><img src="${step.imageUrl}" alt="${step.imageAltText || ''}" class="img-fluid"></p>`;
            content += `<p>${step.paragraph}</p>`;
        });
        if (parsed.conclusion) content += `<p>${parsed.conclusion}</p>`;

        const excerpt = parsed.intro ? parsed.intro.substring(0, 157) + '...' : '';

        return {
            title: parsed.title,
            slug: parsed.slug || parsed.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
            content,
            excerpt,
            tags: parsed.tags || [],
            steps: parsed.steps
        };
    } catch (err) {
        logger.error('generateHowToArticle error:', err);
        throw new HttpsError('internal', err.message || 'Failed to generate how-to article');
    }
}

// --- getStockDataForCompanies (Placeholder - Implement your logic) ---
async function getStockDataForCompanies(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    // TODO: Implement your getStockDataForCompanies logic
    return { stockData: [] };
}

// --- readArticleAloud using Gemini TTS ---
async function readArticleAloud(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Authentication required.");
    const text = request.data && request.data.text;
    if (!text || typeof text !== 'string' || text.trim() === '') {
        throw new HttpsError("invalid-argument", "A non-empty 'text' field is required.");
    }

    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenAI) throw new HttpsError("internal", "Core AI SDK failed to load.");

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });
        const result = await genAI.models.generateContent(
            buildGenerateContentRequest(text, {
                model: 'tts-1-hd',
                responseMimeType: 'audio/mp3',
            }),
        );
        const base64Audio = result.data;
        if (!base64Audio) {
            throw new Error('No audio content returned from Gemini');
        }
        return { success: true, audioContent: base64Audio };
    } catch (err) {
        logger.error('readArticleAloud error:', err);
        throw new HttpsError('internal', 'Failed to generate audio');
    }
}

module.exports = {
  generateArticleContent,
  rephraseText,
  suggestArticleTopic,
  generateArticleImage,
  generateTopTenArticle,
  generateHowToArticle,
  getStockDataForCompanies,
  readArticleAloud,
};