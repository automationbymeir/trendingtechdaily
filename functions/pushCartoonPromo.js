/**
 * pushCartoonPromo.js — one-shot uploader for the BIT/GLITCH cartoon promo.
 *
 * Takes a public MP4 URL (already rendered by Remotion Lambda) and:
 *   1. Downloads it locally
 *   2. Uploads to YouTube as a public Short (privacyStatus: public)
 *   3. Submits it to Instagram as a REELS using the public S3 URL
 *
 * Run:
 *   cd functions && node pushCartoonPromo.js <publicMp4Url>
 *
 * Defaults to the latest English render if no URL is provided.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Existing IG token used by the other one-shot push scripts in this project.
const IG_USER_ID = '17841427939019963';
const IG_ACCESS_TOKEN =
  process.env.IG_ACCESS_TOKEN ||
  'EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD';

const VIDEO_URL =
  process.argv[2] ||
  'https://s3.us-east-1.amazonaws.com/remotionlambda-useast1-di0xuqpokc/renders/dnex4f768h/out.mp4';

const YT_TITLE = 'Meet BIT 🤖 — Tech News, Decoded | TrendingTechDaily';
const YT_DESCRIPTION = `Hey, I'm BIT — I read a hundred tech sites every single day so you don't have to.
At TrendingTechDaily we filter the noise and hand you only what actually matters.

🤖 Apple's M5 chip, OpenAI's GPT-6, Tesla's robotaxi rollout — three-sentence briefs, no fluff.

👉 Decode the tech world with us at https://trendingtechdaily.com

#TrendingTechDaily #TechNews #AI #TechShorts #Apple #OpenAI #Tesla #BIT`;
const YT_TAGS = ['TrendingTechDaily', 'tech news', 'AI', 'BIT mascot', 'tech shorts', 'cartoon news'];

const IG_CAPTION = `Meet BIT 🤖 — the mascot who reads a hundred tech sites a day so you don't have to.

✅ Apple's M5 chip
✅ OpenAI's GPT-6
✅ Tesla's robotaxi rollout
All in three-sentence briefs. No fluff.

👉 TrendingTechDaily.com — your tech news, decoded.

#TrendingTechDaily #TechNews #AI #Apple #OpenAI #Tesla #BIT #CartoonNews`;

// ─── YouTube client (re-uses the long-lived refresh token we already have) ─
async function getYouTube() {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const secrets = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_client_secret.json'), 'utf8'));
  const tokens  = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube_tokens.json'), 'utf8'));
  const oauth2  = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );
  oauth2.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2 });
}

async function downloadToTmp(url) {
  const tmp = path.join(require('os').tmpdir(), `cartoon_${Date.now()}.mp4`);
  console.log(`[fetch] ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  console.log(`[fetch] saved ${tmp} (${(fs.statSync(tmp).size / 1024 / 1024).toFixed(1)} MB)`);
  return tmp;
}

async function uploadYouTube(youtube, localPath) {
  console.log(`[YT] uploading "${YT_TITLE}"…`);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title: YT_TITLE,
        description: YT_DESCRIPTION,
        tags: YT_TAGS,
        categoryId: '28', // Science & Technology
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(localPath) },
  });
  const id = res.data.id;
  const url = `https://www.youtube.com/shorts/${id}`;
  console.log(`[YT] uploaded id=${id} → ${url}`);
  return url;
}

async function uploadInstagram(publicVideoUrl) {
  console.log('[IG] creating REELS container…');
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: publicVideoUrl,
    access_token: IG_ACCESS_TOKEN,
    caption: IG_CAPTION,
    share_to_feed: 'true',
  });
  const create = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, { method: 'POST', body: params });
  const created = await create.json();
  if (created.error) throw new Error(`IG container: ${JSON.stringify(created.error)}`);
  const creationId = created.id;
  console.log(`[IG] container ${creationId} — polling…`);

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await (await fetch(
      `https://graph.facebook.com/v20.0/${creationId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`
    )).json();
    console.log(`  poll ${i + 1}: ${s.status_code}`);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('IG processing error');
  }

  const publish = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: IG_ACCESS_TOKEN }),
  });
  const pub = await publish.json();
  if (pub.error) throw new Error(`IG publish: ${JSON.stringify(pub.error)}`);
  const url = `https://www.instagram.com/reel/${pub.id}/`;
  console.log(`[IG] published id=${pub.id} → ${url}`);
  return url;
}

(async () => {
  const tmpPath = await downloadToTmp(VIDEO_URL);
  try {
    const youtube = await getYouTube();
    const [ytUrl, igUrl] = await Promise.all([
      uploadYouTube(youtube, tmpPath).catch((e) => { console.error('YT failed:', e.message); return null; }),
      uploadInstagram(VIDEO_URL).catch((e) => { console.error('IG failed:', e.message); return null; }),
    ]);
    console.log('\n──── DONE ────');
    console.log(`YouTube:   ${ytUrl || 'FAILED'}`);
    console.log(`Instagram: ${igUrl || 'FAILED'}`);
    console.log('──────────────');
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
  }
})().catch((err) => { console.error('Fatal:', err); process.exit(1); });
