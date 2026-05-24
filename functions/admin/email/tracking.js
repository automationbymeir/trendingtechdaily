//tracking.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance
// Track email open via tracking pixel
exports.trackOpen = functions.https.onRequest(async (req, res) => {
  const trackingId = req.query.tid;
  
  if (!trackingId) {
    res.status(400).send("Bad Request: Missing tracking ID");
    return;
  }
  
  try {
    // Log email open
    await logEmailOpen(trackingId);
    
    // Return a transparent 1x1 GIF
    res.set("Content-Type", "image/gif");
    res.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    
    // Transparent 1x1 pixel GIF
    const pixel = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
    res.status(200).send(pixel);
  } catch (error) {
    console.error("Error tracking email open:", error);
    
    // Still return the pixel even if there's an error
    res.set("Content-Type", "image/gif");
    const pixel = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");
    res.status(200).send(pixel);
  }
});

// Track link click
exports.trackClick = functions.https.onRequest(async (req, res) => {
  const trackingId = req.query.tid;
  const url = req.query.url;
  
  if (!trackingId || !url) {
    res.status(400).send("Bad Request: Missing parameters");
    return;
  }
  
  try {
    // Log link click
    await logLinkClick(trackingId, url);
    
    // Redirect to the target URL
    res.redirect(decodeURIComponent(url));
  } catch (error) {
    console.error("Error tracking link click:", error);
    
    // Still redirect even if there's an error
    res.redirect(decodeURIComponent(url));
  }
});

// Get tracking data for a campaign
exports.getCampaignTracking = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access tracking data.",
    );
  }
  
  try {
    const { campaignId } = data;
    
    if (!campaignId) {
      throw new functions.https.HttpsError("invalid-argument", "Campaign ID is required");
    }
    
    // Get campaign data
    const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
    
    if (!campaignDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Campaign not found");
    }
    
    const campaign = campaignDoc.data();
    
    // Get tracking data
    const trackingSnapshot = await db.collection("tracking")
      .where("campaignId", "==", campaignId)
      .get();
    
    // Compute stats
    const stats = {
      sent: trackingSnapshot.size,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complaints: 0,
    };
    
    // Link click data
    const linkClicks = {};
    
    trackingSnapshot.forEach(doc => {
      const data = doc.data();
      
      if (data.status === "delivered") stats.delivered++;
      if (data.openedAt) stats.opened++;
      if (data.clickedAt) stats.clicked++;
      if (data.status === "bounced") stats.bounced++;
      if (data.status === "complaint") stats.complaints++;
      
      // Process link clicks
      if (data.clickedLinks && data.clickedLinks.length > 0) {
        data.clickedLinks.forEach(link => {
          if (!linkClicks[link.url]) {
            linkClicks[link.url] = 0;
          }
          
          linkClicks[link.url]++;
        });
      }
    });
    
    // Get daily stats
    const dailyStats = {};
    
    trackingSnapshot.forEach(doc => {
      const data = doc.data();
      
      if (data.sentAt) {
        const date = data.sentAt.toDate().toISOString().split("T")[0];
        
        if (!dailyStats[date]) {
          dailyStats[date] = {
            sent: 0,
            delivered: 0,
            opened: 0,
            clicked: 0,
          };
        }
        
        dailyStats[date].sent++;
        
        if (data.status === "delivered") dailyStats[date].delivered++;
        if (data.openedAt) dailyStats[date].opened++;
        if (data.clickedAt) dailyStats[date].clicked++;
      }
    });
    
    // Convert to array for easier processing in the frontend
    const dailyStatsArray = Object.keys(dailyStats).map(date => ({
      date,
      ...dailyStats[date],
    }));
    
    // Sort by date
    dailyStatsArray.sort((a, b) => a.date.localeCompare(b.date));
    
    return {
      campaign: {
        id: campaignDoc.id,
        ...campaign,
      },
      stats,
      linkClicks: Object.entries(linkClicks).map(([url, count]) => ({ url, count })),
      dailyStats: dailyStatsArray,
    };
  } catch (error) {
    console.error("Error getting campaign tracking:", error);
    throw new functions.https.HttpsError("internal", "Failed to get campaign tracking");
  }
});

// Get overall email analytics
exports.getEmailAnalytics = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email analytics.",
    );
  }
  
  try {
    const { period } = data || {};
    
    // Default to last 30 days
    const days = period === "week" ? 7 : period === "year" ? 365 : 30;
    
    // Calculate start date
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
    
    // Get campaigns in the period
    const campaignsSnapshot = await db.collection("campaigns")
      .where("createdAt", ">=", startTimestamp)
      .get();
    
    // Get tracking data in the period
    const trackingSnapshot = await db.collection("tracking")
      .where("sentAt", ">=", startTimestamp)
      .get();
    
    // Compute overall stats
    const stats = {
      totalCampaigns: campaignsSnapshot.size,
      totalSent: trackingSnapshot.size,
      totalOpened: 0,
      totalClicked: 0,
      openRate: 0,
      clickRate: 0,
      clickToOpenRate: 0,
    };
    
    trackingSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.openedAt) stats.totalOpened++;
      if (data.clickedAt) stats.totalClicked++;
    });
    
    if (stats.totalSent > 0) {
      stats.openRate = (stats.totalOpened / stats.totalSent) * 100;
      stats.clickRate = (stats.totalClicked / stats.totalSent) * 100;
    }
    
    if (stats.totalOpened > 0) {
      stats.clickToOpenRate = (stats.totalClicked / stats.totalOpened) * 100;
    }
    
    // Get daily stats
    const dailyStats = {};
    
    trackingSnapshot.forEach(doc => {
      const data = doc.data();
      
      if (data.sentAt) {
        const date = data.sentAt.toDate().toISOString().split("T")[0];
        
        if (!dailyStats[date]) {
          dailyStats[date] = {
            sent: 0,
            opened: 0,
            clicked: 0,
          };
        }
        
        dailyStats[date].sent++;
        if (data.openedAt) dailyStats[date].opened++;
        if (data.clickedAt) dailyStats[date].clicked++;
      }
    });
    
    // Convert to array for easier processing in the frontend
    const dailyStatsArray = Object.keys(dailyStats).map(date => ({
      date,
      ...dailyStats[date],
      openRate: dailyStats[date].sent > 0 
        ? (dailyStats[date].opened / dailyStats[date].sent) * 100 
        : 0,
      clickRate: dailyStats[date].sent > 0 
        ? (dailyStats[date].clicked / dailyStats[date].sent) * 100 
        : 0,
    }));
    
    // Sort by date
    dailyStatsArray.sort((a, b) => a.date.localeCompare(b.date));
    
    // Get top campaigns by open rate
    const campaigns = [];
    
    campaignsSnapshot.forEach(doc => {
      campaigns.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    // Calculate open and click rates for each campaign
    for (const campaign of campaigns) {
      campaign.stats = campaign.stats || {
        sent: 0,
        opened: 0,
        clicked: 0,
      };
      
      campaign.openRate = campaign.stats.sent > 0 
        ? (campaign.stats.opened / campaign.stats.sent) * 100 
        : 0;
        
      campaign.clickRate = campaign.stats.sent > 0 
        ? (campaign.stats.clicked / campaign.stats.sent) * 100 
        : 0;
    }
    
    // Sort by open rate (descending)
    campaigns.sort((a, b) => b.openRate - a.openRate);
    
    // Get top 5 campaigns
    const topCampaigns = campaigns.slice(0, 5);
    
    return {
      stats,
      dailyStats: dailyStatsArray,
      topCampaigns,
    };
  } catch (error) {
    console.error("Error getting email analytics:", error);
    throw new functions.https.HttpsError("internal", "Failed to get email analytics");
  }
});

// Log email open
async function logEmailOpen(trackingId) {
  try {
    const trackingDoc = await db.collection("tracking").doc(trackingId).get();
    
    if (!trackingDoc.exists) {
      console.log(`Tracking not found for ID: ${trackingId}`);
      return;
    }
    
    const trackingData = trackingDoc.data();
    
    // Check if already opened
    if (trackingData.openedAt) {
      return;
    }
    
    // Update tracking data
    await trackingDoc.ref.update({
      openedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: trackingData.status === "delivered" ? "opened" : trackingData.status,
    });
    
    // Update subscriber stats
    if (trackingData.subscriberId) {
      await db.collection("subscribers").doc(trackingData.subscriberId).update({
        emailsOpened: admin.firestore.FieldValue.increment(1),
      });
    }
    
    // Update campaign stats
    if (trackingData.campaignId) {
      await db.collection("campaigns").doc(trackingData.campaignId).update({
        "stats.opened": admin.firestore.FieldValue.increment(1),
      });
    }
  } catch (error) {
    console.error("Error logging email open:", error);
    throw error;
  }
}

// Log link click
async function logLinkClick(trackingId, url) {
  try {
    const trackingDoc = await db.collection("tracking").doc(trackingId).get();
    
    if (!trackingDoc.exists) {
      console.log(`Tracking not found for ID: ${trackingId}`);
      return;
    }
    
    const trackingData = trackingDoc.data();
    const now = admin.firestore.FieldValue.serverTimestamp();
    
    // Prepare click data
    const clickData = {
      url: decodeURIComponent(url),
      clickedAt: now,
    };
    
    // Update tracking data
    const updates = {
      clickedAt: trackingData.clickedAt || now,
      status: trackingData.status === "delivered" || trackingData.status === "opened" 
        ? "clicked" 
        : trackingData.status,
      clickedLinks: admin.firestore.FieldValue.arrayUnion(clickData),
    };
    
    await trackingDoc.ref.update(updates);
    
    // Only update stats if this is the first click
    if (!trackingData.clickedAt) {
      // Update subscriber stats
      if (trackingData.subscriberId) {
        await db.collection("subscribers").doc(trackingData.subscriberId).update({
          emailsClicked: admin.firestore.FieldValue.increment(1),
        });
      }
      
      // Update campaign stats
      if (trackingData.campaignId) {
        await db.collection("campaigns").doc(trackingData.campaignId).update({
          "stats.clicked": admin.firestore.FieldValue.increment(1),
        });
      }
    }
  } catch (error) {
    console.error("Error logging link click:", error);
    throw error;
  }
}