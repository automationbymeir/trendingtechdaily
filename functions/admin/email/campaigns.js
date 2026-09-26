// campaigns.js
const { onCall, HttpsError } = require("firebase-functions/v2/https"); // Import v2 onCall and HttpsError
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance
const logger = require("firebase-functions/logger"); // Import v2 logger

// Create or update a campaign
const saveCampaignHandler = async (request) => {
  // Verify authentication
  if (!request.auth) {
    logger.warn("saveCampaign: Unauthenticated access attempt");
    throw new HttpsError("unauthenticated", "You must be logged in to manage email campaigns.");
  }
  
  try {
    const { id, name, subject, templateId, listIds, scheduleNow, scheduledFor: scheduledForISO } = request.data;
    
    // Validate required fields
    if (!name || !subject || !templateId || !listIds || listIds.length === 0) {
      throw new HttpsError("invalid-argument", "Missing required campaign fields: name, subject, templateId, or listIds.");
    }
    
    // Campaign data
    const campaignData = {
      name,
      subject,
      templateId,
      listIds,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Handle scheduling
    if (scheduleNow) {
      campaignData.status = "scheduled";
      campaignData.scheduledFor = admin.firestore.FieldValue.serverTimestamp(); // Let Firestore set the time
    } else if (scheduledForISO) {
      campaignData.status = "scheduled";
      campaignData.scheduledFor = admin.firestore.Timestamp.fromDate(new Date(scheduledForISO));
    } else {
      campaignData.status = "draft";
      campaignData.scheduledFor = admin.firestore.FieldValue.delete(); // Clear if it's a draft
    }
    
    let campaignId = id;
    
    if (campaignId) {
      // Update existing campaign
      await db.collection("campaigns").doc(campaignId).update(campaignData);
    } else {
      // Create new campaign
      campaignData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      campaignData.stats = {
        sent: 0,
        delivered: 0,
        opened: 0,
        clicked: 0,
        bounced: 0,
        unsubscribed: 0,
      };
      
      const docRef = await db.collection("campaigns").add(campaignData);
      campaignId = docRef.id;
    }
    
    return { success: true, campaignId };
  } catch (error) {
    logger.error("Error saving campaign:", error);
    // If it's already an HttpsError, rethrow it
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to save campaign.", error.message);
  }
};

// Get all campaigns
const getCampaignsHandler = async (request) => {
  // Verify authentication (using v2 request object)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email campaigns.",
    );
  }
  
  try {
    const campaignsSnapshot = await db.collection("campaigns")
      .orderBy("createdAt", "desc")
      .get();
    
    const campaigns = [];
    
    campaignsSnapshot.forEach(doc => {
      campaigns.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return { campaigns };
  } catch (error) {
    logger.error("Error getting campaigns:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to get campaigns.", error.message);
  }
};

// Get a specific campaign
const getCampaignHandler = async (request) => {
  // Verify authentication (using v2 request object)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email campaigns.",
    );
  }
  
  try {
    const { campaignId } = request.data;
    
    if (!campaignId) {
      throw new functions.https.HttpsError("invalid-argument", "Campaign ID is required");
    }
    
    const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found");
    }
    
    return {
      id: campaignDoc.id,
      ...campaignDoc.data(),
    };
  } catch (error) {
    logger.error("Error getting campaign:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to get campaign.", error.message);
  }
};

// Delete a campaign
const deleteCampaignHandler = async (request) => {
  // Verify authentication (using v2 request object)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email campaigns.",
    );
  }
  
  try {
    const { campaignId } = request.data;
    
    if (!campaignId) {
      throw new functions.https.HttpsError("invalid-argument", "Campaign ID is required");
    }
    
    // Get the campaign
    const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found");
    }
    
    const campaign = campaignDoc.data();
    
    // Check if the campaign can be deleted
    if (campaign.status === "sending" || campaign.status === "sent") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Cannot delete a campaign that has been sent or is in progress",
      );
    }
    
    // Delete any scheduled tasks for this campaign
    const tasksSnapshot = await db.collection("scheduledTasks")
      .where("campaignId", "==", campaignId)
      .get();
    
    const batch = db.batch();
    
    tasksSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // Delete the campaign
    batch.delete(db.collection("campaigns").doc(campaignId));
    
    await batch.commit();
    
    return { success: true };
  } catch (error) {
    logger.error("Error deleting campaign:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to delete campaign.", error.message);
  }
};

// Schedule a campaign
const scheduleCampaignHandler = async (request) => {
  // Verify authentication (using v2 request object)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email campaigns.",
    );
  }
  
  try {
    const { campaignId, scheduledFor } = request.data;
    
    if (!campaignId) {
      throw new functions.https.HttpsError("invalid-argument", "Campaign ID is required");
    }

    if (!scheduledFor) {
      throw new functions.https.HttpsError("invalid-argument", "Scheduled date is required");
    }
    
    // Get the campaign
    const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found");
    }
    
    const campaign = campaignDoc.data();
    
    // Check if the campaign can be scheduled
    if (campaign.status !== "draft") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only draft campaigns can be scheduled",
      );
    }
    
    // Convert scheduled date to timestamp
    const scheduledTimestamp = admin.firestore.Timestamp.fromDate(new Date(scheduledFor));
    
    // Update campaign status
    await db.collection("campaigns").doc(campaignId).update({
      status: "scheduled",
      scheduledFor: scheduledTimestamp,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  } catch (error) {
    logger.error("Error scheduling campaign:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to schedule campaign.", error.message);
  }
};

// Cancel a scheduled campaign
const cancelCampaignHandler = async (request) => {
  // Verify authentication (using v2 request object)
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email campaigns.",
    );
  }
  
  try {
    const { campaignId } = request.data;
    
    if (!campaignId) {
      throw new functions.https.HttpsError("invalid-argument", "Campaign ID is required");
    }
    
    // Get the campaign
    const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found");
    }
    
    const campaign = campaignDoc.data();
    
    // Check if the campaign can be canceled
    if (campaign.status !== "scheduled") {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Only scheduled campaigns can be canceled",
      );
    }
    
    // Update campaign status
    await db.collection("campaigns").doc(campaignId).update({
      status: "draft",
      scheduledFor: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Delete scheduled tasks for this campaign
    const tasksSnapshot = await db.collection("scheduledTasks")
      .where("campaignId", "==", campaignId)
      .where("status", "==", "pending")
      .get();
    
    const batch = db.batch();
    
    tasksSnapshot.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    
    return { success: true };
  } catch (error) {
    logger.error("Error canceling campaign:", error);
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError("internal", "Failed to cancel campaign.", error.message);
  }
};

// Process a campaign send (called by scheduler)
// Process a campaign send (called via HTTP endpoint)
// NOTE: This is an onRequest function, its definition is in sending.js
exports.processCampaignSend = require("./sending").processCampaignSend; // Assuming this is now in sending.js

// Export the v2 callable functions
exports.saveCampaign = onCall(
  { region: "us-central1" }, // Add region if not globally set
  saveCampaignHandler,
);

exports.getCampaigns = onCall(
  { region: "us-central1" },
  getCampaignsHandler,
);

exports.getCampaign = onCall(
  { region: "us-central1" },
  getCampaignHandler,
);

exports.deleteCampaign = onCall(
  { region: "us-central1" },
  deleteCampaignHandler,
);

exports.scheduleCampaign = onCall(
  { region: "us-central1" },
  scheduleCampaignHandler,
);

exports.cancelCampaign = onCall(
  { region: "us-central1" },
  cancelCampaignHandler,
);