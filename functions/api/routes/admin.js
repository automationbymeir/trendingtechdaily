// functions/api/routes/admin.js

const express = require("express");
const router = express.Router();
const { requireAdmin } = require("../../middleware/auth");
const { logger } = require("../../config");

let uploadsAdmin;
try {
  // This path should be correct: api/routes/admin.js -> admin/uploads.js
  uploadsAdmin = require("../../admin/uploads");
  if (!uploadsAdmin || typeof uploadsAdmin.uploadFile !== "function") {
    logger.error("Critical: 'uploadsAdmin' module loaded but 'uploadFile' function is missing or not a function. Uploads will fail.");
    // uploadsAdmin will be set, but the check below will prevent its use if uploadFile is invalid
  } else {
    logger.info("'uploadsAdmin' module loaded successfully with 'uploadFile' function.");
  }
} catch (e) {
  logger.error("Critical Error: Could not load the 'uploads' admin module from '../../admin/uploads'. Uploads will be completely unavailable.", e.message, e.stack);
  // If require itself fails, uploadsAdmin will remain undefined.
  // The route handler below will then correctly state that functionality is unavailable.
}

const { enrichRecentArticles } = require("../../services/articleEnrichmentService");

router.post("/upload", requireAdmin, (req, res) => {
  logger.info("POST /admin/upload route hit.");
  if (uploadsAdmin && typeof uploadsAdmin.uploadFile === "function") {
    uploadsAdmin.uploadFile(req, res);
  } else {
    logger.error("Upload functionality is not available because 'uploadsAdmin.uploadFile' is not a valid function.");
    res.status(500).json({ error: "Upload functionality is currently unavailable due to a server-side configuration issue." });
  }
});

router.all("/enrich-recent-articles", async (req, res) => {
  logger.info("ALL /admin/enrich-recent-articles called.");
  try {
    const count = parseInt(req.query.count || req.body?.count || 4, 10);
    const results = await enrichRecentArticles({ count });
    res.status(200).json({ success: true, count, results });
  } catch (error) {
    logger.error("Error in /admin/enrich-recent-articles:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/admin-test-route", (req, res) => {
  logger.info("GET /admin/admin-test-route called (full admin.js)");
  res.status(200).send("Full Admin GET route is responding.");
});

logger.info("Full admin.js router module loaded.");
module.exports = router;