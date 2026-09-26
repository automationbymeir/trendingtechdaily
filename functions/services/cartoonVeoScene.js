/**
 * cartoonVeoScene.js
 * ---------------------------------------------------------------------------
 * Generates one cartoon-style ANIMATED clip per dialog line via Veo 3.1 Fast.
 *
 * Why Veo Fast (not Imagen + Remotion CSS):
 *   - Imagen produces ONE static frame — even with Remotion transforms it
 *     looks like a still image bouncing around, not a cartoon character.
 *   - Veo 3.1 Fast renders ACTUAL animated motion: mouth-flap on talking
 *     beat, body sway, blinks, hand gestures. Backdrop is baked into the
 *     clip, so no "transparency mismatch" against the underlying scene.
 *
 * Cost model:
 *   - Veo 3.1 Fast ≈ $0.10/sec
 *   - 4 seconds per line × ~7 lines ≈ $2.80 per video (vs $25-35 for Veo Pro
 *     realistic, vs $0.25 for the failed Imagen-only path).
 *
 * Character consistency:
 *   - We bake an identical exhaustive character description into every
 *     prompt (same body, same colors, same eye, same antenna).
 *   - Veo 3.1 isn't pixel-perfect across calls but it stays in the same
 *     archetype which reads as the same character in a cartoon.
 *
 * Audio:
 *   - We disable Veo's audio (`generateAudio: false`) and overlay the
 *     ElevenLabs / Google TTS track we generated separately. Cleaner sync.
 *
 * Public API:
 *   generateCartoonScene({ character, dialogCue, durationSeconds, sceneKey })
 *     → public HTTPS URL to MP4 (or '' on failure)
 */

const admin = require('firebase-admin');
const axios = require('axios');
const fetch = require('node-fetch');
const { logger } = require('../config');

const GCP_PROJECT = 'trendingtech-daily';
const VEO_MODEL = 'veo-3.1-fast-generate-001';
const GCS_BUCKET = `${GCP_PROJECT}.firebasestorage.app`;
const S3_BUCKET  = 'remotionlambda-useast1-di0xuqpokc';
const S3_REGION  = 'us-east-1';

// ── Auth token for Vertex AI calls ────────────────────────────────────────
async function getVertexToken() {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
}

// ── Character recipes (identical text in every prompt for consistency) ───
const RECIPES = {
  bit:
    'BIT, a 2D flat-animation robot mascot. Smooth rounded chubby body in deep teal-cyan with a soft muted-violet gradient on the lower half. ' +
    'Large oval visor-style screen face (matte dark grey) showing a single soft glowing cyan dot eye and a clean curved white LED smile. ' +
    'Slim antenna on top with a tiny warm amber light. Minimalist short rounded arms, holding a small flat tablet device. ' +
    'Two compact rounded feet. Modern adult flat-animation style — clean line work, sophisticated muted-vivid palette. ' +
    'NOT children\'s TV. NOT Simpsons. NOT South Park.',
  glitch:
    'GLITCH, a young-adult human (mid-20s) office colleague character, drawn in modern 2D flat-animation style. ' +
    'Messy chestnut-brown hair, oversized round black-frame glasses, calm half-smirk, ' +
    'wearing a clean olive-green crew-neck t-shirt under an unbuttoned soft-grey overshirt, holding a plain white coffee mug. ' +
    'Intelligent slightly-skeptical expression. Designed like a creative-industry professional, not a cartoon kid.',
};

const SCENE_SETTING =
  'A modern minimalist tech-newsroom set: muted-navy back wall with subtle architectural hexagon pattern faintly visible, ' +
  'a slim glowing horizontal LED accent strip across mid-height, soft warm key light from above, ' +
  'a clean polished desk surface across the bottom of the frame. Sleek tasteful designer set. NO readable text anywhere.';

const SHARED_STYLE =
  'Modern adult flat-animation aesthetic — refined character art with smooth limited-frame animation, ' +
  'natural body sway and head movement, expressive mouth-flap on each spoken syllable, occasional gentle hand gestures and eye-blinks. ' +
  'Style references: modern marketing animation (Mailchimp / Slack / Headspace), Vimeo Staff-Picks short film polish. ' +
  '2D flat with subtle gradient shading, light film grain, refined linework. ' +
  'Camera is locked, eye-line on character. 9:16 vertical orientation. CRITICAL: NO subtitles, NO captions, NO speech bubbles, NO text overlays.';

// ── Veo prompt builder per character + dialogue cue ───────────────────────
function buildPrompt({ character, dialogCue, pose }) {
  const recipe = RECIPES[character] || RECIPES.bit;
  const energy =
    pose === 'excited'
      ? 'enthusiastic — arms gesturing widely, body leaning slightly forward, animated talking energy'
      : 'natural conversational — gentle hand gesture, calm body language';
  return (
    `${recipe} ` +
    `Setting: ${SCENE_SETTING} ` +
    `Action: the character is mid-sentence, looking directly at the camera, mouth animating naturally as if speaking the topic "${dialogCue}". ` +
    `Energy: ${energy}. ` +
    `${SHARED_STYLE}`
  );
}

// ── Copy GCS clip → Remotion's S3 bucket (same region as Lambda) ──────────
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

/**
 * Generate one Veo clip for a dialog line. Internally retries once if the
 * first attempt times out or returns no URI.
 *
 * @param {Object} opts
 * @param {'bit'|'glitch'} opts.character
 * @param {string} opts.dialogCue   short topic/summary of what the line is about (NOT the literal dialog — Veo will not say it; we overlay TTS)
 * @param {number} opts.durationSeconds  4 – 8
 * @param {'neutral'|'excited'} [opts.pose='neutral']
 * @param {string} opts.sceneKey    used for filename + logs
 * @returns {Promise<string>} public S3 URL or '' on failure
 */
async function generateCartoonScene(opts) {
  const url = await _generateOnce(opts);
  if (url) return url;
  logger.warn(`[cartoonVeo] ${opts.sceneKey}: first attempt empty — retrying once`);
  return await _generateOnce({ ...opts, sceneKey: `${opts.sceneKey}-retry` });
}

async function _generateOnce({ character, dialogCue, durationSeconds = 5, pose = 'neutral', sceneKey }) {
  try {
    const prompt = buildPrompt({ character, dialogCue, pose });
    const token = await getVertexToken();
    const endpoint = `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/${VEO_MODEL}:predictLongRunning`;

    const dur = Math.max(4, Math.min(8, Math.round(durationSeconds)));
    const body = {
      instances: [{
        prompt,
        negativePrompt:
          'subtitle, caption, speech bubble, watermark, deformed, extra limbs, ' +
          'distorted face, photorealistic human, children\'s TV style',
      }],
      parameters: {
        aspectRatio: '9:16',
        sampleCount: 1,
        durationSeconds: dur,
        personGeneration: 'allow_all',
        generateAudio: false,            // we overlay our own TTS — skip Veo audio
        storageUri: `gs://${GCS_BUCKET}/cartoon-veo/`,
      },
    };

    const initRes = await axios.post(endpoint, body, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 60000,
    });
    const operationName = initRes.data?.name;
    if (!operationName) throw new Error('Veo Fast returned no operation name');
    logger.info(`[cartoonVeo] ${sceneKey} op: ${operationName}`);

    const fetchOpEndpoint =
      `https://us-central1-aiplatform.googleapis.com/v1beta1/projects/${GCP_PROJECT}/locations/us-central1/publishers/google/models/${VEO_MODEL}:fetchPredictOperation`;

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 15000));
      const pollToken = await getVertexToken();
      const pollRes = await axios.post(
        fetchOpEndpoint,
        { operationName },
        { headers: { Authorization: `Bearer ${pollToken}`, 'Content-Type': 'application/json' }, timeout: 30000 }
      );
      if (!pollRes.data.done) continue;

      const predictions = pollRes.data.response?.predictions;
      const videoEntry = Array.isArray(predictions) && predictions[0];
      let gcsUri = videoEntry?.video?.uri || videoEntry?.gcsUri || videoEntry?.uri;
      if (!gcsUri) {
        const videos = pollRes.data.response?.videos || pollRes.data.metadata?.videos;
        gcsUri = Array.isArray(videos) && (videos[0]?.gcsUri || videos[0]?.uri);
      }
      if (!gcsUri) {
        logger.warn(`[cartoonVeo] ${sceneKey} done but no URI:`, JSON.stringify(pollRes.data).slice(0, 400));
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

      const s3Key = `cartoon-veo-clips/${Date.now()}-${sceneKey}.mp4`;
      const finalUrl = await copyVideoToS3(gcsPublicUrl, s3Key);
      logger.info(`[cartoonVeo] ${sceneKey} → ${finalUrl}`);
      return finalUrl;
    }
    logger.warn(`[cartoonVeo] ${sceneKey} timed out`);
    return '';
  } catch (err) {
    logger.warn(`[cartoonVeo] ${sceneKey} failed:`, err.message);
    return '';
  }
}

module.exports = { generateCartoonScene };
