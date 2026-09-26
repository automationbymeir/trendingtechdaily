const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

const getYouTubeClient = async () => {
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

const main = async () => {
  try {
    const hebrewPath = path.join(__dirname, "../video-generator/out/hebrewPromo.mp4");
    const youtube = await getYouTubeClient();

    console.log("--- Processing Hebrew Promo (YouTube) ---");
    await uploadToYouTube(youtube, hebrewPath, "חדשות טכנולוגיה בלי החרטוטים 🚀", "נמאס לכם לקרוא 100 עמודי חדשות? \nבנינו בינה מלאכותית שקוראת הכל. \nאתם מקבלים רק את מה שחשוב!\n\nTrendingTechDaily.com\n#טכנולוגיה #חדשות #בינהמלאכותית");

    console.log("DONE!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

main();
