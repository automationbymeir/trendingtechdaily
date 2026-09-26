
// const functions = require('firebase-functions'); // No longer needed for v2 scheduler
const fetch = require("node-fetch"); // Ensure node-fetch@2 is in your package.json
const { onSchedule } = require("firebase-functions/v2/scheduler"); // Import v2 scheduler

// Ensure these environment variables are set by Firebase or configure them.
const REGION = process.env.FUNCTION_REGION || "us-central1"; // Default if not set
const PROJECT_ID = process.env.GCLOUD_PROJECT;

/**
 * Calls an HTTP Cloud Function.
 * @param {string} functionName The name of the HTTP function to call.
 * @param {string} callerName The name of the calling scheduler function (for logging).
 */
async function callHttpFunction(functionName, callerName) {
  if (!PROJECT_ID) {
    console.error(`[${callerName}] GCLOUD_PROJECT environment variable not set. Cannot construct function URL.`);
    return;
  }
  if (!REGION) {
    console.error(`[${callerName}] FUNCTION_REGION environment variable not set. Cannot construct function URL.`);
    return;
  }

  // Construct the URL for HTTP-triggered functions (v1 functions.https.onRequest)
  const functionUrl = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`;

  try {
    console.log(`[${callerName}] Triggering ${functionName} at ${functionUrl}`);
    // Using POST as a general method, GET would also work if the target function doesn't expect a body.
    const response = await fetch(functionUrl, {
      method: "POST", // Your processCampaignSend and processEmailQueue are onRequest, POST is fine.
      headers: { "Content-Type": "application/json" },
      // body: JSON.stringify({}) // Send an empty JSON body if needed
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${callerName}] Failed to trigger ${functionName}: ${response.status} ${errorText}`);
      throw new Error(`Failed to trigger ${functionName}: ${response.status} ${errorText}`);
    }
    const responseText = await response.text();
    console.log(`[${callerName}] ${functionName} triggered successfully. Response: ${responseText}`);
  } catch (error) {
    console.error(`[${callerName}] Error triggering ${functionName}:`, error);
  }
}

/**
 * Scheduled function to trigger the campaign processing.
 * Runs every minute.
 */
exports.triggerProcessCampaignSend = onSchedule({
  schedule: "every 1 minutes", // Schedule string (Cloud Scheduler format)
  region: REGION,
}, async (context) => {
  await callHttpFunction("processCampaignSend", "triggerProcessCampaignSend");
  return null;
});

/**
 * Scheduled function to trigger the email queue processing.
 * Runs every 1 minutes. (Adjust frequency as needed in the schedule string)
 */
exports.triggerProcessEmailQueue = onSchedule({
  schedule: "every 1 minutes", // Schedule string (Cloud Scheduler format)
  region: REGION,
}, async (context) => {
  await callHttpFunction("processEmailQueue", "triggerProcessEmailQueue");
  return null;
});