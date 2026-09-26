// functions/http/hebrew-routing.js
// Handles URL routing for the Hebrew site at /he/
// Serves full HTML directly at canonical URLs — no redirects — so Google can index them.

const { logger, db } = require('../config');

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const GTM_HEAD = `<!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-M68CNVMQ');</script>
  <!-- End Google Tag Manager -->`;

const GTM_BODY = `<!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M68CNVMQ"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <!-- End Google Tag Manager (noscript) -->`;

const HEAD_ASSETS = `
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

const FOOTER_HTML = `
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
            <li><a href="/he/podcasts">פודקאסטים</a></li>
            <li><a href="/he/about">אודות</a></li>
            <li><a href="/he/privacy">מדיניות פרטיות</a></li>
            <li><a href="/">גרסה אנגלית</a></li>
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
  <script src="/he/js/he-cookie-consent.js" defer></script>`;

const SIDEBAR_HTML = `
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
      </ul>
    </div>
    <div class="sidebar-section automation-banner mb-4">
      <a href="https://www.automationbymeir.com/" target="_blank" rel="noopener" style="text-decoration:none;color:inherit;display:block;">
        <h4 class="mb-2" style="color:#fff;">Automation by Meir</h4>
        <p class="small mb-0" style="color:#aaa;">שדרגו את העסק שלכם עם אוטומציה מותאמת אישית</p>
      </a>
    </div>
  </aside>`;

function renderRelatedCardHe(rel, fallbackCatSlug) {
  const href = '/he/' + (rel.categorySlug || fallbackCatSlug || 'technology') + '/' + (rel.slug || '');
  const img = esc(rel.featuredImage || '');
  const title = esc(rel.title || '');
  const excerpt = esc(rel.excerpt || '');
  return `<div class="col-md-6 col-lg-4">
    <a href="${href}" class="related-article-card text-decoration-none text-reset d-block h-100" style="color:inherit;">
      ${img ? `<img src="${img}" alt="${title}" class="img-fluid rounded mb-2" loading="lazy" style="aspect-ratio:16/9;object-fit:cover;width:100%;">` : ''}
      <h5 class="h6 mt-2">${title}</h5>
      <p class="small text-muted mb-0">${excerpt}</p>
    </a>
  </div>`;
}

function buildFaqBlockHe(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return { html: '', jsonLd: null };
  const validFaqs = faqs.filter(f => f && f.question && f.answer).slice(0, 20);
  if (validFaqs.length === 0) return { html: '', jsonLd: null };
  const html = `<section class="article-faq mt-5" aria-label="שאלות נפוצות">
    <h2 class="section-title">שאלות נפוצות</h2>
    <div class="accordion" id="articleFaq" dir="rtl">
      ${validFaqs.map((f, i) => `
        <div class="accordion-item">
          <h3 class="accordion-header">
            <button class="accordion-button ${i === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#faq-${i}" aria-expanded="${i === 0 ? 'true' : 'false'}">
              ${esc(f.question)}
            </button>
          </h3>
          <div id="faq-${i}" class="accordion-collapse collapse ${i === 0 ? 'show' : ''}" data-bs-parent="#articleFaq">
            <div class="accordion-body">${esc(f.answer)}</div>
          </div>
        </div>`).join('')}
    </div>
  </section>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': validFaqs.map(f => ({
      '@type': 'Question',
      'name': f.question,
      'acceptedAnswer': { '@type': 'Answer', 'text': f.answer }
    }))
  };
  return { html, jsonLd };
}

function buildArticlePage(article, categorySlug, catName, canonicalUrl, enAlternateUrl, relatedArticles = [], sectionSlugMap = {}) {
  const title = esc(article.title || '');
  const excerpt = esc(article.excerpt || '');
  const image = esc(article.featuredImage || '');
  const ogImage = image ? `<meta property="og:image" content="${image}"/>` : '';
  const publishedAt = article.publishedAt
    ? (article.publishedAt.toDate ? article.publishedAt.toDate().toISOString() : new Date(article.publishedAt).toISOString())
    : new Date().toISOString();
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'headline': article.title || '',
    'description': article.excerpt || '',
    'image': article.featuredImage ? [article.featuredImage] : [],
    'author': { '@type': 'Organization', 'name': 'TrendingTech Daily' },
    'publisher': {
      '@type': 'Organization',
      'name': 'TrendingTech Daily',
      'logo': { '@type': 'ImageObject', 'url': 'https://www.trendingtechdaily.com/img/logo.png' }
    },
    'datePublished': publishedAt,
    'dateModified': publishedAt,
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'url': canonicalUrl,
    'articleSection': catName || categorySlug,
    'inLanguage': 'he'
  });

  // FAQ block
  const { html: faqHtml, jsonLd: faqLd } = buildFaqBlockHe(article.faqs);
  const faqSchemaTag = faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : '';

  // Related articles block (server-rendered for SEO)
  const relatedHtml = relatedArticles.length > 0
    ? `<section class="related-articles mt-5">
        <h2 class="section-title">כתבות נוספות</h2>
        <div class="row g-3">
          ${relatedArticles.map(r => renderRelatedCardHe(r, sectionSlugMap[r.category] || categorySlug)).join('')}
        </div>
      </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="google-site-verification" content="AAJy5uWJtM-PEQ6kOZCAiIQuO3CijcFc6DYM7dNYEVY"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} | TrendingTech Daily</title>
  <meta name="description" content="${excerpt}"/>
  <link rel="canonical" href="${esc(canonicalUrl)}"/>
  <link rel="alternate" hreflang="he" href="${esc(canonicalUrl)}"/>
  ${enAlternateUrl ? `<link rel="alternate" hreflang="en" href="${esc(enAlternateUrl)}"/>` : ''}
  ${enAlternateUrl ? `<link rel="alternate" hreflang="x-default" href="${esc(enAlternateUrl)}"/>` : ''}
  <script type="application/ld+json">${jsonLd}</script>
  ${faqSchemaTag}
  <meta property="og:type" content="article"/>
  <meta property="og:title" content="${title}"/>
  <meta property="og:description" content="${excerpt}"/>
  <meta property="og:url" content="${esc(canonicalUrl)}"/>
  ${ogImage}
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${title}"/>
  <meta name="twitter:description" content="${excerpt}"/>
  ${HEAD_ASSETS}
</head>
<body>
  ${GTM_BODY}
  <div id="navbar-placeholder"></div>
  <main class="container my-5">
    <div id="article-loading" class="spinner-container text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">טוען...</span></div>
      <p>טוען כתבה...</p>
    </div>
    <div id="article-error" style="display:none;" class="alert alert-danger">
      <i class="bi bi-exclamation-triangle me-2"></i>
      <span id="article-error-message">לא ניתן לטעון את הכתבה.</span>
      <div class="mt-3"><a href="/he/" class="btn btn-primary btn-sm"><i class="bi bi-arrow-right me-1"></i>חזרה לעמוד הבית</a></div>
    </div>
    <div id="article-content-wrapper" style="display:none;">
      <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb">
          <li class="breadcrumb-item"><a href="/he/" style="color:#2196F3;">ראשי</a></li>
          <li class="breadcrumb-item" id="breadcrumb-category">${catName ? `<a href="/he/${esc(categorySlug)}" style="color:#2196F3;">${esc(catName)}</a>` : ''}</li>
          <li class="breadcrumb-item active" id="breadcrumb-title">${title}</li>
        </ol>
      </nav>
      <div class="row">
        <div class="col-lg-8">
          <article id="he-article-body"></article>
          ${faqHtml}
          ${relatedHtml}
          <section class="compare-cta my-5 p-4 rounded" style="background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%);color:#fff;" dir="rtl">
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
              <div>
                <h3 class="h4 mb-1"><i class="bi bi-columns-gap ms-2"></i>השוואות טכנולוגיה ראש בראש</h3>
                <p class="mb-0 opacity-75">השוואות מפורטות בין מכשירים, מודלי AI, מחשבים ועוד.</p>
              </div>
              <a href="/he/compare" class="btn btn-light btn-lg">לכל ההשוואות ←</a>
            </div>
          </section>
          <div class="mt-4 mb-5">
            <a href="/he/" class="btn btn-outline-primary"><i class="bi bi-arrow-right me-1"></i>חזרה לכל הכתבות</a>
          </div>
        </div>
        ${SIDEBAR_HTML}
      </div>
    </div>
  </main>
  ${FOOTER_HTML}
  <script src="/he/js/he-app.js" defer></script>
  <script src="/he/js/he-article.js" defer></script>
  <script src="/he/js/he-ai-agent.js" defer></script>
</body>
</html>`;
}

function buildCategoryPage(categorySlug, catName, catDescription, canonicalUrl) {
  const title = esc(catName || categorySlug);
  const desc = esc(catDescription || `כתבות ${catName || categorySlug} - TrendingTech Daily`);

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8"/>
  <meta name="google-site-verification" content="AAJy5uWJtM-PEQ6kOZCAiIQuO3CijcFc6DYM7dNYEVY"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} | TrendingTech Daily</title>
  <meta name="description" content="${desc}"/>
  <link rel="canonical" href="${esc(canonicalUrl)}"/>
  <link rel="alternate" hreflang="he" href="${esc(canonicalUrl)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:title" content="${title} | TrendingTech Daily"/>
  <meta property="og:description" content="${desc}"/>
  <meta property="og:url" content="${esc(canonicalUrl)}"/>
  ${HEAD_ASSETS}
</head>
<body>
  ${GTM_BODY}
  <div id="navbar-placeholder"></div>
  <main class="container my-5">
    <div id="category-loading" class="spinner-container text-center py-5">
      <div class="spinner-border" role="status"><span class="visually-hidden">טוען...</span></div>
      <p>טוען קטגוריה...</p>
    </div>
    <div id="category-error" style="display:none;" class="alert alert-danger">
      <i class="bi bi-exclamation-triangle me-2"></i>
      <span id="category-error-message">לא ניתן לטעון את הקטגוריה.</span>
      <div class="mt-3"><a href="/he/" class="btn btn-primary btn-sm"><i class="bi bi-arrow-right me-1"></i>חזרה לעמוד הבית</a></div>
    </div>
    <div id="category-content-wrapper" style="display:none;">
      <nav aria-label="breadcrumb" class="mb-4">
        <ol class="breadcrumb">
          <li class="breadcrumb-item"><a href="/he/" style="color:#2196F3;">ראשי</a></li>
          <li class="breadcrumb-item active" id="breadcrumb-category-name">${title}</li>
        </ol>
      </nav>
      <div class="row">
        <div class="col-lg-8">
          <h1 class="section-title" id="category-page-title">${title}</h1>
          <p id="category-page-description" class="text-muted mb-4">כל הכתבות בנושא ${title}</p>
          <div id="category-articles-container" class="article-grid"></div>
          <div id="category-no-articles" style="display:none;" class="alert alert-info mt-4">
            <i class="bi bi-info-circle me-2"></i>אין כתבות בקטגוריה זו עדיין.
          </div>
        </div>
        ${SIDEBAR_HTML}
      </div>
    </div>
  </main>
  ${FOOTER_HTML}
  <script src="/he/js/he-app.js" defer></script>
  <script src="/he/js/he-category.js" defer></script>
</body>
</html>`;
}

/**
 * Handles routing for the Hebrew site.
 * Serves full HTML directly at the canonical URL — no redirects.
 *   /he/:category/:article → fetch article from Firestore, serve article page HTML
 *   /he/:category          → fetch category from Firestore, serve category page HTML
 */
exports.handleHebrewRouting = async (req, res) => {
  try {
    const rawPath = req.path || '/';
    let decodedPath = rawPath;
    try { decodedPath = decodeURIComponent(rawPath); } catch (e) { /* leave as-is */ }
    const path = decodedPath.replace(/^\/he/, '') || '/';
    const pathSegments = path.split('/').filter(Boolean);

    logger.info('handleHebrewRouting: path =', rawPath, 'segments =', pathSegments);

    // ── Two-segment: /he/:category/:article ───────────────────────────────────
    if (pathSegments.length === 2) {
      const [categorySlug, articleSlug] = pathSegments;

      if (!articleSlug || articleSlug.includes('..') || articleSlug.includes('\0')) {
        return res.status(404).send('Page not found');
      }

      const canonicalUrl = `https://www.trendingtechdaily.com/he/${categorySlug}/${articleSlug}`;

      // Fetch article and category in parallel
      const [articleSnap, catSnap] = await Promise.all([
        db.collection('he_articles').where('slug', '==', articleSlug).limit(1).get(),
        db.collection('he_sections').where('slug', '==', categorySlug).limit(1).get(),
      ]);

      if (articleSnap.empty) {
        logger.warn('handleHebrewRouting: article not found', articleSlug);
        return res.status(404).send('Page not found');
      }

      const article = articleSnap.docs[0].data();
      const catName = catSnap.empty ? '' : (catSnap.docs[0].data().name || '');

      // Look up the English source article for hreflang alternate
      let enAlternateUrl = '';
      try {
        const srcId = article.sourceArticleId || article.enArticleId;
        const srcSlug = article.sourceSlug || article.enSlug;
        let enDoc = null;
        if (srcId) {
          const d = await db.collection('articles').doc(srcId).get();
          if (d.exists && d.data().published) enDoc = d;
        }
        if (!enDoc && srcSlug) {
          const s = await db.collection('articles')
            .where('slug', '==', srcSlug).where('published', '==', true).limit(1).get();
          if (!s.empty) enDoc = s.docs[0];
        }
        if (enDoc) {
          const en = enDoc.data();
          if (en.slug && en.category) {
            const enCatSnap = await db.collection('sections').doc(en.category).get();
            const enCatSlug = enCatSnap.exists ? (enCatSnap.data().slug || en.category.toLowerCase()) : en.category.toLowerCase();
            enAlternateUrl = `https://www.trendingtechdaily.com/${enCatSlug}/${en.slug}`;
          }
        }
      } catch (e) { logger.warn('hreflang lookup failed (he)', e.message); }

      // Server-side related articles for internal linking + SEO
      let relatedArticles = [];
      const sectionSlugMap = {};
      try {
        if (article.category) {
          const relSnap = await db.collection('he_articles')
            .where('category', '==', article.category)
            .orderBy('createdAt', 'desc')
            .limit(8).get();
          relatedArticles = relSnap.docs
            .filter(d => d.data().slug !== articleSlug)
            .slice(0, 6)
            .map(d => ({ id: d.id, ...d.data() }));
          sectionSlugMap[article.category] = categorySlug;
        }
      } catch (e) { logger.warn('he related articles lookup failed', e.message); }

      logger.info('handleHebrewRouting: serving article SSR', { categorySlug, articleSlug });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).send(buildArticlePage(article, categorySlug, catName, canonicalUrl, enAlternateUrl, relatedArticles, sectionSlugMap));
    }

    // ── One-segment: /he/:category ────────────────────────────────────────────
    if (pathSegments.length === 1) {
      const categorySlug = pathSegments[0];

      if (!categorySlug || categorySlug.includes('..') || categorySlug.includes('\0')) {
        return res.status(404).send('Page not found');
      }

      const canonicalUrl = `https://www.trendingtechdaily.com/he/${categorySlug}`;

      // Try active sections first; fall back to any section with that slug
      let snapshot = await db.collection('he_sections')
        .where('slug', '==', categorySlug)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (snapshot.empty) {
        snapshot = await db.collection('he_sections')
          .where('slug', '==', categorySlug)
          .limit(1)
          .get();
      }

      if (snapshot.empty) {
        // Serve a generic shell so client-side JS can still try to load
        logger.info(`handleHebrewRouting: no section found for slug "${categorySlug}", serving shell`);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        return res.status(200).send(buildCategoryPage(categorySlug, categorySlug, '', canonicalUrl));
      }

      const section = snapshot.docs[0].data();
      const catName = section.name || categorySlug;
      const catDescription = section.description || '';

      logger.info('handleHebrewRouting: serving category SSR', { categorySlug });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).send(buildCategoryPage(categorySlug, catName, catDescription, canonicalUrl));
    }

    logger.info('handleHebrewRouting: unmatched path', rawPath);
    return res.status(404).send('Page not found');
  } catch (err) {
    logger.error('handleHebrewRouting error:', err);
    return res.status(500).send('Server error');
  }
};
