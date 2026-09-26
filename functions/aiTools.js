/**
 * aiTools.js
 * ---------------------------------------------------------------------------
 * Business logic for the AI Tools Directory.
 *
 * Exports:
 *   - seedAiToolsCatalog(opts)
 *   - refreshTrendingScores(opts)
 *   - getAiToolsList(args)
 *   - getAiToolDetail(slug)
 *   - submitToolReview(args, auth)
 *
 * Firestore collections:
 *   - ai_tools                (doc id = slug)
 *   - ai_tool_reviews         (auto-id)
 *   - ai_tool_metrics_history (auto-id)
 */

const axios = require('axios');
const admin = require('firebase-admin');
const { logger, db } = require('./config');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');
const { CATALOG, initialTrendingScore } = require('./services/aiToolsCatalog');
const { enrichTool } = require('./services/aiToolsEnrich');

const TOOLS_COLL    = 'ai_tools';
const REVIEWS_COLL  = 'ai_tool_reviews';
const METRICS_COLL  = 'ai_tool_metrics_history';

// ─── Helpers ────────────────────────────────────────────────────────────────

function nowTs() { return admin.firestore.FieldValue.serverTimestamp(); }

function domainOf(url) {
  try { return new URL(url).hostname; } catch (_) { return null; }
}

function faviconUrl(homepage) {
  const d = domainOf(homepage);
  if (!d) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`;
}

async function getGenAI() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }
  await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!GoogleGenAI) throw new Error('Gemini SDK failed to load');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

async function isAdminUid(uid) {
  if (!uid) return false;
  try {
    const user = await admin.auth().getUser(uid);
    return !!(user.customClaims && user.customClaims.admin);
  } catch (_) {
    return false;
  }
}

// Run async work with bounded concurrency.
async function pMap(items, mapper, concurrency = 4) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      try { results[i] = { ok: true, value: await mapper(items[i], i) }; }
      catch (err) { results[i] = { ok: false, error: err }; }
    }
  });
  await Promise.all(workers);
  return results;
}

function parseGithubRepoUrl(url) {
  if (!url) return null;
  const m = String(url).match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function fetchGithubStars(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await axios.get(url, {
    timeout: 15000,
    validateStatus: (s) => s < 500,
    headers: { 'User-Agent': 'trendingtech-ai-tools-directory' },
  });
  if (res.status === 200 && res.data) {
    return Number(res.data.stargazers_count) || 0;
  }
  if (res.status === 403 || res.status === 429) {
    throw new Error(`github rate limited (${res.status})`);
  }
  throw new Error(`github ${owner}/${repo} -> ${res.status}`);
}

// ─── seedAiToolsCatalog ─────────────────────────────────────────────────────

/**
 * Iterate the curated catalog, enrich each entry via Gemini, write to
 * Firestore. Marks the top 8 by initial trendingScore as `featured`.
 *
 * @param {object} opts
 *   - concurrency (default 4)
 *   - overwrite (default false): if false, skips slugs that already exist
 *   - onlyType (optional): seed a single type only
 *   - dryRun (default false)
 */
async function seedAiToolsCatalog(opts = {}) {
  const concurrency = opts.concurrency || 4;
  const overwrite   = !!opts.overwrite;
  const onlyType    = opts.onlyType || null;
  const dryRun      = !!opts.dryRun;

  const genAI = await getGenAI();

  const items = CATALOG
    .filter((t) => !onlyType || t.type === onlyType)
    .map((t) => ({ ...t, trendingScore: initialTrendingScore(t) }));

  // Pre-pick the top 8 slugs by initial score for featured flag.
  const featuredSlugs = new Set(
    [...items].sort((a, b) => b.trendingScore - a.trendingScore).slice(0, 8).map((t) => t.slug),
  );

  // Skip existing if !overwrite — check in bulk.
  const existingSlugs = new Set();
  if (!overwrite) {
    const snaps = await Promise.all(items.map((t) => db.collection(TOOLS_COLL).doc(t.slug).get()));
    snaps.forEach((s, i) => { if (s.exists) existingSlugs.add(items[i].slug); });
  }

  const toProcess = items.filter((t) => overwrite || !existingSlugs.has(t.slug));
  logger.info(`[aiTools.seed] processing ${toProcess.length}/${items.length} tools (skipped existing: ${existingSlugs.size}, dryRun: ${dryRun})`);

  const summary = { total: items.length, attempted: toProcess.length, written: 0, failed: 0, skipped: existingSlugs.size, errors: [] };

  const results = await pMap(toProcess, async (tool) => {
    const enriched = await enrichTool(tool, genAI);
    const doc = {
      slug: enriched.slug,
      name: enriched.name,
      type: enriched.type,
      category: enriched.category,
      description_en: enriched.description_en,
      description_he: enriched.description_he,
      shortDesc_en:   enriched.shortDesc_en,
      shortDesc_he:   enriched.shortDesc_he,
      bestFor: enriched.bestFor || [],
      pricing: enriched.pricing,
      homepage: enriched.homepage,
      repoUrl: enriched.repoUrl || null,
      installCommand: enriched.installCommand || null,
      claudeTake: enriched.claudeTake,
      claudeTakeBy: enriched.claudeTakeBy || 'gemini-2.5-flash',
      trendingScore: enriched.trendingScore,
      metrics: { lastChecked: nowTs() },
      tags: enriched.tags || [],
      iconUrl: faviconUrl(enriched.homepage),
      featured: featuredSlugs.has(enriched.slug),
      published: true,
      createdAt: nowTs(),
      updatedAt: nowTs(),
    };
    if (!dryRun) {
      await db.collection(TOOLS_COLL).doc(enriched.slug).set(doc, { merge: true });
    }
    return enriched.slug;
  }, concurrency);

  for (const r of results) {
    if (r && r.ok) summary.written++;
    else {
      summary.failed++;
      summary.errors.push(r && r.error ? r.error.message : 'unknown');
    }
  }

  logger.info('[aiTools.seed] done', summary);
  // `count` alias for the admin UI which reads `data.count`.
  return { ...summary, count: summary.written };
}

// ─── refreshTrendingScores ──────────────────────────────────────────────────

/**
 * Refresh GitHub stars + trending score for tools with a repoUrl.
 * Caps the number of GitHub calls per run to respect the 60/hr unauth limit.
 *
 * Score formula (0-100, integer):
 *   score = clamp( 0.6 * starsComponent + 0.3 * growthComponent + 0.1 * baseTier )
 * where:
 *   starsComponent  = min(100, log10(stars+1) * 22)            // 100k stars ≈ 110
 *   growthComponent = min(100, weeklyStarsGrowth * 4)
 *   baseTier        = initial heuristic score for the tool
 */
async function refreshTrendingScores(opts = {}) {
  const maxCalls = Math.min(50, Number.isFinite(opts.maxCalls) ? opts.maxCalls : 50);

  // Fetch eligible tools.
  const snap = await db.collection(TOOLS_COLL)
    .where('repoUrl', '>', '')
    .limit(500)
    .get();

  const candidates = [];
  snap.forEach((d) => {
    const data = d.data();
    const parsed = parseGithubRepoUrl(data.repoUrl);
    if (parsed) candidates.push({ id: d.id, data, parsed });
  });

  // Stable order: oldest lastChecked first.
  candidates.sort((a, b) => {
    const ta = (a.data.metrics && a.data.metrics.lastChecked && a.data.metrics.lastChecked.toMillis && a.data.metrics.lastChecked.toMillis()) || 0;
    const tb = (b.data.metrics && b.data.metrics.lastChecked && b.data.metrics.lastChecked.toMillis && b.data.metrics.lastChecked.toMillis()) || 0;
    return ta - tb;
  });

  const slice = candidates.slice(0, maxCalls);
  logger.info(`[aiTools.refresh] refreshing ${slice.length}/${candidates.length} repos (cap ${maxCalls})`);

  const summary = { processed: 0, updated: 0, failed: 0, errors: [] };

  for (const c of slice) {
    summary.processed++;
    try {
      const stars = await fetchGithubStars(c.parsed.owner, c.parsed.repo);

      // Look up most recent history entry to compute weekly growth.
      let weeklyStarsGrowth = 0;
      try {
        const histSnap = await db.collection(METRICS_COLL)
          .where('toolId', '==', c.id)
          .orderBy('date', 'desc')
          .limit(1)
          .get();
        if (!histSnap.empty) {
          const prev = histSnap.docs[0].data();
          if (typeof prev.stars === 'number' && prev.date && prev.date.toMillis) {
            const days = Math.max(1, (Date.now() - prev.date.toMillis()) / (1000 * 60 * 60 * 24));
            weeklyStarsGrowth = Math.round(((stars - prev.stars) / days) * 7);
          }
        }
      } catch (e) {
        logger.warn(`[aiTools.refresh] history lookup failed for ${c.id}: ${e.message}`);
      }

      const baseTier = initialTrendingScore({ slug: c.id, type: c.data.type });
      const starsComponent  = Math.min(100, Math.log10(stars + 1) * 22);
      const growthComponent = Math.min(100, Math.max(0, weeklyStarsGrowth) * 4);
      const trendingScore = Math.round(
        Math.max(0, Math.min(100, 0.6 * starsComponent + 0.3 * growthComponent + 0.1 * baseTier)),
      );

      await db.collection(TOOLS_COLL).doc(c.id).update({
        trendingScore,
        'metrics.stars': stars,
        'metrics.weeklyStarsGrowth': weeklyStarsGrowth,
        'metrics.lastChecked': nowTs(),
        updatedAt: nowTs(),
      });

      await db.collection(METRICS_COLL).add({
        toolId: c.id,
        date: nowTs(),
        trendingScore,
        stars,
      });

      summary.updated++;
    } catch (err) {
      summary.failed++;
      summary.errors.push(`${c.id}: ${err.message}`);
      if (/rate limited/i.test(err.message)) {
        logger.warn('[aiTools.refresh] GitHub rate limited — stopping run early');
        break;
      }
    }
  }

  logger.info('[aiTools.refresh] done', summary);
  return summary;
}

// ─── getAiToolsList ─────────────────────────────────────────────────────────

const ALLOWED_TYPES     = ['claude-skill', 'mcp-connector', 'github-repo', 'llm-product', 'agent-framework'];
const ALLOWED_PRICING   = ['free', 'freemium', 'paid', 'open-source'];

function projectTool(data, language = 'en') {
  const isHe = language === 'he';
  return {
    slug: data.slug,
    name: data.name,
    type: data.type,
    category: data.category,
    description: isHe ? data.description_he : data.description_en,
    shortDesc:   isHe ? data.shortDesc_he   : data.shortDesc_en,
    bestFor: data.bestFor || [],
    pricing: data.pricing,
    homepage: data.homepage,
    repoUrl: data.repoUrl || null,
    installCommand: data.installCommand || null,
    claudeTake: data.claudeTake,
    claudeTakeBy: data.claudeTakeBy || null,
    trendingScore: data.trendingScore || 0,
    metrics: data.metrics || {},
    tags: data.tags || [],
    iconUrl: data.iconUrl || null,
    featured: !!data.featured,
  };
}

/**
 * Filtered + paginated listing.
 * Filters are combined; `search` is a client-side substring scan over name/tags
 * applied after Firestore retrieval (so we keep query simple).
 */
async function getAiToolsList(args = {}) {
  const {
    type, category, bestFor, pricing,
    search, language = 'en',
    limit = 24, cursor = null,
  } = args || {};

  const clampLimit = Math.max(1, Math.min(100, Number(limit) || 24));

  let q = db.collection(TOOLS_COLL).where('published', '==', true);

  if (type && ALLOWED_TYPES.includes(type))         q = q.where('type', '==', type);
  if (category && typeof category === 'string')     q = q.where('category', '==', category);
  if (pricing && ALLOWED_PRICING.includes(pricing)) q = q.where('pricing', '==', pricing);
  if (bestFor && typeof bestFor === 'string')       q = q.where('bestFor', 'array-contains', bestFor);

  // Order by trendingScore desc; secondary by slug for cursor stability.
  q = q.orderBy('trendingScore', 'desc').orderBy('slug', 'asc');

  if (cursor && typeof cursor === 'object' && cursor.trendingScore !== undefined && cursor.slug) {
    q = q.startAfter(cursor.trendingScore, cursor.slug);
  }

  // Over-fetch slightly when search is active.
  const fetchLimit = search ? clampLimit * 4 : clampLimit + 1;
  const snap = await q.limit(fetchLimit).get();

  let docs = snap.docs;
  if (search) {
    const term = String(search).toLowerCase().trim();
    docs = docs.filter((d) => {
      const data = d.data();
      const hay = [
        data.name, data.slug, data.shortDesc_en, data.shortDesc_he,
        ...(Array.isArray(data.tags) ? data.tags : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(term);
    });
  }

  const sliced = docs.slice(0, clampLimit);
  const tools = sliced.map((d) => projectTool(d.data(), language));

  let nextCursor = null;
  if (docs.length > clampLimit && sliced.length > 0) {
    const last = sliced[sliced.length - 1].data();
    nextCursor = { trendingScore: last.trendingScore || 0, slug: last.slug };
  }

  return { tools, nextCursor };
}

// ─── getAiToolDetail ────────────────────────────────────────────────────────

async function getAiToolDetail(slug) {
  if (!slug || typeof slug !== 'string') {
    throw new Error('slug is required');
  }
  const doc = await db.collection(TOOLS_COLL).doc(slug).get();
  if (!doc.exists) return { tool: null };

  const data = doc.data();
  if (data.published === false) return { tool: null };

  // Recent approved reviews + trending history (best-effort).
  const [reviewsSnap, historySnap] = await Promise.all([
    db.collection(REVIEWS_COLL)
      .where('toolId', '==', slug)
      .where('approved', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(25)
      .get()
      .catch((e) => { logger.warn(`[aiTools.detail] reviews query failed: ${e.message}`); return { docs: [] }; }),
    db.collection(METRICS_COLL)
      .where('toolId', '==', slug)
      .orderBy('date', 'desc')
      .limit(30)
      .get()
      .catch((e) => { logger.warn(`[aiTools.detail] history query failed: ${e.message}`); return { docs: [] }; }),
  ]);

  const reviews = reviewsSnap.docs.map((d) => {
    const r = d.data();
    return {
      id: d.id,
      userId: r.userId,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.createdAt && r.createdAt.toMillis ? r.createdAt.toMillis() : null,
    };
  });

  const trendingHistory = historySnap.docs.map((d) => {
    const h = d.data();
    return {
      date: h.date && h.date.toMillis ? h.date.toMillis() : null,
      trendingScore: h.trendingScore || 0,
      stars: typeof h.stars === 'number' ? h.stars : null,
    };
  }).reverse(); // chronological

  return {
    tool: { ...projectTool(data, 'en'), description_en: data.description_en, description_he: data.description_he, shortDesc_en: data.shortDesc_en, shortDesc_he: data.shortDesc_he },
    reviews,
    trendingHistory,
  };
}

// ─── submitToolReview ───────────────────────────────────────────────────────

async function submitToolReview(args, auth) {
  if (!auth || !auth.uid) {
    const err = new Error('Authentication required');
    err.code = 'unauthenticated';
    throw err;
  }
  const { toolId, rating, comment } = args || {};
  if (!toolId || typeof toolId !== 'string') throw new Error('toolId is required');
  const r = Number(rating);
  if (!Number.isFinite(r) || r < 1 || r > 5) throw new Error('rating must be 1-5');
  const text = String(comment || '').trim();
  if (text.length > 2000) throw new Error('comment too long');

  // Confirm tool exists + is published.
  const toolSnap = await db.collection(TOOLS_COLL).doc(toolId).get();
  if (!toolSnap.exists || toolSnap.data().published === false) {
    throw new Error('tool not found');
  }

  const isAdmin = !!(auth.token && auth.token.admin) || await isAdminUid(auth.uid);

  const docRef = await db.collection(REVIEWS_COLL).add({
    toolId,
    userId: auth.uid,
    rating: Math.round(r),
    comment: text,
    approved: !!isAdmin,
    createdAt: nowTs(),
  });

  return { id: docRef.id, approved: !!isAdmin };
}

module.exports = {
  seedAiToolsCatalog,
  refreshTrendingScores,
  getAiToolsList,
  getAiToolDetail,
  submitToolReview,
};
