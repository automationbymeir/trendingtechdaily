const { logger } = require("../config");

/**
 * Sanitizes and validates a URL slug
 * @param {string} slug - The URL slug to validate
 * @returns {boolean} - Whether the slug is valid
 */
function isValidSlug(slug) {
  if (!slug) return false;
  
  // More permissive regex that allows multiple consecutive hyphens
  // Allows: lowercase letters, numbers, and hyphens
  const slugRegex = /^[a-z0-9-]+$/i;
  
  // Additional validation
  return slugRegex.test(slug) && 
         slug.length <= 100 && 
         slug.length >= 3 &&
         !slug.startsWith('-') &&  // Don't start with hyphen
         !slug.endsWith('-');      // Don't end with hyphen
}

/**
 * Simple article routing handler that serves article.html
 * and lets the frontend handle the rest
 * This handles the new URL structure: /category/article-slug and /category
 */
exports.handleArticleRouting = async (req, res) => {
  try {
    const pathSegments = req.path.split("/").filter(Boolean);
    logger.info("Handling article routing for path:", req.path, "Segments:", pathSegments);
    
    // Check if this is a two-segment path (category/article)
    if (pathSegments.length === 2) {
      const [categorySlug, articleSlug] = pathSegments;
      
      // Validate slugs
      if (!isValidSlug(categorySlug) || !isValidSlug(articleSlug)) {
        logger.error("Invalid slugs detected:", { categorySlug, articleSlug });
        return res.status(404).send("Page not found");
      }
      
      logger.info("Valid article route detected:", { categorySlug, articleSlug });
      
      // Return HTML that passes routing info to the client
      const articleHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <script>
        // Store routing information for the article page to use
        sessionStorage.setItem('articleRouting', JSON.stringify({
            category: '${categorySlug}',
            slug: '${articleSlug}'
        }));
        // Redirect to article.html
        window.location.replace('/article.html');
    </script>
</head>
<body>
    <p>Loading article...</p>
    <p>If you are not redirected, <a href="/article.html">click here</a>.</p>
</body>
</html>`;
      
      res.status(200).send(articleHtml);
    } 
    // Check if this is a single-segment path (category)
    else if (pathSegments.length === 1) {
      const categorySlug = pathSegments[0];
      
      // Validate slug
      if (!isValidSlug(categorySlug)) {
        logger.error("Invalid category slug:", categorySlug);
        return res.status(404).send("Page not found");
      }
      
      logger.info("Valid category route detected:", { categorySlug });
      
      // Check if this is a valid category slug
      const { db } = require("../config");
      const categorySnapshot = await db.collection("sections")
        .where("slug", "==", categorySlug)
        .where("active", "==", true)
        .limit(1)
        .get();
      
      if (categorySnapshot.empty) {
        logger.info(`No active category found for slug: ${categorySlug}`);
        return res.status(404).send("Page not found");
      }
      
      // Return HTML that redirects to category.html with the slug
      const categoryHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <script>
        // Store routing information for the category page to use
        sessionStorage.setItem('categoryRouting', '${categorySlug}');
        // Redirect to category.html
        window.location.replace('/category.html');
    </script>
</head>
<body>
    <p>Loading category...</p>
    <p>If you are not redirected, <a href="/category.html">click here</a>.</p>
</body>
</html>`;
      
      res.status(200).send(categoryHtml);
    } else {
      // Not a valid path
      logger.info("Not a valid path, passing to next handler");
      res.status(404).send("Page not found");
    }
    
  } catch (error) {
    logger.error("Error in handleArticleRouting:", error);
    res.status(404).send("Page not found");
  }
};

/**
 * Handles legacy redirects from old URL structure to new
 */
exports.handleLegacyRedirects = async (req, res, next) => {
  try {
    const urlPath = req.path;
    const { db } = require("../config");
    
    logger.info(`Processing potential legacy redirect for path: ${urlPath}`);
    
    // Handle old article URLs with query parameters
    if (urlPath === "/article.html" && req.query.slug) {
      const slug = req.query.slug;
      logger.info(`Found legacy article URL with slug: ${slug}`);
      
      // Look up the article to get its category
      const articleSnapshot = await db.collection("articles")
        .where("slug", "==", slug)
        .where("published", "==", true)
        .limit(1)
        .get();
      
      if (!articleSnapshot.empty) {
        const article = articleSnapshot.docs[0].data();
        const articleId = articleSnapshot.docs[0].id;
        
        // Get category information
        const categoryDoc = await db.collection("sections").doc(article.category).get();
        if (categoryDoc.exists) {
          const category = categoryDoc.data();
          const categorySlug = category.slug || article.category.toLowerCase();
          const newUrl = `/${categorySlug}/${slug}`;
          
          logger.info(`Redirecting old article URL to new format: ${newUrl}`);
          return res.redirect(301, newUrl);
        } else {
          logger.warn(`Category not found for article: ${articleId}`);
          // Fallback: use category ID as slug
          const newUrl = `/${article.category.toLowerCase()}/${slug}`;
          return res.redirect(301, newUrl);
        }
      } else {
        logger.warn(`Article not found for legacy slug: ${slug}`);
        // Continue to serve the old article.html page
        return next();
      }
    }
    
    // Handle old article URLs with ID parameter
    if (urlPath === "/article.html" && req.query.id) {
      const articleId = req.query.id;
      logger.info(`Found legacy article URL with ID: ${articleId}`);
      
      // Look up the article by ID
      const articleDoc = await db.collection("articles").doc(articleId).get();
      if (articleDoc.exists && articleDoc.data().published) {
        const article = articleDoc.data();
        
        // Get category information
        const categoryDoc = await db.collection("sections").doc(article.category).get();
        if (categoryDoc.exists) {
          const category = categoryDoc.data();
          const categorySlug = category.slug || article.category.toLowerCase();
          const articleSlug = article.slug || articleId;
          const newUrl = `/${categorySlug}/${articleSlug}`;
          
          logger.info(`Redirecting old article ID URL to new format: ${newUrl}`);
          return res.redirect(301, newUrl);
        }
      } else {
        logger.warn(`Article not found for legacy ID: ${articleId}`);
        return next();
      }
    }

    // Handle other legacy static page URLs
    const legacyUrls = {
      "/about.html": "/about",
      "/contact.html": "/contact", 
      "/privacy.html": "/privacy",
      "/terms.html": "/terms",
    };

    const newUrl = legacyUrls[urlPath];
    if (newUrl) {
      logger.info(`Redirecting legacy static URL ${urlPath} to ${newUrl}`);
      return res.redirect(301, newUrl);
    }

    // Not a legacy URL, continue to next middleware
    next();
  } catch (error) {
    logger.error("Error in legacy redirects:", error);
    // Don't break the request chain on error
    next();
  }
};

/**
 * Handle dynamic routing for single-segment paths (categories)
 */
exports.handleDynamicRouting = async (req, res) => {
  try {
    const urlPath = req.path.substring(1); // Remove leading slash
    logger.info("Handling dynamic routing for path:", urlPath);
    
    // Skip if path contains multiple segments (handled by article routing)
    if (urlPath.includes("/")) {
      return res.status(404).send("Page not found");
    }
    
    // Validate slug
    if (!isValidSlug(urlPath)) {
      logger.error("Invalid category slug:", urlPath);
      return res.status(404).send("Page not found");
    }
    
    // Check if this is a valid category slug
    const { db } = require("../config");
    const categorySnapshot = await db.collection("sections")
      .where("slug", "==", urlPath)
      .where("active", "==", true)
      .limit(1)
      .get();
    
    if (categorySnapshot.empty) {
      logger.info(`No active category found for slug: ${urlPath}`);
      return res.status(404).send("Page not found");
    }
    
    // Return HTML that redirects to category.html with the slug
    const categoryHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Loading...</title>
    <script>
        // Store routing information for the category page to use
        sessionStorage.setItem('categoryRouting', '${urlPath}');
        // Redirect to category.html
        window.location.replace('/category.html');
    </script>
</head>
<body>
    <p>Loading category...</p>
    <p>If you are not redirected, <a href="/category.html">click here</a>.</p>
</body>
</html>`;
    
    res.status(200).send(categoryHtml);
    
  } catch (error) {
    logger.error("Error in handleDynamicRouting:", error);
    res.status(404).send("Page not found");
  }
};