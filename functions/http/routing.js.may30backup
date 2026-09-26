const { logger } = require('../config');
const path = require('path');
const fs = require('fs');
const express = require('express');
const admin = require('firebase-admin');
const db = admin.firestore();

/**
 * Sanitizes and validates a URL slug
 * @param {string} slug - The URL slug to validate
 * @returns {boolean} - Whether the slug is valid
 */
function isValidSlug(slug) {
  if (!slug) return false;
  // More permissive regex that allows longer slugs with multiple hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
  // Add additional validation for length
  return slugRegex.test(slug) && slug.length <= 100 && slug.length >= 3;
}

/**
 * Gets article data from Firestore by document ID
 * @param {string} docId - The Firestore document ID
 * @returns {Promise<Object|null>} - The article data or null if not found
 */
async function getArticleById(docId) {
  try {
    const doc = await admin.firestore().collection('articles').doc(docId).get();
    if (!doc.exists) {
      logger.info(`Article not found by ID: ${docId}`);
      return null;
    }
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    logger.error('Error getting article by ID:', error);
    return null;
  }
}

/**
 * Gets article data from Firestore by slug
 * @param {string} slug - The article slug
 * @returns {Promise<Object|null>} - The article data or null if not found
 */
async function getArticleBySlug(slug) {
  try {
    const articlesRef = db.collection('articles');
    const snapshot = await articlesRef
      .where('slug', '==', slug)
      .where('published', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      logger.info(`No article found with slug: ${slug}`);
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    logger.error('Error getting article by slug:', error);
    return null;
  }
}

/**
 * Gets section data from Firestore by slug
 * @param {string} slug - The section slug
 * @returns {Promise<Object|null>} - The section data or null if not found
 */
async function getSectionBySlug(slug) {
  try {
    const sectionsRef = db.collection('sections');
    const snapshot = await sectionsRef
      .where('slug', '==', slug)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (snapshot.empty) {
      logger.info(`No section found with slug: ${slug}`);
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    };
  } catch (error) {
    logger.error('Error getting section by slug:', error);
    return null;
  }
}

/**
 * Serves the article.html file
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Object} article - The article data
 */
function serveArticleHTML(req, res, article) {
  try {
    // Set headers for better SEO and caching
    res.set({
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      'X-Article-Category': article.category,
      'X-Article-Slug': article.slug,
      'X-Article-ID': article.id,
      'Content-Type': 'text/html'
    });

    // Serve the article.html file
    const publicDir = path.join(process.cwd(), 'public');
    const articlePath = path.join(publicDir, 'article.html');
    
    logger.info(`Serving article.html from: ${articlePath}`);
    
    if (fs.existsSync(articlePath)) {
      res.sendFile(articlePath, (err) => {
        if (err) {
          logger.error('Error sending article.html:', err);
          if (!res.headersSent) {
            res.status(500).send('Internal Server Error');
          }
        }
      });
    } else {
      logger.error(`article.html not found at: ${articlePath}`);
      res.status(404).redirect('/404.html');
    }
  } catch (error) {
    logger.error('Error serving article HTML:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
}

/**
 * Handles article routing with the new URL structure
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleArticleRouting = async (req, res) => {
  try {
    const pathParts = req.path.split('/').filter(Boolean);
    logger.info('Handling article routing for path:', req.path, 'Parts:', pathParts);

    if (pathParts.length < 1) {
      logger.error('Invalid URL path:', req.path);
      res.status(404).send('Not Found');
      return;
    }

    const categorySlug = pathParts[0];
    const articleSlug = pathParts[1];

    // If no article slug, redirect to category page
    if (!articleSlug) {
      res.redirect(`/${categorySlug}`);
      return;
    }

    // Validate slugs
    if (!isValidSlug(categorySlug) || !isValidSlug(articleSlug)) {
      logger.error('Invalid slugs:', { categorySlug, articleSlug });
      res.status(404).send('Not Found');
      return;
    }

    // Get section first
    const section = await getSectionBySlug(categorySlug);
    if (!section) {
      logger.error('Section not found:', categorySlug);
      res.status(404).send('Not Found');
      return;
    }

    // Get article
    const article = await getArticleBySlug(articleSlug);
    if (!article) {
      logger.error('Article not found:', articleSlug);
      res.status(404).send('Not Found');
      return;
    }

    // Verify article belongs to the category
    if (article.category !== section.id) {
      logger.error('Article does not belong to category:', { articleSlug, categorySlug });
      res.status(404).send('Not Found');
      return;
    }

    // Serve the article page
    res.sendFile('article.html', { root: './public' });

  } catch (error) {
    logger.error('Error in handleArticleRouting:', error);
    res.status(500).send('Internal Server Error');
  }
};

/**
 * Handles redirects from old URLs to new URL structure
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
exports.handleLegacyRedirects = (req, res, next) => {
  try {
    const urlPath = req.path;
    logger.info(`Processing legacy redirect for path: ${urlPath}`);
    
    // Handle old article.html?id=xyz URLs
    if (urlPath === '/article.html' && req.query.id) {
      const articleId = req.query.id;
      // Extract category and slug from the article ID if it's in the format "category:slug"
      const [category, slug] = articleId.split(':');
      
      if (category && slug) {
        const newPath = `/${category.toLowerCase()}/${slug}`;
        logger.info(`Redirecting legacy article.html?id=${articleId} to: ${newPath}`);
        return res.redirect(301, newPath);
      }
    }

    // Handle other legacy URLs
    const legacyUrls = {
      '/about.html': '/about',
      '/contact.html': '/contact',
      '/privacy.html': '/privacy',
      '/terms.html': '/terms'
    };

    const newUrl = legacyUrls[urlPath];
    if (newUrl) {
      logger.info(`Redirecting legacy URL ${urlPath} to ${newUrl}`);
      return res.redirect(301, newUrl);
    }

    // If no redirect is found, continue to next middleware
    next();
  } catch (error) {
    logger.error('Error in legacy redirects:', error);
    next();
  }
};