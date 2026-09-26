const admin = require("firebase-admin");

// Verify admin role
exports.verifyAdmin = async (uid) => {
  try {
    const userDoc = await admin.firestore().collection("users").doc(uid).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData.role === "admin";
  } catch (error) {
    console.error("Error verifying admin:", error);
    return false;
  }
};

// Admin authentication middleware
exports.requireAdmin = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(403).json({ error: "Unauthorized" });
  }
  
  const idToken = authHeader.split("Bearer ")[1];
  
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const isAdmin = await exports.verifyAdmin(decodedToken.uid);
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error("Error verifying token:", error);
    return res.status(403).json({ error: "Unauthorized" });
  }
};