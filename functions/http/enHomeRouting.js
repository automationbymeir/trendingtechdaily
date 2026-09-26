// functions/http/enHomeRouting.js
// Server-side renders the English homepage with pre-fetched articles + category sections + podcast sidebar.

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

// Deduplicate articles: remove same slug AND near-duplicate titles (≥3 shared keywords)
function deduplicateArticles(articles) {
  const seenSlugs = new Set();
  const seenKeywords = [];
  return articles.filter(article => {
    const slug = (article.slug || article.id || '').toLowerCase();
    if (slug && seenSlugs.has(slug)) return false;
    if (slug) seenSlugs.add(slug);

    const words = (article.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 4)
      .slice(0, 7);

    for (const seen of seenKeywords) {
      let shared = 0;
      for (const w of words) {
        if (seen.has(w) && ++shared >= 3) return false;
      }
    }
    seenKeywords.push(new Set(words));
    return true;
  });
}

function formatEnDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderFeaturedArticle(article, catName, catSlug) {
  const href = '/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatEnDate(article.createdAt);
  const readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' min read' : '';
  const title = esc(article.title || '');
  const excerpt = esc(article.excerpt || '');
  return '<div class="featured-article ' + (imgSrc ? '' : 'no-image') + '" data-id="' + esc(article.id) + '">' +
    '<div class="article-image-container ' + (imgSrc ? '' : 'no-image') + '">' +
    (imgSrc
      ? '<div class="category-badge" data-category="' + esc(catName) + '">' + esc(catName) + '</div>' +
        '<a href="' + href + '"><img src="' + imgSrc + '" alt="' + title + '" class="article-image" loading="eager"></a>'
      : '<div class="article-placeholder">No Image Available</div>') +
    '</div>' +
    '<div class="article-content">' +
    '<h2 class="article-title"><a href="' + href + '">' + title + '</a></h2>' +
    '<p class="article-description">' + excerpt + '</p>' +
    '<div class="article-meta">' +
    (dateStr ? '<span>' + dateStr + '</span>' : '') +
    (readTime ? '<span class="ms-auto text-muted small"><i class="bi bi-clock-history me-1"></i>' + readTime + '</span>' : '') +
    '</div></div></div>';
}

function renderArticleCard(article, catName, catSlug) {
  const href = '/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatEnDate(article.createdAt);
  const readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' min read' : '';
  const title = esc(article.title || '');
  const excerpt = esc(article.excerpt || '');
  return '<div class="article-card ' + (imgSrc ? '' : 'no-image') + '" data-id="' + esc(article.id) + '">' +
    '<div class="article-image-container ' + (imgSrc ? '' : 'no-image') + '">' +
    (imgSrc
      ? '<div class="category-badge" data-category="' + esc(catName) + '">' + esc(catName) + '</div>' +
        '<a href="' + href + '"><img src="' + imgSrc + '" alt="' + title + '" class="article-image" loading="lazy"></a>'
      : '<div class="article-placeholder">No Image Available</div>') +
    '</div>' +
    '<div class="article-content">' +
    '<h3 class="article-title"><a href="' + href + '">' + title + '</a></h3>' +
    '<p class="article-description">' + excerpt + '</p>' +
    '<div class="article-meta">' +
    (dateStr ? '<span class="text-muted small">' + dateStr + '</span>' : '') +
    (readTime ? '<span class="ms-auto text-muted small"><i class="bi bi-clock-history me-1"></i>' + readTime + '</span>' : '') +
    '</div></div></div>';
}

// Compact horizontal card for category sections
function renderCompactCard(article, catName, catSlug) {
  const href = '/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatEnDate(article.createdAt);
  const title = esc(article.title || '');
  return '<div class="d-flex gap-3 mb-3 pb-3 border-bottom border-secondary">' +
    (imgSrc
      ? '<a href="' + href + '" style="flex-shrink:0;"><img src="' + imgSrc + '" alt="' + title + '" style="width:90px;height:65px;object-fit:cover;border-radius:8px;" loading="lazy"></a>'
      : '<div style="flex-shrink:0;width:90px;height:65px;border-radius:8px;background:linear-gradient(135deg,#1a1a2e,#6366f1);"></div>') +
    '<div style="min-width:0;">' +
    '<a href="' + href + '" style="text-decoration:none;color:inherit;">' +
    '<p class="mb-1 fw-semibold" style="font-size:0.88rem;line-height:1.3;">' + title + '</p></a>' +
    '<div class="d-flex align-items-center gap-2">' +
    (catName ? '<span class="badge" style="font-size:0.65rem;background:rgba(99,102,241,0.25);color:#818cf8;">' + esc(catName) + '</span>' : '') +
    (dateStr ? '<small class="text-muted" style="font-size:0.72rem;">' + dateStr + '</small>' : '') +
    '</div></div></div>';
}

const EN_PODCASTS_SIDEBAR = [
  { name: 'Hard Fork', host: 'Roose & Newton', category: 'AI & Tech', letter: 'H', gradient: 'linear-gradient(135deg,#667eea,#764ba2)', spotifyQuery: 'Hard%20Fork%20NY%20Times' },
  { name: 'Lex Fridman Podcast', host: 'Lex Fridman', category: 'AI & Tech', letter: 'L', gradient: 'linear-gradient(135deg,#0f0c29,#302b63)', spotifyQuery: 'Lex%20Fridman%20Podcast' },
  { name: 'All-In Podcast', host: 'Chamath & Friends', category: 'Business', letter: 'A', gradient: 'linear-gradient(135deg,#11998e,#38ef7d)', spotifyQuery: 'All-In%20Podcast' },
  { name: 'Acquired', host: 'Gilbert & Rosenthal', category: 'Business', letter: 'A', gradient: 'linear-gradient(135deg,#f7971e,#ffd200)', spotifyQuery: 'Acquired%20podcast' },
  { name: 'Security Now', host: 'Steve Gibson', category: 'Security', letter: 'S', gradient: 'linear-gradient(135deg,#f43b47,#453a94)', spotifyQuery: 'Security%20Now%20podcast' },
];

function buildPodcastSidebarHtml() {
  let html = '<div class="sidebar-section mb-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.25rem;">' +
    '<div class="d-flex align-items-center justify-content-between mb-3">' +
    '<h5 class="mb-0" style="font-weight:700;font-size:1rem;"><i class="bi bi-headphones me-2" style="color:#6366f1;"></i>Recommended Podcasts</h5>' +
    '<a href="/podcasts" style="font-size:0.8rem;color:#6366f1;">All podcasts →</a>' +
    '</div>';
  EN_PODCASTS_SIDEBAR.forEach(p => {
    html += '<div class="d-flex align-items-center gap-2 mb-3">' +
      '<div style="flex-shrink:0;width:42px;height:42px;border-radius:10px;background:' + p.gradient + ';display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:1rem;">' + p.letter + '</div>' +
      '<div style="min-width:0;flex:1;">' +
      '<div style="font-size:0.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.name + '</div>' +
      '<div class="d-flex align-items-center justify-content-between">' +
      '<span style="font-size:0.72rem;color:#aaa;">' + p.category + '</span>' +
      '<a href="https://open.spotify.com/search/' + p.spotifyQuery + '" target="_blank" rel="noopener" style="font-size:0.72rem;color:#1DB954;text-decoration:none;"><i class="bi bi-spotify me-1"></i>Listen</a>' +
      '</div></div></div>';
  });
  html += '</div>';
  return html;
}

async function handleEnHomepage(req, res) {
  try {
    const [sectionsSnap, articlesSnap, comparisonsSnap] = await Promise.all([
      db.collection('sections').where('active', '==', true).orderBy('order').limit(10).get(),
      db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get(),
      db.collection('comparisons').where('published', '==', true).orderBy('createdAt', 'desc').limit(6).get().catch(() => ({ forEach: () => {} })),
    ]);

    // Build section map
    const sectionMap = {};
    const categoryIds = {};
    const categoriesHtmlParts = [];
    sectionsSnap.forEach(doc => {
      const d = doc.data();
      sectionMap[doc.id] = { name: d.name || '', slug: d.slug || 'technology' };
      if (d.slug) categoryIds[d.slug] = doc.id;
      categoriesHtmlParts.push('<li><a href="/' + (d.slug || 'technology') + '">' + esc(d.name || '') + '</a></li>');
    });

    const rawArticles = [];
    articlesSnap.forEach(doc => rawArticles.push(Object.assign({ id: doc.id }, doc.data())));
    const articles = deduplicateArticles(rawArticles);

    const featured = articles[0];
    const mainGrid = articles.slice(1, 13);  // 12 articles
    const remaining = articles.slice(13);     // up to 17 for category sections

    // Build category sections
    const categorySections = [
      { slug: 'ai',        label: 'Artificial Intelligence', icon: 'bi-cpu-fill' },
      { slug: 'security',  label: 'Security & Cyber', icon: 'bi-shield-lock-fill' },
      { slug: 'startups',  label: 'Startups & Innovation', icon: 'bi-rocket-takeoff-fill' },
      { slug: 'technology',label: 'Technology', icon: 'bi-laptop-fill' },
      { slug: 'gadgets',   label: 'Gadgets', icon: 'bi-phone-fill' },
      { slug: 'crypto',    label: 'Crypto & Web3', icon: 'bi-currency-bitcoin' },
    ].map(sec => {
      const catId = categoryIds[sec.slug];
      const catArticles = catId ? remaining.filter(a => a.category === catId).slice(0, 4) : [];
      const catName = catId && sectionMap[catId] ? sectionMap[catId].name : sec.label;
      return { ...sec, catId, catName, articles: catArticles };
    }).filter(sec => sec.articles.length >= 2);

    let featuredHtml = '';
    if (featured) {
      const cat = sectionMap[featured.category] || { name: 'Technology', slug: 'technology' };
      featuredHtml = renderFeaturedArticle(featured, cat.name, cat.slug);
    }

    let mainGridHtml = '';
    if (mainGrid.length > 0) {
      mainGridHtml = '<div class="article-grid">';
      mainGrid.forEach(a => {
        const cat = sectionMap[a.category] || { name: 'Technology', slug: 'technology' };
        mainGridHtml += renderArticleCard(a, cat.name, cat.slug);
      });
      mainGridHtml += '</div>';
    }

    let categorySectionsHtml = '';
    if (categorySections.length > 0) {
      categorySectionsHtml = '<div class="row g-4 mt-2">';
      categorySections.forEach(sec => {
        categorySectionsHtml += '<div class="col-lg-6">' +
          '<div class="p-3" style="background:rgba(255,255,255,0.03);border-radius:12px;border:1px solid rgba(255,255,255,0.08);">' +
          '<div class="d-flex align-items-center justify-content-between mb-3">' +
          '<h4 class="mb-0" style="font-size:1.05rem;font-weight:700;"><i class="bi ' + sec.icon + ' me-2" style="color:#6366f1;"></i>' + esc(sec.catName) + '</h4>' +
          '<a href="/' + sec.slug + '" style="font-size:0.8rem;color:#6366f1;">See all →</a>' +
          '</div>';
        sec.articles.forEach(a => {
          categorySectionsHtml += renderCompactCard(a, sec.catName, sec.slug);
        });
        categorySectionsHtml += '</div></div>';
      });
      categorySectionsHtml += '</div>';
    }

    const categoriesHtml = categoriesHtmlParts.join('') + '<li><a href="/compare">Compare</a></li><li><a href="/stock-data">Stock Data</a></li>';
    const podcastSidebarHtml = buildPodcastSidebarHtml();

    // Build Ticker HTML
    let tickerHtml = '';
    if (articles.length > 0) {
      const tickerItems = articles.slice(0, 5).map((article, i) => {
        const catSlug = sectionMap[article.category] ? sectionMap[article.category].slug : 'technology';
        const href = '/' + (catSlug || 'technology') + '/' + (article.slug || '');
        return `<a href="${href}" class="ticker-item ${i === 0 ? 'active' : ''}">${esc(article.title)}</a>`;
      }).join('');
      tickerHtml = `
      <div class="container mt-2 mb-1">
        <div class="news-ticker-container container-boxed" dir="ltr">
          <div class="ticker-label"><span class="me-2">Breaking News</span> <div class="pulsing-dot"></div></div>
          <div class="ticker-content" id="news-ticker-content">
            ${tickerItems}
          </div>
        </div>
      </div>
      `;
    }

    // Comparisons strip
    const comparisons = [];
    comparisonsSnap.forEach(doc => comparisons.push({ id: doc.id, ...doc.data() }));
    let comparisonsHtml = '';
    if (comparisons.length > 0) {
      comparisonsHtml = '<section class="container mt-5 mb-4" aria-label="Latest comparisons">' +
        '<div class="d-flex align-items-center justify-content-between mb-3">' +
        '<h2 class="mb-0" style="font-size:1.4rem;font-weight:700;"><i class="bi bi-columns-gap me-2" style="color:#6366f1;"></i>Head-to-Head Comparisons</h2>' +
        '<a href="/compare" style="font-size:0.85rem;color:#6366f1;">All comparisons →</a>' +
        '</div>' +
        '<div class="row g-3">' +
        comparisons.map(c => {
          const img = esc(c.featuredImage || '');
          const title = esc(c.title || `${c.itemA} vs ${c.itemB}`);
          const desc = esc((c.metaDescription || '').slice(0, 120));
          return '<div class="col-md-6 col-lg-4">' +
            `<a href="/compare/${esc(c.slug)}" class="card h-100 text-decoration-none" style="background:var(--color-bg-card);border:1px solid var(--color-border);border-radius:var(--radius-lg);overflow:hidden;box-shadow:var(--shadow-soft);">` +
            (img ? `<img src="${img}" class="card-img-top" alt="${title}" loading="lazy" style="aspect-ratio:16/9;object-fit:cover;">` : '') +
            '<div class="card-body">' +
            `<span class="badge mb-2" style="background:var(--color-primary);">Comparison</span>` +
            `<h3 class="h6 mb-1" style="color:var(--color-text-dark);">${title}</h3>` +
            `<p class="small mb-0" style="color:var(--color-text-muted);">${desc}</p>` +
            '</div></a></div>';
        }).join('') +
        '</div></section>';
    }

    const html = buildEnHomepageHtml(featuredHtml, mainGridHtml, categorySectionsHtml, categoriesHtml, podcastSidebarHtml, comparisonsHtml, tickerHtml);
    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    logger.error('handleEnHomepage error:', err);
    res.redirect('/en-home-fallback.html');
  }
}

function buildEnHomepageHtml(featuredHtml, mainGridHtml, categorySectionsHtml, categoriesHtml, podcastSidebarHtml, comparisonsHtml = '', tickerHtml = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-M68CNVMQ');</script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TrendingTech Daily - Latest Tech News and Trends</title>
  <meta name="google-site-verification" content="AAJy5uWJtM-PEQ6kOZCAiIQuO3CijcFc6DYM7dNYEVY" />
  <meta name="description" content="TrendingTech Daily delivers the latest tech news, AI updates, gadget reviews, and in-depth technology analysis for enthusiasts." />
  <meta property="og:title" content="TrendingTech Daily - Latest Tech News and Trends" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://www.trendingtechdaily.com/" />
  <meta property="og:image" content="https://www.trendingtechdaily.com/img/logo.png" />
  <meta property="og:description" content="TrendingTech Daily delivers the latest tech news, AI updates, gadget reviews, and in-depth technology analysis for enthusiasts." />
  <meta property="og:site_name" content="TrendingTech Daily" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="TrendingTech Daily - Latest Tech News and Trends" />
  <meta name="twitter:description" content="TrendingTech Daily delivers the latest tech news, AI updates, gadget reviews, and in-depth technology analysis for enthusiasts." />
  <meta name="twitter:image" content="https://www.trendingtechdaily.com/img/logo.png" />
  <link rel="alternate" hreflang="en" href="https://www.trendingtechdaily.com/" />
  <link rel="alternate" hreflang="he" href="https://www.trendingtechdaily.com/he" />
  <link rel="alternate" hreflang="x-default" href="https://www.trendingtechdaily.com/" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebSite","url":"https://www.trendingtechdaily.com/","name":"TrendingTech Daily","publisher":{"@type":"Organization","name":"TrendingTech Daily","logo":{"@type":"ImageObject","url":"https://www.trendingtechdaily.com/img/logo.png"}}}
  </script>
  <script>
    // Signal to index-main.js that featured + latest articles are already server-rendered
    window.EN_SSR_READY = true;
  </script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-functions-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js" defer></script>
  <link rel="canonical" href="https://www.trendingtechdaily.com/" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=IBM+Plex+Sans:wght@400;600&family=Fira+Code&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/css/ai-agent.css">
  <link rel="stylesheet" href="/css/popup.css" />
  <link rel="stylesheet" href="/css/sidebar-podcasts.css" />
  <link rel="stylesheet" href="/css/trending-github.css" />
  <link rel="stylesheet" href="/css/cookie-consent.css">
  <link rel="stylesheet" href="/css/stories.css">
  <link rel="stylesheet" href="/css/ticker.css">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8142734137865758" crossorigin="anonymous"></script>
</head>
<body>
  <noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-M68CNVMQ" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
  <div id="navbar-placeholder"></div>
  ${tickerHtml}
  <h1 class="visually-hidden">TrendingTech Daily - Latest Tech News and Trends</h1>

  <!-- Welcome Popup -->
  <div id="welcome-popup-overlay" class="welcome-popup-overlay">
    <div class="welcome-popup">
      <div class="welcome-popup-header">
        <button class="popup-close-btn" id="popup-close-btn" type="button" aria-label="Close popup"><i class="bi bi-x"></i></button>
        <div class="welcome-icon"><i class="bi bi-hand-thumbs-up"></i></div>
        <h2>Welcome to TrendingTech Daily!</h2>
        <p>Join our community and unlock exclusive features to enhance your tech news experience.</p>
      </div>
      <div class="welcome-popup-body">
        <div class="benefits-grid">
          <div class="benefit-card"><div class="benefit-icon"><i class="bi bi-bookmark-heart"></i></div><h4>Save Articles</h4><p>Bookmark articles for later reading.</p></div>
          <div class="benefit-card"><div class="benefit-icon"><i class="bi bi-eye-fill"></i></div><h4>Track Reading</h4><p>Keep track of articles you've read.</p></div>
          <div class="benefit-card"><div class="benefit-icon"><i class="bi bi-chat-dots"></i></div><h4>Join Discussions</h4><p>Leave comments and share insights.</p></div>
          <div class="benefit-card"><div class="benefit-icon"><i class="bi bi-graph-up"></i></div><h4>Stock Wishlist</h4><p>Track your favorite tech stocks.</p></div>
        </div>
        <div class="popup-actions">
          <a href="/signup.html" class="popup-btn popup-btn-primary"><i class="bi bi-person-plus"></i> Create Free Account</a>
          <button class="popup-btn popup-btn-secondary" id="popup-maybe-later">Maybe Later</button>
        </div>
      </div>
      <div class="popup-footer"><p>Already have an account? <a href="/login.html">Sign in here</a></p></div>
    </div>
  </div>

  <!-- Stories Section -->
  <section class="container mt-4 mb-3 stories-container">
    <div class="stories-wrapper" id="stories-wrapper">
        <!-- Story circles will be injected here via JS -->
    </div>
  </section>

  <!-- Story Viewer Modal -->
  <div class="story-viewer-modal" id="story-viewer-modal">
    <div class="story-viewer-close" id="story-viewer-close"><i class="bi bi-x"></i></div>
    <div class="story-viewer-content">
        <div class="story-progress-container" id="story-progress-container"></div>
        <video id="story-video-player" playsinline autoplay></video>
    </div>
  </div>

  <!-- Featured Article — server-rendered -->
  <section class="container mb-5" id="featured-article-container">
    ${featuredHtml}
  </section>

  <!-- Video Recommendations (loads async) -->
  <section class="container mt-5 mb-4 video-recommendations">
    <h2 class="section-title">Recommended Videos</h2>
    <div id="video-loader" class="text-center py-4" style="display:none;"></div>
    <div id="video-recommendations-container" class="row row-cols-1 row-cols-md-2 row-cols-lg-3 g-3"></div>
    <div id="show-more-videos-container" class="text-center mt-4" style="display:none;">
      <button id="show-more-videos-btn" class="btn btn-outline-secondary btn-sm">Show More Videos</button>
      <button id="show-less-videos-btn" class="btn btn-outline-secondary btn-sm" style="display:none;">Show Less</button>
    </div>
  </section>

  <main class="container">
    <div class="row">
      <!-- Main Column -->
      <div class="col-lg-8">

        <!-- Latest Articles Grid — server-rendered -->
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h2 class="section-title mb-0">Latest Articles</h2>
          <a href="/technology" style="font-size:0.85rem;color:#6366f1;">See all →</a>
        </div>
        <div id="articles-container">
          ${mainGridHtml}
        </div>
        <hr class="section-divider my-5">

        <!-- Comparison pages strip -->
        ${comparisonsHtml}
        ${comparisonsHtml ? '<hr class="section-divider my-5">' : ''}

        <!-- Category Sections — server-rendered -->
        ${categorySectionsHtml ? `
        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;"><i class="bi bi-grid-3x3-gap-fill me-2" style="color:#6366f1;"></i>Browse by Category</h3>
        ${categorySectionsHtml}
        <hr class="section-divider my-5">
        ` : ''}

        <!-- API / News Feed sections (loads async) -->
        <div id="api-articles-container"></div>

      </div>

      <!-- Sidebar -->
      <aside class="col-lg-4">

        <!-- Newsletter Subscription -->
        <div class="sidebar-section mb-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.5rem;text-align:center;">
          <h4 class="mb-2" style="font-weight:700;font-size:1.1rem;"><i class="bi bi-envelope-paper me-2" style="color:#6366f1;"></i>Weekly Newsletter</h4>
          <p class="small mb-3" style="color: rgba(255,255,255,0.7);">Get the top tech news delivered to your inbox every Friday.</p>
          <form class="d-flex flex-column gap-2" onsubmit="event.preventDefault(); const btn=this.querySelector('button'); btn.innerHTML='<span class=\\'spinner-border spinner-border-sm\\'></span>'; btn.disabled=true; fetch('https://subscribenewsletter-xa54maubsa-uc.a.run.app?lang=en&email='+encodeURIComponent(this.querySelector('input').value)).then(r=>r.json()).then(d=>{if(d.success){btn.innerHTML='Subscribed!';btn.classList.replace('btn-primary','btn-success');}else{btn.innerHTML='Error';btn.disabled=false;}}); return false;">
            <input type="email" class="form-control form-control-sm text-center" placeholder="Enter your email" required style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;">
            <button type="submit" class="btn btn-sm btn-primary w-100" style="font-weight:bold;">Subscribe Now</button>
          </form>
        </div>

        <!-- Podcast Recommendations -->
        ${podcastSidebarHtml}

        <!-- Trending Topics — server-rendered -->
        <div class="sidebar-section mb-4">
          <h4 class="mb-3" style="font-weight:700;font-size:1rem;"><i class="bi bi-fire me-2" style="color:#f59e0b;"></i>Trending Topics</h4>
          <ul class="trending-topics-list" id="categories-list">
            ${categoriesHtml}
          </ul>
        </div>

        <!-- GitHub Trending (loads async) -->
        <div class="sidebar-section mb-5" id="trending-github-section">
          <h4 class="mb-3">Trending GitHub</h4>
          <ul id="trending-github-list" class="list-group list-group-flush"></ul>
        </div>

        <!-- Automation Banner -->
        <div class="sidebar-section automation-banner mb-5">
          <a href="https://www.automationbymeir.com/" target="_blank" rel="noopener" class="automation-banner-link">
            <h4 class="mb-2">Automation by Meir</h4>
            <p class="small mb-0">Transform your business with custom automation</p>
          </a>
        </div>

      </aside>
    </div>
  </main>

  <footer class="footer">
    <div class="container">
      <div class="row">
        <div class="col-md-3 mb-4 mb-md-0"><h5 id="footer-site-title">TrendingTech Daily</h5><p id="footer-description" class="small text-muted">Stay informed with the latest tech news, AI updates, and market analysis.</p></div>
        <div class="col-md-3 mb-4 mb-md-0"><h5>Quick Links</h5><ul class="footer-links"><li><a href="/">Home</a></li><li><a href="/podcasts">Podcasts</a></li><li><a href="/about.html">About Us</a></li><li><a href="/privacy.html">Privacy Policy</a></li><li><a href="/terms.html">Terms of Service</a></li></ul></div>
        <div class="col-md-3 mb-4 mb-md-0"><h5>Categories</h5><ul class="footer-links" id="footer-categories-list"><li class="text-muted small fst-italic">Loading...</li></ul></div>
        <div class="col-md-3"><h5>Contact Us</h5><p class="small"><i class="bi bi-envelope-fill me-1"></i><span id="contact-email">info@trendingtechdaily.com</span><br><i class="bi bi-geo-alt-fill me-1"></i><span id="contact-address">Israel</span></p><div id="footer-social-links" class="mt-2"></div></div>
      </div>
      <div class="copyright"><span id="footer-text">© 2025 TrendingTech Daily.</span></div>
    </div>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" defer></script>
  <script src="/js/app-base.js" defer></script>
  <script src="/js/index-main.js" defer></script>
  <script src="/js/index-features.js" defer></script>
  <script src="/js/ai-agent.js" defer></script>
  <script src="/js/config.js" defer></script>
  <script src="/js/auth.js" defer></script>
  <script src="/js/nav-loader.js" defer></script>
  <script src="/js/github-trending.js" defer></script>
  <script src="/js/stories.js" defer></script>
  <script src="/js/ticker.js" defer></script>
  <script src="/js/cookie-consent.js" defer></script>

  <!-- AI Agent -->
  <div class="ai-agent-container" id="aiAgentContainer">
    <button class="ai-agent-button" id="aiAgentButton" aria-label="AI Tech News Assistant">
      <div class="ai-agent-pulse"></div>
      <svg class="ai-agent-icon" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
    </button>
    <div class="ai-agent-chat" id="aiAgentChat">
      <div class="ai-chat-header">
        <h3><span class="ai-status-indicator"></span> AI Tech News Agent</h3>
        <button class="ai-chat-close" id="aiChatClose" aria-label="Close chat">
          <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="ai-chat-content">
        <div class="ai-chat-messages" id="aiChatMessages">
          <div class="ai-message bot"><div class="ai-message-bubble">Hello! I'm your AI assistant for TrendingTech Daily. How can I help you today?</div></div>
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
  </div>
  <div class="ai-agent-banner-pointer" id="aiAgentBannerPointer">
    <div class="ai-agent-banner">
      <button class="dismiss-btn" id="aiAgentBannerDismiss" aria-label="Dismiss banner"><i class="bi bi-x"></i></button>
      <div class="banner-content"><div class="banner-title"><h2>AI Tech Assistant</h2></div><p class="subtitle">Your personal guide to the latest in tech.</p></div>
      <div class="banner-arrow-container"><div class="banner-arrow"></div></div>
    </div>
  </div>
  <section class="container my-5">
    <p>Learn more <a href="/about.html">about us</a> or <a href="/contact.html">get in touch</a>.</p>
  </section>
</body>
</html>`;
}

module.exports = { handleEnHomepage };
