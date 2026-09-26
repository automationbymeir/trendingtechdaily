/**
 * instagramCarousel.js
 * ---------------------------------------------------------------------------
 * End-to-end pipeline that posts a Hebrew Instagram carousel summarising
 * 4 fresh "X vs Y" comparisons from the site.
 *
 *   1. Pull up to 4 published he_comparisons docs not yet posted as a
 *      carousel (ordered by createdAt desc, oldest-first within that pool).
 *   2. Build slides with services/carouselGenerator.js (PNG buffers).
 *   3. Upload each slide to Firebase Storage with a public download URL.
 *   4. Create N image media containers on IG, then a CAROUSEL parent
 *      container that references them all, then publish.
 *   5. Mark each comparison with `lastInstagramCarouselAt` and the
 *      published media id, so we don't re-post the same item.
 *   6. Write a `schedulerLogs` entry (type: 'instagram_carousel') so the
 *      admin Automation panel surfaces success/error rows alongside the
 *      existing article-generation logs.
 *
 * Triggered by:
 *   - cron `0 7,15 * * *` (10:00 & 18:00 Asia/Jerusalem)
 *   - onCall `triggerInstagramCarousel` (admin manual)
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { logger, db } = require('./config');
const { buildCarouselSlideUrls } = require('./services/carouselGenerator');

// Instagram Graph API constants. Token is the long-lived page token already
// used by pushPromo / pushBrandPromo — pulled from env in prod so we don't
// commit it twice.
const IG_USER_ID = '17841427939019963';
const IG_TOKEN_FALLBACK =
  'EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD';

const SLIDE_LIMIT = 10;      // IG carousel max
const COMPARISONS_PER_POST = 4;
const COLLECTION = 'he_comparisons';     // Hebrew posts; switch to 'comparisons' for EN

function getIgToken() {
  return process.env.IG_ACCESS_TOKEN || IG_TOKEN_FALLBACK;
}

/**
 * Create a CHILD image media container (must include `is_carousel_item=true`).
 * Returns the container id.
 */
async function createIgChild(imageUrl) {
  const token = getIgToken();
  const params = new URLSearchParams({
    image_url: imageUrl,
    is_carousel_item: 'true',
    access_token: token,
  });
  const res = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: params,
  });
  const data = await res.json();
  if (data.error) throw new Error(`IG child container error: ${JSON.stringify(data.error)}`);
  return data.id;
}

/**
 * Create the PARENT carousel container referencing every child id, then poll
 * until ready, then publish. Returns the published media id.
 */
async function publishCarousel(childIds, caption) {
  const token = getIgToken();
  const createParams = new URLSearchParams({
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
    access_token: token,
  });
  const createRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
    method: 'POST',
    body: createParams,
  });
  const createData = await createRes.json();
  if (createData.error) throw new Error(`IG parent error: ${JSON.stringify(createData.error)}`);
  const parentId = createData.id;

  // Carousel parent is usually ready almost instantly, but poll just in case.
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await (
      await fetch(`https://graph.facebook.com/v20.0/${parentId}?fields=status_code&access_token=${token}`)
    ).json();
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('IG parent container processing error');
  }

  const publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: parentId, access_token: token }),
  });
  const publishData = await publishRes.json();
  if (publishData.error) throw new Error(`IG publish error: ${JSON.stringify(publishData.error)}`);
  return publishData.id;
}

function buildCaption(comparisons, copy) {
  const headline = (copy && copy.coverHeadline) || 'השוואות טכנולוגיה';
  const lines = [`${headline} 👇`, ''];
  comparisons.forEach((c, i) => {
    const sCopy = copy && copy.slides && copy.slides[i];
    const tail = sCopy && sCopy.hook ? ` — ${sCopy.hook}` : '';
    lines.push(`${i + 1}. ${c.itemA} מול ${c.itemB}${tail}`);
  });
  lines.push('');
  lines.push('🔗 הניתוח המלא — TrendingTechDaily.com');
  lines.push('');
  lines.push('#טכנולוגיה #השוואה #גאדג׳טס #TechNews #VS #TrendingTechDaily');
  return lines.join('\n');
}

/**
 * Pick up to N comparisons that haven't been posted as a carousel yet.
 * Falls back to the most recent comparisons if we can't find enough fresh ones.
 */
async function pickComparisons(limit) {
  const snap = await db.collection(COLLECTION)
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(40)
    .get();

  const all = [];
  snap.forEach((doc) => all.push({ id: doc.id, ref: doc.ref, ...doc.data() }));

  const fresh = all.filter((c) => !c.lastInstagramCarouselAt);
  if (fresh.length >= limit) {
    return fresh.slice(0, limit);
  }

  // Not enough fresh ones, so include previously posted ones,
  // ordered by the least recently posted (oldest first).
  const stale = all.filter((c) => c.lastInstagramCarouselAt);
  stale.sort((a, b) => {
    const tA = a.lastInstagramCarouselAt.toMillis ? a.lastInstagramCarouselAt.toMillis() : 0;
    const tB = b.lastInstagramCarouselAt.toMillis ? b.lastInstagramCarouselAt.toMillis() : 0;
    return tA - tB;
  });

  const pool = [...fresh, ...stale];
  return pool.slice(0, limit);
}

/**
 * Main entry — posts ONE carousel.
 *
 * @param {Object} opts
 * @param {'scheduled'|'manual'} [opts.trigger='scheduled']
 * @param {number}              [opts.count=COMPARISONS_PER_POST]
 * @returns {Promise<{success:boolean, mediaId?:string, comparisonIds:string[], error?:string}>}
 */
async function postComparisonCarousel({ trigger = 'scheduled', count = COMPARISONS_PER_POST } = {}) {
  const runId = `igcar_${Date.now()}_${uuidv4().slice(0, 8)}`;
  const startedAt = admin.firestore.FieldValue.serverTimestamp();
  const logRef = await db.collection('schedulerLogs').add({
    type: 'instagram_carousel',
    trigger,
    status: 'started',
    runId,
    count,
    startedAt,
  });

  try {
    const comparisons = await pickComparisons(Math.min(count, SLIDE_LIMIT - 2));
    if (!comparisons.length) {
      throw new Error('No published comparisons found in he_comparisons collection.');
    }
    logger.info(`[igCarousel] picked ${comparisons.length} comparisons:`, comparisons.map((c) => `${c.itemA} vs ${c.itemB}`).join(' | '));

    await logRef.update({ status: 'rendering', comparisonIds: comparisons.map((c) => c.id) });

    // 1. Generate Hebrew copy + Nano Banana backgrounds + render Remotion stills.
    //    Returns public S3 URLs for every slide PNG, no extra upload step needed.
    const { urls: slideUrls, copy } = await buildCarouselSlideUrls(comparisons);
    logger.info(`[igCarousel] rendered ${slideUrls.length} slide URLs via Remotion Lambda`);

    await logRef.update({
      status: 'creating_containers',
      slideUrls,
      copy: {
        coverHeadline: copy.coverHeadline,
        coverSubline: copy.coverSubline,
        ctaHeadline: copy.ctaHeadline,
        slideCount: slideUrls.length,
      },
    });

    // 2. Create IG child containers (sequential — IG occasionally 429s on parallel)
    const childIds = [];
    for (const url of slideUrls) {
      childIds.push(await createIgChild(url));
    }
    logger.info(`[igCarousel] created ${childIds.length} child containers`);

    await logRef.update({ status: 'publishing' });

    // 3. Parent container + publish
    const caption = buildCaption(comparisons, copy);
    const mediaId = await publishCarousel(childIds, caption);
    logger.info(`[igCarousel] PUBLISHED media id=${mediaId}`);

    // 5. Stamp each comparison so we don't re-post it
    const now = admin.firestore.FieldValue.serverTimestamp();
    await Promise.all(comparisons.map((c) =>
      c.ref.update({
        lastInstagramCarouselAt: now,
        lastInstagramMediaId: mediaId,
      })
    ));

    await logRef.update({
      status: 'success',
      mediaId,
      comparisonIds: comparisons.map((c) => c.id),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, mediaId, comparisonIds: comparisons.map((c) => c.id) };
  } catch (err) {
    logger.error('[igCarousel] FAILED:', err);
    await logRef.update({
      status: 'error',
      error: err.message || String(err),
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { success: false, error: err.message || String(err), comparisonIds: [] };
  }
}

module.exports = { postComparisonCarousel };
