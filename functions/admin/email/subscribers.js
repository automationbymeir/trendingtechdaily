//subscribers.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance
// Create or update a subscriber
exports.saveSubscriber = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage subscribers.",
    );
  }
  
  try {
    const { id, email, name, status, listIds, tags, customFields } = data;
    
    // Validate email
    if (!email || !validateEmail(email)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Valid email is required",
      );
    }
    
    // Check for existing subscriber with same email
    const existingSnapshot = await db.collection("subscribers")
      .where("email", "==", email)
      .get();
    
    let existingId = null;
    
    existingSnapshot.forEach(doc => {
      if (doc.id !== id) {
        existingId = doc.id;
      }
    });
    
    if (existingId) {
      throw new functions.https.HttpsError(
        "already-exists",
        "A subscriber with this email already exists",
      );
    }
    
    // Subscriber data
    const subscriberData = {
      email,
      name: name || "",
      status: status || "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    if (listIds) subscriberData.listIds = listIds;
    if (tags) subscriberData.tags = tags;
    if (customFields) subscriberData.customFields = customFields;
    
    let subscriberId = id;
    
    if (subscriberId) {
      // Update existing subscriber
      await db.collection("subscribers").doc(subscriberId).update(subscriberData);
    } else {
      // Create new subscriber
      subscriberData.subscriptionDate = admin.firestore.FieldValue.serverTimestamp();
      subscriberData.emailsSent = 0;
      subscriberData.emailsOpened = 0;
      subscriberData.emailsClicked = 0;
      
      const docRef = await db.collection("subscribers").add(subscriberData);
      subscriberId = docRef.id;
    }
    
    // Update list memberships
    if (listIds && listIds.length > 0) {
      // Get current list memberships
      const currentMemberships = await db.collectionGroup("members")
        .where("subscriberId", "==", subscriberId)
        .get();
      
      const currentListIds = new Set();
      currentMemberships.forEach(doc => {
        currentListIds.add(doc.ref.parent.parent.id);
      });
      
      // Add to new lists
      const batch = db.batch();
      
      for (const listId of listIds) {
        if (!currentListIds.has(listId)) {
          const memberRef = db.collection("lists")
            .doc(listId)
            .collection("members")
            .doc(subscriberId);
          
          batch.set(memberRef, {
            subscriberId: subscriberId,
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          // Update list subscriber count
          batch.update(db.collection("lists").doc(listId), {
            subscriberCount: admin.firestore.FieldValue.increment(1),
          });
        }
        
        currentListIds.delete(listId);
      }
      
      // Remove from old lists
      for (const listId of currentListIds) {
        const memberRef = db.collection("lists")
          .doc(listId)
          .collection("members")
          .doc(subscriberId);
        
        batch.delete(memberRef);
        
        // Update list subscriber count
        batch.update(db.collection("lists").doc(listId), {
          subscriberCount: admin.firestore.FieldValue.increment(-1),
        });
      }
      
      await batch.commit();
    }
    
    return { success: true, subscriberId };
  } catch (error) {
    console.error("Error saving subscriber:", error);
    throw new functions.https.HttpsError("internal", "Failed to save subscriber");
  }
});

// Get all subscribers
exports.getSubscribers = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access subscribers.",
    );
  }
  
  try {
    const { limit, offset, status, listId } = data || {};
    
    let query = db.collection("subscribers");
    
    // Apply filters
    if (status) {
      query = query.where("status", "==", status);
    }
    
    if (listId) {
      // Get subscribers in a specific list
      const membersSnapshot = await db.collection("lists")
        .doc(listId)
        .collection("members")
        .get();
      
      const subscriberIds = membersSnapshot.docs.map(doc => doc.id);
      
      if (subscriberIds.length === 0) {
        return { subscribers: [], total: 0 };
      }
      
      // Firestore limits 'in' queries to 10 items, so we need to batch
      const batches = [];
      const batchSize = 10;
      
      for (let i = 0; i < subscriberIds.length; i += batchSize) {
        const batch = subscriberIds.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      const subscribersPromises = batches.map(batch => 
        db.collection("subscribers")
          .where(admin.firestore.FieldPath.documentId(), "in", batch)
          .get(),
      );
      
      const snapshotsList = await Promise.all(subscribersPromises);
      
      // Merge results
      const subscribers = [];
      
      snapshotsList.forEach(snapshot => {
        snapshot.forEach(doc => {
          subscribers.push({
            id: doc.id,
            ...doc.data(),
          });
        });
      });
      
      // Sort by subscription date (newest first)
      subscribers.sort((a, b) => {
        const dateA = a.subscriptionDate ? a.subscriptionDate.toDate() : new Date(0);
        const dateB = b.subscriptionDate ? b.subscriptionDate.toDate() : new Date(0);
        return dateB - dateA;
      });
      
      // Apply pagination if requested
      const paginatedSubscribers = limit
        ? subscribers.slice(offset || 0, (offset || 0) + limit)
        : subscribers;
      
      return { subscribers: paginatedSubscribers, total: subscribers.length };
    } else {
      // Regular query with pagination
      // Get total count (inefficient but Firestore doesn't support count queries)
      const countSnapshot = await query.get();
      const total = countSnapshot.size;
      
      // Apply sorting and pagination
      query = query.orderBy("subscriptionDate", "desc");
      
      if (offset) {
        query = query.offset(offset);
      }
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const subscribersSnapshot = await query.get();
      
      const subscribers = [];
      
      subscribersSnapshot.forEach(doc => {
        subscribers.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      return { subscribers, total };
    }
  } catch (error) {
    console.error("Error getting subscribers:", error);
    throw new functions.https.HttpsError("internal", "Failed to get subscribers");
  }
});

// Get a specific subscriber
exports.getSubscriber = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access subscriber data.",
    );
  }
  
  try {
    const { subscriberId } = data;
    
    if (!subscriberId) {
      throw new functions.https.HttpsError("invalid-argument", "Subscriber ID is required");
    }
    
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
    
    if (!subscriberDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Subscriber not found");
    }
    
    // Get list memberships
    const membershipsSnapshot = await db.collectionGroup("members")
      .where("subscriberId", "==", subscriberId)
      .get();
    
    const listIds = [];
    
    membershipsSnapshot.forEach(doc => {
      listIds.push(doc.ref.parent.parent.id);
    });
    
    // Get email activity
    const trackingSnapshot = await db.collection("tracking")
      .where("subscriberId", "==", subscriberId)
      .orderBy("sentAt", "desc")
      .limit(20) // Get last 20 emails
      .get();
    
    const activity = [];
    
    for (const trackingDoc of trackingSnapshot.docs) {
      const trackingData = trackingDoc.data();
      const campaignId = trackingData.campaignId;
      
      // Get campaign details
      let campaignName = "Unknown Campaign";
      
      if (campaignId) {
        const campaignDoc = await db.collection("campaigns").doc(campaignId).get();
        if (campaignDoc.exists) {
          campaignName = campaignDoc.data().name;
        }
      }
      
      activity.push({
        id: trackingDoc.id,
        campaignId: campaignId,
        campaignName: campaignName,
        sentAt: trackingData.sentAt,
        deliveredAt: trackingData.deliveredAt,
        openedAt: trackingData.openedAt,
        clickedAt: trackingData.clickedAt,
        status: trackingData.status,
      });
    }
    
    return {
      id: subscriberDoc.id,
      ...subscriberDoc.data(),
      listIds,
      activity,
    };
  } catch (error) {
    console.error("Error getting subscriber:", error);
    throw new functions.https.HttpsError("internal", "Failed to get subscriber");
  }
});

// Delete a subscriber
exports.deleteSubscriber = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage subscribers.",
    );
  }
  
  try {
    const { subscriberId } = data;
    
    if (!subscriberId) {
      throw new functions.https.HttpsError("invalid-argument", "Subscriber ID is required");
    }
    
    // Get the subscriber to verify it exists
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
    
    if (!subscriberDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Subscriber not found");
    }
    
    // Get list memberships
    const membershipsSnapshot = await db.collectionGroup("members")
      .where("subscriberId", "==", subscriberId)
      .get();
    
    // Batch operations for efficiency
    const batch = db.batch();
    
    // Remove from all lists
    membershipsSnapshot.forEach(doc => {
      batch.delete(doc.ref);
      
      // Update list subscriber count
      const listId = doc.ref.parent.parent.id;
      batch.update(db.collection("lists").doc(listId), {
        subscriberCount: admin.firestore.FieldValue.increment(-1),
      });
    });
    
    // Delete the subscriber
    batch.delete(db.collection("subscribers").doc(subscriberId));
    
    await batch.commit();
    
    return { success: true };
  } catch (error) {
    console.error("Error deleting subscriber:", error);
    throw new functions.https.HttpsError("internal", "Failed to delete subscriber");
  }
});

// Import subscribers from CSV (base64 encoded)
exports.importSubscribers = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to import subscribers.",
    );
  }
  
  try {
    const { csvBase64, listIds, overwrite } = data;
    
    if (!csvBase64) {
      throw new functions.https.HttpsError("invalid-argument", "CSV data is required");
    }
    
    // Decode CSV data
    const csvString = Buffer.from(csvBase64, "base64").toString("utf-8");
    
    // Parse CSV (simple parser, you might want to use a library in production)
    const lines = csvString.split("\n");
    const headers = lines[0].split(",").map(header => header.trim());
    
    // Find email column
    const emailIndex = headers.findIndex(h => 
      h.toLowerCase() === "email" || h.toLowerCase() === "email address",
    );
    
    if (emailIndex === -1) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "CSV must contain an 'email' column",
      );
    }
    
    // Find name column if it exists
    const nameIndex = headers.findIndex(h => 
      h.toLowerCase() === "name" || h.toLowerCase() === "first name" || h.toLowerCase() === "fullname",
    );
    
    // Process subscribers
    const subscribers = [];
    const errors = [];
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue; // Skip empty lines
      
      const values = parseCSVLine(lines[i]);
      
      if (values.length < headers.length) {
        errors.push(`Line ${i + 1}: Not enough values`);
        continue;
      }
      
      const email = values[emailIndex].trim();
      
      if (!validateEmail(email)) {
        errors.push(`Line ${i + 1}: Invalid email address "${email}"`);
        continue;
      }
      
      const name = nameIndex !== -1 ? values[nameIndex].trim() : "";
      
      // Build custom fields
      const customFields = {};
      
      for (let j = 0; j < headers.length; j++) {
        if (j !== emailIndex && j !== nameIndex && headers[j] && values[j]) {
          customFields[headers[j]] = values[j].trim();
        }
      }
      
      subscribers.push({
        email,
        name,
        customFields,
      });
    }
    
    // Save subscribers
    const results = {
      total: subscribers.length,
      added: 0,
      updated: 0,
      errors: errors,
    };
    
    for (const subscriber of subscribers) {
      try {
        // Check for existing subscriber
        const existingSnapshot = await db.collection("subscribers")
          .where("email", "==", subscriber.email)
          .limit(1)
          .get();
        
        let subscriberId = null;
        
        if (!existingSnapshot.empty) {
          // Subscriber exists
          subscriberId = existingSnapshot.docs[0].id;
          
          if (overwrite) {
            // Update existing subscriber
            await db.collection("subscribers").doc(subscriberId).update({
              name: subscriber.name,
              customFields: subscriber.customFields,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            results.updated++;
          } else {
            // Skip existing subscriber
            continue;
          }
        } else {
          // Create new subscriber
          const subscriberData = {
            email: subscriber.email,
            name: subscriber.name,
            status: "active",
            subscriptionDate: admin.firestore.FieldValue.serverTimestamp(),
            customFields: subscriber.customFields,
            emailsSent: 0,
            emailsOpened: 0,
            emailsClicked: 0,
          };
          
          if (listIds) {
            subscriberData.listIds = listIds;
          }
          
          const docRef = await db.collection("subscribers").add(subscriberData);
          subscriberId = docRef.id;
          
          results.added++;
        }
        
        // Add to specified lists
        if (listIds && listIds.length > 0 && subscriberId) {
          const batch = db.batch();
          
          for (const listId of listIds) {
            const memberRef = db.collection("lists")
              .doc(listId)
              .collection("members")
              .doc(subscriberId);
            
            batch.set(memberRef, {
              subscriberId: subscriberId,
              addedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            
            // Update list subscriber count
            batch.update(db.collection("lists").doc(listId), {
              subscriberCount: admin.firestore.FieldValue.increment(1),
            });
          }
          
          await batch.commit();
        }
      } catch (error) {
        console.error(`Error importing subscriber ${subscriber.email}:`, error);
        errors.push(`Error importing ${subscriber.email}: ${error.message}`);
      }
    }
    
    return results;
  } catch (error) {
    console.error("Error importing subscribers:", error);
    throw new functions.https.HttpsError("internal", "Failed to import subscribers");
  }
});

// Export subscribers to CSV
exports.exportSubscribers = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to export subscribers.",
    );
  }
  
  try {
    const { listId, status } = data || {};
    
    let query = db.collection("subscribers");
    
    // Apply filters
    if (status) {
      query = query.where("status", "==", status);
    }
    
    if (listId) {
      // Get subscribers in a specific list
      const membersSnapshot = await db.collection("lists")
        .doc(listId)
        .collection("members")
        .get();
      
      const subscriberIds = membersSnapshot.docs.map(doc => doc.id);
      
      if (subscriberIds.length === 0) {
        // Return empty CSV
        return {
          csv: "email,name,status,subscriptionDate\n",
          count: 0,
        };
      }
      
      // Firestore limits 'in' queries to 10 items, so we need to batch
      const batches = [];
      const batchSize = 10;
      
      for (let i = 0; i < subscriberIds.length; i += batchSize) {
        const batch = subscriberIds.slice(i, i + batchSize);
        batches.push(batch);
      }
      
      const subscribersPromises = batches.map(batch => 
        db.collection("subscribers")
          .where(admin.firestore.FieldPath.documentId(), "in", batch)
          .get(),
      );
      
      const snapshotsList = await Promise.all(subscribersPromises);
      
      // Merge results
      let subscribers = [];
      
      snapshotsList.forEach(snapshot => {
        snapshot.forEach(doc => {
          subscribers.push({
            id: doc.id,
            ...doc.data(),
          });
        });
      });
      
      // Apply status filter if provided
      if (status) {
        subscribers = subscribers.filter(sub => sub.status === status);
      }
      
      // Generate CSV
      return generateSubscriberCSV(subscribers);
    } else {
      // Get all subscribers
      const subscribersSnapshot = await query.get();
      
      const subscribers = [];
      
      subscribersSnapshot.forEach(doc => {
        subscribers.push({
          id: doc.id,
          ...doc.data(),
        });
      });
      
      // Generate CSV
      return generateSubscriberCSV(subscribers);
    }
  } catch (error) {
    console.error("Error exporting subscribers:", error);
    throw new functions.https.HttpsError("internal", "Failed to export subscribers");
  }
});

// Helper function to generate CSV
function generateSubscriberCSV(subscribers) {
  // Start with headers
  let csv = "email,name,status,subscriptionDate";
  
  // Add custom fields to headers
  const customFields = new Set();
  
  subscribers.forEach(subscriber => {
    if (subscriber.customFields) {
      Object.keys(subscriber.customFields).forEach(field => {
        customFields.add(field);
      });
    }
  });
  
  customFields.forEach(field => {
    csv += `,${escapeCSVValue(field)}`;
  });
  
  csv += "\n";
  
  // Add subscriber data
  subscribers.forEach(subscriber => {
    const subscriptionDate = subscriber.subscriptionDate 
      ? subscriber.subscriptionDate.toDate().toISOString().split("T")[0]
      : "";
    
    csv += `${escapeCSVValue(subscriber.email)},`;
    csv += `${escapeCSVValue(subscriber.name || "")},`;
    csv += `${escapeCSVValue(subscriber.status || "")},`;
    csv += `${escapeCSVValue(subscriptionDate)}`;
    
    // Add custom fields
    customFields.forEach(field => {
      const value = subscriber.customFields && subscriber.customFields[field] 
        ? subscriber.customFields[field]
        : "";
      
      csv += `,${escapeCSVValue(value)}`;
    });
    
    csv += "\n";
  });
  
  return {
    csv,
    count: subscribers.length,
  };
}

// Helper function to escape CSV values
function escapeCSVValue(value) {
  if (value === null || value === undefined) {
    return "";
  }
  
  const stringValue = String(value);
  
  // If the value contains a comma, newline, or double quote, enclose it in double quotes
  if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes("\"")) {
    // Replace double quotes with two double quotes
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  
  return stringValue;
}

// Helper function to parse a CSV line (handles quoted values)
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === "\"") {
      if (inQuotes && i + 1 < line.length && line[i + 1] === "\"") {
        // Double quotes inside quotes - add a single quote
        current += "\"";
        i++;
      } else {
        // Toggle quotes mode
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      // End of field
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(current);
  
  return result;
}

// Helper function to validate email
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}