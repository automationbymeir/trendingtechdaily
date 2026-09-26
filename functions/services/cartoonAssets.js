/**
 * cartoonAssets.js
 * ---------------------------------------------------------------------------
 * Generates and caches the cartoon character + backdrop assets used by the
 * trendingtechdaily mascot-led promo / news videos.
 *
 * Characters:
 *   - BIT   — the TTD mascot (round retro-futurist robot, cyan body, big eye,
 *             LED grin, antenna, holds a glowing tablet)
 *   - GLITCH — the human sidekick (skeptical office mate, big glasses, coffee
 *             mug, brown messy hair)
 *
 * Style guide kept identical across calls so the characters look like the
 * same characters every time:
 *   - 2D flat-shaded cartoon, thick black outlines, vivid primary colors
 *   - design vibe: Bee and PuppyCat × Steven Universe × 80s arcade
 *   - NEVER realistic / photoreal / pixel-art / 3D rendered
 *
 * Each generated PNG is uploaded to Firebase Storage with a deterministic
 * filename (so consecutive runs reuse the cached art — zero extra API cost
 * once a pose is generated).
 *
 * Public API:
 *   ensureCartoonAssets(genAI) →
 *     {
 *       bit:        { neutral, mouthClosed, mouthOpen, excited },
 *       glitch:     { neutral, mouthClosed, mouthOpen },
 *       backdrop:   string,
 *     }
 *   Each value is a public HTTPS URL to a PNG.
 */

const admin = require('firebase-admin');
const { logger } = require('../config');

// Bump this if you want to invalidate the cache (e.g. tweak the style and
// regenerate everything). Keep it stable otherwise.
const ASSET_VERSION = 'v2';

// "Adult flat animation" aesthetic — refined, modern, NOT kids' TV. Visual
// references: Mailchimp / Slack / Headspace / Stripe Press ads, modern
// Vimeo Staff Picks short films, Big Mouth's muted palette without the
// crude faces.
const STYLE_GUIDE =
  'Modern adult flat-animation illustration style — refined line art with subtle weight variation, ' +
  'sophisticated muted-yet-vivid palette, soft gradient shading on top of flat colors, slight grain texture, ' +
  'expressive but tasteful character design. Think Mailchimp / Slack / Headspace marketing illustrations, ' +
  'modern Vimeo Staff-Picks short film aesthetic. NOT children\'s Saturday-morning TV. NOT South Park paper-cutout. ' +
  'NOT Simpsons yellow-skin. NOT photorealistic, NOT pixel-art, NOT 3D rendered. ' +
  'CRITICAL: render with FULLY TRANSPARENT BACKGROUND (RGBA alpha channel, NO solid backdrop, NO floor shadow box, ' +
  'NO colored padding around the character). Output must be a clean PNG cutout suitable for compositing.';

const BIT_DESCRIPTION =
  'BIT — a sleek modern robot mascot, designed like a premium product icon. ' +
  'Smooth rounded chubby body in deep teal-cyan with subtle muted violet gradient on the lower half, ' +
  'one large oval visor-style screen face (matte dark grey) showing a single soft cyan dot eye and a clean curved white LED smile, ' +
  'a slim antenna with a tiny warm amber light on top, ' +
  'minimalist short arms holding a small flat tablet device, ' +
  'two compact rounded feet. Confident, intelligent, slightly playful personality. Designed for a tech brand, not a toy.';

const GLITCH_DESCRIPTION =
  'GLITCH — a young adult human office colleague character (mid-20s), drawn in a modern flat-animation style. ' +
  'Messy chestnut-brown hair, oversized round black-frame glasses, calm half-smirk, ' +
  'wearing a clean olive-green crew-neck t-shirt under an unbuttoned soft-grey overshirt, ' +
  'holding a plain white coffee mug, intelligent slightly-skeptical expression. Looks like a creative-industry professional, not a cartoon kid.';

// ─── Image generation via Nano Banana ─────────────────────────────────────
async function generateImage(genAI, prompt) {
  if (!genAI) return null;
  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const parts =
      (result &&
        result.candidates &&
        result.candidates[0] &&
        result.candidates[0].content &&
        result.candidates[0].content.parts) ||
      [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        return {
          buf: Buffer.from(p.inlineData.data, 'base64'),
          mime: p.inlineData.mimeType || 'image/png',
        };
      }
    }
    return null;
  } catch (err) {
    logger.warn('cartoonAssets: image gen failed:', err.message);
    return null;
  }
}

/**
 * Upload (or skip if already cached) and return the public URL.
 * Cache key is `cartoon-assets/<version>/<slug>.png` — stable, so
 * re-runs use the same already-uploaded file.
 */
async function uploadCached(slug, image) {
  const bucket = admin.storage().bucket();
  const dest = `cartoon-assets/${ASSET_VERSION}/${slug}.png`;
  const file = bucket.file(dest);
  const [exists] = await file.exists();
  if (!exists && image) {
    await file.save(image.buf, {
      contentType: image.mime,
      resumable: false,
      public: true,
      metadata: { cacheControl: 'public, max-age=2592000' }, // 30 days
    });
    try { await file.makePublic(); } catch (_) { /* ignore */ }
    logger.info(`cartoonAssets: generated + uploaded ${slug}`);
  } else if (exists) {
    logger.info(`cartoonAssets: cache hit for ${slug}`);
  } else {
    return null;
  }
  return `https://storage.googleapis.com/${bucket.name}/${dest}`;
}

// ─── Asset prompts ─────────────────────────────────────────────────────────
function buildPrompts() {
  return {
    'bit':
      `${BIT_DESCRIPTION} Neutral confident expression, slight readable smile, both arms relaxed at sides. ${STYLE_GUIDE} ` +
      `Full-body front-facing portrait, character centered. CRITICAL: render on a fully transparent background (no backdrop, no floor, no shadow box).`,
    'bit-excited':
      `${BIT_DESCRIPTION} Both arms raised in an enthusiastic gesture, antenna light glowing brighter, eye-dot slightly enlarged. ${STYLE_GUIDE} ` +
      `Full-body front-facing portrait, character centered. CRITICAL: render on a fully transparent background.`,
    'glitch':
      `${GLITCH_DESCRIPTION} Standing relaxed, holding coffee mug at chest height, head tilted slightly. ${STYLE_GUIDE} ` +
      `Full-body 3/4 portrait, character centered. CRITICAL: render on a fully transparent background.`,
    'cartoon-backdrop':
      `Modern tech-newsroom backdrop scene, 9:16 vertical orientation suitable for a vertical video. ` +
      `Sleek minimalist studio: a soft muted-navy wall in the upper half, ` +
      `a subtle architectural geometric pattern (hexagons / circuits) faintly visible in low contrast, ` +
      `a slim glowing horizontal LED accent strip running across at mid-height, ` +
      `a clean polished desk silhouette across the bottom third with a soft warm tabletop glow. ` +
      `Tasteful, designed like a modern startup branded set. ${STYLE_GUIDE} ` +
      `Empty center where characters will stand. NO text, NO logos, NO readable signage anywhere.`,
  };
}

// ─── Public ────────────────────────────────────────────────────────────────
async function ensureCartoonAssets(genAI) {
  const prompts = buildPrompts();
  const slugs = Object.keys(prompts);
  const urls = {};

  // Sequential to avoid Nano Banana rate-limit (tight quota on free tier)
  for (const slug of slugs) {
    const bucket = admin.storage().bucket();
    const dest = `cartoon-assets/${ASSET_VERSION}/${slug}.png`;
    const [exists] = await bucket.file(dest).exists();
    if (exists) {
      urls[slug] = `https://storage.googleapis.com/${bucket.name}/${dest}`;
      logger.info(`cartoonAssets: cache hit for ${slug}`);
      continue;
    }
    const image = await generateImage(genAI, prompts[slug]);
    if (!image) {
      logger.warn(`cartoonAssets: failed to generate ${slug}`);
      urls[slug] = null;
      continue;
    }
    urls[slug] = await uploadCached(slug, image);
  }

  return {
    bit: {
      neutral: urls['bit'],
      excited: urls['bit-excited'],
    },
    glitch: {
      neutral: urls['glitch'],
    },
    backdrop: urls['cartoon-backdrop'],
  };
}

module.exports = { ensureCartoonAssets, ASSET_VERSION };
