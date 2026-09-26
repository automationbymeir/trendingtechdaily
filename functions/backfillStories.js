const admin = require("firebase-admin");
const serviceAccount = require("./sa.json"); // Assuming sa.json exists from previous work

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function backfill() {
  console.log("Starting backfill from video_logs to stories...");
  const snapshot = await db.collection("video_logs")
    .where("status", "==", "success")
    .get();

  let count = 0;
  for (const doc of snapshot.docs) {
    const logData = doc.data();
    if (logData.highlightDownloadUrl) {
      // Check if it's already in stories
      const existing = await db.collection("stories").where("articleId", "==", logData.articleId).get();
      if (existing.empty) {
        // Find thumbnail by querying article
        let thumbnail = "/img/logo.png";
        let articleUrl = "";
        try {
          const coll = logData.language === 'he' ? 'he_articles' : 'articles';
          const artDoc = await db.collection(coll).doc(logData.articleId).get();
          if (artDoc.exists) {
            thumbnail = artDoc.data().featuredImage || thumbnail;
            const category = artDoc.data().category || "tech";
            const slug = artDoc.data().slug || logData.articleId;
            articleUrl = logData.language === 'he' 
              ? `https://www.trendingtechdaily.com/he/${category}/${slug}`
              : `https://www.trendingtechdaily.com/${category}/${slug}`;
          }
        } catch(e) {
          console.warn("Could not fetch article for thumbnail:", logData.articleId);
        }

        await db.collection("stories").add({
          articleId: logData.articleId,
          title: logData.title,
          language: logData.language || "en",
          videoUrl: logData.highlightDownloadUrl,
          thumbnail: thumbnail,
          articleUrl: articleUrl,
          createdAt: new Date().toISOString()
        });
        console.log(`Added story for ${logData.title}`);
        count++;
      }
    }
  }
  console.log(`Backfill complete. Added ${count} stories.`);
}

backfill().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
