// functions/http/routing.js
// Full Server-Side Rendering for English article and category pages.
// Serves complete HTML with meta tags, canonical URLs and JSON-LD schema
// at the canonical URL — no JS redirects — so Googlebot can index them.

const { logger } = require('../config');

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isValidSlug(slug) {
  if (!slug) return false;
  return /^[a-z0-9-]+$/i.test(slug) &&
    slug.length <= 100 &&
    slug.length >= 2 &&
    !slug.startsWith('-') &&
    !slug.endsWith('-');
}

// ── Shared assets injected in every <head> ────────────────────────────────────
const HEAD_ASSETS = `
  <!-- Google Tag Manager -->
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-M68CNVMQ');</script>

  <!-- Firebase -->
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-storage-compat.js"></script>

  <!-- Styles -->
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Source+Serif+Pro:wght@400;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/css/ai-agent.css">
  <link rel="stylesheet" href="/css/article-code.css">
  <link rel="stylesheet" href="/css/cookie-consent.css">
  <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">

  <!-- AdSense -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8142734137865758" crossorigin="anonymous"></script>`;

const FOOTER_SCRIPTS = `
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/js/app-base.js?v=2"></script>
  <script src="/js/category-helper.js"></script>
  <script src="/js/ai-agent.js" defer></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/prism.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
  <script src="/js/article-page.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/nav-loader.js"></script>
  <script src="/js/cookie-consent.js" defer></script>`;

const GTM_NOSCRIPT = `
  <!-- Google Tag Manager (noscript) -->
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M68CNVMQ"
  height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`;

// ── Article SSR page builder ───────────────────────────────────────────────────
function renderRelatedCardEn(rel, categorySlug) {
  const href = '/' + (rel.categorySlug || categorySlug || 'tech') + '/' + (rel.slug || '');
  const img = esc(rel.featuredImage || '');
  const title = esc(rel.title || '');
  const excerpt = esc(rel.excerpt || stripHtml(rel.content || '').slice(0, 120));
  return `<div class="col-md-6 col-lg-4">
    <a href="${href}" class="related-article-card text-decoration-none text-reset d-block h-100">
      ${img ? `<img src="${img}" alt="${title}" class="img-fluid rounded mb-2" loading="lazy" style="aspect-ratio:16/9;object-fit:cover;width:100%;">` : ''}
      <h5 class="h6 mt-2">${title}</h5>
      <p class="small text-muted mb-0">${excerpt}</p>
    </a>
  </div>`;
}

function buildFaqBlock(faqs) {
  if (!Array.isArray(faqs) || faqs.length === 0) return { html: '', jsonLd: null };
  const validFaqs = faqs
    .filter(f => f && f.question && f.answer)
    .slice(0, 20);
  if (validFaqs.length === 0) return { html: '', jsonLd: null };
  const html = `<section class="article-faq mt-5" aria-label="Frequently Asked Questions">
    <h2 class="section-title">Frequently Asked Questions</h2>
    <div class="accordion" id="articleFaq">
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

function buildArticlePage(article, articleId, categorySlug, catName, canonicalUrl, heAlternateUrl, relatedArticles = [], sectionSlugMap = {}) {
  const title     = esc(article.title || '');
  const excerpt   = esc(article.excerpt || stripHtml(article.content || '').slice(0, 160));
  const image     = esc(article.featuredImage || '');
  const author    = esc(article.author || 'TrendingTech Daily');
  const ogImage   = image ? `<meta property="og:image" content="${image}"/>` : '';
  const twitterImage = image ? `<meta name="twitter:image" content="${image}"/>` : '';

  // ISO date for schema
  const publishedAt = article.publishedAt
    ? (article.publishedAt.toDate ? article.publishedAt.toDate().toISOString() : new Date(article.publishedAt).toISOString())
    : new Date().toISOString();

  // JSON-LD NewsArticle schema — required for Google News
  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    'headline': article.title || '',
    'description': article.excerpt || stripHtml(article.content || '').slice(0, 160),
    'image': article.featuredImage ? [article.featuredImage] : [],
    'author': { '@type': 'Organization', 'name': author },
    'publisher': {
      '@type': 'Organization',
      'name': 'TrendingTech Daily',
      'logo': { '@type': 'ImageObject', 'url': 'https://www.trendingtechdaily.com/favicon.png' }
    },
    'datePublished': publishedAt,
    'dateModified': publishedAt,
    'mainEntityOfPage': { '@type': 'WebPage', '@id': canonicalUrl },
    'url': canonicalUrl,
    'articleSection': catName || categorySlug,
    'inLanguage': 'en-US'
  });

  // Pass routing info to client JS via a global variable so article-page.js
  // can load the article without an extra Firestore lookup.
  const serverInjected = JSON.stringify({
    sectionSlug: categorySlug,
    articleSlug: article.slug || ''
  });

  // Server-side related articles — real internal links Googlebot sees immediately
  const relatedHtml = relatedArticles.length > 0
    ? `<section class="related-articles mt-5" id="related-articles-container">
        <h2 class="section-title">Related Articles</h2>
        <div class="row g-3" id="related-articles-list">
          ${relatedArticles.map(r => renderRelatedCardEn(r, sectionSlugMap[r.category] || categorySlug)).join('')}
        </div>
      </section>`
    : '';

  // Optional FAQ block + FAQPage schema
  const { html: faqHtml, jsonLd: faqLd } = buildFaqBlock(article.faqs);
  const faqSchema = faqLd ? `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | TrendingTech Daily</title>
  <meta name="description" content="${excerpt}">
  <link rel="canonical" href="${esc(canonicalUrl)}">

  <!-- hreflang alternates -->
  <link rel="alternate" hreflang="en" href="${esc(canonicalUrl)}">
  ${heAlternateUrl ? `<link rel="alternate" hreflang="he" href="${esc(heAlternateUrl)}">` : ''}
  <link rel="alternate" hreflang="x-default" href="${esc(canonicalUrl)}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${excerpt}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:site_name" content="TrendingTech Daily">
  ${ogImage}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${excerpt}">
  ${twitterImage}

  <!-- JSON-LD structured data for Google News -->
  <script type="application/ld+json">${schema}</script>
  ${faqSchema}

  ${HEAD_ASSETS}

  <!-- Pass article routing to client JS -->
  <script>window.__SERVER_INJECTED_ARTICLE_INFO__ = ${serverInjected};</script>
</head>
<body>
  ${GTM_NOSCRIPT}

  <!-- Navbar Placeholder -->
  <div id="navbar-placeholder"></div>

  <!-- Main Content -->
  <div class="container mt-4 mb-5">
    <div class="row">
      <!-- Article Column -->
      <div class="col-lg-8">
        <!-- Breadcrumb -->
        <nav aria-label="breadcrumb" class="mb-3">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="/">Home</a></li>
            ${catName ? `<li class="breadcrumb-item"><a href="/${esc(categorySlug)}">${esc(catName)}</a></li>` : ''}
            <li class="breadcrumb-item active">${title}</li>
          </ol>
        </nav>

        <!-- Article Container — populated by article-page.js -->
        <div id="article-container">
          <div class="spinner-container text-center py-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="text-muted mt-2">Loading article...</p>
          </div>
        </div>

        ${faqHtml}

        <!-- Related Articles (server-rendered for SEO) -->
        ${relatedHtml}

        <!-- Compare tech section link -->
        <section class="compare-cta my-5 p-4 rounded" style="background:linear-gradient(135deg,#6366f1 0%,#4338ca 100%);color:#fff;">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-3">
            <div>
              <h3 class="h4 mb-1"><i class="bi bi-columns-gap me-2"></i>Compare the latest tech head-to-head</h3>
              <p class="mb-0 opacity-75">Side-by-side comparisons of phones, AI models, laptops and more.</p>
            </div>
            <a href="/compare" class="btn btn-light btn-lg">Browse comparisons →</a>
          </div>
        </section>

        <!-- Advertisement -->
        <div class="ad-container my-4 text-center">
          <hr>
          <p class="text-muted small mb-2">Advertisement</p>
          <iframe src="https://www.fiverr.com/gig_widgets?id=U2FsdGVkX19Swkh+R4Km+WCOEHylAuvdb5hVh/hagr09NnGaLFnuFZFgo+VxZxgp+V7tsbus+6Qy9BTItznEyUzdaC211ywZboShwUMuZPoxmTBHjqj0+tmw79+OnPph+yE0rhMZgmDLJQFI4omAS4yBfTPa/htI8ZUD0lfviR1tIlZ5NnSu8TuEp00dg0cjveQgIbCgp+xijyNL1Ae8PHaMAeqBtB7yB8DG8NySd1zg63gPrw34oOaJf2fyY7vDZZm3nKtg8boiY/5eW0lzON5IuJ/YFhXOjpiPP9I+Mc+nlFLXETULNOgqvjAtL32jp8oKdfBrE/pLCj5J+iiKyf+kNf9ekO+IMm0T6LgFra1nr9Wzs3JSRGbunzuLD59cLjHFV1VcpGwrrJTigauNVhCilZKCZb9YYc8G/seAXMxatBUg2VVNWZ2vljS2nHmBwUD6uRZ91AgQ9aOLMPoNwg==&affiliate_id=1123441&strip_google_tagmanager=true" loading="lazy" data-with-title="true" class="fiverr_nga_frame" frameborder="0" height="500" width="100%" referrerpolicy="no-referrer-when-downgrade" data-mode="random_gigs" onload=" var frame = this; var script = document.createElement('script'); script.addEventListener('load', function()  { window.FW_SDK.register(frame); }); script.setAttribute('src', 'https://www.fiverr.com/gig_widgets/sdk'); document.body.appendChild(script); "></iframe>
          <hr class="mt-4">
        </div>
      </div>

      <!-- Sidebar -->
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
        <div class="ad-container text-center">
          <p class="text-muted mb-1 small">Advertisement</p>
          <div class="bg-light d-flex align-items-center justify-content-center" style="height:250px;width:100%;"><div></div></div>
        </div>
      </aside>
    </div>
  </div>

  <!-- Footer -->
  <div id="footer-placeholder"></div>

  ${FOOTER_SCRIPTS}

  <!-- AI Agent -->
  <div class="ai-agent-container" id="aiAgentContainer">
    <button class="ai-agent-button" id="aiAgentButton" aria-label="AI Tech News Assistant">
      <div class="ai-agent-pulse"></div>
      <svg class="ai-agent-icon" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    </button>
    <div class="ai-agent-chat" id="aiAgentChat">
      <div class="ai-chat-header">
        <h3><span class="ai-status-indicator"></span>AI Tech News Agent</h3>
        <button class="ai-chat-close" id="aiChatClose" aria-label="Close chat">
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="ai-chat-content">
        <div class="ai-chat-messages" id="aiChatMessages">
          <div class="ai-message bot">
            <div class="ai-message-bubble">Hello! I'm your AI assistant for TrendingTech Daily. I can help you find articles, explain tech concepts, or discuss the latest tech news. How can I assist you today?</div>
          </div>
        </div>
      </div>
      <div class="ai-chat-input">
        <div class="ai-quick-actions">
          <button class="ai-quick-action" data-action="What's trending today?">What's trending?</button>
          <button class="ai-quick-action" data-action="Explain this article">Explain article</button>
          <button class="ai-quick-action" data-action="Find AI news">AI news</button>
        </div>
        <form class="ai-input-form" id="aiInputForm">
          <input type="text" class="ai-input-field" id="aiInputField" placeholder="Ask me anything..." autocomplete="off">
          <button type="submit" class="ai-send-button" id="aiSendButton" disabled>
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </form>
      </div>
    </div>
    <div class="ai-agent-banner-pointer" id="aiAgentBannerPointer">
      <div class="ai-agent-banner">
        <button class="dismiss-btn" id="aiAgentBannerDismiss" aria-label="Dismiss banner"><i class="bi bi-x"></i></button>
        <div class="banner-content">
          <div class="banner-title"><h2>Summarize the article</h2></div>
          <p class="subtitle">With our advanced AI assistant</p>
        </div>
        <div class="banner-arrow-container"><div class="banner-arrow"></div></div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ── Category SSR page builder ─────────────────────────────────────────────────
function buildCategoryPage(categorySlug, catName, catDescription, canonicalUrl) {
  const title = esc(catName || categorySlug);
  const desc  = esc(catDescription || `Latest ${catName || categorySlug} news and articles - TrendingTech Daily`);

  const schema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    'name': catName || categorySlug,
    'description': catDescription || `Latest ${catName || categorySlug} news`,
    'url': canonicalUrl,
    'publisher': {
      '@type': 'Organization',
      'name': 'TrendingTech Daily',
      'url': 'https://www.trendingtechdaily.com'
    }
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | TrendingTech Daily</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <link rel="alternate" hreflang="en" href="${esc(canonicalUrl)}">
  <link rel="alternate" hreflang="x-default" href="${esc(canonicalUrl)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title} | TrendingTech Daily">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:site_name" content="TrendingTech Daily">
  <script type="application/ld+json">${schema}</script>
  ${HEAD_ASSETS}
  <script>sessionStorage.setItem('categoryRouting', '${categorySlug}');</script>
</head>
<body>
  ${GTM_NOSCRIPT}
  <div id="navbar-placeholder"></div>
  <div class="container mt-4 mb-5">
    <div class="row">
      <div class="col-lg-8">
        <nav aria-label="breadcrumb" class="mb-3">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="/">Home</a></li>
            <li class="breadcrumb-item active">${title}</li>
          </ol>
        </nav>
        <h1 id="category-title" class="section-title mb-1">${title}</h1>
        <p id="category-description" class="text-muted mb-4"></p>
        <div id="articles-container">
          <div class="spinner-container text-center py-5">
            <div class="spinner-border text-primary" role="status">
              <span class="visually-hidden">Loading...</span>
            </div>
            <p class="text-muted mt-2">Loading articles...</p>
          </div>
        </div>
      </div>
      <aside class="col-lg-4">
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
      </aside>
    </div>
  </div>
  <div id="footer-placeholder"></div>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
  <script src="/js/app-base.js?v=2"></script>
  <script src="/js/category-helper.js"></script>
  <script src="/js/category.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/nav-loader.js"></script>
  <script src="/js/cookie-consent.js" defer></script>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
exports.handleArticleRouting = async (req, res) => {
  try {
    const pathSegments = req.path.split('/').filter(Boolean);
    logger.info('handleArticleRouting: path =', req.path, 'segments =', pathSegments);

    const { db } = require('../config');

    // ── /category/article-slug ────────────────────────────────────────────────
    if (pathSegments.length === 2) {
      const [categorySlug, articleSlug] = pathSegments;

      if (!isValidSlug(categorySlug) || !isValidSlug(articleSlug)) {
        return res.status(404).send('Page not found');
      }

      const canonicalUrl = `https://www.trendingtechdaily.com/${categorySlug}/${articleSlug}`;

      // Fetch article and category in parallel
      const [articleSnap, catSnap] = await Promise.all([
        db.collection('articles')
          .where('slug', '==', articleSlug)
          .where('published', '==', true)
          .limit(1)
          .get(),
        db.collection('sections')
          .where('slug', '==', categorySlug)
          .where('active', '==', true)
          .limit(1)
          .get(),
      ]);

      if (articleSnap.empty) {
        logger.warn('handleArticleRouting: article not found', articleSlug);
        return res.status(404).send('Page not found');
      }

      const articleDoc = articleSnap.docs[0];
      const article    = articleDoc.data();
      const catName    = catSnap.empty ? '' : (catSnap.docs[0].data().name || '');

      // Look up a matching Hebrew translation for hreflang alternate
      let heAlternateUrl = '';
      try {
        const heSnap = await db.collection('he_articles')
          .where('sourceArticleId', '==', articleDoc.id)
          .where('published', '==', true)
          .limit(1).get();
        let heDoc = heSnap.empty ? null : heSnap.docs[0];
        if (!heDoc) {
          const heSnap2 = await db.collection('he_articles')
            .where('sourceSlug', '==', articleSlug)
            .where('published', '==', true)
            .limit(1).get();
          heDoc = heSnap2.empty ? null : heSnap2.docs[0];
        }
        if (heDoc) {
          const he = heDoc.data();
          if (he.slug && he.category) {
            const heCatSnap = await db.collection('he_sections').doc(he.category).get();
            const heCatSlug = heCatSnap.exists ? (heCatSnap.data().slug || he.category.toLowerCase()) : he.category.toLowerCase();
            heAlternateUrl = `https://www.trendingtechdaily.com/he/${heCatSlug}/${he.slug}`;
          }
        }
      } catch (e) { logger.warn('hreflang lookup failed', e.message); }

      // Fetch related articles (same category, exclude current) — server-rendered for SEO
      let relatedArticles = [];
      let sectionSlugMap = {};
      try {
        if (article.category) {
          const relSnap = await db.collection('articles')
            .where('category', '==', article.category)
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(8).get();
          relatedArticles = relSnap.docs
            .filter(d => d.id !== articleDoc.id)
            .slice(0, 6)
            .map(d => ({ id: d.id, ...d.data() }));
          sectionSlugMap[article.category] = categorySlug;
        }
      } catch (e) { logger.warn('related articles lookup failed', e.message); }

      logger.info('handleArticleRouting: serving SSR article', { categorySlug, articleSlug });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).send(
        buildArticlePage(article, articleDoc.id, categorySlug, catName, canonicalUrl, heAlternateUrl, relatedArticles, sectionSlugMap)
      );
    }

    // ── /category ─────────────────────────────────────────────────────────────
    if (pathSegments.length === 1) {
      const categorySlug = pathSegments[0];

      if (!isValidSlug(categorySlug)) {
        return res.status(404).send('Page not found');
      }

      // Try active sections first; fall back to any section with that slug
      // (avoids 404 when 'active' field is missing or uses a different value)
      let catSnap = await db.collection('sections')
        .where('slug', '==', categorySlug)
        .where('active', '==', true)
        .limit(1)
        .get();

      if (catSnap.empty) {
        catSnap = await db.collection('sections')
          .where('slug', '==', categorySlug)
          .limit(1)
          .get();
      }

      if (catSnap.empty) {
        // Serve a generic category shell so client-side JS can still try to load articles
        logger.info('handleArticleRouting: no section found for slug, serving shell', categorySlug);
        const canonicalUrl = `https://www.trendingtechdaily.com/${categorySlug}`;
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'no-cache');
        return res.status(200).send(
          buildCategoryPage(categorySlug, categorySlug, '', canonicalUrl)
        );
      }

      const section = catSnap.docs[0].data();
      const canonicalUrl = `https://www.trendingtechdaily.com/${categorySlug}`;

      logger.info('handleArticleRouting: serving SSR category', { categorySlug });
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      return res.status(200).send(
        buildCategoryPage(categorySlug, section.name || '', section.description || '', canonicalUrl)
      );
    }

    logger.info('handleArticleRouting: unmatched path', req.path);
    return res.status(404).send('Page not found');

  } catch (error) {
    logger.error('handleArticleRouting error:', error);
    return res.status(500).send('Server error');
  }
};

/**
 * Handles legacy redirects from old URL structure to new
 */
exports.handleLegacyRedirects = async (req, res, next) => {
  try {
    const urlPath = req.path;
    const { db } = require('../config');

    logger.info(`Processing potential legacy redirect for path: ${urlPath}`);

    if (urlPath === '/article.html' && req.query.slug) {
      const slug = req.query.slug;
      const articleSnapshot = await db.collection('articles')
        .where('slug', '==', slug)
        .where('published', '==', true)
        .limit(1)
        .get();

      if (!articleSnapshot.empty) {
        const article = articleSnapshot.docs[0].data();
        const categoryDoc = await db.collection('sections').doc(article.category).get();
        if (categoryDoc.exists) {
          const categorySlug = categoryDoc.data().slug || article.category.toLowerCase();
          return res.redirect(301, `/${categorySlug}/${slug}`);
        }
        return res.redirect(301, `/${article.category.toLowerCase()}/${slug}`);
      }
      return next();
    }

    if (urlPath === '/article.html' && req.query.id) {
      const articleId = req.query.id;
      const articleDoc = await db.collection('articles').doc(articleId).get();
      if (articleDoc.exists && articleDoc.data().published) {
        const article = articleDoc.data();
        const categoryDoc = await db.collection('sections').doc(article.category).get();
        if (categoryDoc.exists) {
          const categorySlug = categoryDoc.data().slug || article.category.toLowerCase();
          const articleSlug  = article.slug || articleId;
          return res.redirect(301, `/${categorySlug}/${articleSlug}`);
        }
      }
      return next();
    }

    const legacyUrls = {
      '/about.html':   '/about',
      '/contact.html': '/contact',
      '/privacy.html': '/privacy',
      '/terms.html':   '/terms',
    };
    const newUrl = legacyUrls[urlPath];
    if (newUrl) return res.redirect(301, newUrl);

    next();
  } catch (error) {
    logger.error('handleLegacyRedirects error:', error);
    next();
  }
};

/**
 * Handle dynamic routing for single-segment paths (categories)
 */
exports.handleDynamicRouting = async (req, res) => {
  try {
    const urlPath = req.path.substring(1);
    logger.info('handleDynamicRouting: path =', urlPath);

    if (urlPath.includes('/')) return res.status(404).send('Page not found');
    if (!isValidSlug(urlPath))  return res.status(404).send('Page not found');

    const { db } = require('../config');
    const catSnap = await db.collection('sections')
      .where('slug', '==', urlPath)
      .where('active', '==', true)
      .limit(1)
      .get();

    if (catSnap.empty) return res.status(404).send('Page not found');

    const section = catSnap.docs[0].data();
    const canonicalUrl = `https://www.trendingtechdaily.com/${urlPath}`;

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    return res.status(200).send(
      buildCategoryPage(urlPath, section.name || '', section.description || '', canonicalUrl)
    );

  } catch (error) {
    logger.error('handleDynamicRouting error:', error);
    return res.status(500).send('Server error');
  }
};
