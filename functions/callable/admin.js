// functions/callable/admin.js

const { HttpsError } = require("firebase-functions/v2/https");
const { admin, db, logger } = require("../config");

/**
 * A callable function to set a custom 'admin' claim on a user.
 * @param {object} request The request object, containing auth and data.
 * @param {string} request.data.uid The UID of the user to make an admin.
 */
async function createAdmin(request) {
  // Check if the caller is authenticated.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  
  // The UID of the user to make an admin. Can be passed in data or defaults to the caller's UID.
  const uid = request.data.uid || request.auth.uid;
  if (!uid) {
    throw new HttpsError("invalid-argument", "User UID is required.");
  }

  try {
    // Get the user record to access their email.
    const userRecord = await admin.auth().getUser(uid);
    const email = userRecord.email;
    
    logger.info(`Attempting to set admin claim for user: ${uid} (${email})`);

    // Set the custom claim.
    await admin.auth().setCustomUserClaims(uid, { admin: true });

    // For easier querying, also set a role in Firestore.
    await db.collection("users").doc(uid).set({
      email,
      role: "admin",
      isAdmin: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    logger.info(`Admin claim set successfully for user: ${uid}`);
    return { success: true, message: `User ${email} (${uid}) is now an admin.` };
    
  } catch (error) {
    logger.error(`Error creating admin for UID ${uid}:`, error);
    throw new HttpsError("internal", "An internal error occurred while setting the admin claim.", error.message);
  }
}

module.exports = {
  createAdmin,
};