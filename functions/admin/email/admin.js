// admin.js
const admin = require("firebase-admin");

try {
  admin.initializeApp();
} catch (error) {
  // App already initialized
}

module.exports = admin;