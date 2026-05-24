// functions/services/firestoreService.js

const { db, admin, logger } = require("../config");

/**
 * Deletes old items and saves a new batch of items for a given category.
 * Handles both 'news' and 'stocks' collections.
 * @param {string} category The category name (e.g., "AI", "Gadgets", "stocks").
 * @param {Array<Object>} items The array of items to save.
 */
async function saveToFirestore(category, items) {
  if (!items || items.length === 0) {
    logger.warn(`No items provided to save for ${category}`);
    return;
  }
  
  const batch = db.batch();
  const collectionName = category === "stocks" ? "stocks" : "news";
  
  try {
    let query = db.collection(collectionName);
    if (collectionName === "news") {
      // For news, clear out the specific category before adding new ones.
      query = query.where("category", "==", category);
    }
    
    // Delete all existing documents in the category/collection.
    const existingDocsSnapshot = await query.limit(500).get(); // Limit to 500 to stay within batch limits.
    existingDocsSnapshot.forEach(doc => batch.delete(doc.ref));
    
    // Limit the number of articles to save for news categories.
    const itemsToSave = collectionName === "news" ? items.slice(0, 15) : items;
    
    // Add new documents to the batch.
    itemsToSave.forEach(item => {
      const docRef = db.collection(collectionName).doc(); // Auto-generate ID
      batch.set(docRef, { ...item, savedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    
    // Commit the batch operation.
    await batch.commit();
    logger.info(`Successfully saved ${itemsToSave.length} items for ${category} in ${collectionName}.`);
    
  } catch (error) {
    logger.error(`Error saving data for ${category} to Firestore:`, error);
    // Re-throw the error so the calling function knows something went wrong.
    throw error;
  }
}

module.exports = { saveToFirestore };