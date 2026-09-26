const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

async function checkSections() {
  const db = admin.firestore();
  const snapshot = await db.collection("sections").get();
  console.log("Found", snapshot.size, "sections");
  snapshot.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

checkSections().catch(console.error);
