//templates.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance

// Create or update a template
exports.saveTemplate = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email templates.",
    );
  }
  
  try {
    const { id, name, subject, htmlContent, textContent, category } = data;
    
    // Extract placeholders from HTML content
    const placeholders = extractPlaceholders(htmlContent);
    
    // Template data
    const templateData = {
      name,
      subject,
      htmlContent,
      textContent: textContent || stripHtml(htmlContent),
      category: category || "general",
      placeholders,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    let templateId = id;
    
    if (templateId) {
      // Update existing template
      await db.collection("templates").doc(templateId).update(templateData);
    } else {
      // Create new template
      templateData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const docRef = await db.collection("templates").add(templateData);
      templateId = docRef.id;
    }
    
    return { success: true, templateId };
  } catch (error) {
    console.error("Error saving template:", error);
    throw new functions.https.HttpsError("internal", "Failed to save template");
  }
});

// Get all templates
exports.getTemplates = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email templates.",
    );
  }
  
  try {
    const templatesSnapshot = await db.collection("templates")
      .orderBy("updatedAt", "desc")
      .get();
    
    const templates = [];
    
    templatesSnapshot.forEach(doc => {
      templates.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return { templates };
  } catch (error) {
    console.error("Error getting templates:", error);
    throw new functions.https.HttpsError("internal", "Failed to get templates");
  }
});

// Get a specific template
exports.getTemplate = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email templates.",
    );
  }
  
  try {
    const { templateId } = data;
    
    if (!templateId) {
      throw new functions.https.HttpsError("invalid-argument", "Template ID is required");
    }
    
    const templateDoc = await db.collection("templates").doc(templateId).get();
    
    if (!templateDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Template not found");
    }
    
    return {
      id: templateDoc.id,
      ...templateDoc.data(),
    };
  } catch (error) {
    console.error("Error getting template:", error);
    throw new functions.https.HttpsError("internal", "Failed to get template");
  }
});

// Delete a template
exports.deleteTemplate = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email templates.",
    );
  }
  
  try {
    const { templateId } = data;
    
    if (!templateId) {
      throw new functions.https.HttpsError("invalid-argument", "Template ID is required");
    }
    
    // Check if template is in use by campaigns or workflows
    const campaignsSnapshot = await db.collection("campaigns")
      .where("templateId", "==", templateId)
      .limit(1)
      .get();
    
    if (!campaignsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition", 
        "Template is in use by one or more campaigns and cannot be deleted",
      );
    }
    
    const workflowsSnapshot = await db.collection("workflows")
      .where("steps.templateId", "array-contains", templateId)
      .limit(1)
      .get();
    
    if (!workflowsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition", 
        "Template is in use by one or more workflows and cannot be deleted",
      );
    }
    
    // Delete the template
    await db.collection("templates").doc(templateId).delete();
    
    return { success: true };
  } catch (error) {
    console.error("Error deleting template:", error);
    throw new functions.https.HttpsError("internal", "Failed to delete template");
  }
});

// Extract placeholders from template content
function extractPlaceholders(content) {
  const placeholderRegex = /{{([^}]+)}}/g;
  const placeholders = new Set();
  let match;
  
  while ((match = placeholderRegex.exec(content)) !== null) {
    placeholders.add(match[1]);
  }
  
  return Array.from(placeholders);
}

// Simple HTML strip function for text content
function stripHtml(html) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}