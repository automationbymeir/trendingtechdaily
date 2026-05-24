// functions/admin/articles.js

// Import the initialized Firestore instance from your central config file
const { db, admin } = require("../config"); // Ensure admin is also imported if you use admin.firestore.FieldValue

/**
 * Helper function to safely access properties or return default
 * @param {function} fn - Function to execute for property access
 * @param {*} [defaultValue=''] - Default value to return on error or undefined
 * @returns {*} The property value or the default value
 */
function getSafe(fn, defaultValue = "") {
  try {
    const value = fn();
    return (value !== null && value !== undefined) ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Retrieves all articles, ordered by creation date descending.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of article objects.
 */
exports.getAllArticles = async () => {
  try {
    const articlesSnapshot = await db.collection("articles").orderBy("createdAt", "desc").get();
    return articlesSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error("Error getting articles:", error);
    throw error;
  }
};

/**
 * Retrieves a single article by its document ID.
 * @param {string} articleId - The ID of the article document.
 * @returns {Promise<Object>} A promise that resolves to the article object.
 */
exports.getArticleById = async (articleId) => {
  try {
    const articleDoc = await db.collection("articles").doc(articleId).get();
    if (!articleDoc.exists) {
      const notFoundError = new Error("Article not found");
      notFoundError.status = 404; 
      throw notFoundError;
    }
    return {
      id: articleDoc.id,
      ...articleDoc.data(),
    };
  } catch (error) {
    console.error(`Error getting article ${articleId}:`, error);
    throw error;
  }
};

/**
 * Creates a new article document in Firestore.
 * @param {Object} articleData - The data for the new article.
 * @returns {Promise<Object>} A promise that resolves to the newly created article object with its ID.
 */
exports.createArticle = async (articleData) => {
  try {
    const article = {
      title: getSafe(() => articleData.title, "Untitled Article"),
      slug: getSafe(() => articleData.slug, ""), 
      excerpt: getSafe(() => articleData.excerpt, ""),
      category: getSafe(() => articleData.category, ""),
      tags: getSafe(() => articleData.tags, []),
      featuredImage: getSafe(() => articleData.featuredImage, ""),
      imageAltText: getSafe(() => articleData.imageAltText, ""),
      content: getSafe(() => articleData.content, ""),
      published: getSafe(() => articleData.published, false),
      readingTimeMinutes: (typeof articleData.readingTimeMinutes === "number" && articleData.readingTimeMinutes >= 0)
        ? articleData.readingTimeMinutes
        : 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(), 
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), 
    };

    const docRef = await db.collection("articles").add(article);
    console.log(`Article created with ID: ${docRef.id}`);
    return {
      id: docRef.id,
      ...article, // Note: timestamps will be null here from local object
    };
  } catch (error) {
    console.error("Error creating article:", error);
    throw error;
  }
};

/**
 * Updates an existing article document in Firestore.
 * @param {string} articleId - The ID of the article to update.
 * @param {Object} articleData - The data to update.
 * @returns {Promise<Object>} A promise that resolves to the updated article data object.
 */
exports.updateArticle = async (articleId, articleData) => {
  try {
    const articleUpdate = {
      title: getSafe(() => articleData.title, undefined),
      slug: getSafe(() => articleData.slug, undefined),
      excerpt: getSafe(() => articleData.excerpt, undefined),
      category: getSafe(() => articleData.category, undefined),
      tags: getSafe(() => articleData.tags, undefined),
      featuredImage: getSafe(() => articleData.featuredImage, undefined),
      imageAltText: getSafe(() => articleData.imageAltText, undefined),
      content: getSafe(() => articleData.content, undefined),
      published: getSafe(() => articleData.published, undefined),
      readingTimeMinutes: (typeof articleData.readingTimeMinutes === "number" && articleData.readingTimeMinutes >= 0)
        ? articleData.readingTimeMinutes
        : (articleData.readingTimeMinutes === undefined ? undefined : 0), // Keep undefined if not passed, else default to 0
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    Object.keys(articleUpdate).forEach(key => articleUpdate[key] === undefined && delete articleUpdate[key]);
    delete articleUpdate.createdAt;

    const docRef = db.collection("articles").doc(articleId);
    await docRef.update(articleUpdate);
    console.log(`Article updated with ID: ${articleId}`);

    const updatedDoc = await docRef.get();
    if (!updatedDoc.exists) {
      throw new Error("Article disappeared after update"); 
    }
    return {
      id: articleId,
      ...updatedDoc.data(),
    };
  } catch (error) {
    console.error(`Error updating article ${articleId}:`, error);
    if (error.code === 5 || error.message.includes("NOT_FOUND") || error.message.includes("No document to update")) { 
      const notFoundError = new Error("Article not found for update");
      notFoundError.status = 404;
      throw notFoundError;
    }
    throw error;
  }
};

/**
 * Deletes an article document from Firestore.
 * @param {string} articleId - The ID of the article to delete.
 * @returns {Promise<Object>} A promise that resolves to { success: true } on successful deletion.
 */
exports.deleteArticle = async (articleId) => {
  try {
    const docRef = db.collection("articles").doc(articleId);
    await docRef.delete();
    console.log(`Article deleted with ID: ${articleId}`);
    return { success: true };
  } catch (error) {
    console.error(`Error deleting article ${articleId}:`, error);
    if (error.code === 5 || error.message.includes("NOT_FOUND")) {
      const notFoundError = new Error("Article not found for deletion");
      notFoundError.status = 404;
      throw notFoundError;
    }
    throw error;
  }
};