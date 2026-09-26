//index.js
const admin = require("firebase-admin");
const templates = require("./templates");
const campaigns = require("./campaigns");
const tracking = require("./tracking");
const workflows = require("./workflows");
const sending = require("./sending");

// This ensures admin is initialized
try {
  admin.initializeApp();
} catch (error) {
  // App already initialized
}

// Export all email functionality
module.exports = {
  templates,
  campaigns,
  tracking,
  workflows,
  sending,
};