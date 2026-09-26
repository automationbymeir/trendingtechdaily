/**
 * aiToolsExplainerPipeline.js
 * ---------------------------------------------------------------------------
 * Renders short (~30-45s) 9:16 BIT-anchor explainer videos for each AI Tools
 * Pulse page (landing / guide / glossary) in EN + HE — 6 videos total.
 *
 * Each video is:
 *   - TTS'd from a hand-written 3-4-beat script
 *   - composited around a single Veo BIT clip (looped) + static fallback
 *   - rendered via Remotion Lambda using composition "AiToolsExplainer"
 *   - copied to Firebase Storage at `ai-tools-explainers/{topic}-{lang}.mp4`
 *   - recorded in Firestore at `ai_tools_explainers/{topic}-{lang}`
 *
 * The SSR for /ai-tools, /ai-tools-guide and /ai-tools-glossary (+ /he mirrors)
 * reads the Firestore doc and embeds the MP4 above the page hero.
 *
 * Public API:
 *   renderAiToolsExplainer({ topic, language, autoPublish }) →
 *     { success, runId, url, topic, language, instagramUrl? }
 *   renderAllAiToolsExplainers({ autoPublish }) → array of the above
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { renderMediaOnLambda, getRenderProgress } = require('@remotion/lambda/client');

const { logger, db } = require('./config');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');
const { synthesizeCartoonLine } = require('./services/cartoonTts');
const { generateAnchorScene, resetReferenceImage } = require('./services/cartoonAnchorScene');
const { getStaticAnchorImages } = require('./services/cartoonAnchorStatic');

// Optional IG publishing (reused token pattern from launch pipeline)
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

// Char-count based estimator (no MP3 probe). Slightly slower for HE.
function estimateAudioFrames(text, language, fps = 30) {
  const cps = language === 'he' ? 12 : 14;
  const seconds = Math.max(2.6, String(text || '').length / cps + 0.6);
  return Math.round(seconds * fps);
}

// ─── Hand-written scripts (no Gemini) ─────────────────────────────────────
function buildScripts(topic, language) {
  const he = language === 'he';
  if (topic === 'landing') {
    if (he) {
      return [
        'ברוכים הבאים ל-AI Tools Pulse — המדריך היחיד שמאחד יכולות Claude, מחברי MCP, ריפוז ה-AI הכי חמים ומוצרי LLM.',
        'כל כלי מקבל ציון טרנדינג חי ופסיקה כתובה על ידי AI — כך מוצאים את הכלי הנכון בשניות.',
        'דפדפו, בנו את הסטאק שלכם, והעבירו את העבודה מהר יותר. יאללה.',
      ];
    }
    return [
      'Welcome to AI Tools Pulse — the only directory that unifies Claude Skills, MCP connectors, trending GitHub repos and LLM products.',
      'Every tool is rated, ranked and reviewed by AI — so you find the right one in seconds.',
      "Browse, build your stack, and ship faster. Let's go.",
    ];
  }
  if (topic === 'guide') {
    if (he) {
      return [
        'חדשים בעולם ה-AI? הגעתם למקום הנכון.',
        'המדריך הזה מפרק את ארבעת סוגי הכלים שאנחנו מכסים.',
        'בחרו את הנכון למשימה שלכם — כתיבה, קוד, עיצוב, או ניתוח.',
        'ואז עברו צעד-צעד על עשר הדקות הראשונות שלכם עם AI.',
      ];
    }
    return [
      "New to AI? You're in the right place.",
      'This guide breaks down the four kinds of tools we cover.',
      'Pick the right one for your job — writer, coder, designer, or analyst.',
      'Then take your first ten minutes with AI step by step.',
    ];
  }
  // glossary
  if (he) {
    return [
      'LLM. MCP. RAG. Embeddings. הז\'רגון אמיתי.',
      'במילון שלנו כל מונח מוסבר באנגלית פשוטה ובעברית.',
      'חפשו, גללו, ולמדו — וחזרו בכל פעם ששוכחים.',
    ];
  }
  return [
    'LLM. MCP. RAG. Embeddings. The jargon is real.',
    'Our glossary explains every term in plain English.',
    'Search, scroll, learn — and come back any time you forget.',
  ];
}

function topicSlug(topic, language) {
  if (topic === 'landing') {
    return language === 'he' ? '/he/ai-tools' : '/ai-tools';
  }
  if (topic === 'guide') {
    return language === 'he' ? '/he/ai-tools-guide' : '/ai-tools-guide';
  }
  return language === 'he' ? '/he/ai-tools-glossary' : '/ai-tools-glossary';
}

function ctaForTopic(topic, language) {
  return 'trendingtechdaily.com' + topicSlug(topic, language);
}

// ─── Copy Remotion S3 output → Firebase Storage at a stable path ──────────
async function copyMp4ToFirebase({ s3Url, topic, language }) {
  const bucket = admin.storage().bucket();
  const dest = `ai-tools-explainers/${topic}-${language}.mp4`;
  const file = bucket.file(dest);

  const res = await fetch(s3Url);
  if (!res.ok) throw new Error(`Failed to download Remotion output ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  await file.save(buf, {
    contentType: 'video/mp4',
    resumable: false,
    public: true,
    metadata: { cacheControl: 'public, max-age=3600' },
  });
  try { await file.makePublic(); } catch (_) { /* ignore */ }
  return `https://storage.googleapis.com/${bucket.name}/${dest}`;
}

// ─── Public — render ONE explainer ────────────────────────────────────────
async function renderAiToolsExplainer({ topic, language = 'en', autoPublish = false } = {}) {
  if (!['landing', 'guide', 'glossary'].includes(topic)) {
    throw new Error(`Invalid topic: ${topic}`);
  }
  const lang = language === 'he' ? 'he' : 'en';
  const runId = `aiToolsExplainer-${topic}-${lang}-${Date.now()}`;
  const ctaUrl = ctaForTopic(topic, lang);

  const logRef = await db.collection('cartoon_test_runs').add({
    runId,
    type: 'aiToolsExplainer',
    topic,
    language: lang,
    status: 'started',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    // 1. Scripts
    await logRef.update({ status: 'writing_script' });
    const beats = buildScripts(topic, lang);
    await logRef.update({ script: beats });

    // 2. TTS each beat
    await logRef.update({ status: 'rendering_tts' });
    const ttsResults = await Promise.all(
      beats.map((text, i) =>
        synthesizeCartoonLine({
          text,
          character: 'bit',
          language: lang,
          runId,
          sceneKey: `beat-${i + 1}`,
        }).catch((err) => {
          logger.warn(`[aiToolsExplainer] TTS beat ${i + 1} failed: ${err.message}`);
          return '';
        })
      )
    );

    // 3. Per-scene frame counts
    const scripts = beats.map((text, i) => ({
      text,
      audioUrl: ttsResults[i] || undefined,
      durationFrames: Math.max(150, estimateAudioFrames(text, lang) + 30),
    }));

    const openerDurationFrames = 60;
    const outroFrames = 90;
    const sceneTotal = scripts.reduce((s, sc) => s + sc.durationFrames, 0);
    const totalFrames = openerDurationFrames + sceneTotal + outroFrames;

    // 4. Anchor visuals — one Veo clip + static fallback
    await logRef.update({ status: 'rendering_anchor' });
    resetReferenceImage();
    const genAI = await getGenAI();
    const [{ mouthClosedUrl, mouthOpenUrl } = {}, bitClipUrl] = await Promise.all([
      getStaticAnchorImages(genAI).catch((err) => {
        logger.warn(`[aiToolsExplainer] static anchor failed: ${err.message}`);
        return {};
      }),
      generateAnchorScene({
        pose: 'intro',
        durationSeconds: 8,
        sceneKey: `explainer-${topic}-${lang}`,
      }).catch((err) => {
        logger.warn(`[aiToolsExplainer] Veo clip failed: ${err.message}`);
        return '';
      }),
    ]);

    await logRef.update({
      status: 'rendering_video',
      totalFrames,
      anchorImages: { mouthClosedUrl, mouthOpenUrl },
      anchorClips: { bitClipUrl },
      scripts: scripts.map((s) => ({ text: s.text, durationFrames: s.durationFrames, hasAudio: !!s.audioUrl })),
    });

    // 5. Submit Remotion render
    trimAwsCreds();
    const init = await renderMediaOnLambda({
      region: REMOTION_REGION,
      functionName: REMOTION_FUNCTION,
      serveUrl: REMOTION_SERVE_URL,
      composition: 'AiToolsExplainer',
      inputProps: {
        topic,
        hebrew: lang === 'he',
        openerDurationFrames,
        openerStingUrl: undefined,
        bitClipUrl: bitClipUrl || undefined,
        bitMouthClosedUrl: mouthClosedUrl || undefined,
        bitMouthOpenUrl: mouthOpenUrl || undefined,
        scripts,
        ctaUrl,
      },
      frameRange: [0, totalFrames - 1],
      codec: 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      framesPerLambda: 300,
      maxRetries: 1,
    });

    // 6. Poll (30-min budget)
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
    const s3VideoUrl = result.outputFile || result.outUrl || '';
    if (!s3VideoUrl) throw new Error('Remotion returned no output URL');

    // 7. Copy → Firebase Storage at stable path
    await logRef.update({ status: 'copying_storage', s3VideoUrl });
    const publicUrl = await copyMp4ToFirebase({ s3Url: s3VideoUrl, topic, language: lang });

    // 8. Firestore record for SSR
    await db.collection('ai_tools_explainers').doc(`${topic}-${lang}`).set({
      topic,
      language: lang,
      url: publicUrl,
      runId,
      renderedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 9. Optional IG Reel
    let instagramUrl = null;
    if (autoPublish) {
      try {
        instagramUrl = await publishToInstagramReels(
          publicUrl,
          lang === 'he'
            ? `מדריך קצר: מה מצפה לכם ב-${topic} של AI Tools Pulse → ${ctaUrl}`
            : `Quick guide: what's inside ${topic} on AI Tools Pulse → ${ctaUrl}`
        );
      } catch (e) {
        logger.error('[aiToolsExplainer] IG publish failed:', e.message);
      }
    }

    await logRef.update({
      status: 'success',
      url: publicUrl,
      ...(instagramUrl ? { instagramUrl } : {}),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    logger.info(`[aiToolsExplainer] DONE ${runId} → ${publicUrl}`);
    return {
      success: true,
      runId,
      url: publicUrl,
      topic,
      language: lang,
      ...(instagramUrl ? { instagramUrl } : {}),
    };
  } catch (err) {
    logger.error(`[aiToolsExplainer] FAILED ${runId}:`, err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: false, runId, topic, language: lang, error: err.message || String(err) };
  }
}

// ─── Render all 6 (sequential — Lambda heavy) ─────────────────────────────
async function renderAllAiToolsExplainers({ autoPublish = false } = {}) {
  const combos = [
    { topic: 'landing',  language: 'en' },
    { topic: 'landing',  language: 'he' },
    { topic: 'guide',    language: 'en' },
    { topic: 'guide',    language: 'he' },
    { topic: 'glossary', language: 'en' },
    { topic: 'glossary', language: 'he' },
  ];
  const out = [];
  for (const c of combos) {
    try {
      const r = await renderAiToolsExplainer({ ...c, autoPublish });
      out.push(r);
    } catch (e) {
      out.push({ success: false, ...c, error: e.message || String(e) });
    }
  }
  return out;
}

// ─── IG publishing (Reels) — same flow as launch pipeline ─────────────────
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

module.exports = {
  renderAiToolsExplainer,
  renderAllAiToolsExplainers,
};
