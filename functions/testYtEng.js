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
    const englishPath = path.join(__dirname, "../video-generator/out/englishPromo.mp4");
    const youtube = await getYouTubeClient();

    console.log("--- Processing English Promo (YouTube) ---");
    await uploadToYouTube(youtube, englishPath, "Tech News Without the Fluff 🚀", "Tired of reading 100 pages of tech news? \nOur AI reads everything.\nYou only get what matters!\n\nTrendingTechDaily.com\n#TechNews #AI #TrendingTechDaily");

    console.log("DONE!");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
};

main();
