//lists.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance

// Create or update a list
exports.saveList = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email lists.",
    );
  }
  
  try {
    const { id, name, description } = data;
    
    // Validate required fields
    if (!name) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "List name is required",
      );
    }
    
    // List data
    const listData = {
      name,
      description: description || "",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    let listId = id;
    
    if (listId) {
      // Update existing list
      await db.collection("lists").doc(listId).update(listData);
    } else {
      // Create new list
      listData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      listData.subscriberCount = 0;
      
      const docRef = await db.collection("lists").add(listData);
      listId = docRef.id;
    }
    
    return { success: true, listId };
  } catch (error) {
    console.error("Error saving list:", error);
    throw new functions.https.HttpsError("internal", "Failed to save list");
  }
});

// Get all lists
exports.getLists = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email lists.",
    );
  }
  
  try {
    const listsSnapshot = await db.collection("lists")
      .orderBy("name")
      .get();
    
    const lists = [];
    
    listsSnapshot.forEach(doc => {
      lists.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return { lists };
  } catch (error) {
    console.error("Error getting lists:", error);
    throw new functions.https.HttpsError("internal", "Failed to get lists");
  }
});

// Get a specific list
exports.getList = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email lists.",
    );
  }
  
  try {
    const { listId } = data;
    
    if (!listId) {
      throw new functions.https.HttpsError("invalid-argument", "List ID is required");
    }
    
    const listDoc = await db.collection("lists").doc(listId).get();
    
    if (!listDoc.exists) {
      throw new functions.https.HttpsError("not-found", "List not found");
    }
    
    return {
      id: listDoc.id,
      ...listDoc.data(),
    };
  } catch (error) {
    console.error("Error getting list:", error);
    throw new functions.https.HttpsError("internal", "Failed to get list");
  }
});

// Delete a list
exports.deleteList = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email lists.",
    );
  }
  
  try {
    const { listId } = data;
    
    if (!listId) {
      throw new functions.https.HttpsError("invalid-argument", "List ID is required");
    }
    
    // Check if the list is in use by campaigns
    const campaignsSnapshot = await db.collection("campaigns")
      .where("listIds", "array-contains", listId)
      .limit(1)
      .get();
    
    if (!campaignsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "List is in use by one or more campaigns and cannot be deleted",
      );
    }
    
    // Check if the list is in use by workflows
    const workflowsSnapshot = await db.collection("workflows")
      .where("steps.listId", "==", listId)
      .limit(1)
      .get();
    
    if (!workflowsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "List is in use by one or more workflows and cannot be deleted",
      );
    }
    
    // Get all members
    const membersSnapshot = await db.collection("lists")
      .doc(listId)
      .collection("members")
      .get();
    
    const batch = db.batch();
    let batchCount = 0;
    let currentBatch = db.batch();
    const batchSize = 500; // Firestore batch limit
    
    // Remove list from subscribers
    for (const memberDoc of membersSnapshot.docs) {
      const subscriberId = memberDoc.id;
      
      // Delete member document
      currentBatch.delete(memberDoc.ref);
      batchCount++;
      
      // Update subscriber's listIds
      currentBatch.update(db.collection("subscribers").doc(subscriberId), {
        listIds: admin.firestore.FieldValue.arrayRemove(listId),
      });
      batchCount++;
      
      if (batchCount >= batchSize) {
        // Commit batch and start a new one
        await currentBatch.commit();
        currentBatch = db.batch();
        batchCount = 0;
      }
    }
    
    // Delete the list
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    await db.collection("lists").doc(listId).delete();
    
    return { success: true };
  } catch (error) {
    console.error("Error deleting list:", error);
    throw new functions.https.HttpsError("internal", "Failed to delete list");
  }
});

// Add subscribers to a list
exports.addSubscribersToList = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email lists.",
    );
  }
  
  try {
    const { listId, subscriberIds } = data;
    
    if (!listId) {
      throw new functions.https.HttpsError("invalid-argument", "List ID is required");
    }
    
    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Subscriber IDs are required");
    }
    
    // Check if list exists
    const listDoc = await db.collection("lists").doc(listId).get();
    
    if (!listDoc.exists) {
      throw new functions.https.HttpsError("not-found", "List not found");
    }
    
    // Get current members
    const membersSnapshot = await db.collection("lists")
      .doc(listId)
      .collection("members")
      .get();
    
    const existingMembers = new Set();
    
    membersSnapshot.forEach(doc => {
      existingMembers.add(doc.id);
    });
    
    // Add subscribers to list
    let addedCount = 0;
    const batch = db.batch();
    let batchCount = 0;
    let currentBatch = db.batch();
    const batchSize = 500; // Firestore batch limit
    
    for (const subscriberId of subscriberIds) {
      // Skip if already a member
      if (existingMembers.has(subscriberId)) {
        continue;
      }
      
      // Check if subscriber exists
      const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
      
      if (!subscriberDoc.exists) {
        console.log(`Subscriber not found: ${subscriberId}`);
        continue;
      }
      
      // Add to list
      currentBatch.set(
        db.collection("lists").doc(listId).collection("members").doc(subscriberId),
        {
          subscriberId: subscriberId,
          addedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
      );
      batchCount++;
      
      // Update subscriber's listIds
      currentBatch.update(db.collection("subscribers").doc(subscriberId), {
        listIds: admin.firestore.FieldValue.arrayUnion(listId),
      });
      batchCount++;
      
      addedCount++;
      
      if (batchCount >= batchSize) {
        // Commit batch and start a new one
        await currentBatch.commit();
        currentBatch = db.batch();
        batchCount = 0;
      }
    }
    
    // Commit final batch if needed
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    // Update list subscriber count
    await db.collection("lists").doc(listId).update({
      subscriberCount: admin.firestore.FieldValue.increment(addedCount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { 
      success: true, 
      addedCount,
      skippedCount: subscriberIds.length - addedCount,
    };
  } catch (error) {
    console.error("Error adding subscribers to list:", error);
    throw new functions.https.HttpsError("internal", "Failed to add subscribers to list");
  }
});

// Remove subscribers from a list
exports.removeSubscribersFromList = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage email lists.",
    );
  }
  
  try {
    const { listId, subscriberIds } = data;
    
    if (!listId) {
      throw new functions.https.HttpsError("invalid-argument", "List ID is required");
    }
    
    if (!subscriberIds || !Array.isArray(subscriberIds) || subscriberIds.length === 0) {
      throw new functions.https.HttpsError("invalid-argument", "Subscriber IDs are required");
    }
    
    // Check if list exists
    const listDoc = await db.collection("lists").doc(listId).get();
    
    if (!listDoc.exists) {
      throw new functions.https.HttpsError("not-found", "List not found");
    }
    
    // Remove subscribers from list
    let removedCount = 0;
    const batch = db.batch();
    let batchCount = 0;
    let currentBatch = db.batch();
    const batchSize = 500; // Firestore batch limit
    
    for (const subscriberId of subscriberIds) {
      // Check if subscriber is in the list
      const memberDoc = await db.collection("lists")
        .doc(listId)
        .collection("members")
        .doc(subscriberId)
        .get();
      
      if (!memberDoc.exists) {
        continue;
      }
      
      // Remove from list
      currentBatch.delete(memberDoc.ref);
      batchCount++;
      
      // Update subscriber's listIds
      currentBatch.update(db.collection("subscribers").doc(subscriberId), {
        listIds: admin.firestore.FieldValue.arrayRemove(listId),
      });
      batchCount++;
      
      removedCount++;
      
      if (batchCount >= batchSize) {
        // Commit batch and start a new one
        await currentBatch.commit();
        currentBatch = db.batch();
        batchCount = 0;
      }
    }
    
    // Commit final batch if needed
    if (batchCount > 0) {
      await currentBatch.commit();
    }
    
    // Update list subscriber count
    await db.collection("lists").doc(listId).update({
      subscriberCount: admin.firestore.FieldValue.increment(-removedCount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    return { 
      success: true, 
      removedCount,
      skippedCount: subscriberIds.length - removedCount,
    };
  } catch (error) {
    console.error("Error removing subscribers from list:", error);
    throw new functions.https.HttpsError("internal", "Failed to remove subscribers from list");
  }
});

// Get subscribers in a list
exports.getListMembers = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access email lists.",
    );
  }
  
  try {
    const { listId, limit, offset } = data;
    
    if (!listId) {
      throw new functions.https.HttpsError("invalid-argument", "List ID is required");
    }
    
    // Check if list exists
    const listDoc = await db.collection("lists").doc(listId).get();
    
    if (!listDoc.exists) {
      throw new functions.https.HttpsError("not-found", "List not found");
    }
    
    // Get members
    let membersQuery = db.collection("lists")
      .doc(listId)
      .collection("members");
    
    // Get total count (inefficient but Firestore doesn't support count queries)
    const countSnapshot = await membersQuery.get();
    const total = countSnapshot.size;
    
    // Apply pagination
    if (offset) {
      membersQuery = membersQuery.offset(offset);
    }
    
    if (limit) {
      membersQuery = membersQuery.limit(limit);
    }
    
    const membersSnapshot = await membersQuery.get();
    
    const memberIds = [];
    membersSnapshot.forEach(doc => {
      memberIds.push(doc.id);
    });
    
    // Get subscriber details
    const subscribers = [];
    
    // Firestore limits 'in' queries to 10 items, so we need to batch
    const batches = [];
    const batchSize = 10;
    
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      batches.push(batch);
    }
    
    const subscribersPromises = batches.map(batch => 
      db.collection("subscribers")
        .where(admin.firestore.FieldPath.documentId(), "in", batch)
        .get(),
    );
    
    const snapshotsList = await Promise.all(subscribersPromises);
    
    // Merge results
    snapshotsList.forEach(snapshot => {
      snapshot.forEach(doc => {
        subscribers.push({
          id: doc.id,
          ...doc.data(),
        });
      });
    });
    
    return { 
      subscribers,
      total,
    };
  } catch (error) {
    console.error("Error getting list members:", error);
    throw new functions.https.HttpsError("internal", "Failed to get list members");
  }
});