/**
 * weeklyDigestPipeline.js
 * ---------------------------------------------------------------------------
 * Builds the "BIT's Weekly Tech News Roundup" video — a ~3-minute vertical
 * news show where the BIT mascot anchor introduces each of the week's top
 * 5 article stories with PIP, then cuts to the full article video.
 *
 *   1. Pull the 5 most recent stories with `videoUrl` from the `stories`
 *      collection (services/weeklyDigestContent.js).
 *   2. Have Gemini write BIT's anchor script (intro + per-story bitLine
 *      + outro).
 *   3. Run TTS on every spoken line (Google TTS for HE, ElevenLabs for EN —
 *      same routing as the cartoon promo).
 *   4. Generate Veo Fast anchor clips: 1 intro, 1 per story (paired with
 *      PIP), 1 segue, 1 outro. Green-screen monitor stays solid behind BIT
 *      so Remotion can overlay the article video on top.
 *   5. Submit to Remotion Lambda → returns MP4 URL.
 *   6. Does NOT publish — returns the URL for review (per user request).
 *
 * Public API:
 *   postWeeklyDigest({ language, trigger? }) → { success, videoUrl, runId, ... }
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { google } = require('googleapis');
const { renderMediaOnLambda, getRenderProgress } = require('@remotion/lambda/client');

const { logger, db } = require('./config');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');
const { buildWeeklyDigest } = require('./services/weeklyDigestContent');
const { synthesizeCartoonLine } = require('./services/cartoonTts');
const { generateAnchorScene, resetReferenceImage } = require('./services/cartoonAnchorScene');
const { getStaticAnchorImages } = require('./services/cartoonAnchorStatic');

// Hardcoded IG token used by other one-shot scripts in this project.
const IG_USER_ID = '17841427939019963';
const IG_TOKEN_FALLBACK =
  'EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD';
function getIgToken() { return (process.env.IG_ACCESS_TOKEN || IG_TOKEN_FALLBACK).trim(); }

const REMOTION_REGION = 'us-east-1';
const REMOTION_FUNCTION = 'remotion-render-4-0-452-mem3008mb-disk2048mb-900sec';
const REMOTION_SERVE_URL =
  'https://remotionlambda-useast1-di0xuqpokc.s3.us-east-1.amazonaws.com/sites/trending-tech-daily/index.html';

function trimAwsCreds() {
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID.trim();
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY.trim();
  }
}

async function getGenAI() {
  if (!process.env.GEMINI_API_KEY) return null;
  await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!GoogleGenAI) return null;
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

// Same estimator we use in the cartoon promo pipeline — based on character
// count so we don't have to probe MP3 byte size.
function estimateAudioFrames(text, language, fps = 30) {
  const cps = language === 'he' ? 12 : 14;
  const seconds = Math.max(2.5, String(text || '').length / cps + 0.7);
  return Math.round(seconds * fps);
}

// ─── Public ────────────────────────────────────────────────────────────────
// ─── News-show intro music sting ───────────────────────────────────────────
// 5-second cinematic broadcast opener via ElevenLabs sound-generation. The
// sting underlays the animated logo reveal, then BIT starts speaking.
async function generateIntroSting(runId) {
  const xiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!xiKey) return '';
  const POOLS = [
    'Cinematic news broadcast intro sting, 5 seconds, urgent orchestral hit, swelling brass, deep bass impact, electronic synth swoosh, modern news network signature. Punchy resolved ending. Instrumental, no vocals.',
    'Modern tech-news intro sting, 5 seconds, energetic synthwave hit, rising electronic pulse, crisp percussion punch, futuristic edge. Bold confident ending. Instrumental, no vocals.',
    'Premium broadcast news opener, 5 seconds, powerful orchestral percussion, glowing synth bell, deep cinematic boom, anticipation buildup. Clean resolved finish. Instrumental, no vocals.',
  ];
  const prompt = POOLS[Math.floor(Math.random() * POOLS.length)];
  try {
    const axios = require('axios');
    const res = await axios.post(
      'https://api.elevenlabs.io/v1/sound-generation',
      { text: prompt, duration_seconds: 5, prompt_influence: 0.6 },
      { headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 90000 }
    );
    const bucket = admin.storage().bucket();
    const dest = `cartoon-tts/${runId}/sting_${Date.now()}.mp3`;
    const file = bucket.file(dest);
    await file.save(Buffer.from(res.data), {
      contentType: 'audio/mpeg',
      resumable: false,
      public: true,
      metadata: { cacheControl: 'public, max-age=86400' },
    });
    try { await file.makePublic(); } catch (_) { /* ignore */ }
    return `https://storage.googleapis.com/${bucket.name}/${dest}`;
  } catch (err) {
    logger.warn('[weeklyDigest] intro sting failed:', err.message);
    return '';
  }
}

async function postWeeklyDigest({ language = 'he', trigger = 'manual', articleId, autoPublish = false } = {}) {
  const lang = language === 'en' ? 'en' : 'he';
  const mode = articleId ? 'single' : 'weekly';
  const runId = `${mode}-${Date.now()}-${lang}`;

  const logRef = await db.collection('cartoon_test_runs').add({
    runId,
    type: articleId ? 'single_story' : 'weekly_digest',
    language: lang,
    articleId: articleId || null,
    trigger,
    status: 'started',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    const genAI = await getGenAI();

    // 1. Pull stories + Gemini script
    await logRef.update({ status: 'writing_script' });
    const digest = await buildWeeklyDigest(genAI, { language: lang, limit: 5, articleId });
    logger.info(`[weeklyDigest] ${digest.stories.length} stories, lang=${lang}`);
    await logRef.update({
      stories: digest.stories.map((s) => ({ id: s.id, title: s.title, videoUrl: s.videoUrl })),
      intro: digest.intro,
      outro: digest.outro,
    });

    // 2. TTS — intro, one line per story, outro, CTA (BIT voice throughout)
    await logRef.update({ status: 'rendering_tts' });
    const introAudioUrl  = await synthesizeCartoonLine({ text: digest.intro, character: 'bit', language: lang, runId, sceneKey: 'intro' });
    const outroAudioUrl  = await synthesizeCartoonLine({ text: digest.outro, character: 'bit', language: lang, runId, sceneKey: 'outro' });
    const ctaAudioUrl    = digest.ctaText
      ? await synthesizeCartoonLine({ text: digest.ctaText, character: 'bit', language: lang, runId, sceneKey: 'cta' })
      : undefined;
    const storyAudioUrls = [];
    for (let i = 0; i < digest.perStory.length; i++) {
      const url = await synthesizeCartoonLine({
        text: digest.perStory[i].bitLine,
        character: 'bit',
        language: lang,
        runId,
        sceneKey: `story${i + 1}`,
      });
      storyAudioUrls.push(url);
    }

    // 3. Frame durations
    //    - Veo's hard max per clip is 8s (240f). To avoid a "freeze on last
    //      frame" feeling, we cap every BIT-visible sub-scene at <= 8s.
    //    - The per-story TTS is ONE continuous track that plays across the
    //      whole story (BIT-intro + fullscreen + segue), so it never gets
    //      clipped at a cut. We size the fullscreen sub-scene to absorb any
    //      remaining TTS length.
    const VEO_MAX = 240;     // 8s
    const FULLSCREEN_MIN = 360; // 12s minimum for the article video to read
    const introDur = Math.min(VEO_MAX, estimateAudioFrames(digest.intro, lang) + 24);
    // Outro scene runs as long as the TTS needs (plus a small tail) — Veo
    // clip may freeze on its last frame for ≤2s, which is fine; better than
    // cutting the audio mid-word like before.
    const outroDur = estimateAudioFrames(digest.outro, lang) + 36;
    // CTA end card: "Subscribe + Follow". Fixed ~7s, or sized to TTS length.
    const ctaDur = digest.ctaText ? estimateAudioFrames(digest.ctaText, lang) + 45 : 0;
    const perStory = digest.perStory.map((p) => {
      const totalSpeech = estimateAudioFrames(p.bitLine, lang) + 18;
      // PIP sub-scene runs for up to one Veo clip (8s).
      const bitIntroDur = Math.min(VEO_MAX, totalSpeech);
      // Fullscreen sub-scene absorbs whatever speech remains, plus a minimum
      // floor so the article footage is visible long enough to recognize.
      const remaining = Math.max(0, totalSpeech - bitIntroDur);
      const fullscreenDur = Math.max(FULLSCREEN_MIN, remaining + 60);
      // No segue cut — story ends with the fullscreen scene and the next
      // story's BIT-intro starts immediately. Removes the silent "talking
      // head with no audio" beat between items.
      const segueDur = 0;
      return { bitIntroDur, fullscreenDur, segueDur };
    });

    // 4. BIT anchor scenes.
    //    Generate ANIMATED clips with Veo Fast. Veo sometimes hallucinates a
    //    green production monitor on the back wall — `cartoonAnchorScene.js`
    //    now post-processes every clip through ffmpeg chroma-key, removing
    //    any green pixels and compositing the cleaned BIT over the static
    //    Nano Banana studio backdrop. The static stills are also generated
    //    as a fallback in case any individual Veo job fails entirely.
    await logRef.update({ status: 'rendering_anchor' });
    resetReferenceImage();
    const [{ mouthClosedUrl, mouthOpenUrl }, introClipUrl, outroClipUrl, ...storyClipUrls] = await Promise.all([
      getStaticAnchorImages(genAI),
      generateAnchorScene({ pose: 'intro', durationSeconds: Math.min(8, Math.max(4, Math.ceil(introDur / 30))), sceneKey: 'intro' }),
      generateAnchorScene({ pose: 'outro', durationSeconds: Math.min(8, Math.max(4, Math.ceil(outroDur / 30))), sceneKey: 'outro' }),
      ...digest.stories.map((_, i) => generateAnchorScene({
        pose: 'introducing',
        durationSeconds: Math.min(8, Math.max(4, Math.ceil(perStory[i].bitIntroDur / 30))),
        sceneKey: `story-${i + 1}`,
      })),
    ]);

    // Intro sting music (5s ElevenLabs sound-gen)
    const introStingUrl = await generateIntroSting(runId);

    // 5. Build the inputProps for Remotion
    const stories = digest.stories.map((s, i) => ({
      title: s.title,
      articleVideoUrl: s.videoUrl,
      bitIntroClipUrl: storyClipUrls[i] || undefined,
      bitIntroAudioUrl: storyAudioUrls[i] || undefined,
      bitIntroDurationFrames: perStory[i].bitIntroDur,
      fullscreenDurationFrames: perStory[i].fullscreenDur,
      segueDurationFrames: perStory[i].segueDur,
    }));

    // News-show opener: animated TTD logo reveal + sting music. 4s before
    // BIT starts speaking.
    const openerDurationFrames = 120;
    const totalFrames =
      openerDurationFrames +
      introDur +
      stories.reduce((a, b) => a + b.bitIntroDurationFrames + b.fullscreenDurationFrames + b.segueDurationFrames, 0) +
      outroDur +
      ctaDur;

    await logRef.update({
      status: 'rendering_video',
      totalFrames,
      anchorImages: { mouthClosedUrl, mouthOpenUrl },
      anchorClips: { introClipUrl, outroClipUrl, storyClipUrls },
      introStingUrl,
    });

    // 6. Submit Remotion render
    trimAwsCreds();
    const init = await renderMediaOnLambda({
      region: REMOTION_REGION,
      functionName: REMOTION_FUNCTION,
      serveUrl: REMOTION_SERVE_URL,
      composition: 'CartoonWeeklyDigest',
      inputProps: {
        // News-show animated opener (before BIT's first scene)
        openerDurationFrames,
        openerStingUrl: introStingUrl || undefined,
        // Animated BIT clips (Veo, chroma-cleaned) + static fallback stills
        bitMouthClosedUrl: mouthClosedUrl || undefined,
        bitMouthOpenUrl: mouthOpenUrl || undefined,
        introClipUrl: introClipUrl || undefined,
        outroClipUrl: outroClipUrl || undefined,
        // BIT intro/outro audio
        introAudioUrl: introAudioUrl || undefined,
        introDurationFrames: introDur,
        outroAudioUrl: outroAudioUrl || undefined,
        outroDurationFrames: outroDur,
        // CTA: subscribe + follow end card
        ctaAudioUrl: ctaAudioUrl || undefined,
        ctaDurationFrames: ctaDur,
        ambientUrl: undefined,
        hebrew: lang === 'he',
        stories,
      },
      frameRange: [0, totalFrames - 1],
      codec: 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      // Smaller chunks → Remotion parallelizes the 3-min render across many
      // Lambdas instead of grinding on one. Without this, a 5400-frame
      // vertical with multiple OffthreadVideo overlays takes >25 minutes.
      framesPerLambda: 300,
      maxRetries: 1,
    });

    let result = null;
    for (let i = 0; i < 180; i++) {     // 30-minute poll budget
      await new Promise((r) => setTimeout(r, 10000));
      const p = await getRenderProgress({
        renderId: init.renderId,
        bucketName: init.bucketName,
        functionName: REMOTION_FUNCTION,
        region: REMOTION_REGION,
      });
      if (p.done) { result = p; break; }
      if (p.fatalErrorEncountered) {
        throw new Error(`Remotion render failed: ${JSON.stringify(p.errors).slice(0, 400)}`);
      }
    }
    if (!result) throw new Error('Remotion timed out');
    const videoUrl = result.outputFile || result.outUrl || '';
    if (!videoUrl) throw new Error('Remotion returned no output URL');

    let publishResult = null;
    if (autoPublish) {
      try {
        publishResult = await publishDigest({ videoUrl, digest, logRef });
      } catch (pubErr) {
        logger.error('[weeklyDigest] publish wrapper failed:', pubErr.message);
        publishResult = { error: pubErr.message };
      }
    }

    await logRef.update({
      status: 'success',
      videoUrl,
      ...(publishResult ? { publishResult } : {}),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[weeklyDigest] DONE runId=${runId} → ${videoUrl}`);
    return {
      success: true,
      runId,
      videoUrl,
      totalFrames,
      storyCount: stories.length,
      ...(publishResult ? { publish: publishResult } : {}),
    };
  } catch (err) {
    logger.error('[weeklyDigest] FAILED:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: false, runId, error: err.message || String(err) };
  }
}

// ─── Optional auto-publish step ────────────────────────────────────────────
// Builds language-aware caption/title metadata, downloads the rendered MP4
// to a temp file, uploads to YouTube + Instagram Reels. Reused for both
// "weekly digest" and "single story anchor" runs.
function buildPublishMetadata(digest) {
  const isSingle = !!digest.singleStory;
  const lang = digest.language;
  const titles = digest.stories.map((s) => s.title).filter(Boolean);
  const tldr = titles.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n');

  if (lang === 'he') {
    const heading = isSingle ? 'דיווח של BIT 🤖' : 'מהדורת השבוע של BIT 🤖';
    return {
      ytTitle: isSingle
        ? `BIT מדווח: ${titles[0] || 'חדשות טק'}`.slice(0, 95)
        : `מהדורת השבוע — TrendingTechDaily 🤖`.slice(0, 95),
      ytDescription:
        `${heading}\n\n${tldr}\n\nכל הסיפורים המלאים מחכים לכם ב-TrendingTechDaily.com\n\n#TrendingTechDaily #BIT #טכנולוגיה #חדשות #AI`,
      ytTags: ['TrendingTechDaily', 'BIT', 'טכנולוגיה', 'חדשות', 'AI', 'מהדורה'],
      igCaption:
        `${heading}\n\n${tldr}\n\n👉 הסיפורים המלאים — TrendingTechDaily.com\n\n#TrendingTechDaily #BIT #טכנולוגיה #חדשות #AI`,
    };
  }
  // EN
  const heading = isSingle ? "BIT's tech brief 🤖" : "BIT's tech week 🤖";
  return {
    ytTitle: isSingle
      ? `BIT reports: ${titles[0] || 'tech news'}`.slice(0, 95)
      : `Tech Week Roundup — TrendingTechDaily 🤖`.slice(0, 95),
    ytDescription:
      `${heading}\n\n${tldr}\n\nFull stories at TrendingTechDaily.com\n\n#TrendingTechDaily #BIT #TechNews #AI`,
    ytTags: ['TrendingTechDaily', 'BIT', 'tech news', 'AI', 'weekly roundup'],
    igCaption:
      `${heading}\n\n${tldr}\n\n👉 Full stories — TrendingTechDaily.com\n\n#TrendingTechDaily #BIT #TechNews #AI`,
  };
}

async function getYouTubeClient() {
  const secretPath = path.join(__dirname, 'youtube_client_secret.json');
  const tokenPath  = path.join(__dirname, 'youtube_tokens.json');
  if (!fs.existsSync(secretPath) || !fs.existsSync(tokenPath)) {
    throw new Error('YouTube credentials missing on the function');
  }
  const secrets = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  const tokens  = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  const oauth2  = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );
  oauth2.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2 });
}

async function publishToYouTube(videoUrl, meta) {
  const youtube = await getYouTubeClient();
  const tmp = path.join(os.tmpdir(), `digest_${Date.now()}.mp4`);
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Download failed ${res.status}`);
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  try {
    const up = await youtube.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: meta.ytTitle,
          description: meta.ytDescription,
          tags: meta.ytTags,
          categoryId: '28',
        },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
      },
      media: { body: fs.createReadStream(tmp) },
    });
    return `https://www.youtube.com/watch?v=${up.data.id}`;
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
  }
}

async function publishToInstagramReels(videoUrl, caption) {
  const token = getIgToken();
  if (!token) throw new Error('IG token missing');
  const create = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: new URLSearchParams({
      media_type: 'REELS',
      video_url: videoUrl,
      access_token: token,
      caption,
      share_to_feed: 'true',
    }),
  });
  const created = await create.json();
  if (created.error) throw new Error(`IG container: ${JSON.stringify(created.error)}`);
  for (let i = 0; i < 48; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await (await fetch(
      `https://graph.facebook.com/v20.0/${created.id}?fields=status_code&access_token=${token}`
    )).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('IG processing error');
  }
  const pub = await (await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: created.id, access_token: token }),
  })).json();
  if (pub.error) throw new Error(`IG publish: ${JSON.stringify(pub.error)}`);
  return `https://www.instagram.com/reel/${pub.id}/`;
}

async function publishDigest({ videoUrl, digest, logRef }) {
  const meta = buildPublishMetadata(digest);
  const out = { youtubeUrl: null, instagramUrl: null };
  await logRef.update({ status: 'publishing' });

  try {
    out.youtubeUrl = await publishToYouTube(videoUrl, meta);
    logger.info(`[weeklyDigest] YT: ${out.youtubeUrl}`);
  } catch (e) {
    logger.error('[weeklyDigest] YT failed:', e.message);
    out.youtubeError = e.message;
  }
  try {
    out.instagramUrl = await publishToInstagramReels(videoUrl, meta.igCaption);
    logger.info(`[weeklyDigest] IG: ${out.instagramUrl}`);
  } catch (e) {
    logger.error('[weeklyDigest] IG failed:', e.message);
    out.instagramError = e.message;
  }
  return out;
}

module.exports = { postWeeklyDigest, publishDigest, buildPublishMetadata };
