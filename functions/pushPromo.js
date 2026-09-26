const admin = require("firebase-admin");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require('uuid');

admin.initializeApp({
  storageBucket: "trendingtech-daily.appspot.com",
  projectId: "trendingtech-daily"
});

// Instagram Graph API Constants
const IG_USER_ID = "17841427939019963";
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD";

const getYouTubeClient = async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  
  const secretPath = path.join(__dirname, "youtube_client_secret.json");
  const tokenPath = path.join(__dirname, "youtube_tokens.json");
  const secrets = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );
  oauth2Client.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const uploadToYouTube = async (youtube, videoPath, title, description) => {
  console.log(`Uploading to YouTube: ${title}...`);
  const uploadRes = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, tags: ["tech", "news", "trending"], categoryId: "28" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  console.log(`YouTube upload successful: ${uploadRes.data.id}`);
  return uploadRes.data.id;
};

const uploadToFirebaseStorage = async (filePath) => {
  const bucket = admin.storage().bucket();
  const destPath = `promos/${path.basename(filePath)}_${uuidv4()}.mp4`;
  console.log(`Uploading to Firebase Storage: ${destPath}...`);
  await bucket.upload(filePath, {
    destination: destPath,
    metadata: {
      contentType: 'video/mp4',
    }
  });
  const file = bucket.file(destPath);
  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
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

    const youtube = await getYouTubeClient();

    // Hebrew
    console.log("--- Processing Hebrew Promo ---");
    const hebrewUrl = await uploadToFirebaseStorage(hebrewPath);
    await uploadToYouTube(youtube, hebrewPath, "חדשות טכנולוגיה בלי החרטוטים 🚀", "נמאס לכם לקרוא 100 עמודי חדשות? \nבנינו בינה מלאכותית שקוראת הכל. \nאתם מקבלים רק את מה שחשוב!\n\nTrendingTechDaily.com\n#טכנולוגיה #חדשות #בינהמלאכותית");
    await uploadToInstagram("REELS", hebrewUrl, "מרגישים שטובעים בחדשות טכנולוגיה? 🚀 אנחנו מסכמים לכם הכל! \nכנסו ל- TrendingTechDaily.com\n#טכנולוגיה #חדשות #AI");

    // English
    console.log("--- Processing English Promo ---");
    const englishUrl = await uploadToFirebaseStorage(englishPath);
    await uploadToYouTube(youtube, englishPath, "Tech News Without the Fluff 🚀", "Tired of reading 100 pages of tech news? \nOur AI reads everything.\nYou only get what matters!\n\nTrendingTechDaily.com\n#TechNews #AI #TrendingTechDaily");
    await uploadToInstagram("REELS", englishUrl, "Feeling drowning in Tech News? 🚀 We summarize it all for you! \nVisit TrendingTechDaily.com\n#TechNews #Technology #AI");

    console.log("DONE!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

main();
