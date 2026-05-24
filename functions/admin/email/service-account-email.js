// admin/email/service-account-email.js
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Initialize Firestore
const db = admin.firestore();

// Email address to impersonate (must be in your Google Workspace domain)
const EMAIL_TO_IMPERSONATE = "info@trendingtechdaily.com";

// Create a JWT auth client using service account
const createTransporter = async () => {
  try {
    logger.info("Creating service account transporter for Gmail");
    
    // Get service account credentials from environment variables
    const serviceAccountKey = process.env.GMAIL_SERVICE_ACCOUNT;
    
    if (!serviceAccountKey) {
      logger.error("Missing service account credentials in environment variables");
      throw new Error("GMAIL_SERVICE_ACCOUNT secret is not set in Firebase function configuration.");
    }
    
    logger.info("Raw GMAIL_SERVICE_ACCOUNT (first 100 chars):", serviceAccountKey.substring(0, 100));

    // Parse the service account key from JSON string to object
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(serviceAccountKey);
    } catch (parseError) {
      logger.error("Failed to parse GMAIL_SERVICE_ACCOUNT JSON string:", parseError.message);
      logger.error("Ensure the GMAIL_SERVICE_ACCOUNT secret contains the valid JSON content of your service account key file.");
      throw new Error(`Invalid GMAIL_SERVICE_ACCOUNT JSON: ${parseError.message}`);
    }
    
    // Create a JWT client
    const jwtClient = new google.auth.JWT(
      serviceAccount.client_email,
      null,
      serviceAccount.private_key,
      ["https://mail.google.com/"],
      EMAIL_TO_IMPERSONATE,
    );
    
    // Authorize the client
    await jwtClient.authorize();
    logger.info("Service account authorized successfully");
    
    // Create the nodemailer transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: EMAIL_TO_IMPERSONATE,
        serviceClient: serviceAccount.client_email,
        privateKey: serviceAccount.private_key,
        accessToken: jwtClient.credentials.access_token,
      },
    });
    
    // Verify the transporter configuration
    await transporter.verify();
    logger.info("Transporter verified successfully");
    
    return transporter;
  } catch (error) {
    logger.error("Error creating transporter:", error);
    throw error;
  }
};

// Main function to process email queue
const processEmailQueue = onRequest(
  { 
    secrets: ["GMAIL_SERVICE_ACCOUNT"],
    region: "us-central1",
  }, 
  async (req, res) => {
    logger.info("processEmailQueue: Function triggered.");
    try {
      // Get pending email tasks
      const tasksSnapshot = await db.collection("emailTasks")
        .where("status", "==", "pending")
        .orderBy("createdAt")
        .limit(10) // Process in smaller batches to avoid rate limits
        .get();
      
      if (tasksSnapshot.empty) {
        logger.info("processEmailQueue: No email tasks to process.");
        res.status(200).send("No email tasks to process");
        return;
      }
      
      logger.info(`processEmailQueue: Processing ${tasksSnapshot.size} email tasks.`);
      
      // Initialize the transporter
      const transporter = await createTransporter();
      
      // Process each task
      const promises = [];
      
      tasksSnapshot.forEach(doc => {
        const task = doc.data();
        logger.info(`processEmailTask: Starting task ${doc.id}.`);
        promises.push(processEmailTask(task, doc.ref, transporter));
      });
      
      await Promise.all(promises);
      
      logger.info("processEmailQueue: All email tasks processed successfully.");
      res.status(200).send(`Processed ${tasksSnapshot.size} email tasks successfully`);
    } catch (error) {
      logger.error("processEmailQueue: Critical error in queue processing:", error);
      res.status(500).send(`Error processing email queue: ${error.message}`);
    }
  },
);

// Process a single email task
async function processEmailTask(task, taskRef, transporter) {
  try {
    // Mark task as processing
    await taskRef.update({
      status: "processing",
      processingStarted: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Get tracking info
    let trackingDoc = null;
    
    if (task.trackingId) {
      trackingDoc = await db.collection("tracking").doc(task.trackingId).get();
      
      if (!trackingDoc || !trackingDoc.exists) {
        logger.warn(`Tracking not found for task: ${task.trackingId}`);
      }
    }
    
    // Send the email
    await sendEmail(task, transporter);
    
    // Update tracking status
    if (trackingDoc && trackingDoc.exists) {
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
    
    logger.info(`processEmailTask: Email sent successfully for task ${taskRef.id}.`);
  } catch (error) {
    logger.error(`processEmailTask: Error processing task ${taskRef.id}:`, error);
    
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
        await trackingRef.update({ 
          status: "failed", 
          error: error.message, 
          errorAt: admin.firestore.FieldValue.serverTimestamp(), 
        });
      }
    }
    
    throw error;
  }
}

// Send email using transporter
async function sendEmail(emailData, transporter) {
  try {
    logger.info(`Sending email to ${emailData.to}...`);
    
    // Create mail options
    const mailOptions = {
      from: emailData.from || "TrendingTechDaily <info@trendingtechdaily.com>",
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      cc: emailData.cc,
      bcc: emailData.bcc,
      replyTo: emailData.replyTo,
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent: ${info.messageId}`);
    return info;
  } catch (error) {
    logger.error(`Error sending email to ${emailData.to}:`, error);
    throw error;
  }
}

// Create a simple test function 
const testEmail = onRequest(
  { 
    secrets: ["GMAIL_SERVICE_ACCOUNT"],
    region: "us-central1",
  }, 
  async (req, res) => {
    try {
      logger.info("testEmail: Function triggered.");
      
      // Create transporter
      const transporter = await createTransporter();
      
      // Send test email
      const info = await transporter.sendMail({
        from: "TrendingTechDaily <info@trendingtechdaily.com>",
        to: "meirho01@gmail.com",
        subject: "Test Email from Firebase Function",
        html: "<h1>Test Email</h1><p>This is a test email from your Firebase function using service account authentication.</p>",
      });
      
      logger.info(`Test email sent: ${info.messageId}`);
      res.status(200).send(`Test email sent successfully! Message ID: ${info.messageId}`);
    } catch (error) {
      logger.error("Error sending test email:", error);
      res.status(500).send(`Error sending test email: ${error.message}`);
    }
  },
);

// Export functions
module.exports = {
  processEmailQueue,
  testEmail,
};