/**
 * aiToolsLaunchPipeline.js
 * ---------------------------------------------------------------------------
 * Builds the "AI Tools Pulse" LAUNCH PROMO video — a polished 9:16 launch
 * announcement (~50 seconds) where BIT (cartoon robot anchor) introduces the
 * new TrendingTechDaily AI Tools directory.
 *
 *   1. Hand-written EN/HE script (5 lines — intro/hook/trending/stack/outro)
 *   2. TTS each line via `synthesizeCartoonLine`
 *   3. Generate one Veo BIT anchor clip (used for scenes 1 & 5)
 *   4. Generate static Nano Banana stills as fallback
 *   5. Generate an intro sting (ElevenLabs sound-gen)
 *   6. Submit `renderMediaOnLambda` with composition `AiToolsLaunchPromo`
 *   7. Poll for completion → MP4 URL
 *   8. Optional autoPublish → YouTube + Instagram (launch-specific copy)
 *
 * Public API:
 *   postAiToolsLaunch({ trigger, language, autoPublish }) →
 *     { success, runId, videoUrl, totalFrames, publish? }
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
const { synthesizeCartoonLine } = require('./services/cartoonTts');
const { generateAnchorScene, resetReferenceImage } = require('./services/cartoonAnchorScene');
const { getStaticAnchorImages } = require('./services/cartoonAnchorStatic');

// Reuse IG fallback token style from weeklyDigestPipeline
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

// Same estimator as weeklyDigestPipeline — character-count based, no MP3 probe.
function estimateAudioFrames(text, language, fps = 30) {
  const cps = language === 'he' ? 12 : 14;
  const seconds = Math.max(2.5, String(text || '').length / cps + 0.7);
  return Math.round(seconds * fps);
}

// ─── Intro sting (cinematic broadcast opener) ──────────────────────────────
async function generateIntroSting(runId) {
  const xiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!xiKey) return '';
  const POOLS = [
    'Cinematic product-launch sting, 5 seconds, soaring synth swell, deep cinematic boom, glowing bell impact, modern tech-brand signature. Triumphant resolved ending. Instrumental, no vocals.',
    'Modern AI-launch intro sting, 5 seconds, futuristic synth pulse, rising electronic shimmer, crisp percussion hit, optimistic tech edge. Punchy confident ending. Instrumental, no vocals.',
    'Premium tech-product reveal sting, 5 seconds, orchestral brass swell with electronic glitch accents, deep impact, anticipation buildup. Clean resolved finish. Instrumental, no vocals.',
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
    logger.warn('[aiToolsLaunch] intro sting failed:', err.message);
    return '';
  }
}

// ─── Hand-written script (brand copy — NOT Gemini) ─────────────────────────
function buildLaunchScript(language) {
  if (language === 'he') {
    return {
      intro:    'טרנדינגטק דיילי השיק עכשיו משהו שלא ראיתם בשום מקום אחר.',
      hook:     'AI Tools Pulse. כל יכולת של קלוד. כל MCP. הריפוז הכי חמים. המוצרים הכי טובים. הכל במקום אחד — לחיפוש, סינון, ודירוג.',
      trending: 'לכל כלי יש ציון טרנדינג בזמן אמת ופסיקה כתובה על ידי AI. בלי לבזבז זמן על ניחושים.',
      stack:    'אתם יכולים אפילו לבנות סטאק AI משלכם — שלושה כלים, יחסים ביניהם, ייצוא, שיתוף.',
      outro:    'זה חי עכשיו ב-trendingtechdaily.com סלאש ai-tools. מבוסס על קלוד. תיכנסו עכשיו.',
    };
  }
  return {
    intro:    "TrendingTech Daily just shipped something we've never seen anywhere else.",
    hook:     "It's AI Tools Pulse. Every Claude skill. Every MCP connector. The hottest AI repos. The best LLM products. All in one place — searchable, filterable, ranked.",
    trending: "Every tool gets a live trending score and a verdict written by AI. So you spend zero time guessing what's actually worth using.",
    stack:    "You can even build your own AI stack — pick three tools, see how they fit together, export it, share it.",
    outro:    "It's live right now at trendingtechdaily.com slash ai-tools. Powered by Claude. Go check it out.",
  };
}

// ─── Public ────────────────────────────────────────────────────────────────
async function postAiToolsLaunch({ trigger = 'manual', language = 'en', autoPublish = false } = {}) {
  const lang = language === 'he' ? 'he' : 'en';
  const runId = `aiToolsLaunch-${Date.now()}-${lang}`;
  const ctaUrl = lang === 'he'
    ? 'trendingtechdaily.com/he/ai-tools'
    : 'trendingtechdaily.com/ai-tools';

  const logRef = await db.collection('cartoon_test_runs').add({
    runId,
    type: 'aiToolsLaunch',
    language: lang,
    trigger,
    status: 'started',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    // 1. Hand-written script
    await logRef.update({ status: 'writing_script' });
    const script = buildLaunchScript(lang);
    await logRef.update({ script });

    // 2. TTS — five separate lines
    await logRef.update({ status: 'rendering_tts' });
    const ttsArgs = (text, sceneKey) => ({ text, character: 'bit', language: lang, runId, sceneKey });
    const [introAudioUrl, hookAudioUrl, trendingAudioUrl, stackAudioUrl, outroAudioUrl] = await Promise.all([
      synthesizeCartoonLine(ttsArgs(script.intro,    'intro')),
      synthesizeCartoonLine(ttsArgs(script.hook,     'hook')),
      synthesizeCartoonLine(ttsArgs(script.trending, 'trending')),
      synthesizeCartoonLine(ttsArgs(script.stack,    'stack')),
      synthesizeCartoonLine(ttsArgs(script.outro,    'outro')),
    ]);

    // 3. Frame durations — sized to TTS length, with floors to keep visual
    //    beats reading clearly. Total target ≈ 1500 frames (50s).
    const openerDurationFrames = 120;
    const introDurationFrames    = Math.max(240, estimateAudioFrames(script.intro,    lang) + 30);
    const hookDurationFrames     = Math.max(300, estimateAudioFrames(script.hook,     lang) + 30);
    const trendingDurationFrames = Math.max(240, estimateAudioFrames(script.trending, lang) + 30);
    const stackDurationFrames    = Math.max(300, estimateAudioFrames(script.stack,    lang) + 30);
    const outroDurationFrames    = Math.max(300, estimateAudioFrames(script.outro,    lang) + 45);

    const totalFrames =
      openerDurationFrames +
      introDurationFrames +
      hookDurationFrames +
      trendingDurationFrames +
      stackDurationFrames +
      outroDurationFrames;

    // 4. BIT anchor visuals.
    //    ONE Veo clip (intro pose, 8s) reused for scenes 1 & 5. Static stills
    //    generated in parallel as fallback. cartoonAnchorScene.js chroma-cleans
    //    each Veo output automatically.
    await logRef.update({ status: 'rendering_anchor' });
    resetReferenceImage();
    const genAI = await getGenAI();
    const [{ mouthClosedUrl, mouthOpenUrl }, bitClipUrl] = await Promise.all([
      getStaticAnchorImages(genAI),
      generateAnchorScene({ pose: 'intro', durationSeconds: 8, sceneKey: 'launch-bit' }),
    ]);

    // 5. Intro sting
    const introStingUrl = await generateIntroSting(runId);

    await logRef.update({
      status: 'rendering_video',
      totalFrames,
      anchorImages: { mouthClosedUrl, mouthOpenUrl },
      anchorClips: { bitClipUrl },
      introStingUrl,
      durations: {
        openerDurationFrames,
        introDurationFrames,
        hookDurationFrames,
        trendingDurationFrames,
        stackDurationFrames,
        outroDurationFrames,
      },
    });

    // 6. Submit Remotion render
    trimAwsCreds();
    const init = await renderMediaOnLambda({
      region: REMOTION_REGION,
      functionName: REMOTION_FUNCTION,
      serveUrl: REMOTION_SERVE_URL,
      composition: 'AiToolsLaunchPromo',
      inputProps: {
        openerStingUrl: introStingUrl || undefined,
        openerDurationFrames,
        bitClipUrl: bitClipUrl || undefined,
        bitMouthClosedUrl: mouthClosedUrl || undefined,
        bitMouthOpenUrl: mouthOpenUrl || undefined,
        introAudioUrl: introAudioUrl || undefined,
        introDurationFrames,
        hookAudioUrl: hookAudioUrl || undefined,
        hookDurationFrames,
        trendingAudioUrl: trendingAudioUrl || undefined,
        trendingDurationFrames,
        stackAudioUrl: stackAudioUrl || undefined,
        stackDurationFrames,
        outroAudioUrl: outroAudioUrl || undefined,
        outroDurationFrames,
        ambientUrl: undefined,
        hebrew: lang === 'he',
        ctaUrl,
      },
      frameRange: [0, totalFrames - 1],
      codec: 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      framesPerLambda: 300,
      maxRetries: 1,
    });

    // 7. Poll for completion (30-minute budget, identical to weeklyDigest)
    let result = null;
    for (let i = 0; i < 180; i++) {
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

    // 8. Optional autoPublish
    let publishResult = null;
    if (autoPublish) {
      try {
        publishResult = await publishLaunch({ videoUrl, language: lang, ctaUrl, logRef });
      } catch (pubErr) {
        logger.error('[aiToolsLaunch] publish wrapper failed:', pubErr.message);
        publishResult = { error: pubErr.message };
      }
    }

    await logRef.update({
      status: 'success',
      videoUrl,
      ...(publishResult ? { publishResult } : {}),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[aiToolsLaunch] DONE runId=${runId} → ${videoUrl}`);
    return {
      success: true,
      runId,
      videoUrl,
      totalFrames,
      ...(publishResult ? { publish: publishResult } : {}),
    };
  } catch (err) {
    logger.error('[aiToolsLaunch] FAILED:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: false, runId, error: err.message || String(err) };
  }
}

// ─── Publishing copy + YT/IG uploaders ─────────────────────────────────────
function buildLaunchPublishMetadata(language, ctaUrl) {
  if (language === 'he') {
    const ytTitle = '🚀 מציגים את AI Tools Pulse — מדריך אחד לכל כלי ה-AI'.slice(0, 95);
    const bullets = [
      '🧠 כל היכולות של קלוד',
      '🔌 כל ה-MCP Connectors',
      '🐙 ריפוז ה-AI הכי חמים בגיטהאב',
      '🚀 מוצרי ה-LLM הכי טובים',
      '⭐ ציון טרנדינג חי + פסיקת AI',
      '🛠️ בונה סטאק AI אישי',
    ].join('\n');
    const ytDescription =
`AI Tools Pulse השיק עכשיו ב-TrendingTechDaily — מדריך אחד שמרכז את כל כלי ה-AI שחשובים לכם, עם ציון טרנדינג חי וסקירת AI לכל כלי.

${bullets}

🔗 ${ctaUrl}

מבוסס על קלוד 🤖

#AITools #ClaudeAI #MCP #טכנולוגיה #AI #TrendingTechDaily`;
    return {
      ytTitle,
      ytDescription,
      ytTags: ['AI Tools', 'Claude', 'MCP', 'TrendingTechDaily', 'AI', 'טכנולוגיה', 'בינה מלאכותית'],
      igCaption:
`🚀 AI Tools Pulse — חי עכשיו!

מדריך אחד לכל כלי ה-AI שחשובים לכם:
${bullets}

🔗 ${ctaUrl}
מבוסס על קלוד 🤖

#AI #ClaudeAI #MCP #AITools #טכנולוגיה #TrendingTechDaily #בינהמלאכותית #StartupTools #ProductivityTools #TechTools`,
    };
  }

  const ytTitle = '🚀 Introducing AI Tools Pulse — One Directory For Every AI Tool'.slice(0, 95);
  const bullets = [
    '🧠 Every Claude skill',
    '🔌 Every MCP connector',
    '🐙 The hottest AI repos on GitHub',
    '🚀 The best LLM products',
    '⭐ Live trending score + AI-written verdict',
    '🛠️ Build & export your own AI stack',
  ].join('\n');
  const ytDescription =
`AI Tools Pulse just launched on TrendingTechDaily — one directory that catalogs every AI tool worth knowing, with a live trending score and an AI-written verdict on each.

${bullets}

🔗 ${ctaUrl}

Powered by Claude 🤖

#AITools #ClaudeAI #MCP #AI #TechTools #StartupTools`;
  return {
    ytTitle,
    ytDescription,
    ytTags: ['AI Tools', 'Claude', 'MCP', 'TrendingTechDaily', 'AI', 'LLM', 'tech tools', 'AI directory'],
    igCaption:
`🚀 AI Tools Pulse — LIVE NOW!

One directory for every AI tool that matters:
${bullets}

🔗 ${ctaUrl}
Powered by Claude 🤖

#AI #ClaudeAI #MCP #AITools #TechTools #StartupTools #ProductivityTools #LLM #AIProducts #TrendingTechDaily #ProductLaunch #AIDirectory`,
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
  const tmp = path.join(os.tmpdir(), `launch_${Date.now()}.mp4`);
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

async function publishLaunch({ videoUrl, language, ctaUrl, logRef }) {
  const meta = buildLaunchPublishMetadata(language, ctaUrl);
  const out = { youtubeUrl: null, instagramUrl: null };
  if (logRef) await logRef.update({ status: 'publishing' });
  try {
    out.youtubeUrl = await publishToYouTube(videoUrl, meta);
    logger.info(`[aiToolsLaunch] YT: ${out.youtubeUrl}`);
  } catch (e) {
    logger.error('[aiToolsLaunch] YT failed:', e.message);
    out.youtubeError = e.message;
  }
  try {
    out.instagramUrl = await publishToInstagramReels(videoUrl, meta.igCaption);
    logger.info(`[aiToolsLaunch] IG: ${out.instagramUrl}`);
  } catch (e) {
    logger.error('[aiToolsLaunch] IG failed:', e.message);
    out.instagramError = e.message;
  }
  return out;
}

module.exports = { postAiToolsLaunch, publishLaunch, buildLaunchPublishMetadata };
