// functions/api/routes/articles.js

const express = require("express");
const router = express.Router();

// Local dependencies
const { requireAdmin } = require("../../middleware/auth"); // Path: api/routes -> middleware
const { logger } = require("../../config"); // Path: api/routes -> config

// This is where the admin logic for articles is imported
let articlesAdmin;
try {
  // Path: api/routes/articles.js -> admin/articles.js = ../../admin/articles
  articlesAdmin = require("../../admin/articles"); 
} catch (e) {
  logger.error("Could not load the 'articles' admin module from '../../admin/articles'. Article routes will not work.", e.message);
  // To make the error more explicit if this module fails to load:
  // throw new Error("Critical: articlesAdmin module failed to load. " + e.message); 
}

// === PUBLIC ROUTES ===
router.get("/", async (req, res) => {
  if (!articlesAdmin || typeof articlesAdmin.getAllArticles !== "function") {
    logger.error("articlesAdmin.getAllArticles is not available.");
    return res.status(500).json({ error: "Articles service not loaded or getAllArticles function missing." });
  }
  try {
    const articles = await articlesAdmin.getAllArticles();
    res.status(200).json(articles);
  } catch (error) {
    logger.error("Error getting all articles:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve articles." });
  }
});

router.get("/:id", async (req, res) => {
  if (!articlesAdmin || typeof articlesAdmin.getArticleById !== "function") {
    logger.error("articlesAdmin.getArticleById is not available.");
    return res.status(500).json({ error: "Articles service not loaded or getArticleById function missing." });
  }
  try {
    const article = await articlesAdmin.getArticleById(req.params.id);
    // getArticleById should throw an error if not found, which will be caught below
    res.status(200).json(article);
  } catch (error) {
    logger.error(`Error getting article ${req.params.id}:`, error);
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to retrieve the article." });
  }
});

// === ADMIN ROUTES ===
router.post("/", requireAdmin, async (req, res) => {
  if (!articlesAdmin || typeof articlesAdmin.createArticle !== "function") {
    logger.error("articlesAdmin.createArticle is not available.");
    return res.status(500).json({ error: "Articles service not loaded or createArticle function missing." });
  }
  try {
    logger.info("API: Received article data for creation:", req.body);
    const article = await articlesAdmin.createArticle(req.body);
    res.status(201).json(article);
  } catch (error) {
    logger.error("API Error in POST /articles:", error);
    res.status(500).json({ error: error.message || "Failed to create the article." });
  }
});

router.put("/:id", requireAdmin, async (req, res) => {
  if (!articlesAdmin || typeof articlesAdmin.updateArticle !== "function") {
    logger.error("articlesAdmin.updateArticle is not available.");
    return res.status(500).json({ error: "Articles service not loaded or updateArticle function missing." });
  }
  try {
    const article = await articlesAdmin.updateArticle(req.params.id, req.body);
    // updateArticle should throw an error if not found
    res.status(200).json(article);
  } catch (error) {
    logger.error(`API Error in PUT /articles/${req.params.id}:`, error);
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to update the article." });
  }
});

router.delete("/:id", requireAdmin, async (req, res) => {
  if (!articlesAdmin || typeof articlesAdmin.deleteArticle !== "function") {
    logger.error("articlesAdmin.deleteArticle is not available.");
    return res.status(500).json({ error: "Articles service not loaded or deleteArticle function missing." });
  }
  try {
    await articlesAdmin.deleteArticle(req.params.id);
    res.status(200).json({ success: true, message: "Article deleted successfully." });
  } catch (error) {
    logger.error(`API Error in DELETE /articles/${req.params.id}:`, error);
    if (error.status === 404) {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to delete the article." });
  }
});

// IMPORTANT: Ensure the router is exported.
module.exports = router;