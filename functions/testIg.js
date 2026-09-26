const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require('uuid');

admin.initializeApp({
  credential: admin.credential.cert(require('./sa.json')),
  storageBucket: "trendingtech-daily.appspot.com",
  projectId: "trendingtech-daily"
});

// Instagram Graph API Constants
const IG_USER_ID = "17841427939019963";
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD";

const FormData = require('form-data');

const uploadToTempStorage = async (filePath) => {
  console.log(`Uploading to tmpfiles.org: ${filePath}...`);
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));
  
  const res = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  if (data.status !== 'success') throw new Error('Temp upload failed');
  
  // Convert https://tmpfiles.org/123/file.mp4 to https://tmpfiles.org/dl/123/file.mp4
  const publicUrl = data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  console.log(`Public URL: ${publicUrl}`);
  return publicUrl;
};

const uploadToInstagram = async (mediaType, videoUrl, captionText) => {
  console.log(`Uploading to Instagram (${mediaType})...`);
  const params = new URLSearchParams({
    media_type: mediaType,
    video_url: videoUrl,
    access_token: IG_ACCESS_TOKEN
  });
  if (captionText) params.append("caption", captionText);

  let publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params
  });
  let publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG Container Error: ${JSON.stringify(publishData.error)}`);

  const creationId = publishData.id;
  console.log(`Container created: ${creationId}. Polling for readiness...`);

  let isReady = false;
  let attempts = 0;
  while (!isReady && attempts < 20) {
    attempts++;
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await fetch(`https://graph.facebook.com/v20.0/${creationId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`);
    const statusData = await statusRes.json();
    if (statusData.status_code === 'FINISHED') {
      isReady = true;
    } else if (statusData.status_code === 'ERROR') {
      throw new Error("IG Processing Error.");
    }
  }

  console.log(`Publishing container ${creationId}...`);
  const publishReq = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: IG_ACCESS_TOKEN })
  });
  const finalData = await publishReq.json();
  if (finalData.error) throw new Error(`IG Publish Error: ${JSON.stringify(finalData.error)}`);
  
  console.log(`Instagram Upload successful: ${finalData.id}`);
  return finalData.id;
};

const main = async () => {
  try {
    const hebrewPath = path.join(__dirname, "../video-generator/out/hebrewPromo.mp4");
    const englishPath = path.join(__dirname, "../video-generator/out/englishPromo.mp4");

    console.log("--- Processing Hebrew Promo (Instagram) ---");
    const hebrewUrl = await uploadToTempStorage(hebrewPath);
    await uploadToInstagram("REELS", hebrewUrl, "מרגישים שטובעים בחדשות טכנולוגיה? 🚀 אנחנו מסכמים לכם הכל! \nכנסו ל- TrendingTechDaily.com\n#טכנולוגיה #חדשות #AI");

    console.log("--- Processing English Promo (Instagram) ---");
    const englishUrl = await uploadToTempStorage(englishPath);
    await uploadToInstagram("REELS", englishUrl, "Feeling drowning in Tech News? 🚀 We summarize it all for you! \nVisit TrendingTechDaily.com\n#TechNews #Technology #AI");

    console.log("DONE!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

main();
