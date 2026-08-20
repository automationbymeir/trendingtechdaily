// functions/callable/search.js
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require('../config');
const admin = require('firebase-admin');
const { loadGeminiSDK, getGeminiSDK, buildGenerateContentRequest, getSafetySettings } = require('../utils');

/**
 * Enhanced search function with AI-powered suggestions
 */
async function searchArticles(request) {
    if (!request.auth) {
        // Allow unauthenticated searches but with rate limiting
        logger.info("Unauthenticated search request");
    }

    const { query, limit = 20, offset = 0, filters = {} } = request.data;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
        throw new HttpsError("invalid-argument", "Search query must be at least 2 characters long");
    }

    const searchQuery = query.trim().toLowerCase();
    logger.info(`Search request for: "${searchQuery}" with filters:`, filters);

    try {
        const db = admin.firestore();
        const searchTerms = searchQuery.split(' ').filter(term => term.length > 2);
        
        // Build base query
        let articlesQuery = db.collection('articles')
            .where('status', '==', 'published');

        // Apply filters
        if (filters.category) {
            articlesQuery = articlesQuery.where('category', '==', filters.category);
        }

        if (filters.dateFrom) {
            articlesQuery = articlesQuery.where('publishedAt', '>=', new Date(filters.dateFrom));
        }

        if (filters.dateTo) {
            articlesQuery = articlesQuery.where('publishedAt', '<=', new Date(filters.dateTo));
        }

        // Execute query
        const snapshot = await articlesQuery
            .orderBy('publishedAt', 'desc')
            .limit(100) // Get more results for filtering
            .get();

        const allArticles = [];
        
        snapshot.forEach(doc => {
            const article = { id: doc.id, ...doc.data() };
            
            // Calculate relevance score
            const relevanceScore = calculateRelevanceScore(article, searchTerms);
            
            if (relevanceScore > 0) {
                allArticles.push({
                    ...article,
                    relevanceScore,
                    // Convert Firestore timestamp to ISO string
                    publishedAt: article.publishedAt?.toDate?.()?.toISOString() || null
                });
            }
        });

        // Sort by relevance score
        allArticles.sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Apply pagination
        const paginatedResults = allArticles.slice(offset, offset + limit);

        // Log search analytics
        await logSearchAnalytics(searchQuery, allArticles.length, request.auth?.uid);

        return {
            success: true,
            results: paginatedResults,
            total: allArticles.length,
            query: searchQuery,
            offset,
            limit
        };

    } catch (error) {
        logger.error("Search error:", error);
        throw new HttpsError("internal", "Search failed. Please try again.");
    }
}

/**
 * Calculate relevance score for search results
 */
function calculateRelevanceScore(article, searchTerms) {
    let score = 0;
    const title = (article.title || '').toLowerCase();
    const content = stripHtml(article.content || '').toLowerCase();
    const excerpt = (article.excerpt || '').toLowerCase();
    const tags = (article.tags || []).map(tag => tag.toLowerCase());
    const author = (article.author || '').toLowerCase();

    searchTerms.forEach(term => {
        // Exact matches in title (highest weight)
        if (title === term) score += 20;
        else if (title.includes(term)) score += 10;
        
        // Matches in excerpt
        if (excerpt.includes(term)) score += 5;
        
        // Tag matches
        tags.forEach(tag => {
            if (tag === term) score += 8;
            else if (tag.includes(term)) score += 3;
        });
        
        // Author matches
        if (author.includes(term)) score += 4;
        
        // Content matches (count occurrences)
        const contentMatches = (content.match(new RegExp(term, 'gi')) || []).length;
        score += Math.min(contentMatches * 0.5, 5); // Cap content score
    });

    // Boost recent articles slightly
    if (article.publishedAt) {
        const daysSincePublished = (Date.now() - article.publishedAt.toMillis()) / (1000 * 60 * 60 * 24);
        if (daysSincePublished < 7) score += 2;
        else if (daysSincePublished < 30) score += 1;
    }

    return score;
}

/**
 * Get AI-powered search suggestions
 */
async function getSearchSuggestions(request) {
    const { query, previousResults = [] } = request.data;

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
        throw new HttpsError("invalid-argument", "Query must be at least 2 characters long");
    }

    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenAI) {
            throw new HttpsError("internal", "AI service not available");
        }

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

        // Create context from previous results
        const context = previousResults.length > 0 
            ? `Based on these search results: ${previousResults.map(r => r.title).join(', ')}` 
            : '';

        const prompt = `
            Generate search suggestions for a tech news website based on the query: "${query}"
            ${context}
            
            Provide:
            1. 3 related search terms
            2. 2 trending topics in this area
            3. 1 advanced search tip
            
            Format as JSON:
            {
                "relatedTerms": ["term1", "term2", "term3"],
                "trendingTopics": ["topic1", "topic2"],
                "searchTip": "tip text"
            }
        `;

        const result = await genAI.models.generateContent(
            buildGenerateContentRequest(prompt, {
                model: "gemini-1.5-flash",
                safetySettings: getSafetySettings(),
            }),
        );
        const response = (typeof result.text === "function" ? result.text() : result.text) || "";
        
        // Parse JSON from response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const suggestions = JSON.parse(jsonMatch[0]);
            return {
                success: true,
                suggestions
            };
        }

        throw new Error("Invalid AI response format");

    } catch (error) {
        logger.error("AI suggestions error:", error);
        
        // Return fallback suggestions
        return {
            success: true,
            suggestions: {
                relatedTerms: generateFallbackTerms(query),
                trendingTopics: ["AI Development", "Tech Innovation"],
                searchTip: "Use quotes for exact phrases, e.g., \"artificial intelligence\""
            }
        };
    }
}

/**
 * Search with both Gemini and Grok for comprehensive results
 */
async function enhancedSearch(request) {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "Authentication required for enhanced search");
    }

    const { query, includeAIAnalysis = true } = request.data;

    try {
        // First, get regular search results
        const searchResults = await searchArticles(request);

        if (!includeAIAnalysis || searchResults.results.length === 0) {
            return searchResults;
        }

        // Get AI insights in parallel
        const [geminiInsights, grokInsights] = await Promise.allSettled([
            getGeminiInsights(query, searchResults.results),
            getGrokInsights(query)
        ]);

        // Combine results
        const enhancedResults = {
            ...searchResults,
            aiInsights: {
                gemini: geminiInsights.status === 'fulfilled' ? geminiInsights.value : null,
                grok: grokInsights.status === 'fulfilled' ? grokInsights.value : null
            }
        };

        return enhancedResults;

    } catch (error) {
        logger.error("Enhanced search error:", error);
        throw new HttpsError("internal", "Enhanced search failed");
    }
}

/**
 * Get Gemini insights for search results
 */
async function getGeminiInsights(query, results) {
    try {
        const sdkLoaded = await loadGeminiSDK();
        const { GoogleGenAI } = getGeminiSDK();
        if (!sdkLoaded || !GoogleGenAI) {
            return null;
        }

        const genAI = new GoogleGenAI({ project: process.env.GCLOUD_PROJECT || 'automationbymeir', location: process.env.GCLOUD_LOCATION || 'us-central1' });

        const resultsContext = results.slice(0, 5).map(r => `- ${r.title}: ${r.excerpt}`).join('\n');

        const prompt = `
            Analyze these search results for the query "${query}":
            ${resultsContext}
            
            Provide:
            1. A brief summary of the main themes (2-3 sentences)
            2. Key insights or patterns
            3. What might be missing or worth exploring further
            
            Be concise and factual.
        `;

        const result = await genAI.models.generateContent(
            buildGenerateContentRequest(prompt, {
                model: "gemini-1.5-flash",
                safetySettings: getSafetySettings(),
            }),
        );
        return {
            summary: (typeof result.text === "function" ? result.text() : result.text) || "",
            source: 'gemini'
        };

    } catch (error) {
        logger.error("Gemini insights error:", error);
        return null;
    }
}

/**
 * Get Grok insights for search query
 */
async function getGrokInsights(query) {
    try {
        const GROK_API_KEY = process.env.GROK_API_KEY;
        if (!GROK_API_KEY) return null;

        const response = await fetch("https://api.x.ai/v1/chat/completions", {
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
                        content: "You are a tech news analyst. Provide trending insights and emerging topics."
                    },
                    {
                        role: "user",
                        content: `What are the latest trends and developments related to "${query}" in technology? Be specific and current.`
                    }
                ],
                temperature: 0.7,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            throw new Error(`Grok API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        return {
            insights: content || "No insights available",
            source: 'grok'
        };

    } catch (error) {
        logger.error("Grok insights error:", error);
        return null;
    }
}

// Helper functions
function stripHtml(html) {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function generateFallbackTerms(query) {
    const terms = [];
    const baseQuery = query.toLowerCase();
    
    // Add variations
    if (!baseQuery.includes('latest')) terms.push(`latest ${query}`);
    if (!baseQuery.includes('news')) terms.push(`${query} news`);
    if (!baseQuery.includes('2024') && !baseQuery.includes('2025')) {
        terms.push(`${query} 2025`);
    }
    
    return terms.slice(0, 3);
}

async function logSearchAnalytics(query, resultCount, userId) {
    try {
        const db = admin.firestore();
        await db.collection('searchAnalytics').add({
            query,
            resultCount,
            userId: userId || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            date: new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        logger.error("Failed to log search analytics:", error);
        // Don't throw - this is not critical
    }
}

// Export functions
module.exports = {
    searchArticles,
    getSearchSuggestions,
    enhancedSearch
};