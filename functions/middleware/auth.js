// functions/middleware/auth.js

const { admin } = require("../config");

/**
 * Express middleware to verify Firebase ID token and check for admin custom claim.
 */
async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  
  if (!match) {
    return res.status(401).json({ error: "Unauthorized (no token)" });
  }

  try {
    const idToken = match[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    if (decodedToken.admin) {
      req.user = decodedToken; // Optionally attach user to request
      return next();
    } else {
      return res.status(403).json({ error: "Forbidden (not an admin)" });
    }
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized (invalid token)" });
  }
}

module.exports = { requireAdmin };