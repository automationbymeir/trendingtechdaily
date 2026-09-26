//sending.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance
const { google } = require("googleapis");

// IMPORTANT: If you set up Domain-Wide Delegation, specify the user to impersonate here.
// This email address MUST be a user in your Google Workspace domain.
// Otherwise, emails will be sent from the service account's email address.
const USER_TO_IMPERSONATE = "info@trendingtechdaily.com"; // Or your desired "From" user in your Workspace
// If not using impersonation (e.g., sending from the service account itself), set to null or remove related auth logic.
// const USER_TO_IMPERSONATE = null;

// Process email task queue
exports.processEmailQueue = functions.https.onRequest(async (req, res) => {
  console.log("processEmailQueue: Function triggered.");
  try {
    // Get pending email tasks
    const tasksSnapshot = await db.collection("emailTasks")
      .where("status", "==", "pending")
      .orderBy("createdAt")
      .limit(50) // Process in batches
      .get();
    
    if (tasksSnapshot.empty) {
      console.log("processEmailQueue: No email tasks to process.");
      res.status(200).send("No email tasks to process");
      return;
    }
    
    console.log(`processEmailQueue: Processing ${tasksSnapshot.size} email tasks.`);
    
    // Process each task
    const promises = [];
    
    tasksSnapshot.forEach(doc => {
      const task = doc.data();
      promises.push(processEmailTask(task, doc.ref));
      console.log(`processEmailQueue: Pushed task ${doc.id} to promises.`);
    });
    
    await Promise.all(promises);
    
    console.log("processEmailQueue: All email tasks processed successfully.");
    res.status(200).send("Email processing complete");
  } catch (error) {
    console.error("processEmailQueue: Critical error in queue processing:", error.message, error.stack);
    res.status(500).send("Error processing email queue: " + error.message + (error.stack ? ` Stack: ${error.stack}` : ""));
  }
});

// Process a single email task
async function processEmailTask(task, taskRef) {
  try {
    // Mark task as processing
    console.log(`processEmailTask: Starting task ${taskRef.id}. Data:`, JSON.stringify(task).substring(0,300));
    await taskRef.update({
      status: "processing",
      processingStarted: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Get tracking info
    let trackingDoc = null;
    
    if (task.trackingId) {
      trackingDoc = await db.collection("tracking").doc(task.trackingId).get();
      
      if (!trackingDoc || !trackingDoc.exists) { // Added null check for trackingDoc
        console.log(`Tracking not found for task: ${task.trackingId}`);
      }
    }
    
    // Send the email using Gmail API
    await sendEmailViaGmailAPI(task);
    
    // Update tracking status
    if (trackingDoc && trackingDoc.exists) { // Check if trackingDoc is not null and exists
      await trackingDoc.ref.update({
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "delivered",
      });
      
      // Update campaign stats if applicable
      const trackingData = trackingDoc.data();
      
      if (trackingData.campaignId) {
        await db.collection("campaigns").doc(trackingData.campaignId).update({
          "stats.delivered": admin.firestore.FieldValue.increment(1),
        });
      }
      
      // Update subscriber stats
      if (trackingData.subscriberId) {
        await db.collection("subscribers").doc(trackingData.subscriberId).update({
          emailsSent: admin.firestore.FieldValue.increment(1),
          lastEmailSent: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    }
    
    // Mark task as complete
    await taskRef.update({
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    console.log(`processEmailTask: Email sent successfully for task ${taskRef.id}. Tracking ID: ${task.trackingId || "N/A"}`);
  } catch (error) {
    console.error(`processEmailTask: Error processing task ${taskRef.id}:`, error.message, error.stack);
    
    // Mark task as failed
    await taskRef.update({
      status: "error",
      error: error.message,
      errorAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Update tracking status if available
    if (task.trackingId) {
      const trackingRef = db.collection("tracking").doc(task.trackingId);
      // Check if tracking doc exists before trying to update it
      const currentTrackingDoc = await trackingRef.get();
      if (currentTrackingDoc.exists) {
        await trackingRef.update({ status: "failed", error: error.message, errorAt: admin.firestore.FieldValue.serverTimestamp() });
      }
    }
    // Do not rethrow here if you want other tasks in Promise.all to attempt processing.
    
    throw error;
  }
}

// Helper to create the raw email message for Gmail API
// Ensures proper formatting for headers and body.
function createRawEmailMessage({ to, from, subject, htmlBody, cc, bcc, replyTo }) {
  try {
    // Create email headers
    const emailLines = [];
    emailLines.push(`From: ${from}`);
    emailLines.push(`To: ${to}`);
    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    emailLines.push(`Subject: ${subject}`);
    if (replyTo) emailLines.push(`Reply-To: ${replyTo}`);
    
    // Set MIME headers
    emailLines.push("MIME-Version: 1.0");
    emailLines.push("Content-Type: text/html; charset=utf-8");
    emailLines.push(""); // Empty line separates headers from body
    emailLines.push(htmlBody);

    // Combine into a single string with proper line endings
    const email = emailLines.join("\r\n");
    
    // Base64url encode the email
    return Buffer.from(email).toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  } catch (error) {
    console.error("Error creating raw email message:", error);
    throw error;
  }
}

async function sendEmailViaGmailAPI(emailData) {
  try {
    // Validate required fields
    if (!emailData.to || !emailData.subject || !emailData.html) {
      throw new Error("sendEmailViaGmailAPI: Missing required email fields (to, subject, or html).");
    }
    
    console.log(`sendEmailViaGmailAPI: Preparing to send email to ${emailData.to}...`);
    
    // Prepare request data
    const mailOptions = {
      to: emailData.to,
      subject: emailData.subject,
      htmlBody: emailData.html, // Using htmlBody for createRawEmailMessage
      from: emailData.from || `TrendingTechDaily <${USER_TO_IMPERSONATE}>`,
      cc: emailData.cc,
      bcc: emailData.bcc,
      replyTo: emailData.replyTo,
    };
    
    console.log("sendEmailViaGmailAPI: Mail options prepared");

    // Create auth with explicit client ID from your service account
    const auth = new google.auth.GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/gmail.send"],
      clientOptions: {
        subject: USER_TO_IMPERSONATE, // This is the critical part for domain-wide delegation
      },
    });
    
    const authClient = await auth.getClient();
    console.log("sendEmailViaGmailAPI: Auth client created");

    const gmail = google.gmail({ version: "v1", auth: authClient });
    
    // Create raw email message (RFC 2822 format)
    const rawMessage = createRawEmailMessage(mailOptions);
    console.log("sendEmailViaGmailAPI: Raw message created");

    const params = {
      userId: "me", // When using domain-wide delegation with subject, 'me' refers to the impersonated user
      requestBody: {
        raw: rawMessage,
      },
    };

    console.log("sendEmailViaGmailAPI: Sending email via Gmail API...");
    const res = await gmail.users.messages.send(params);
    console.log("sendEmailViaGmailAPI: Gmail API send response status:", res.status);
    return res.data;

  } catch (error) {
    console.error("sendEmailViaGmailAPI: Error sending email:", error.message);
    
    // Provide more detailed error info for common Gmail API errors
    if (error.code === 403) {
      console.error("This is likely a permissions issue. Make sure your service account has domain-wide delegation.");
    } else if (error.code === 400) {
      console.error("Bad request - check the email format and content.");
    } else if (error.response) {
      console.error("API Error Response:", JSON.stringify(error.response.data));
    }
    
    throw error;
  }
}

// Export the function
module.exports = { sendEmailViaGmailAPI };

// Send transactional email (direct API)
exports.sendTransactionalEmail = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to send emails.",
    );
  }
  
  try {
    const { templateId, to, subject, data: emailData } = data;
    
    // Validate required fields
    if (!to || !subject) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required email fields",
      );
    }
    
    let htmlContent;
    
    if (templateId) {
      // Get template
      const templateDoc = await db.collection("templates").doc(templateId).get();
      
      if (!templateDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Email template not found");
      }
      
      const template = templateDoc.data();
      htmlContent = template.htmlContent;
      
      // Replace placeholders
      for (const [key, value] of Object.entries(emailData || {})) {
        const regex = new RegExp(`{{${key}}}`, "g");
        htmlContent = htmlContent.replace(regex, value);
      }
    } else if (data.html) {
      htmlContent = data.html;
    } else {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Either templateId or html must be provided",
      );
    }
    
    // Add to task queue
    await db.collection("emailTasks").add({
      taskType: "send_transactional",
      to,
      subject,
      html: htmlContent,
      from: data.from || "TrendingTechDaily <info@trendingtechdaily.com>",
      replyTo: data.replyTo,
      cc: data.cc,
      bcc: data.bcc,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { success: true };
  } catch (error) {
    console.error("Error sending transactional email:", error);
    throw new functions.https.HttpsError("internal", "Failed to send email");
  }
});

// Process bounces and complaints (webhook handler)
exports.processEmailFeedback = functions.https.onRequest(async (req, res) => {
  try {
    // This handler would process bounces and complaints from your email service
    // For Gmail/Apps Script, this would need to be implemented separately
    
    const { type, messageId, email, reason } = req.body;
    
    if (!type || !email) {
      res.status(400).send("Missing required fields");
      return;
    }
    
    // Find subscriber by email
    const subscriberSnapshot = await db.collection("subscribers")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (subscriberSnapshot.empty) {
      console.log(`Subscriber not found for email: ${email}`);
      res.status(200).send("OK");
      return;
    }
    
    const subscriberId = subscriberSnapshot.docs[0].id;
    const subscriber = subscriberSnapshot.docs[0].data();
    
    if (type === "bounce") {
      // Handle hard bounce
      await db.collection("subscribers").doc(subscriberId).update({
        status: "bounced",
        bounceReason: reason || "Hard bounce",
        bounceDate: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Find tracking entry if messageId is provided
      if (messageId) {
        const trackingSnapshot = await db.collection("tracking")
          .where("emailId", "==", messageId)
          .limit(1)
          .get();
        
        if (!trackingSnapshot.empty) {
          const trackingId = trackingSnapshot.docs[0].id;
          
          await db.collection("tracking").doc(trackingId).update({
            status: "bounced",
            bounceReason: reason || "Hard bounce",
            bounceDate: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          // Update campaign stats if applicable
          const trackingData = trackingSnapshot.docs[0].data();
          
          if (trackingData.campaignId) {
            await db.collection("campaigns").doc(trackingData.campaignId).update({
              "stats.bounced": admin.firestore.FieldValue.increment(1),
            });
          }
        }
      }
    } else if (type === "complaint") {
      // Handle spam complaint
      await db.collection("subscribers").doc(subscriberId).update({
        status: "unsubscribed",
        unsubscribeReason: "Spam complaint",
        unsubscribeDate: admin.firestore.FieldValue.serverTimestamp(),
      });
      
      // Find tracking entry if messageId is provided
      if (messageId) {
        const trackingSnapshot = await db.collection("tracking")
          .where("emailId", "==", messageId)
          .limit(1)
          .get();
        
        if (!trackingSnapshot.empty) {
          const trackingId = trackingSnapshot.docs[0].id;
          
          await db.collection("tracking").doc(trackingId).update({
            status: "complaint",
            complaintDate: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          // Update campaign stats if applicable
          const trackingData = trackingSnapshot.docs[0].data();
          
          if (trackingData.campaignId) {
            await db.collection("campaigns").doc(trackingData.campaignId).update({
              "stats.complaints": admin.firestore.FieldValue.increment(1),
            });
          }
        }
      }
    }
    
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing email feedback:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Handle unsubscribe requests
exports.handleUnsubscribe = functions.https.onRequest(async (req, res) => {
  try {
    const email = req.query.email;
    const trackingId = req.query.tid; // Optional
    
    if (!email) {
      res.status(400).send("Email is required");
      return;
    }
    
    // Find subscriber by email
    const subscriberSnapshot = await db.collection("subscribers")
      .where("email", "==", email)
      .limit(1)
      .get();
    
    if (subscriberSnapshot.empty) {
      res.status(404).send("Subscriber not found");
      return;
    }
    
    const subscriberId = subscriberSnapshot.docs[0].id;
    
    // Update subscriber status
    await db.collection("subscribers").doc(subscriberId).update({
      status: "unsubscribed",
      unsubscribeDate: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Update tracking if trackingId is provided
    if (trackingId) {
      const trackingDoc = await db.collection("tracking").doc(trackingId).get();
      
      if (trackingDoc.exists) {
        await trackingDoc.ref.update({
          unsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        // Update campaign stats if applicable
        const trackingData = trackingDoc.data();
        
        if (trackingData.campaignId) {
          await db.collection("campaigns").doc(trackingData.campaignId).update({
            "stats.unsubscribed": admin.firestore.FieldValue.increment(1),
          });
        }
      }
    }
    
    // Return unsubscribe confirmation page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
          }
          h1 {
            color: #333;
          }
          .card {
            background: #f5f5f5;
            border-radius: 5px;
            padding: 20px;
            margin-top: 20px;
          }
          .button {
            display: inline-block;
            background: #3a7bd5;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 5px;
            margin-top: 15px;
          }
        </style>
      </head>
      <body>
        <h1>You have been unsubscribed</h1>
        <p>You will no longer receive marketing emails from TrendingTechDaily.</p>
        
        <div class="card">
          <h2>Changed your mind?</h2>
          <p>If you unsubscribed by mistake, you can resubscribe at any time.</p>
          <a href="https://trendingtechdaily.com/resubscribe?email=${encodeURIComponent(email)}" class="button">Resubscribe</a>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error handling unsubscribe:", error);
    res.status(500).send("Internal Server Error");
  }
});