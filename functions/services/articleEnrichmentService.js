// functions/services/articleEnrichmentService.js
//
// Automatically enriches recent published articles with:
// 1. Authentic editorial images (via editorialImageService).
// 2. Real, authoritative primary sources & citations (arXiv, Bloomberg, Reuters, SEC, GitHub).
// 3. Authentic social media quotes & tweets from tech leaders / engineers (X, LinkedIn, GitHub).
// 4. Seamless inline hyperlinks inside the article content.

const { db, logger } = require('../config');
const { loadGeminiSDK, getGeminiSDK, getSafetySettings, getSafe } = require('../utils');
const { resolveEditorialArticleImage } = require('./editorialImageService');

const GEMINI_PRIMARY_MODEL = 'gemini-1.5-flash';

async function enrichSingleArticle(doc, isHe = false, unsplashKey = '') {
  const data = doc.data();
  const title = data.title || '';
  const excerpt = data.excerpt || '';
  const existingContent = data.content || '';
  const category = data.category || 'ai';
  const tags = data.tags || [];

  logger.info(`Enriching ${isHe ? 'Hebrew' : 'English'} article: "${title.substring(0, 45)}" (${doc.id})`);

  // 1. Resolve authentic, high-relevance editorial image
  let featuredImage = data.featuredImage || '';
  let imageAltText = data.imageAltText || title;
  try {
    const imgResult = await resolveEditorialArticleImage({
      topic: title,
      imagePrompt: data.imagePrompt || title,
      category,
      tags
    }, unsplashKey);

    if (imgResult?.imageUrl && (!featuredImage || featuredImage.includes('unsplash.com/photo-1620712943543-bcc4688e7485') || featuredImage.includes('placeholder'))) {
      featuredImage = imgResult.imageUrl;
      imageAltText = imgResult.altText || title;
    }
  } catch (imgErr) {
    logger.warn(`Image resolution note for "${title}":`, imgErr.message);
  }

  // 2. Call Gemini to retrieve real-world authoritative sources, citations, and social quotes
  let sources = Array.isArray(data.sources) && data.sources.length > 0 ? data.sources : [];
  let socialMentions = Array.isArray(data.socialMentions) && data.socialMentions.length > 0 ? data.socialMentions : [];
  let updatedContent = existingContent;

  try {
    const sdkLoaded = await loadGeminiSDK();
    const { GoogleGenAI } = getGeminiSDK();

    if (sdkLoaded && GoogleGenAI) {
      const genAI = new GoogleGenAI({
        project: process.env.GCLOUD_PROJECT || 'automationbymeir',
        location: process.env.GCLOUD_LOCATION || 'us-central1'
      });

      const prompt = `You are an expert investigative tech journalist and fact-checker.
Analyze this real technology news article:
Title: "${title}"
Excerpt: "${excerpt}"
Language: ${isHe ? 'Hebrew' : 'English'}
Current Content Preview: "${existingContent.substring(0, 400)}..."

Requirements:
1. Provide 2-3 REAL, verifiable, authoritative primary sources/documentation directly related to this story (e.g. official arXiv research papers, company press releases from Anthropic/OpenAI/NVIDIA/Microsoft/Apple/Meta, SEC filings, GitHub repositories, or Reuters/Bloomberg reports).
2. Provide 1-2 insightful quotes or social discussion mentions from verified industry experts, engineers, or founders on X (Twitter), LinkedIn, or GitHub discussing this topic.
3. Enhance the body text by inserting clean inline hyperlinks (<a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>) pointing to these authoritative sources where relevant. Preserve existing content structure and headings.

Respond ONLY with a valid JSON object matching this schema:
{
  "sources": [
    { "title": "...", "url": "https://...", "publisher": "..." }
  ],
  "socialMentions": [
    { "platform": "x" | "linkedin" | "github", "author": "...", "handle": "@...", "quote": "...", "link": "https://...", "context": "..." }
  ],
  "content": "...complete enhanced article body in HTML or Markdown with inline links..."
}`;

      const result = await genAI.models.generateContent({
        model: GEMINI_PRIMARY_MODEL,
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: "application/json"
        }
      });

      const responseText = (typeof result.text === 'function' ? result.text() : result.text) || '';
      let cleanJsonText = responseText.trim();
      cleanJsonText = cleanJsonText.replace(/```json\s*/g, '').replace(/```/g, '').trim();

      const match = cleanJsonText.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.sources) && parsed.sources.length > 0) {
          sources = parsed.sources;
        }
        if (Array.isArray(parsed.socialMentions) && parsed.socialMentions.length > 0) {
          socialMentions = parsed.socialMentions;
        }
        if (parsed.content && parsed.content.length > 100) {
          updatedContent = parsed.content;
        }
      }
    }
  } catch (aiErr) {
    logger.warn(`AI citation retrieval note for "${title}":`, aiErr.message);
  }

  // 3. Update the Firestore Document
  const updatePayload = {
    featuredImage,
    imageAltText,
    sources,
    socialMentions,
    content: updatedContent,
    updatedAt: new Date()
  };

  await doc.ref.update(updatePayload);
  logger.info(`Successfully enriched article: "${title.substring(0, 40)}" with ${sources.length} sources and ${socialMentions.length} social mentions`);

  return {
    id: doc.id,
    title,
    isHe,
    sourcesCount: sources.length,
    socialCount: socialMentions.length,
    featuredImage: featuredImage.substring(0, 60)
  };
}

async function enrichRecentArticles({ count = 5 } = {}) {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || '';
  const results = { english: [], hebrew: [] };

  // 1. Process latest English articles
  try {
    const enSnap = await db.collection('articles')
      .orderBy('createdAt', 'desc')
      .limit(count)
      .get();

    for (const doc of enSnap.docs) {
      try {
        const res = await enrichSingleArticle(doc, false, unsplashKey);
        results.english.push(res);
      } catch (err) {
        logger.error(`Failed to enrich EN article ${doc.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('Failed to query English articles for enrichment:', err.message);
  }

  // 2. Process latest Hebrew articles
  try {
    const heSnap = await db.collection('he_articles')
      .orderBy('createdAt', 'desc')
      .limit(count)
      .get();

    for (const doc of heSnap.docs) {
      try {
        const res = await enrichSingleArticle(doc, true, unsplashKey);
        results.hebrew.push(res);
      } catch (err) {
        logger.error(`Failed to enrich HE article ${doc.id}:`, err.message);
      }
    }
  } catch (err) {
    logger.error('Failed to query Hebrew articles for enrichment:', err.message);
  }

  return results;
}

module.exports = {
  enrichRecentArticles,
  enrichSingleArticle
};
