const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp({
  projectId: "trendingtech-daily"
});

const db = admin.firestore();

// The never-expiring Page Token for "Trending Tech Daily"
const FB_ACCESS_TOKEN = "EAAXSLPA21hsBRUr8IQQ4nZAf6UB8ZAKLZBvjcquADMp7CTWxSNvdwwxsPrtNpfVMI9Wxhr3j9DKJVh0dtmigHiiMLh4UBNOuSabzzp9080MyrNZCJcQF2vh8QhTr04PXvTITMcypn8HTIMxDmDvgMr3oZAk63Yk6b41Rusvr2ZB40KBaxjOnVzhV8EqahZBT0az2gZDZD";
const FB_PAGE_ID = "1015383948335262";

const main = async () => {
  console.log("Starting Facebook backfill...");
  
  const logsSnapshot = await db.collection("video_logs").where("status", "==", "success").get();
  
  for (const doc of logsSnapshot.docs) {
    const logData = doc.data();
    if (logData.facebookUrl || logData.facebookPostId) {
      console.log(`Skipping ${doc.id}: already has Facebook URL.`);
      continue;
    }
    if (!logData.articleId) {
      console.log(`Skipping ${doc.id}: No article ID attached.`);
      continue;
    }

    try {
      console.log(`Processing article ${logData.articleId} (${logData.language})`);
      const collectionName = logData.language === "he" ? "hebrew_articles" : "articles";
      const articleDoc = await db.collection(collectionName).doc(logData.articleId).get();
      
      if (!articleDoc.exists) {
        console.log(`Article not found: ${logData.articleId}`);
        continue;
      }
      
      const article = articleDoc.data();
      
      // Determine URL
      let articleUrl = "";
      if (logData.language === "he") {
        articleUrl = `https://www.trendingtechdaily.com/he/${article.categorySlug}/${article.slug}`;
      } else {
        articleUrl = `https://www.trendingtechdaily.com/${article.categorySlug}/${article.slug}`;
      }

      // Format caption
      const fbCaption = `${article.title}\n\n${article.summary}\n\nRead more at: ${articleUrl}\n\n#TechNews #TrendingTechDaily`;
      
      console.log(`Publishing to Facebook Page...`);
      const fbRes = await fetch(`https://graph.facebook.com/v20.0/${FB_PAGE_ID}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.featuredImage,
          message: fbCaption,
          access_token: FB_ACCESS_TOKEN
        })
      });
      const fbData = await fbRes.json();
      
      if (fbData.error) {
        throw new Error(`Facebook API Error: ${JSON.stringify(fbData.error)}`);
      }
      
      let facebookPostId = fbData.post_id || fbData.id;
      const actualPostId = facebookPostId.includes('_') ? facebookPostId.split('_')[1] : facebookPostId;
      let facebookUrl = `https://www.facebook.com/${FB_PAGE_ID}/posts/${actualPostId}`;
      
      console.log(`Successfully published to Facebook Page! Post ID: ${facebookPostId}`);

      await doc.ref.update({
        facebookPostId,
        facebookUrl
      });
      
      // small delay to prevent rate limits
      await new Promise(r => setTimeout(r, 2000));
      
    } catch (e) {
      console.error(`Error processing ${doc.id}:`, e);
    }
  }
  
  console.log("Backfill complete!");
  process.exit(0);
};

main();
