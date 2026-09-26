/**
 * cartoonVideoPipeline.js
 * ---------------------------------------------------------------------------
 * Orchestrates the trendingtechdaily mascot-led cartoon promo video.
 *
 *   1. Ensure the cartoon character + backdrop art exists (Nano Banana — cached).
 *   2. Build the script (deterministic promo for the first test; Gemini for
 *      later news-style runs).
 *   3. Run ElevenLabs TTS per line using the right character voice.
 *   4. Probe each MP3's exact duration so each scene is timed precisely.
 *   5. Generate a light ambient music bed (low volume under the dialog).
 *   6. Submit a Remotion Lambda render of `CartoonPromoVideo` and return
 *      the MP4 URL.
 *
 * This pipeline does NOT publish anywhere (no IG, no YT) — it just produces
 * the MP4 so we can preview the result before committing to the format.
 *
 * Triggered via the HTTP `triggerCartoonTestVideo` endpoint (admin-key gated,
 * NOT in the admin UI yet).
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');
const { renderMediaOnLambda, getRenderProgress } = require('@remotion/lambda/client');

const { logger, db } = require('./config');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');
const { synthesizeCartoonLine } = require('./services/cartoonTts');
const { buildCartoonScript } = require('./services/cartoonScriptGen');
const { generateCartoonScene } = require('./services/cartoonVeoScene');

// Same Remotion Lambda setup used by the existing pipelines
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

// ─── Estimate audio duration from text length ─────────────────────────────
// We tried probing MP3 byte-length but Google TTS and ElevenLabs use
// different bitrates so the math diverges. Character count is a more
// reliable estimate AND lets us size the scene before TTS finishes.
//
// Empirical rates:
//   English  → ~14 chars/sec (incl. spaces) at normal cartoon delivery
//   Hebrew   → ~12 chars/sec (HE TTS speaks a bit slower)
//
// Add a 0.7s tail so the audio doesn't get clipped at the scene boundary.
function estimateAudioFrames(text, language, fps = 30) {
  const cps = language === 'he' ? 12 : 14;
  const seconds = Math.max(2.5, String(text || '').length / cps + 0.7);
  return Math.round(seconds * fps);
}

// ─── Light ambient music ──────────────────────────────────────────────────
// 22s clip via ElevenLabs sound-generation — kept quiet behind dialog.
async function generateLightAmbient(runId) {
  const xiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!xiKey) return '';
  const POOLS = [
    'Light playful cartoon background music, ukulele plucks, soft xylophone, soft whistle, light snare brushes, upbeat and curious. Instrumental only, no vocals.',
    'Quirky cheerful retro 8-bit chiptune ambient, soft synth bells, gentle arpeggios, upbeat slow tempo. Instrumental, no vocals.',
    'Friendly sitcom-style soft bossa nova, soft brushed drums, mellow electric piano, light bass, cheerful neutral. Instrumental, no vocals.',
    'Cute curious cartoon underscore, soft pizzicato strings, light wood block, gentle flute, playful and warm. Instrumental, no vocals.',
  ];
  const prompt = POOLS[Math.floor(Math.random() * POOLS.length)];
  try {
    const res = await axios.post(
      'https://api.elevenlabs.io/v1/sound-generation',
      { text: prompt, duration_seconds: 22, prompt_influence: 0.45 },
      { headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json' }, responseType: 'arraybuffer', timeout: 90000 }
    );
    const bucket = admin.storage().bucket();
    const dest = `cartoon-tts/${runId}/ambient_${uuidv4().slice(0, 6)}.mp3`;
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
    logger.warn('cartoonVideo: ambient gen failed', err.message);
    return '';
  }
}

// ─── Public ────────────────────────────────────────────────────────────────
async function postCartoonTestVideo({ language = 'he', format = 'promo' } = {}) {
  const lang = language === 'en' ? 'en' : 'he';
  const runId = `cartoon-${Date.now()}-${lang}`;
  const logRef = await db.collection('cartoon_test_runs').add({
    runId,
    language: lang,
    format,
    status: 'started',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  try {
    const genAI = await getGenAI();

    // 1. Script
    await logRef.update({ status: 'writing_script' });
    const script = await buildCartoonScript({ genAI, format, language: lang });

    // 2. TTS per line (sequential — friendly to ElevenLabs / Google quotas)
    await logRef.update({ status: 'rendering_tts' });
    const linesWithAudio = [];
    for (let i = 0; i < script.lines.length; i++) {
      const line = script.lines[i];
      const audioUrl = await synthesizeCartoonLine({
        text: line.text,
        character: line.character,
        language: lang,
        runId,
        sceneKey: `line${i + 1}`,
      });
      const durationFrames = estimateAudioFrames(line.text, lang, 30);
      linesWithAudio.push({ ...line, audioUrl, durationFrames });
    }

    // 3. Veo Fast clips — one animated cartoon clip per line, PLUS one for CTA.
    //    Clips are length-matched to the TTS audio (rounded to whole seconds,
    //    clamped 4–8s — Veo's hard limits).
    await logRef.update({ status: 'rendering_veo' });
    const veoClips = await Promise.all(
      linesWithAudio.map((line, i) => {
        const seconds = Math.max(4, Math.min(8, Math.round(line.durationFrames / 30)));
        return generateCartoonScene({
          character: line.character,
          dialogCue: line.text.slice(0, 200),   // gives Veo context but it won't speak it
          durationSeconds: seconds,
          pose: line.pose,
          sceneKey: `line${i + 1}`,
        });
      })
    );
    // CTA — BIT excited, 5 seconds
    const ctaClipUrl = await generateCartoonScene({
      character: 'bit',
      dialogCue: 'visit TrendingTechDaily.com — arms raised, big smile, celebratory finale',
      durationSeconds: 5,
      pose: 'excited',
      sceneKey: 'cta',
    });

    // Stitch clipUrl into each line
    for (let i = 0; i < linesWithAudio.length; i++) {
      linesWithAudio[i].clipUrl = veoClips[i] || '';
    }

    // 4. Ambient
    await logRef.update({ status: 'rendering_ambient' });
    const ambientUrl = await generateLightAmbient(runId);

    // 5. Remotion Lambda render
    trimAwsCreds();
    await logRef.update({ status: 'rendering_video' });

    const ctaDurationFrames = 150;
    const totalFrames = linesWithAudio.reduce((s, l) => s + l.durationFrames, 0) + ctaDurationFrames;

    const init = await renderMediaOnLambda({
      region: REMOTION_REGION,
      functionName: REMOTION_FUNCTION,
      serveUrl: REMOTION_SERVE_URL,
      composition: 'CartoonPromoVideo',
      inputProps: {
        ambientUrl: ambientUrl || undefined,
        hebrew: lang === 'he',
        lines: linesWithAudio,
        cta: script.cta,
        ctaDurationFrames,
        ctaClipUrl: ctaClipUrl || undefined,
      },
      // Pass-through prop the player needs so it knows when to stop
      // (Composition default is 1800; we override via frameRange if needed)
      frameRange: [0, totalFrames - 1],
      codec: 'h264',
      imageFormat: 'jpeg',
      privacy: 'public',
      framesPerLambda: Math.max(totalFrames, 600),
      maxRetries: 1,
    });

    let result = null;
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 8000));
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
    if (!result) throw new Error('Remotion timed out after 12 minutes');
    const videoUrl = result.outputFile || result.outUrl || '';
    if (!videoUrl) throw new Error('Remotion returned no output URL');

    await logRef.update({
      status: 'success',
      videoUrl,
      script,
      lines: linesWithAudio,
      ctaClipUrl,
      ambientUrl,
      totalFrames,
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`[cartoonVideo] DONE runId=${runId} → ${videoUrl}`);
    return { success: true, runId, videoUrl, totalFrames };
  } catch (err) {
    logger.error('[cartoonVideo] FAILED:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: false, runId, error: err.message || String(err) };
  }
}

module.exports = { postCartoonTestVideo };
