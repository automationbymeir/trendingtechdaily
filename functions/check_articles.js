const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp(); // Assuming GOOGLE_APPLICATION_CREDENTIALS or emulator
}
const db = admin.firestore();

async function check() {
    console.log("Checking articles...");
    try {
        const en = await db.collection("articles").where("published", "==", true).limit(5).get();
        console.log("English published articles:", en.docs.length);
        
        const he = await db.collection("hebrewArticles").where("published", "==", true).limit(5).get();
        console.log("Hebrew published articles:", he.docs.length);
        
        const he_alt = await db.collection("he_articles").where("published", "==", true).limit(5).get();
        console.log("Hebrew alt published articles:", he_alt.docs.length);
    } catch(err) {
        console.error("Error:", err.message);
    }
}

check().catch(console.error);
