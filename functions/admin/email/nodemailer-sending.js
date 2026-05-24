// admin/email/nodemailer-sending.js
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Initialize Firestore if not already initialized
const db = admin.firestore();

// Create a reusable transporter using SMTP
// Modify your createTransporter function in nodemailer-sending.js
const createTransporter = async () => {
    logger.info("Creating email transporter using SMTP");
    
    // Get config values from Firebase
    const functions = require('firebase-functions');
    const emailPassword = functions.config().email?.password;
    
    if (!emailPassword) {
      logger.error("Email password not found in configuration!");
      throw new Error("Email password not configured properly. Please set email.password config value.");
    }
    
    logger.info("Got email credentials from config");
    
    // Create transporter with the proper credentials
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: 'info@trendingtechdaily.com',
        pass: emailPassword
      }
    });
  };

// Main function to process email queue
const processEmailQueue = onRequest({ region: 'us-central1' }, async (req, res) => {
  logger.info("processEmailQueue: Function triggered.");
  try {
    // Get pending email tasks
    const tasksSnapshot = await db.collection("emailTasks")
      .where("status", "==", "pending")
      .orderBy("createdAt")
      .limit(50) // Process in batches
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
      logger.info(`processEmailTask: Starting task ${doc.id}. Data: ${JSON.stringify(task).substring(0,300)}...`);
      promises.push(processEmailTask(task, doc.ref, transporter));
      logger.info(`processEmailQueue: Pushed task ${doc.id} to promises.`);
    });
    
    await Promise.all(promises);
    
    logger.info("processEmailQueue: All email tasks processed successfully.");
    res.status(200).send("Email processing complete");
  } catch (error) {
    logger.error("processEmailQueue: Critical error in queue processing:", error);
    res.status(500).send("Error processing email queue: " + error.message);
  }
});

// Process a single email task
async function processEmailTask(task, taskRef, transporter) {
  try {
    // Mark task as processing
    await taskRef.update({
      status: "processing",
      processingStarted: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // Get tracking info
    let trackingDoc = null;
    
    if (task.trackingId) {
      trackingDoc = await db.collection("tracking").doc(task.trackingId).get();
      
      if (!trackingDoc || !trackingDoc.exists) {
        logger.warn(`Tracking not found for task: ${task.trackingId}`);
      }
    }
    
    // Send the email using Nodemailer
    await sendEmailWithNodemailer(task, transporter);
    
    // Update tracking status
    if (trackingDoc && trackingDoc.exists) {
      await trackingDoc.ref.update({
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "delivered"
      });
      
      // Update campaign stats if applicable
      const trackingData = trackingDoc.data();
      
      if (trackingData.campaignId) {
        await db.collection("campaigns").doc(trackingData.campaignId).update({
          "stats.delivered": admin.firestore.FieldValue.increment(1)
        });
      }
      
      // Update subscriber stats
      if (trackingData.subscriberId) {
        await db.collection("subscribers").doc(trackingData.subscriberId).update({
          emailsSent: admin.firestore.FieldValue.increment(1),
          lastEmailSent: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    
    // Mark task as complete
    await taskRef.update({
      status: "completed",
      completedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logger.info(`processEmailTask: Email sent successfully for task ${taskRef.id}. Tracking ID: ${task.trackingId || 'N/A'}`);
  } catch (error) {
    logger.error(`processEmailTask: Error processing task ${taskRef.id}:`, error);
    
    // Mark task as failed
    await taskRef.update({
      status: "error",
      error: error.message,
      errorAt: admin.firestore.FieldValue.serverTimestamp()
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
    
    throw error;
  }
}

// Send email using Nodemailer
async function sendEmailWithNodemailer(emailData, transporter) {
  try {
    logger.info(`Sending email to ${emailData.to}...`);
    
    // Create mail options
    const mailOptions = {
      from: emailData.from || 'TrendingTechDaily <info@trendingtechdaily.com>',
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
      cc: emailData.cc,
      bcc: emailData.bcc,
      replyTo: emailData.replyTo
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

// Other email sending related functions
const sendTransactionalEmail = async (data) => {
  // Implementation goes here
  // Similar to processEmailQueue but for one-off emails
};

const processEmailFeedback = onRequest({ region: 'us-central1' }, async (req, res) => {
  // Implementation goes here
});

const handleUnsubscribe = onRequest({ region: 'us-central1' }, async (req, res) => {
  // Implementation goes here
});

// Export all functions
module.exports = {
  processEmailQueue,
  sendTransactionalEmail,
  processEmailFeedback,
  handleUnsubscribe
};