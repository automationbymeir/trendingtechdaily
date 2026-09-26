// functions/http/comparisons.js
// SSR for "X vs Y" comparison pages — English (/compare/<slug>) and Hebrew
// (/he/compare/<slug>) plus their index pages. Emits canonical, hreflang,
// OpenGraph, FAQPage + Article JSON-LD so Googlebot indexes them instantly.
//
// Chrome (navbar, footer, fonts, sidebar) matches the rest of the site:
//   • EN → uses /nav.html loader (nav-loader.js) + /footer.html placeholder,
//     Playfair Display / Source Serif, /styles.css, article-page sidebar.
//   • HE → uses /he/nav.html loader (he-app.js) + inline Hebrew footer,
//     Heebo font, /he/styles.css, Hebrew sidebar.

const { db, logger } = require('../config');

const BASE_URL = 'https://www.trendingtechdaily.com';

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

// ── GTM ────────────────────────────────────────────────────────────────────────
const GTM_HEAD = `<!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-M68CNVMQ');</script>`;
const GTM_NOSCRIPT = `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M68CNVMQ" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

// ── English chrome (matches routing.js) ────────────────────────────────────────
const EN_HEAD_ASSETS = `
  ${GTM_HEAD}
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js"></script>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/css/cookie-consent.css">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8142734137865758" crossorigin="anonymous"></script>`;

const EN_FOOTER_SCRIPTS = `
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/js/app-base.js?v=2"></script>
  <script src="/js/category-helper.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/nav-loader.js"></script>
  <script src="/js/cookie-consent.js" defer></script>`;

const EN_SIDEBAR_HTML = `
  <aside class="col-lg-4">
    <div class="sidebar-section mb-4">
      <h4>Trending Articles</h4>
      <ul class="trending-topics-list" id="trending-articles-list">
        <li class="text-muted small">Loading...</li>
      </ul>
    </div>
    <div class="sidebar-section mb-4">
      <h4>Categories</h4>
      <ul class="trending-topics-list" id="categories-list">
        <li class="text-muted small">Loading...</li>
      </ul>
    </div>
    <div class="sidebar-section automation-banner mb-4">
      <a href="https://www.automationbymeir.com/" target="_blank" rel="noopener" class="automation-banner-link">
        <h4 class="mb-2">Automation by Meir</h4>
        <p class="small mb-0">Transform your business with custom automation</p>
      </a>
    </div>
  </aside>`;

// ── Hebrew chrome (matches hebrew-routing.js) ──────────────────────────────────
const HE_HEAD_ASSETS = `
  ${GTM_HEAD}
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js" defer></script>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet"/>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet"/>
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;900&family=Orbitron:wght@900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/he/styles.css">
  <link rel="stylesheet" href="/css/cookie-consent.css">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">`;

const HE_FOOTER_HTML = `
  <footer class="footer">
    <div class="container">
      <div class="row">
        <div class="col-md-4 mb-4 mb-md-0">
          <h5>TrendingTech Daily</h5>
          <p class="small" style="color:#aaa;">הישארו מעודכנים עם חדשות הטכנולוגיה האחרונות בעברית.</p>
        </div>
        <div class="col-md-4 mb-4 mb-md-0">
          <h5>קישורים מהירים</h5>
          <ul class="footer-links">
            <li><a href="/he/">ראשי</a></li>
            <li><a href="/he/compare">השוואות</a></li>
            <li><a href="/he/podcasts">פודקאסטים</a></li>
            <li><a href="/he/about">אודות</a></li>
            <li><a href="/he/privacy">מדיניות פרטיות</a></li>
            <li><a href="/">English Version</a></li>
          </ul>
        </div>
        <div class="col-md-4">
          <h5>שפה</h5>
          <p class="small" style="color:#aaa;"><a href="/" style="color:#FFC107;">🌐 English Version</a></p>
        </div>
      </div>
      <div class="copyright"><p style="margin:0;">© 2025 TrendingTech Daily. כל הזכויות שמורות.</p></div>
    </div>
  </footer>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" defer></script>
  <script src="/he/js/he-app.js" defer></script>
  <script src="/he/js/he-cookie-consent.js" defer></script>`;

const HE_SIDEBAR_HTML = `
  <aside class="col-lg-4">
    <div class="sidebar-section mb-4">
      <h4>קטגוריות</h4>
      <ul class="trending-topics-list" id="categories-list">
        <li><a href="/he/ai">בינה מלאכותית <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/technology">טכנולוגיה <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/startups">סטארטאפים <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/gadgets">גאדג'טים <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/security">אבטחה <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/crypto">קריפטו <span class="badge bg-primary rounded-pill">→</span></a></li>
        <li><a href="/he/compare">השוואות <span class="badge bg-primary rounded-pill">→</span></a></li>
      </ul>
    </div>
    <div class="sidebar-section automation-banner mb-4">
      <a href="https://www.automationbymeir.com/" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block;">
        <h4 class="mb-2" style="color:#fff;">Automation by Meir</h4>
        <p class="small mb-0" style="color:#aaa;">שדרגו את העסק שלכם עם אוטומציה מותאמת אישית</p>
      </a>
    </div>
  </aside>`;

// ── Shared content helpers ─────────────────────────────────────────────────────
function renderSpecTable(specRows, aLabel, bLabel, isHebrew) {
  if (!Array.isArray(specRows) || specRows.length === 0) return '';
  const t = (en, he) => isHebrew ? he : en;
  return `<section class="comparison-specs mt-5">
    <h2 class="section-title">${t('Side-by-side specifications', 'מפרט השוואתי')}</h2>
    <div class="table-responsive">
      <table class="table table-bordered table-hover align-middle">
        <thead class="table-light">
          <tr>
            <th style="width:30%">${t('Feature', 'תכונה')}</th>
            <th>${esc(aLabel)}</th>
            <th>${esc(bLabel)}</th>
          </tr>
        </thead>
        <tbody>
          ${specRows.map(r => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.a)}</td><td>${esc(r.b)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>`;
}

function renderProsCons(label, items, variant) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return `<div class="list-group list-group-flush">
    <div class="list-group-item fw-bold text-${variant === 'pro' ? 'success' : 'danger'}">
      <i class="bi bi-${variant === 'pro' ? 'check-circle-fill' : 'x-circle-fill'} me-2"></i>${esc(label)}
    </div>
    ${items.map(x => `<div class="list-group-item small">${esc(x)}</div>`).join('')}
  </div>`;
}

function renderItemCard(name, summary, pros, cons, isHebrew) {
  const t = (en, he) => isHebrew ? he : en;
  return `<div class="col-md-6">
    <div class="card shadow-sm h-100">
      <div class="card-body">
        <h3 class="h4 card-title">${esc(name)}</h3>
        ${summary ? `<p class="text-muted">${esc(summary)}</p>` : ''}
        ${renderProsCons(t('Pros', 'יתרונות'), pros, 'pro')}
        <div class="mt-2"></div>
        ${renderProsCons(t('Cons', 'חסרונות'), cons, 'con')}
      </div>
    </div>
  </div>`;
}

function renderFaqBlock(faqs, isHebrew) {
  if (!Array.isArray(faqs) || faqs.length === 0) return { html: '', jsonLd: null };
  const valid = faqs.filter(f => f && f.question && f.answer).slice(0, 20);
  if (!valid.length) return { html: '', jsonLd: null };
  const t = (en, he) => isHebrew ? he : en;
  const html = `<section class="comparison-faq mt-5" aria-label="${t('Frequently Asked Questions', 'שאלות נפוצות')}">
    <h2 class="section-title">${t('Frequently Asked Questions', 'שאלות נפוצות')}</h2>
    <div class="accordion" id="cmpFaq">
      ${valid.map((f, i) => `
        <div class="accordion-item">
          <h3 class="accordion-header">
            <button class="accordion-button ${i === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#cmpfaq-${i}" aria-expanded="${i === 0 ? 'true' : 'false'}">
              ${esc(f.question)}
            </button>
          </h3>
          <div id="cmpfaq-${i}" class="accordion-collapse collapse ${i === 0 ? 'show' : ''}" data-bs-parent="#cmpFaq">
            <div class="accordion-body">${esc(f.answer)}</div>
          </div>
        </div>`).join('')}
    </div>
  </section>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': valid.map(f => ({
      '@type': 'Question', 'name': f.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': f.answer },
    })),
  };
  return { html, jsonLd };
}

// ── Detail page builder ────────────────────────────────────────────────────────
function buildComparisonPage(doc, isHebrew, canonicalUrl, alternateUrl) {
  const lang = isHebrew ? 'he' : 'en';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const title = esc(doc.title || `${doc.itemA} vs ${doc.itemB}`);
  const desc = esc(doc.metaDescription || `${doc.itemA} vs ${doc.itemB} — side-by-side comparison, specs, pros & cons.`);
  const image = esc(doc.featuredImage || '');
  const t = (en, he) => isHebrew ? he : en;

  const hreflangLinks = `
    <link rel="alternate" hreflang="en" href="${esc(lang === 'en' ? canonicalUrl : alternateUrl || canonicalUrl)}" />
    <link rel="alternate" hreflang="he" href="${esc(lang === 'he' ? canonicalUrl : alternateUrl || canonicalUrl)}" />
    <link rel="alternate" hreflang="x-default" href="${esc(lang === 'en' ? canonicalUrl : alternateUrl || canonicalUrl)}" />`;

  const { html: faqHtml, jsonLd: faqLd } = renderFaqBlock(doc.faqs, isHebrew);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': doc.title,
    'description': doc.metaDescription,
    'image': image ? [image] : undefined,
    'inLanguage': lang,
    'mainEntityOfPage': canonicalUrl,
    'author': { '@type': 'Organization', 'name': 'TrendingTech Daily' },
    'publisher': {
      '@type': 'Organization',
      'name': 'TrendingTech Daily',
      'logo': { '@type': 'ImageObject', 'url': `${BASE_URL}/images/logo.png` },
    },
    'datePublished': doc.createdAt && doc.createdAt.toDate ? doc.createdAt.toDate().toISOString() : new Date().toISOString(),
    'dateModified': doc.updatedAt && doc.updatedAt.toDate ? doc.updatedAt.toDate().toISOString() : new Date().toISOString(),
  };

  const heroImg = image ? `<img src="${image}" alt="${esc(doc.imageAltText || title)}" class="img-fluid rounded mb-3" style="max-height:420px;width:100%;object-fit:cover;">` : '';

  const HEAD_ASSETS = isHebrew ? HE_HEAD_ASSETS : EN_HEAD_ASSETS;
  const SIDEBAR = isHebrew ? HE_SIDEBAR_HTML : EN_SIDEBAR_HTML;
  const FOOTER_BLOCK = isHebrew ? HE_FOOTER_HTML : `<div id="footer-placeholder"></div>${EN_FOOTER_SCRIPTS}`;

  const articleBody = `
    <nav aria-label="breadcrumb" class="mb-3">
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="${isHebrew ? '/he/' : '/'}">${t('Home', 'ראשי')}</a></li>
        <li class="breadcrumb-item"><a href="${isHebrew ? '/he/compare' : '/compare'}">${t('Comparisons', 'השוואות')}</a></li>
        <li class="breadcrumb-item active" aria-current="page">${esc(doc.itemA)} vs ${esc(doc.itemB)}</li>
      </ol>
    </nav>

    <article class="article-content comparison-article">
      <header class="mb-4">
        <h1 class="mb-3">${title}</h1>
        ${heroImg}
        <p class="lead">${esc(doc.introduction)}</p>
      </header>

      <div class="row g-4 mb-4">
        ${renderItemCard(doc.itemA, doc.itemASummary, doc.prosA, doc.consA, isHebrew)}
        ${renderItemCard(doc.itemB, doc.itemBSummary, doc.prosB, doc.consB, isHebrew)}
      </div>

      ${renderSpecTable(doc.specRows, doc.itemA, doc.itemB, isHebrew)}

      <section class="comparison-verdict mt-5">
        <h2 class="section-title">${t('The Verdict', 'השורה התחתונה')}</h2>
        <div class="alert alert-primary"><p class="mb-0 fs-5">${esc(doc.verdict)}</p></div>
      </section>

      ${faqHtml}
    </article>

    <div class="mt-4 mb-5">
      <a href="${isHebrew ? '/he/compare' : '/compare'}" class="btn btn-outline-primary">
        <i class="bi bi-${isHebrew ? 'arrow-right' : 'arrow-left'} me-1"></i>${t('Back to all comparisons', 'חזרה לכל ההשוואות')}
      </a>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} | TrendingTech Daily</title>
<meta name="description" content="${desc}"/>
<link rel="canonical" href="${esc(canonicalUrl)}"/>
${hreflangLinks}
<meta property="og:type" content="article"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${desc}"/>
<meta property="og:url" content="${esc(canonicalUrl)}"/>
<meta property="og:site_name" content="TrendingTech Daily"/>
${image ? `<meta property="og:image" content="${image}"/>` : ''}
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${desc}"/>
${image ? `<meta name="twitter:image" content="${image}"/>` : ''}
${HEAD_ASSETS}
<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
${faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : ''}
<style>
  .comparison-article .section-title { font-weight: 700; margin-top: 1.5rem; }
  .comparison-article .table thead th { background: rgba(99,102,241,0.12); }
</style>
</head>
<body>
${GTM_NOSCRIPT}
<div id="navbar-placeholder"></div>
<main class="container mt-4 mb-5">
  <div class="row">
    <div class="col-lg-8">
      ${articleBody}
    </div>
    ${SIDEBAR}
  </div>
</main>
${FOOTER_BLOCK}
</body></html>`;
}

// ── Index page builder ────────────────────────────────────────────────────────
function buildIndexPage(docs, isHebrew, canonicalUrl) {
  const lang = isHebrew ? 'he' : 'en';
  const dir = isHebrew ? 'rtl' : 'ltr';
  const t = (en, he) => isHebrew ? he : en;
  const title = t('Tech Comparisons — TrendingTech Daily', 'השוואות טכנולוגיה — TrendingTech Daily');
  const desc = t('Side-by-side comparisons of the latest phones, AI models, laptops and tech products.', 'השוואות בין מוצרי הטכנולוגיה הכי חמים: סמארטפונים, מודלי בינה מלאכותית, מחשבים ועוד.');

  const altBase = isHebrew ? `${BASE_URL}/compare` : `${BASE_URL}/he/compare`;
  const hreflangLinks = `
    <link rel="alternate" hreflang="en" href="${esc(isHebrew ? altBase : canonicalUrl)}" />
    <link rel="alternate" hreflang="he" href="${esc(isHebrew ? canonicalUrl : altBase)}" />
    <link rel="alternate" hreflang="x-default" href="${esc(isHebrew ? altBase : canonicalUrl)}" />`;

  const cards = docs.map(d => {
    const href = isHebrew ? `/he/compare/${d.slug}` : `/compare/${d.slug}`;
    return `<div class="col-md-6 col-lg-4 mb-4">
      <a href="${href}" class="card h-100 text-decoration-none text-reset shadow-sm">
        ${d.featuredImage ? `<img src="${esc(d.featuredImage)}" class="card-img-top" alt="${esc(d.imageAltText || d.title)}" style="aspect-ratio:16/9;object-fit:cover;" loading="lazy">` : ''}
        <div class="card-body">
          <h3 class="h5 card-title">${esc(d.title || `${d.itemA} vs ${d.itemB}`)}</h3>
          <p class="small text-muted mb-0">${esc((d.metaDescription || '').slice(0, 140))}</p>
        </div>
      </a></div>`;
  }).join('');

  const collectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'inLanguage': lang,
    'name': title,
    'description': desc,
    'url': canonicalUrl,
  };

  const HEAD_ASSETS = isHebrew ? HE_HEAD_ASSETS : EN_HEAD_ASSETS;
  const SIDEBAR = isHebrew ? HE_SIDEBAR_HTML : EN_SIDEBAR_HTML;
  const FOOTER_BLOCK = isHebrew ? HE_FOOTER_HTML : `<div id="footer-placeholder"></div>${EN_FOOTER_SCRIPTS}`;

  const body = `
    <nav aria-label="breadcrumb" class="mb-3">
      <ol class="breadcrumb">
        <li class="breadcrumb-item"><a href="${isHebrew ? '/he/' : '/'}">${t('Home', 'ראשי')}</a></li>
        <li class="breadcrumb-item active" aria-current="page">${t('Comparisons', 'השוואות')}</li>
      </ol>
    </nav>
    <header class="mb-4">
      <h1 class="mb-3">${esc(title)}</h1>
      <p class="lead">${esc(desc)}</p>
    </header>
    ${docs.length === 0 ? `<p class="text-muted">${t('No comparisons yet — check back soon.', 'עוד אין השוואות זמינות — חזרו בקרוב.')}</p>` : `<div class="row">${cards}</div>`}
  `;

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<link rel="canonical" href="${esc(canonicalUrl)}"/>
${hreflangLinks}
<meta property="og:type" content="website"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${esc(canonicalUrl)}"/>
${HEAD_ASSETS}
<script type="application/ld+json">${JSON.stringify(collectionSchema)}</script>
</head>
<body>
${GTM_NOSCRIPT}
<div id="navbar-placeholder"></div>
<main class="container mt-4 mb-5">
  <div class="row">
    <div class="col-lg-8">${body}</div>
    ${SIDEBAR}
  </div>
</main>
${FOOTER_BLOCK}
</body></html>`;
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────
async function handleComparison(req, res) {
  try {
    const path = (req.path || req.url || '').split('?')[0];
    const parts = path.replace(/^\/+|\/+$/g, '').split('/');
    const slug = parts[1] || '';
    const collName = 'comparisons';
    const heCollName = 'he_comparisons';

    if (!slug) {
      const snap = await db.collection(collName)
        .where('published', '==', true).orderBy('createdAt', 'desc').limit(60).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(buildIndexPage(docs, false, `${BASE_URL}/compare`));
    }

    if (!isValidSlug(slug)) return res.status(404).send('Not found');

    const snap = await db.collection(collName).where('slug', '==', slug).limit(1).get();
    if (snap.empty) return res.status(404).send('Comparison not found');
    const doc = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (doc.published === false) return res.status(404).send('Comparison unavailable');

    let alternateUrl = null;
    try {
      const heSnap = await db.collection(heCollName).where('slug', '==', slug).limit(1).get();
      if (!heSnap.empty && heSnap.docs[0].data().published !== false) {
        alternateUrl = `${BASE_URL}/he/compare/${slug}`;
      }
    } catch (_e) { /* ignore */ }

    const canonicalUrl = `${BASE_URL}/compare/${slug}`;
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(buildComparisonPage(doc, false, canonicalUrl, alternateUrl));
  } catch (e) {
    logger.error('handleComparison error', e);
    return res.status(500).send('Internal error');
  }
}

async function handleHeComparison(req, res) {
  try {
    const path = (req.path || req.url || '').split('?')[0];
    const parts = path.replace(/^\/+|\/+$/g, '').split('/');
    const slug = parts[2] || '';
    const collName = 'he_comparisons';
    const enCollName = 'comparisons';

    if (!slug) {
      const snap = await db.collection(collName)
        .where('published', '==', true).orderBy('createdAt', 'desc').limit(60).get();
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
      return res.status(200).send(buildIndexPage(docs, true, `${BASE_URL}/he/compare`));
    }

    if (!isValidSlug(slug)) return res.status(404).send('Not found');

    const snap = await db.collection(collName).where('slug', '==', slug).limit(1).get();
    if (snap.empty) return res.status(404).send('Comparison not found');
    const doc = { id: snap.docs[0].id, ...snap.docs[0].data() };
    if (doc.published === false) return res.status(404).send('Comparison unavailable');

    let alternateUrl = null;
    try {
      const enSnap = await db.collection(enCollName).where('slug', '==', slug).limit(1).get();
      if (!enSnap.empty && enSnap.docs[0].data().published !== false) {
        alternateUrl = `${BASE_URL}/compare/${slug}`;
      }
    } catch (_e) { /* ignore */ }

    const canonicalUrl = `${BASE_URL}/he/compare/${slug}`;
    res.set('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).send(buildComparisonPage(doc, true, canonicalUrl, alternateUrl));
  } catch (e) {
    logger.error('handleHeComparison error', e);
    return res.status(500).send('Internal error');
  }
}

module.exports = { handleComparison, handleHeComparison };
