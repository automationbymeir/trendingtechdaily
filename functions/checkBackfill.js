const admin = require("firebase-admin");
admin.initializeApp({ projectId: "trendingtech-daily" });
const db = admin.firestore();

async function run() {
  const all = await db.collection("video_logs").where("status", "==", "success").get();
  let done = 0;
  let pending = 0;
  all.forEach(d => {
    if (d.data().facebookUrl) done++;
    else pending++;
  });
  console.log(`Done: ${done}, Pending: ${pending}`);
  process.exit(0);
}
run();
