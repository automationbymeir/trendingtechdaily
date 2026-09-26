/**
 * cartoonAnchorStatic.js
 * ---------------------------------------------------------------------------
 * Replaces the Veo Fast-based BIT anchor scenes with Nano Banana stills.
 *
 * Why: Veo Fast insists on hallucinating a green production monitor on the
 * back wall every time, no matter how hard we negative-prompt or supply a
 * reference image. Static stills give us pixel-level control — no green
 * screen, no calibration markers, exactly the studio we asked for.
 *
 * We generate TWO images (per asset version, cached forever after):
 *   - bit-anchor-closed.png — BIT at desk, calm mouth-closed smile
 *   - bit-anchor-open.png   — same pose, mouth slightly open mid-speech
 *
 * Remotion alternates between them every ~5 frames during speaking scenes
 * to fake limited-animation lip flap. A subtle body bob + breathing scale
 * applied via CSS gives the still enough life that the viewer reads it as
 * animation, not a poster.
 *
 * Public:
 *   getStaticAnchorImages(genAI) → { mouthClosedUrl, mouthOpenUrl }
 */

const admin = require('firebase-admin');
const { logger } = require('../config');

const ASSET_VERSION = 'v1';
const STYLE_GUIDE =
  'Premium 2D flat-animation illustration, refined line work, modern muted-vivid palette, subtle gradient shading, slight grain. ' +
  'Adult flat-animation aesthetic similar to modern Headspace / Mailchimp / Vimeo Staff-Picks short film visual. ' +
  'NOT children\'s TV. NOT South Park. NOT Simpsons. NOT photorealistic, NOT 3D, NOT pixel art.';

const BIT_RECIPE =
  'BIT, a sleek modern cartoon robot mascot. ' +
  'Smooth rounded chubby body in deep teal-cyan with a soft muted-violet gradient on the lower half. ' +
  'Large oval visor-style screen face (matte dark grey) showing a single soft glowing cyan dot eye and a clean curved white LED smile. ' +
  'Slim antenna on top with a tiny warm amber light. Minimalist short rounded arms. Confident friendly anchor personality.';

const ANCHOR_SET =
  'A modern minimalist tech-newsroom anchor set, 9:16 vertical orientation. ' +
  'BIT sits at a sleek polished anchor desk in the LOWER HALF of the frame, ' +
  'shifted to the LEFT side so his entire head and body occupy roughly 12%-55% of the frame width. ' +
  'The top of his antenna does NOT extend above the middle horizontal line of the frame. ' +
  'Back wall: clean muted-navy newsroom wall with a faint architectural hexagon pattern, ' +
  'soft warm key light from above, a slim glowing horizontal LED accent strip across mid-height. ' +
  'A subtle "TTD" wordmark on the front of the desk. ' +
  'CRITICAL: the back wall is UNIFORMLY EMPTY — absolutely no monitor, no TV, no screen, no green rectangle, no chroma key, no calibration markers, no picture, no signage, no logo on the wall. The wall is a continuous clean texture.';

function makeClosedPrompt() {
  return (
    `${BIT_RECIPE} BIT looks straight at the camera with a calm warm anchor expression, mouth closed in a small natural smile. ` +
    `${ANCHOR_SET} ${STYLE_GUIDE}`
  );
}

function makeOpenPrompt() {
  return (
    `${BIT_RECIPE} BIT looks straight at the camera mid-sentence, mouth slightly open in a natural anchor "talking" shape (small oval), eyebrows relaxed. ` +
    `Same exact framing, pose, body position, lighting, and background as the mouth-closed reference — only the mouth changes. ` +
    `${ANCHOR_SET} ${STYLE_GUIDE}`
  );
}

// ─── Nano Banana wrapper ───────────────────────────────────────────────────
async function generateNanoBanana(genAI, prompt) {
  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const parts =
      (result && result.candidates && result.candidates[0] &&
        result.candidates[0].content && result.candidates[0].content.parts) || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        return { buf: Buffer.from(p.inlineData.data, 'base64'), mime: p.inlineData.mimeType || 'image/png' };
      }
    }
    return null;
  } catch (err) {
    logger.warn('[cartoonAnchorStatic] Nano Banana failed:', err.message);
    return null;
  }
}

async function uploadCached(slug, image) {
  const bucket = admin.storage().bucket();
  const dest = `cartoon-anchor-static/${ASSET_VERSION}/${slug}.png`;
  const file = bucket.file(dest);
  const [exists] = await file.exists();
  if (!exists && image) {
    await file.save(image.buf, {
      contentType: image.mime,
      resumable: false,
      public: true,
      metadata: { cacheControl: 'public, max-age=2592000' },
    });
    try { await file.makePublic(); } catch (_) { /* ignore */ }
    logger.info(`[cartoonAnchorStatic] uploaded ${slug}`);
  } else if (exists) {
    logger.info(`[cartoonAnchorStatic] cache hit ${slug}`);
  } else {
    return null;
  }
  return `https://storage.googleapis.com/${bucket.name}/${dest}`;
}

/**
 * Get the two static anchor images. Generated once, cached forever (until
 * ASSET_VERSION is bumped). Subsequent runs reuse them with zero API cost.
 *
 * @param {object} genAI  @google/genai client (REQUIRED on first run)
 * @returns {Promise<{ mouthClosedUrl: string, mouthOpenUrl: string }>}
 */
async function getStaticAnchorImages(genAI) {
  const bucket = admin.storage().bucket();
  const slugs = ['bit-anchor-closed', 'bit-anchor-open'];
  const urls = {};

  for (const slug of slugs) {
    const dest = `cartoon-anchor-static/${ASSET_VERSION}/${slug}.png`;
    const [exists] = await bucket.file(dest).exists();
    if (exists) {
      urls[slug] = `https://storage.googleapis.com/${bucket.name}/${dest}`;
      logger.info(`[cartoonAnchorStatic] cache hit ${slug}`);
      continue;
    }
    if (!genAI) {
      logger.warn(`[cartoonAnchorStatic] cannot generate ${slug} — genAI missing`);
      urls[slug] = '';
      continue;
    }
    const prompt = slug === 'bit-anchor-closed' ? makeClosedPrompt() : makeOpenPrompt();
    const img = await generateNanoBanana(genAI, prompt);
    if (!img) {
      urls[slug] = '';
      continue;
    }
    urls[slug] = (await uploadCached(slug, img)) || '';
  }

  return {
    mouthClosedUrl: urls['bit-anchor-closed'],
    mouthOpenUrl: urls['bit-anchor-open'],
  };
}

module.exports = { getStaticAnchorImages, ASSET_VERSION };
