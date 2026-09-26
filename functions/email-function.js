const functions = require("firebase-functions");
const axios = require("axios");

// Simple email function that doesn't use auth triggers
exports.manualSendWelcomeEmail = functions.https.onCall(async (data, context) => {
  try {
    // Get data from the callable function parameters
    const userEmail = data.email;
    const userName = data.name || "";
    const userUid = data.uid;

    // Basic validation
    if (!userEmail) {
      throw new functions.https.HttpsError("invalid-argument", "Email required");
    }

    console.log(`Manual welcome email request for: ${userEmail}`);
    
    // For testing purposes, just return success without making the external call
    return { 
      success: true, 
      message: "Welcome email process initiated",
      data: { email: userEmail, name: userName, uid: userUid },
    };
  } catch (error) {
    console.error("Error in manualSendWelcomeEmail:", error);
    throw new functions.https.HttpsError("internal", "Failed to process welcome email");
  }
});