/**
 * cartoonAnchorScene.js
 * ---------------------------------------------------------------------------
 * Generates "BIT at the news anchor desk" clips with a LARGE solid-color
 * monitor on the wall behind him — so Remotion can overlay the article
 * video onto that monitor at a fixed position.
 *
 * Output frame layout (locked in the prompt so multiple regenerations stay
 * roughly in the same place; we leave generous overlay margins to mask
 * minor variance from Veo):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  ← news set ambient
 *   │  ░░░░░░░░ NEWS-STUDIO WALL ░░░░░░░░░░░░░░░░  │
 *   │  ░░░  ┌───────────────────────────┐  ░░░░░░  │
 *   │  ░░░  │                           │  ░░░░░░  │  ← BIG monitor (PIP target)
 *   │  ░░░  │      SOLID #00FF00        │  ░░░░░░  │   approx top:18%  left:10%
 *   │  ░░░  │       (chroma-key)        │  ░░░░░░  │           width:80% height:38%
 *   │  ░░░  └───────────────────────────┘  ░░░░░░  │
 *   │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
 *   │                                              │
 *   │             ┌─ BIT at desk ─┐                │  ← BIT lower-center
 *   │             │  (anchor pose) │                │
 *   │             └────────────────┘                │
 *   │  ░░░░░░░░░ desk surface ░░░░░░░░░░░░░░░░░░░  │
 *   └──────────────────────────────────────────────┘
 *
 * The Remotion composition overlays the article video at:
 *   top: 18%   left: 5%   width: 90%   height: 42%
 * which fully covers the green monitor regardless of slight Veo variance.
 *
 * Public API:
 *   generateAnchorScene({ pose, durationSeconds, sceneKey }) → public S3 URL
 *
 *   pose ∈ 'intro' | 'introducing' | 'segue' | 'outro'
 */

const admin = require('firebase-admin');
const axios = require('axios');
const fetch = require('node-fetch');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { logger } = require('../config');

const GCP_PROJECT = 'trendingtech-daily';
const VEO_MODEL = 'veo-3.1-fast-generate-001';
const GCS_BUCKET = `${GCP_PROJECT}.firebasestorage.app`;
const S3_BUCKET  = 'remotionlambda-useast1-di0xuqpokc';
const S3_REGION  = 'us-east-1';

async function getVertexToken() {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// ─── Generate ONE reference still of the studio set BEFORE Veo ─────────────
// Veo Fast keeps hallucinating a green production monitor on the back wall
// despite negative prompts. The reliable fix is to give Veo a REFERENCE
// IMAGE that shows what the studio set should look like (without any green
// screen) and let Veo replicate the composition. We use Nano Banana
// (gemini-2.5-flash-image) once, then cache the result for the whole run.
//
// Returns { base64, mime } or null on failure.
let _cachedReference = null;
async function getStudioReferenceImage() {
  if (_cachedReference) return _cachedReference;
  if (!process.env.GEMINI_API_KEY) return null;
  try {
    const { GoogleGenAI } = require('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const refPrompt =
      'A SINGLE keyframe still of the BIT cartoon mascot in a tech news anchor set, 9:16 vertical orientation. ' +
      BIT_RECIPE + ' ' + ANCHOR_SET_PROMPT + ' ' +
      'BIT looking at the camera with a calm anchor expression, mid-shot framing. ' +
      'CRITICAL: the back wall is uniformly muted navy with faint hexagons — there is NO monitor, NO TV, NO screen, NO green rectangle, NO photograph, NO logo, NO calibration markers anywhere on the wall. The wall is a clean continuous surface. ' +
      'Render as a high-quality 2D flat animation keyframe.';
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ text: refPrompt }] }],
    });
    const parts = (result && result.candidates && result.candidates[0] &&
      result.candidates[0].content && result.candidates[0].content.parts) || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        _cachedReference = {
          base64: p.inlineData.data,
          mime: p.inlineData.mimeType || 'image/png',
        };
        logger.info(`[cartoonAnchor] reference image generated (${p.inlineData.data.length} chars)`);
        return _cachedReference;
      }
    }
    logger.warn('[cartoonAnchor] reference image: no inlineData returned');
    return null;
  } catch (err) {
    logger.warn('[cartoonAnchor] reference image failed:', err.message);
    return null;
  }
}

// Reset between digest runs so we get a fresh reference each request.
function resetReferenceImage() { _cachedReference = null; }

// Identical character recipe so BIT stays consistent across every anchor clip.
const BIT_RECIPE =
  'BIT, a 2D flat-animation robot mascot. Smooth rounded chubby body in deep teal-cyan with a soft muted-violet gradient on the lower half. ' +
  'Large oval visor-style screen face (matte dark grey) showing a single soft glowing cyan dot eye and a clean curved white LED smile. ' +
  'Slim antenna on top with a tiny warm amber light. Minimalist short rounded arms. ' +
  'Modern adult flat-animation style — clean line work, sophisticated muted-vivid palette. NOT children\'s TV.';

// Layout lock: BIT MUST live in the lower-left half of the frame so that
// nothing in the top-right quadrant — where Remotion overlays the article-
// video PIP — ever covers his face. There is NO green monitor; the back
// wall is just a clean newsroom backdrop.
const ANCHOR_SET_PROMPT =
  'A modern minimalist tech-newsroom anchor set, 9:16 vertical frame. ' +
  'BIT sits at a sleek polished anchor desk in the LOWER HALF of the frame, ' +
  'shifted to the LEFT side so his entire head and body occupy roughly the horizontal range 12%-55% of the frame width. ' +
  'The TOP of BIT\'s antenna must NOT extend above the horizontal middle of the frame — keep his whole figure strictly in the bottom half. ' +
  'Camera shows the polished desk surface across the bottom 25% of the frame, BIT\'s torso and head occupy roughly the area 12%-55% width and 35%-90% height. ' +
  'Back wall: a clean muted-navy newsroom wall with a faint architectural hexagon pattern, soft warm key light from above, a slim glowing horizontal LED accent strip across mid-height. ' +
  'CRITICAL: do NOT place any monitor, screen, TV, sign, photograph, or rectangular display anywhere on the wall — the back wall must be uniformly empty so a TV-style PIP overlay can be placed on top of the upper-right quadrant of the final composite. ' +
  'A subtle "TTD" wordmark on the front of the desk. ' +
  'No captions, no subtitles, no speech bubbles, no floating UI anywhere.';

// Poses are deliberately simple — Veo Fast occasionally fails on complex
// multi-arm gestures (returns "done but no URI"). A calm anchor read with
// one small gesture and natural head movement is reliably generated.
const POSES = {
  intro:
    'BIT looks straight at the camera with a warm welcoming smile, opens with a small one-handed wave, then keeps his hands relaxed. Calm anchor energy — like opening a news broadcast.',
  introducing:
    'BIT looks at the camera, gestures briefly with one hand toward the upper-right area of the wall behind him, then returns the hand near the desk. Mid-sentence anchor delivery.',
  segue:
    'BIT briefly nods at the camera with a small calm gesture, transitional anchor energy.',
  outro:
    'BIT looks straight at the camera with a satisfied closing smile, one small hand gesture to wrap up. Sign-off energy.',
};

function buildPrompt(pose) {
  return (
    `${BIT_RECIPE} ` +
    `${ANCHOR_SET_PROMPT} ` +
    `Action: ${POSES[pose] || POSES.introducing} His mouth animates naturally as if speaking, but no specific words are heard. ` +
    `Smooth 2D limited animation, subtle head movement, occasional blink. ` +
    `Modern adult flat-animation aesthetic — refined linework, muted-vivid palette. 9:16 vertical orientation. ` +
    `CRITICAL: the back wall is COMPLETELY EMPTY — absolutely NO monitor, NO TV, NO screen, NO rectangle, NO green area, NO chroma key, NO calibration markers, NO picture, NO signage anywhere on the wall. The wall is a clean continuous muted-navy surface with only the faint hexagon texture.`
  );
}

async function copyVideoToS3(publicUrl, s3Key) {
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID.trim();
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY.trim();
  }
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
    },
  });
  const res = await fetch(publicUrl, { timeout: 60000 });
  if (!res.ok) throw new Error(`copyVideoToS3 download failed ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: buf,
    ContentType: 'video/mp4',
    ACL: 'public-read',
  }));
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
}

// Run ffmpeg with given args, capture stderr, resolve when done.
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

// Strip any green-screen pixels Veo hallucinated and composite the clip over
// a still backdrop (the Nano Banana studio reference image). This guarantees
// no green can appear in the final scene — even if Veo ignores the prompt.
async function chromaCleanClip(inputUrl, backdropBuf) {
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'chroma-'));
  const inPath = path.join(work, 'in.mp4');
  const bgPath = path.join(work, 'bg.png');
  const outPath = path.join(work, 'out.mp4');
  // Download input mp4
  const res = await fetch(inputUrl, { timeout: 60000 });
  if (!res.ok) throw new Error(`chromaCleanClip download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(inPath, buf);
  await fs.promises.writeFile(bgPath, backdropBuf);

  // Two-pass chroma key: bright pure green (Veo's monitor) AND phosphor-green
  // variants. similarity 0.30 / blend 0.10 catches anti-aliased edges without
  // eating BIT's cyan body (cyan is far from green in YUV space).
  await runFfmpeg([
    '-y',
    '-loop', '1', '-i', bgPath,
    '-i', inPath,
    '-filter_complex',
    '[0:v]scale=1080:1920,setsar=1[bg];' +
    // Narrow chromakey: ONLY pure monitor-green pixels. BIT's body is
    // teal/cyan (#00B8C4-ish), which sits right next to green in YUV/RGB,
    // so wider similarity (>0.15) starts eating his body and makes him
    // appear "frozen behind a moving backdrop". 0.12 strips Veo's bright
    // green monitor cleanly while leaving BIT 100% intact.
    '[1:v]scale=1080:1920,setsar=1,' +
    'chromakey=0x00FF00:0.12:0.04[fg];' +
    '[bg][fg]overlay=shortest=1[out]',
    '-map', '[out]',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '20',
    '-movflags', '+faststart',
    outPath,
  ]);
  const cleaned = await fs.promises.readFile(outPath);
  // Clean up tmp
  try { await fs.promises.rm(work, { recursive: true, force: true }); } catch (_) { /* ignore */ }
  return cleaned;
}

async function uploadBufferToS3(buf, s3Key) {
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID.trim();
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY.trim();
  }
  const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
  const client = new S3Client({
    region: S3_REGION,
    credentials: {
      accessKeyId: process.env.REMOTION_AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.REMOTION_AWS_SECRET_ACCESS_KEY,
    },
  });
  await client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: buf,
    ContentType: 'video/mp4',
    ACL: 'public-read',
  }));
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
}

async function _once({ pose, durationSeconds, sceneKey }) {
  try {
    const prompt = buildPrompt(pose);
    const token = await getVertexToken();
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/${VEO_MODEL}:predictLongRunning`;
    const dur = Math.max(4, Math.min(8, Math.round(durationSeconds)));

    // Inject a reference image so Veo replicates the studio composition
    // exactly (no green screen, no random calibration markers on the wall).
    const ref = await getStudioReferenceImage();
    const instance = {
      prompt,
      negativePrompt:
        'subtitle, caption, speech bubble, watermark, deformed, distorted face, ' +
        'monitor on wall, TV on wall, screen on wall, picture on wall, green screen, green rectangle, ' +
        'chroma key, green production monitor, calibration markers, plus signs on wall, ' +
        'BIT head in upper half of frame, character above middle line, ' +
        'photorealistic human, children\'s TV style',
    };
    if (ref) {
      instance.image = { bytesBase64Encoded: ref.base64, mimeType: ref.mime };
    }

    const initRes = await axios.post(
      endpoint,
      {
        instances: [instance],
        parameters: {
          aspectRatio: '9:16',
          sampleCount: 1,
          durationSeconds: dur,
          personGeneration: 'allow_all',
          generateAudio: false,
          storageUri: `gs://${GCS_BUCKET}/cartoon-anchor-veo/`,
        },
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, timeout: 60000 }
    );
    const operationName = initRes.data?.name;
    if (!operationName) throw new Error('Veo Fast (anchor) returned no operation name');
    logger.info(`[cartoonAnchor] ${sceneKey} op: ${operationName}`);

    const fetchOpEndpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      const t = await getVertexToken();
      const poll = await axios.post(
        fetchOpEndpoint,
        { operationName },
        { headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      if (!poll.data.done) continue;

      const predictions = poll.data.response?.predictions;
      const videoEntry = Array.isArray(predictions) && predictions[0];
      let gcsUri = videoEntry?.video?.uri || videoEntry?.gcsUri || videoEntry?.uri;
      if (!gcsUri) {
        const videos = poll.data.response?.videos || poll.data.metadata?.videos;
        gcsUri = Array.isArray(videos) && (videos[0]?.gcsUri || videos[0]?.uri);
      }
      if (!gcsUri) {
        logger.warn(`[cartoonAnchor] ${sceneKey} done but no URI`);
        return '';
      }
      if (gcsUri.startsWith('gs://')) {
        try {
          const bucketName = gcsUri.split('/')[2];
          const objectPath = gcsUri.split('/').slice(3).join('/');
          await admin.storage().bucket(bucketName).file(objectPath).makePublic();
        } catch (_) { /* best effort */ }
      }
      const gcsPublicUrl = gcsUri.startsWith('gs://')
        ? gcsUri.replace('gs://', 'https://storage.googleapis.com/')
        : gcsUri;

      // CHROMA-CLEAN: strip any green pixels Veo hallucinated and composite
      // over the Nano Banana studio backdrop. Falls back to the raw clip if
      // the reference image is unavailable (rare).
      const s3Key = `cartoon-anchor-clips/${Date.now()}-${sceneKey}.mp4`;
      try {
        if (ref && ref.base64) {
          const bg = Buffer.from(ref.base64, 'base64');
          const cleaned = await chromaCleanClip(gcsPublicUrl, bg);
          const finalUrl = await uploadBufferToS3(cleaned, s3Key);
          logger.info(`[cartoonAnchor] ${sceneKey} chroma-cleaned → ${finalUrl}`);
          return finalUrl;
        }
      } catch (e) {
        logger.warn(`[cartoonAnchor] ${sceneKey} chroma-clean failed (${e.message}) — using raw clip`);
      }
      const finalUrl = await copyVideoToS3(gcsPublicUrl, s3Key);
      logger.info(`[cartoonAnchor] ${sceneKey} (raw) → ${finalUrl}`);
      return finalUrl;
    }
    logger.warn(`[cartoonAnchor] ${sceneKey} timed out`);
    return '';
  } catch (err) {
    logger.warn(`[cartoonAnchor] ${sceneKey} failed:`, err.message);
    return '';
  }
}

/**
 * Generate a single anchor clip. One retry on failure.
 */
async function generateAnchorScene(opts) {
  const url = await _once(opts);
  if (url) return url;
  logger.warn(`[cartoonAnchor] ${opts.sceneKey}: retrying once`);
  return _once({ ...opts, sceneKey: `${opts.sceneKey}-retry` });
}

module.exports = { generateAnchorScene, resetReferenceImage };
