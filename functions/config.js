// functions/config.js

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const logger = require("firebase-functions/logger");

// Legacy GEMINI_API_KEY fallback removed. Using Vertex AI ADC.

// Initialize Firebase Admin SDK only once.
if (admin.apps.length === 0) {
  admin.initializeApp({
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'trendingtech-daily'
  });
  logger.info("Firebase Admin SDK initialized with project ID:", admin.app().options.projectId);
}

// Centralized Firestore DB instance.
const db = getFirestore();

// Centralized configuration object.
const CONFIG = {
  fallbackImages: {
    AI: "https://images.unsplash.com/photo-1677442135394-633f44004c86?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    Gadgets: "https://images.unsplash.com/photo-1526570207772-2a4269e3ac40?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    Startups: "https://images.unsplash.com/photo-1661956602116-661d5c25f9f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    Crypto: "https://images.unsplash.com/photo-1640340002902-a0588c2a6f38?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    default: "https://images.unsplash.com/photo-1488590528505-98fb2e5ea1c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
  },
};

module.exports = {
  admin,
  db,
  logger,
  CONFIG,
};