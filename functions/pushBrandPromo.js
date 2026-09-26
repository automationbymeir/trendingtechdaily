/**
 * pushBrandPromo.js — one-shot uploader for the long-form brand promo.
 *
 * Renders are produced by Remotion and saved at:
 *   video-generator/out/brandPromoHebrew.mp4   (1080×1920, 60s)
 *
 * This script:
 *   1. Pushes the file to Firebase Storage (public URL for IG)
 *   2. Uploads to YouTube (privacyStatus: public)
 *   3. Uploads to Instagram as a REELS
 *
 * Run with:
 *   cd functions && node pushBrandPromo.js
 */

const admin = require('firebase-admin');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

if (!admin.apps.length) {
  admin.initializeApp({
    storageBucket: 'trendingtech-daily.appspot.com',
    projectId: 'trendingtech-daily',
  });
}

const IG_USER_ID = '17841427939019963';
const IG_ACCESS_TOKEN =
  process.env.IG_ACCESS_TOKEN ||
  'EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD';

const YT_TITLE = 'TrendingTechDaily — חדשות טכנולוגיה בלי הרעש 🚀';
const YT_DESCRIPTION = `מרגישים שטובעים בחדשות טכנולוגיה? \nאנחנו אוספים, מסננים ומסכמים את כל מה שחשוב — בעברית ובאנגלית.\n\n✨ מאומת מ-3+ מקורות\n🎙️ פודקאסטים יומיים\n🌅 מגיע אליכם כל בוקר\n\nלחצו והצטרפו: https://trendingtechdaily.com\n\n#TrendingTechDaily #טכנולוגיה #AI #TechNews #חדשותטק`;
const YT_TAGS = ['tech', 'news', 'AI', 'trending', 'TrendingTechDaily', 'טכנולוגיה'];

const IG_CAPTION = `מרגישים שטובעים בחדשות טכנולוגיה? 🚀\n\nאנחנו אוספים, מסננים ומסכמים את הכל — בעברית ובאנגלית.\n\n✅ מאומת מ-3+ מקורות\n🎙️ פודקאסטים יומיים\n🌅 מגיע אליכם כל בוקר\n\n👉 TrendingTechDaily.com\n\n#טכנולוגיה #חדשות #AI #TrendingTechDaily #TechNews`;

const getYouTubeClient = async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_client_secret.json'), 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_tokens.json'), 'utf8'));
  const oauth2Client = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );
  oauth2Client.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const uploadToFirebaseStorage = async (filePath) => {
  const bucket = admin.storage().bucket();
  const destPath = `promos/brandPromo_${Date.now()}_${uuidv4()}.mp4`;
  console.log(`[Storage] uploading → ${destPath}`);
  await bucket.upload(filePath, {
    destination: destPath,
    metadata: { contentType: 'video/mp4' },
  });
  const file = bucket.file(destPath);
  await file.makePublic();
  const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
  console.log(`[Storage] public URL: ${publicUrl}`);
  return publicUrl;
};

const uploadToYouTube = async (youtube, videoPath) => {
  console.log(`[YouTube] uploading "${YT_TITLE}"…`);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: YT_TITLE,
        description: YT_DESCRIPTION,
        tags: YT_TAGS,
        categoryId: '28',     // Science & Technology
        defaultLanguage: 'he',
        defaultAudioLanguage: 'he',
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  console.log(`[YouTube] uploaded id=${res.data.id} → https://youtu.be/${res.data.id}`);
  return res.data.id;
};

const uploadToInstagramReels = async (videoUrl, caption) => {
  console.log('[Instagram] creating REELS container…');
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    access_token: IG_ACCESS_TOKEN,
    caption,
    share_to_feed: 'true',
  });
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  });
  const createData = await createRes.json();
  if (createData.error) throw new Error(`IG container error: ${JSON.stringify(createData.error)}`);
  const creationId = createData.id;
  console.log(`[Instagram] container ${creationId} — polling…`);

  // Poll until FINISHED (Reels usually take 30–90s to transcode)
  let ready = false;
  for (let i = 0; i < 40 && !ready; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v20.0/${creationId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
    );
    const statusData = await statusRes.json();
    console.log(`  poll ${i + 1}: ${statusData.status_code}`);
    if (statusData.status_code === 'FINISHED') ready = true;
    else if (statusData.status_code === 'ERROR') throw new Error('IG processing error');
  }
  if (!ready) throw new Error('IG container not ready after timeout');

  const publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: IG_ACCESS_TOKEN }),
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG publish error: ${JSON.stringify(publishData.error)}`);
  console.log(`[Instagram] published id=${publishData.id}`);
  return publishData.id;
};

const main = async () => {
  const videoPath = path.join(__dirname, '..', 'video-generator', 'out', 'brandPromoHebrew.mp4');
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Render not found: ${videoPath}`);
  }
  console.log(`[Brand promo] source: ${videoPath} (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);

  // Run YouTube + Storage in parallel; IG depends on storage URL.
  const youtube = await getYouTubeClient();
  const [ytId, publicUrl] = await Promise.all([
    uploadToYouTube(youtube, videoPath).catch((e) => {
      console.error('[YouTube] FAILED:', e.message);
      return null;
    }),
    uploadToFirebaseStorage(videoPath),
  ]);

  let igId = null;
  try {
    igId = await uploadToInstagramReels(publicUrl, IG_CAPTION);
  } catch (e) {
    console.error('[Instagram] FAILED:', e.message);
  }

  console.log('\n──────────── SUMMARY ────────────');
  console.log(`YouTube:   ${ytId ? `https://youtu.be/${ytId}` : 'FAILED'}`);
  console.log(`Storage:   ${publicUrl}`);
  console.log(`Instagram: ${igId ? `id=${igId}` : 'FAILED'}`);
  console.log('─────────────────────────────────');
  process.exit(ytId || igId ? 0 : 1);
};

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
