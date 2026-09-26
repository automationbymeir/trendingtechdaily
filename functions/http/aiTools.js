// functions/http/aiTools.js
// SSR for "AI Tools Pulse" — directory landing (/ai-tools) and detail
// (/ai-tools/<slug>) pages plus their Hebrew mirrors. Injects canonical,
// hreflang, OpenGraph, and JSON-LD (CollectionPage on landing,
// SoftwareApplication on detail) so Googlebot indexes everything.
//
// The static templates live at /public/ai-tools.html and
// /public/ai-tools-detail.html (with /he mirrors). For the landing pages
// we return them mostly verbatim and let the client-side JS populate
// content via the existing getAiToolsList callable. For detail pages we
// substitute {{PLACEHOLDERS}} so the bot sees the populated metadata.

const fs = require('fs');
const path = require('path');
const { db, logger } = require('../config');

const BASE_URL = 'https://www.trendingtechdaily.com';
const GLOSSARY_COLL = 'ai_glossary';
const CATEGORY_ORDER = { core: 0, models: 1, agents: 2, developer: 3 };

function esc(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function isValidSlug(s) { return typeof s === 'string' && /^[a-z0-9-]+$/i.test(s) && s.length >= 2 && s.length <= 100; }

const TYPE_LABELS_EN = {
  'claude-skill': 'Claude Skill',
  'mcp-connector': 'MCP Connector',
  'github-repo': 'GitHub Repo',
  'llm-product': 'LLM Product',
  'agent-framework': 'Agent Framework',
};
const TYPE_LABELS_HE = {
  'claude-skill': 'Claude Skill',
  'mcp-connector': 'מחבר MCP',
  'github-repo': 'מאגר GitHub',
  'llm-product': 'מוצר LLM',
  'agent-framework': 'Agent Framework',
};

function readTemplate(relPath) {
  // Templates live in BOTH /public (served by Hosting) and
  // /functions/templates (shipped with the function bundle so SSR can
  // read them at request time — Cloud Functions don't include /public).
  const candidates = [
    path.join(__dirname, '..', 'templates', relPath),
    path.join(process.cwd(), 'templates', relPath),
    path.join(__dirname, '..', '..', 'public', relPath),
    path.join(process.cwd(), 'public', relPath),
  ];
  for (const c of candidates) {
    try { return fs.readFileSync(c, 'utf8'); } catch (_e) { /* try next */ }
  }
  throw new Error(`Template not found: ${relPath}`);
}

function buildInstallBlock(installCommand, isHebrew) {
  if (!installCommand) return '';
  const t = (en, he) => isHebrew ? he : en;
  return `<section class="my-4">
    <h2>${t('Install', 'התקנה')}</h2>
    <div class="aip-code">
      <code id="aip-install-code">${esc(installCommand)}</code>
      <button id="aip-copy-install">${t('Copy', 'העתק')}</button>
    </div>
  </section>`;
}

function buildQuickStartBlock(tool, isHebrew) {
  const steps = isHebrew ? tool.quickStart_he : tool.quickStart_en;
  if (!Array.isArray(steps) || steps.length < 1) return '';
  const intro = isHebrew ? (tool.quickStartIntro_he || '') : (tool.quickStartIntro_en || '');
  const t = (en, he) => isHebrew ? he : en;
  const items = steps.slice(0, 5).map((s, i) =>
    `<li><span class="aip-qs-num">${i + 1}</span><span class="aip-qs-text">${esc(s)}</span></li>`
  ).join('');
  return `<section class="my-4 aip-quickstart">
    <h2>${t('Quick start', 'התחלה מהירה')}</h2>
    ${intro ? `<p class="aip-qs-intro">${esc(intro)}</p>` : ''}
    <ol class="aip-qs-list">${items}</ol>
  </section>`;
}

function buildBestForBlock(bestFor, isHebrew) {
  if (!Array.isArray(bestFor) || !bestFor.length) return '';
  const t = (en, he) => isHebrew ? he : en;
  return `<section class="my-4">
    <h2>${t('Best for', 'מתאים ל')}</h2>
    <div class="aip-bestfor">
      ${bestFor.map(x => `<span class="aip-chip">${esc(x)}</span>`).join('')}
    </div>
  </section>`;
}

function buildHomepageBtn(url, isHebrew) {
  if (!url) return '';
  const t = isHebrew ? 'אתר רשמי' : 'Homepage';
  return `<a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i> ${t}</a>`;
}
function buildRepoBtn(url, isHebrew) {
  if (!url) return '';
  const t = isHebrew ? 'מאגר' : 'Repository';
  return `<a class="btn btn-outline-dark" href="${esc(url)}" target="_blank" rel="noopener"><i class="bi bi-github"></i> ${t}</a>`;
}

function buildCategoryPill(category) {
  if (!category) return '';
  return `<span class="aip-pill">${esc(category)}</span>`;
}

function buildIconHtml(tool) {
  if (tool.iconUrl) return `<img src="${esc(tool.iconUrl)}" alt="${esc(tool.name || '')}">`;
  const initials = (tool.name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return esc(initials);
}

function averageRating(reviews) {
  const approved = (reviews || []).filter(r => r.approved !== false && Number(r.rating) > 0);
  if (!approved.length) return null;
  const avg = approved.reduce((s, r) => s + Number(r.rating), 0) / approved.length;
  return avg.toFixed(1);
}

// ── Detail page builder ───────────────────────────────────────────────
function buildDetailPage(tool, reviews, isHebrew) {
  const lang = isHebrew ? 'he' : 'en';
  const labels = isHebrew ? TYPE_LABELS_HE : TYPE_LABELS_EN;
  const typeLabel = labels[tool.type] || tool.type || '';
  const description = (isHebrew ? tool.description_he : tool.description_en) || tool.description_en || '';
  const shortDesc = (isHebrew ? tool.shortDesc_he : tool.shortDesc_en) || tool.shortDesc_en || '';
  const claudeTake = tool.claudeTake || (isHebrew ? 'הניתוח של Claude יופיע כאן בקרוב.' : 'Claude\'s analysis will appear here shortly.');
  const trendingScore = Math.max(0, Math.min(100, Number(tool.trendingScore) || 0));
  const avgRating = averageRating(reviews) || '—';
  const canonical = `${BASE_URL}${isHebrew ? '/he' : ''}/ai-tools/${tool.slug}`;
  const alternate = `${BASE_URL}${isHebrew ? '' : '/he'}/ai-tools/${tool.slug}`;

  const hreflang = `
    <link rel="alternate" hreflang="en" href="${esc(isHebrew ? alternate : canonical)}"/>
    <link rel="alternate" hreflang="he" href="${esc(isHebrew ? canonical : alternate)}"/>
    <link rel="alternate" hreflang="x-default" href="${esc(isHebrew ? alternate : canonical)}"/>`;

  const softwareLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    'name': tool.name,
    'description': shortDesc || description.replace(/<[^>]+>/g, '').slice(0, 200),
    'applicationCategory': tool.category || 'DeveloperApplication',
    'operatingSystem': 'Web',
    'url': canonical,
    'inLanguage': lang,
    'offers': tool.pricing ? { '@type': 'Offer', 'price': tool.pricing === 'free' || tool.pricing === 'open-source' ? '0' : undefined, 'category': tool.pricing } : undefined,
    'aggregateRating': avgRating !== '—' ? {
      '@type': 'AggregateRating',
      'ratingValue': avgRating,
      'reviewCount': (reviews || []).filter(r => r.approved !== false).length,
    } : undefined,
  };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(softwareLd)}</script>`;

  const tpl = readTemplate(isHebrew ? 'he/ai-tools-detail.html' : 'ai-tools-detail.html');

  const replacements = {
    '{{TITLE}}': esc(tool.name || tool.slug),
    '{{DESCRIPTION}}': esc(shortDesc || description.replace(/<[^>]+>/g, '').slice(0, 200)),
    '{{CANONICAL}}': esc(canonical),
    '{{HREFLANG}}': hreflang,
    '{{JSONLD}}': jsonLd,
    '{{SLUG}}': esc(tool.slug),
    '{{NAME}}': esc(tool.name || ''),
    '{{TYPE}}': esc(tool.type || ''),
    '{{TYPE_LABEL}}': esc(typeLabel),
    '{{CATEGORY_PILL}}': buildCategoryPill(tool.category),
    '{{PRICING}}': esc(tool.pricing || (isHebrew ? 'לא ידוע' : 'unknown')),
    '{{RATING}}': esc(avgRating),
    '{{SHORT_DESC}}': esc(shortDesc),
    '{{HOMEPAGE_BTN}}': buildHomepageBtn(tool.homepage, isHebrew),
    '{{REPO_BTN}}': buildRepoBtn(tool.repoUrl, isHebrew),
    '{{ICON_HTML}}': buildIconHtml(tool),
    '{{TRENDING_SCORE}}': String(trendingScore),
    '{{CLAUDE_TAKE}}': `<span>${esc(claudeTake)}</span>`,
    '{{DESCRIPTION_HTML}}': description ? (/<[a-z]+/i.test(description) ? description : `<p>${esc(description)}</p>`) : '',
    '{{INSTALL_BLOCK}}': buildInstallBlock(tool.installCommand, isHebrew),
    '{{BEST_FOR_BLOCK}}': buildBestForBlock(tool.bestFor, isHebrew),
    '{{QUICKSTART_BLOCK}}': buildQuickStartBlock(tool, isHebrew),
  };

  let html = tpl;
  for (const [k, v] of Object.entries(replacements)) {
    html = html.split(k).join(v);
  }
  return html;
}

// ── Explainer video lookup + embed ───────────────────────────────────
// SSR reads `ai_tools_explainers/{topic}-{language}` and substitutes the
// `{{EXPLAINER_VIDEO}}` placeholder in each template. If no doc exists
// (e.g. before the explainer pipeline first runs), the placeholder is
// replaced with an empty string and the page renders without the block.
async function loadExplainerUrl(topic, isHebrew) {
  try {
    const lang = isHebrew ? 'he' : 'en';
    const snap = await db.collection('ai_tools_explainers').doc(`${topic}-${lang}`).get();
    if (!snap.exists) return '';
    const data = snap.data() || {};
    return typeof data.url === 'string' ? data.url : '';
  } catch (e) {
    logger.warn(`[aiTools] loadExplainerUrl ${topic} failed:`, e.message);
    return '';
  }
}

function buildExplainerEmbed(videoUrl, isHebrew) {
  if (!videoUrl) return '';
  const label = isHebrew ? 'הסיור הקצר ב-30 שניות' : 'Watch the 30-second tour';
  return `<section class="aip-explainer-wrap" aria-label="${esc(label)}" style="padding:24px 16px 0;">
  <video class="aip-explainer"
    src="${esc(videoUrl)}"
    controls muted playsinline preload="metadata"
    style="display:block;margin:0 auto;width:100%;max-width:360px;aspect-ratio:9/16;border-radius:18px;box-shadow:0 12px 32px rgba(0,0,0,0.25);background:#000;"></video>
</section>`;
}

async function injectExplainer(html, topic, isHebrew) {
  const videoUrl = await loadExplainerUrl(topic, isHebrew);
  const embed = buildExplainerEmbed(videoUrl, isHebrew);
  return html.split('{{EXPLAINER_VIDEO}}').join(embed);
}

// ── Landing page builder ─────────────────────────────────────────────
async function buildLandingPage(isHebrew) {
  let html = readTemplate(isHebrew ? 'he/ai-tools.html' : 'ai-tools.html');
  html = await injectExplainer(html, 'landing', isHebrew);
  return html;
}

// (guide + glossary builders + their handlers are defined further down
//  in this file; they call `injectExplainer` to wire in {{EXPLAINER_VIDEO}}.)
//  The landing handlers above call buildLandingPage which already includes
//  the explainer placeholder substitution.


async function loadToolBySlug(slug) {
  // Slug doubles as doc id per the schema, but fall back to a `slug` field
  // query for safety.
  const direct = await db.collection('ai_tools').doc(slug).get().catch(() => null);
  if (direct && direct.exists) return { id: direct.id, ...direct.data() };
  const snap = await db.collection('ai_tools').where('slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function loadReviews(toolId) {
  try {
    const snap = await db.collection('ai_tool_reviews')
      .where('toolId', '==', toolId)
      .where('approved', '==', true)
      .limit(50)
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (_e) {
    return [];
  }
}

async function handleAiToolsLanding(req, res) {
  try {
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(await buildLandingPage(false));
  } catch (e) {
    logger.error('handleAiToolsLanding error', e);
    return res.status(500).send('Internal error');
  }
}

async function handleHeAiToolsLanding(req, res) {
  try {
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(await buildLandingPage(true));
  } catch (e) {
    logger.error('handleHeAiToolsLanding error', e);
    return res.status(500).send('Internal error');
  }
}

async function handleAiToolDetail(req, res) {
  try {
    const reqPath = (req.path || req.url || '').split('?')[0];
    const parts = reqPath.replace(/^\/+|\/+$/g, '').split('/');
    // Expected: ['ai-tools', '<slug>'] (EN) — the rewrite captures :slug.
    const slug = parts[parts.length - 1];
    if (!slug || !isValidSlug(slug) || slug === 'ai-tools') {
      // Fall back to landing if the slug is missing.
      return handleAiToolsLanding(req, res);
    }
    const tool = await loadToolBySlug(slug);
    if (!tool || tool.published === false) return res.status(404).send('Tool not found');
    const reviews = await loadReviews(tool.id || slug);
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(buildDetailPage(tool, reviews, false));
  } catch (e) {
    logger.error('handleAiToolDetail error', e);
    return res.status(500).send('Internal error');
  }
}

async function handleHeAiToolDetail(req, res) {
  try {
    const reqPath = (req.path || req.url || '').split('?')[0];
    const parts = reqPath.replace(/^\/+|\/+$/g, '').split('/');
    const slug = parts[parts.length - 1];
    if (!slug || !isValidSlug(slug) || slug === 'ai-tools') {
      return handleHeAiToolsLanding(req, res);
    }
    const tool = await loadToolBySlug(slug);
    if (!tool || tool.published === false) return res.status(404).send('Tool not found');
    const reviews = await loadReviews(tool.id || slug);
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(buildDetailPage(tool, reviews, true));
  } catch (e) {
    logger.error('handleHeAiToolDetail error', e);
    return res.status(500).send('Internal error');
  }
}

// ── Glossary + Guide SSR ──────────────────────────────────────────────
async function loadGlossary() {
  try {
    const snap = await db.collection(GLOSSARY_COLL).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    items.sort((a, b) => {
      const ca = CATEGORY_ORDER[a.category] ?? 99;
      const cb = CATEGORY_ORDER[b.category] ?? 99;
      if (ca !== cb) return ca - cb;
      return (a.order || 0) - (b.order || 0);
    });
    return items;
  } catch (e) {
    logger.warn('loadGlossary failed', e && e.message);
    return [];
  }
}

function buildGlossaryPage(items, isHebrew) {
  const lang = isHebrew ? 'he' : 'en';
  const canonical = `${BASE_URL}${isHebrew ? '/he' : ''}/ai-tools/glossary`;
  const alternate = `${BASE_URL}${isHebrew ? '' : '/he'}/ai-tools/glossary`;
  const hreflang = `
    <link rel="alternate" hreflang="en" href="${esc(isHebrew ? alternate : canonical)}"/>
    <link rel="alternate" hreflang="he" href="${esc(isHebrew ? canonical : alternate)}"/>
    <link rel="alternate" hreflang="x-default" href="${esc(isHebrew ? alternate : canonical)}"/>`;

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': isHebrew ? 'מילון מונחי AI' : 'AI Glossary',
    'description': isHebrew
      ? 'מילון מונחי בינה מלאכותית בעברית פשוטה — 35 מונחים: AI, LLM, RAG, MCP ועוד.'
      : '35 plain-English definitions of the AI terms you actually encounter — AI, LLM, RAG, MCP, agents, and more.',
    'url': canonical,
    'inLanguage': lang,
    'hasPart': items.slice(0, 50).map((it) => ({
      '@type': 'DefinedTerm',
      'name': isHebrew ? (it.term_he || it.term_en) : it.term_en,
      'description': isHebrew ? (it.definition_he || it.definition_en) : it.definition_en,
      'inDefinedTermSet': isHebrew ? 'מילון AI Tools Pulse' : 'AI Tools Pulse Glossary',
      'url': `${canonical}#${esc(it.slug)}`,
    })),
  };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;

  const tpl = readTemplate(isHebrew ? 'he/ai-tools-glossary.html' : 'ai-tools-glossary.html');
  const replacements = {
    '{{CANONICAL}}': esc(canonical),
    '{{HREFLANG}}': hreflang,
    '{{JSONLD}}': jsonLd,
    '{{GLOSSARY_JSON}}': JSON.stringify(items).replace(/</g, '\\u003c'),
  };
  let html = tpl;
  for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);
  return html;
}

function buildGuidePage(isHebrew) {
  const lang = isHebrew ? 'he' : 'en';
  const canonical = `${BASE_URL}${isHebrew ? '/he' : ''}/ai-tools/guide`;
  const alternate = `${BASE_URL}${isHebrew ? '' : '/he'}/ai-tools/guide`;
  const hreflang = `
    <link rel="alternate" hreflang="en" href="${esc(isHebrew ? alternate : canonical)}"/>
    <link rel="alternate" hreflang="he" href="${esc(isHebrew ? canonical : alternate)}"/>
    <link rel="alternate" hreflang="x-default" href="${esc(isHebrew ? alternate : canonical)}"/>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': isHebrew ? 'AI Tools למתחילים — מדריך מהיר' : 'AI Tools for Dummies — The 10-Minute Guide',
    'description': isHebrew
      ? 'מדריך התחלה לכלי AI: 4 הסוגים, איך לבחור את הראשון, מה להימנע ממנו.'
      : 'A friendly 10-minute guide to AI tools: the 4 types, picking your first one, common mistakes.',
    'url': canonical,
    'inLanguage': lang,
    'author': { '@type': 'Organization', 'name': 'TrendingTech Daily' },
    'publisher': { '@type': 'Organization', 'name': 'TrendingTech Daily' },
  };
  const jsonLd = `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
  const tpl = readTemplate(isHebrew ? 'he/ai-tools-guide.html' : 'ai-tools-guide.html');
  const replacements = {
    '{{CANONICAL}}': esc(canonical),
    '{{HREFLANG}}': hreflang,
    '{{JSONLD}}': jsonLd,
  };
  let html = tpl;
  for (const [k, v] of Object.entries(replacements)) html = html.split(k).join(v);
  return html;
}

async function handleAiToolsGlossary(req, res) {
  try {
    const items = await loadGlossary();
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    let html = buildGlossaryPage(items, false);
    html = await injectExplainer(html, 'glossary', false);
    return res.status(200).send(html);
  } catch (e) {
    logger.error('handleAiToolsGlossary error', e);
    return res.status(500).send('Internal error');
  }
}
async function handleHeAiToolsGlossary(req, res) {
  try {
    const items = await loadGlossary();
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    let html = buildGlossaryPage(items, true);
    html = await injectExplainer(html, 'glossary', true);
    return res.status(200).send(html);
  } catch (e) {
    logger.error('handleHeAiToolsGlossary error', e);
    return res.status(500).send('Internal error');
  }
}
async function handleAiToolsGuide(req, res) {
  try {
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    let html = buildGuidePage(false);
    html = await injectExplainer(html, 'guide', false);
    return res.status(200).send(html);
  } catch (e) {
    logger.error('handleAiToolsGuide error', e);
    return res.status(500).send('Internal error');
  }
}
async function handleHeAiToolsGuide(req, res) {
  try {
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.set('Content-Type', 'text/html; charset=utf-8');
    let html = buildGuidePage(true);
    html = await injectExplainer(html, 'guide', true);
    return res.status(200).send(html);
  } catch (e) {
    logger.error('handleHeAiToolsGuide error', e);
    return res.status(500).send('Internal error');
  }
}

module.exports = {
  handleAiToolsLanding,
  handleAiToolDetail,
  handleHeAiToolsLanding,
  handleHeAiToolDetail,
  handleAiToolsGlossary,
  handleHeAiToolsGlossary,
  handleAiToolsGuide,
  handleHeAiToolsGuide,
};
