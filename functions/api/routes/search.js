// functions/api/routes/search.js
const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const { logger } = require('../../config');

/**
 * GET /api/search
 * Public endpoint for searching articles
 */
router.get('/', async (req, res) => {
    try {
        const { 
            q: query, 
            category, 
            limit = 20, 
            offset = 0,
            sort = 'relevance' 
        } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Query parameter "q" must be at least 2 characters long'
            });
        }

        const db = admin.firestore();
        const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 2);

        // Start with base query
        let articlesRef = db.collection('articles')
            .where('status', '==', 'published');

        // Add category filter if provided
        if (category) {
            articlesRef = articlesRef.where('category', '==', category);
        }

        // Get articles
        const snapshot = await articlesRef
            .orderBy('publishedAt', 'desc')
            .limit(100)
            .get();

        // Process and score results
        const results = [];
        snapshot.forEach(doc => {
            const article = { id: doc.id, ...doc.data() };
            const score = calculateRelevance(article, searchTerms);
            
            if (score > 0) {
                results.push({
                    id: article.id,
                    title: article.title,
                    slug: article.slug,
                    excerpt: article.excerpt,
                    category: article.category,
                    tags: article.tags || [],
                    author: article.author,
                    publishedAt: article.publishedAt?.toDate?.() || null,
                    imageUrl: article.imageUrl,
                    views: article.views || 0,
                    relevanceScore: score
                });
            }
        });

        // Sort results
        if (sort === 'relevance') {
            results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        } else if (sort === 'date') {
            results.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        } else if (sort === 'views') {
            results.sort((a, b) => b.views - a.views);
        }

        // Apply pagination
        const paginatedResults = results.slice(
            parseInt(offset), 
            parseInt(offset) + parseInt(limit)
        );

        // Log search for analytics
        logSearch(query, results.length, req.user?.uid);

        res.json({
            success: true,
            query,
            total: results.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            results: paginatedResults
        });

    } catch (error) {
        logger.error('Search API error:', error);
        res.status(500).json({
            error: 'Search failed',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/search/suggestions
 * Get search suggestions based on query
 */
router.get('/suggestions', async (req, res) => {
    try {
        const { q: query } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Query parameter "q" must be at least 2 characters long'
            });
        }

        const db = admin.firestore();
        
        // Get popular searches that match the query
        const searchAnalytics = await db.collection('searchAnalytics')
            .where('query', '>=', query.toLowerCase())
            .where('query', '<=', query.toLowerCase() + '\uf8ff')
            .orderBy('query')
            .orderBy('resultCount', 'desc')
            .limit(5)
            .get();

        const popularSearches = [];
        searchAnalytics.forEach(doc => {
            const data = doc.data();
            if (!popularSearches.find(s => s.query === data.query)) {
                popularSearches.push({
                    query: data.query,
                    count: data.resultCount
                });
            }
        });

        // Get matching tags
        const tagsSnapshot = await db.collection('tags')
            .where('name', '>=', query.toLowerCase())
            .where('name', '<=', query.toLowerCase() + '\uf8ff')
            .orderBy('name')
            .orderBy('count', 'desc')
            .limit(5)
            .get();

        const matchingTags = [];
        tagsSnapshot.forEach(doc => {
            matchingTags.push({
                name: doc.data().name,
                count: doc.data().count || 0
            });
        });

        // Get autocomplete from article titles
        const titlesSnapshot = await db.collection('articles')
            .where('status', '==', 'published')
            .orderBy('title')
            .startAt(query)
            .endAt(query + '\uf8ff')
            .limit(5)
            .get();

        const titleSuggestions = [];
        titlesSnapshot.forEach(doc => {
            titleSuggestions.push({
                title: doc.data().title,
                slug: doc.data().slug
            });
        });

        res.json({
            success: true,
            suggestions: {
                popular: popularSearches,
                tags: matchingTags,
                articles: titleSuggestions
            }
        });

    } catch (error) {
        logger.error('Search suggestions error:', error);
        res.status(500).json({
            error: 'Failed to get suggestions',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/search/trending
 * Get trending search terms
 */
router.get('/trending', async (req, res) => {
    try {
        const db = admin.firestore();
        const { limit = 10 } = req.query;

        // Get trending searches from the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const trendingSnapshot = await db.collection('searchAnalytics')
            .where('timestamp', '>=', sevenDaysAgo)
            .orderBy('timestamp', 'desc')
            .limit(100)
            .get();

        // Aggregate search counts
        const searchCounts = {};
        trendingSnapshot.forEach(doc => {
            const query = doc.data().query;
            searchCounts[query] = (searchCounts[query] || 0) + 1;
        });

        // Sort by count and get top results
        const trending = Object.entries(searchCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, parseInt(limit))
            .map(([query, count]) => ({ query, count }));

        res.json({
            success: true,
            trending,
            period: '7_days'
        });

    } catch (error) {
        logger.error('Trending search error:', error);
        res.status(500).json({
            error: 'Failed to get trending searches',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Helper functions
function calculateRelevance(article, searchTerms) {
    let score = 0;
    const title = (article.title || '').toLowerCase();
    const content = (article.content || '').toLowerCase().replace(/<[^>]*>/g, '');
    const excerpt = (article.excerpt || '').toLowerCase();
    const tags = (article.tags || []).map(tag => tag.toLowerCase());

    searchTerms.forEach(term => {
        // Title matches (highest weight)
        if (title.includes(term)) score += 10;
        // Excerpt matches
        if (excerpt.includes(term)) score += 5;
        // Tag matches
        tags.forEach(tag => {
            if (tag.includes(term)) score += 3;
        });
        // Content matches
        const matches = (content.match(new RegExp(term, 'gi')) || []).length;
        score += Math.min(matches, 5); // Cap at 5 points per term
    });

    return score;
}

async function logSearch(query, resultCount, userId) {
    try {
        const db = admin.firestore();
        await db.collection('searchAnalytics').add({
            query: query.toLowerCase(),
            resultCount,
            userId: userId || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        logger.error('Failed to log search:', error);
    }
}

module.exports = router;