const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");

// Initialize admin if not already done
if (!admin.apps.length) {
  admin.initializeApp();
}

// Environment variables
const APPS_SCRIPT_WEB_APP_URL = process.env.APPS_SCRIPT_WEB_APP_URL;
const APPS_SCRIPT_SECRET_TOKEN = process.env.APPS_SCRIPT_SECRET_TOKEN;

exports.sendWelcomeEmail = functions.auth.user().onCreate(async (user) => {
  const userEmail = user.email;
  const userName = user.displayName || "";
  const userUid = user.uid;

  // Ensure email exists
  if (!userEmail) {
    console.warn(`New user ${userUid} created without email. Cannot send welcome.`);
    return null;
  }

  console.log(`New user signed up: ${userEmail} (UID: ${userUid}).`);
  
  // Check for environment variables
  if (!APPS_SCRIPT_WEB_APP_URL || !APPS_SCRIPT_SECRET_TOKEN) {
    console.error("Missing environment variables for Google Apps Script.");
    return null;
  }

  try {
    const response = await axios.post(APPS_SCRIPT_WEB_APP_URL, {
      token: APPS_SCRIPT_SECRET_TOKEN,
      email: userEmail,
      name: userName,
      uid: userUid,
    }, {
      headers: { "Content-Type": "application/json" },
    });

    console.log(`Welcome email processed: ${response.status}`);
    return null;
  } catch (error) {
    console.error(`Error sending welcome email: ${error.message}`);
    return null;
  }
});