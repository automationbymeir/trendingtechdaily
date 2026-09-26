// functions/http/heHomeRouting.js
// Server-side renders the Hebrew homepage with pre-fetched articles.
// CDN caches the response for 5 minutes so cold starts are rare.

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
    // Exact slug dedup
    const slug = (article.slug || article.id || '').toLowerCase();
    if (slug && seenSlugs.has(slug)) return false;
    if (slug) seenSlugs.add(slug);

    // Title keyword dedup
    const words = (article.title || '')
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length >= 3)
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

function formatHeDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function renderArticleCard(article, catName, catSlug) {
  const href = '/he/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatHeDate(article.createdAt);
  const readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
  return '<div class="article-card">' +
    '<a href="' + href + '" class="article-card-link">' +
    (imgSrc ? '<img src="' + imgSrc + '" alt="' + esc(article.imageAltText || article.title || '') + '" class="article-card-img" loading="lazy">' : '') +
    '</a>' +
    '<div class="article-card-body">' +
    (catName ? '<div class="mb-2"><a href="/he/' + catSlug + '" class="category-badge">' + esc(catName) + '</a></div>' : '') +
    '<a href="' + href + '" class="article-card-link">' +
    '<h3 class="article-card-title">' + esc(article.title || '') + '</h3>' +
    '<p class="article-card-excerpt">' + esc(article.excerpt || '') + '</p>' +
    '</a>' +
    '<div class="article-card-meta">' +
    (dateStr ? '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>' : '') +
    (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
    '</div></div></div>';
}

function renderFeaturedArticle(article, catName, catSlug) {
  const href = '/he/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatHeDate(article.createdAt);
  const readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
  return '<article class="featured-article">' +
    (imgSrc ? '<a href="' + href + '"><img src="' + imgSrc + '" alt="' + esc(article.imageAltText || article.title || '') + '" class="featured-article-img"></a>' : '') +
    '<div class="featured-article-body">' +
    '<div class="mb-3 d-flex gap-2 align-items-center">' +
    '<span class="featured-badge">כתבה נבחרת</span>' +
    (catName ? '<a href="/he/' + catSlug + '" class="category-badge">' + esc(catName) + '</a>' : '') +
    '</div>' +
    '<a href="' + href + '" style="text-decoration:none;color:inherit;">' +
    '<h2 class="featured-article-title mb-3">' + esc(article.title || '') + '</h2>' +
    '</a>' +
    '<p class="text-muted mb-3">' + esc(article.excerpt || '') + '</p>' +
    '<div class="d-flex gap-3 text-muted small mb-3">' +
    (dateStr ? '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>' : '') +
    (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
    '</div>' +
    '<a href="' + href + '" class="btn btn-primary">קרא עוד <i class="bi bi-arrow-left me-1"></i></a>' +
    '</div></article>';
}

// Compact horizontal card for category sections
function renderCompactCard(article, catName, catSlug) {
  const href = '/he/' + (catSlug || 'technology') + '/' + (article.slug || '');
  const imgSrc = esc(article.featuredImage || '');
  const dateStr = formatHeDate(article.createdAt);
  return '<div class="d-flex gap-3 mb-3 pb-3 border-bottom">' +
    (imgSrc
      ? '<a href="' + href + '" style="flex-shrink:0;"><img src="' + imgSrc + '" alt="' + esc(article.title || '') + '" style="width:90px;height:65px;object-fit:cover;border-radius:8px;" loading="lazy"></a>'
      : '<div style="flex-shrink:0;width:90px;height:65px;border-radius:8px;background:linear-gradient(135deg,#1A1A2E,#2196F3);"></div>') +
    '<div style="min-width:0;">' +
    (catName ? '<a href="/he/' + catSlug + '" class="category-badge mb-1 d-inline-block" style="font-size:0.7rem;">' + esc(catName) + '</a>' : '') +
    '<a href="' + href + '" style="text-decoration:none;color:inherit;">' +
    '<p class="mb-1 fw-semibold" style="font-size:0.9rem;line-height:1.3;">' + esc(article.title || '') + '</p>' +
    '</a>' +
    (dateStr ? '<small class="text-muted"><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</small>' : '') +
    '</div></div>';
}

async function handleHeHomepage(req, res) {
  try {
    // Fetch sections and articles (fetch 30 to have enough for category sections)
    const [sectionsSnap, articlesSnap, comparisonsSnap] = await Promise.all([
      db.collection('he_sections').where('active', '==', true).get(),
      db.collection('he_articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .get(),
      db.collection('he_comparisons').where('published', '==', true).orderBy('createdAt', 'desc').limit(6).get().catch(() => ({ forEach: () => {} })),
    ]);

    // Build section map + identify key category IDs by slug
    const sectionMap = {};
    const categoryIds = {}; // slug → docId
    sectionsSnap.forEach(doc => {
      const d = doc.data();
      sectionMap[doc.id] = { name: d.name || '', slug: d.slug || 'technology' };
      if (d.slug) categoryIds[d.slug] = doc.id;
    });

    // Build articles array and deduplicate
    const rawArticles = [];
    articlesSnap.forEach(doc => rawArticles.push(Object.assign({ id: doc.id }, doc.data())));
    const articles = deduplicateArticles(rawArticles);

    // Featured = first article; main grid = next 11; rest for category sections
    const featured = articles[0];
    const mainGrid = articles.slice(1, 13);   // 12 articles in grid
    const remaining = articles.slice(13);      // up to 17 for category sections

    // Group remaining by category (up to 4 each)
    const categorySections = [
      { slug: 'ai',        label: 'בינה מלאכותית', icon: 'bi-cpu' },
      { slug: 'startups',  label: 'סטארטאפים וחדשנות', icon: 'bi-rocket-takeoff' },
      { slug: 'security',  label: 'אבטחה וסייבר', icon: 'bi-shield-lock' },
      { slug: 'technology',label: 'טכנולוגיה', icon: 'bi-laptop' },
      { slug: 'gadgets',   label: 'גאדג\'טים', icon: 'bi-phone' },
      { slug: 'crypto',    label: 'קריפטו', icon: 'bi-currency-bitcoin' },
    ].map(sec => {
      const catId = categoryIds[sec.slug];
      const catArticles = catId
        ? remaining.filter(a => a.category === catId).slice(0, 4)
        : [];
      return { ...sec, catId, catName: sectionMap[catId] ? sectionMap[catId].name : sec.label, articles: catArticles };
    }).filter(sec => sec.articles.length >= 2); // only show sections with 2+ articles

    // Render featured HTML
    let featuredHtml = '';
    if (featured) {
      const cat = sectionMap[featured.category] || { name: '', slug: 'technology' };
      featuredHtml = renderFeaturedArticle(featured, cat.name, cat.slug);
    }

    // Render main grid HTML
    let mainGridHtml = '';
    if (mainGrid.length > 0) {
      mainGridHtml = '<div class="article-grid">';
      mainGrid.forEach(a => {
        const cat = sectionMap[a.category] || { name: '', slug: 'technology' };
        mainGridHtml += renderArticleCard(a, cat.name, cat.slug);
      });
      mainGridHtml += '</div>';
    }

    // Render category sections HTML
    let categorySectionsHtml = '';
    if (categorySections.length > 0) {
      // Two-column layout for category sections
      categorySectionsHtml = '<div class="row g-4 mt-2">';
      categorySections.forEach(sec => {
        categorySectionsHtml += '<div class="col-lg-6">' +
          '<div class="p-3" style="background:#0d1117;border-radius:12px;border:1px solid rgba(255,255,255,0.08);">' +
          '<div class="d-flex align-items-center justify-content-between mb-3">' +
          '<h4 class="mb-0" style="font-size:1.05rem;font-weight:700;"><i class="bi ' + sec.icon + ' me-2" style="color:#2196F3;"></i>' + esc(sec.catName) + '</h4>' +
          '<a href="/he/' + sec.slug + '" style="font-size:0.8rem;color:#2196F3;">הכל <i class="bi bi-arrow-left"></i></a>' +
          '</div>';
        sec.articles.forEach(a => {
          categorySectionsHtml += renderCompactCard(a, sec.catName, sec.slug);
        });
        categorySectionsHtml += '</div></div>';
      });
      categorySectionsHtml += '</div>';
    }

    // Render categories sidebar
    let categoriesHtml = '';
    Object.values(sectionMap).forEach(cat => {
      categoriesHtml += '<li><a href="/he/' + cat.slug + '">' + esc(cat.name) +
        ' <span class="badge bg-primary rounded-pill" style="font-size:0.7rem;">→</span></a></li>';
    });

    // Comparisons strip (HE)
    const comparisons = [];
    comparisonsSnap.forEach(doc => comparisons.push({ id: doc.id, ...doc.data() }));
    let comparisonsHtml = '';
    if (comparisons.length > 0) {
      comparisonsHtml = '<section class="container mt-5 mb-4" dir="rtl" aria-label="השוואות אחרונות">' +
        '<div class="d-flex align-items-center justify-content-between mb-3">' +
        '<h2 class="mb-0" style="font-size:1.4rem;font-weight:700;"><i class="bi bi-columns-gap ms-2" style="color:#2196F3;"></i>השוואות ראש בראש</h2>' +
        '<a href="/he/compare" style="font-size:0.85rem;color:#2196F3;">לכל ההשוואות ←</a>' +
        '</div>' +
        '<div class="row g-3">' +
        comparisons.map(c => {
          const img = esc(c.featuredImage || '');
          const title = esc(c.title || `${c.itemA} vs ${c.itemB}`);
          const desc = esc((c.metaDescription || '').slice(0, 120));
          return '<div class="col-md-6 col-lg-4">' +
            `<a href="/he/compare/${esc(c.slug)}" class="card h-100 text-decoration-none text-white" style="background:#0d1117;border:1px solid rgba(255,255,255,0.08);">` +
            (img ? `<img src="${img}" class="card-img-top" alt="${title}" loading="lazy" style="aspect-ratio:16/9;object-fit:cover;">` : '') +
            '<div class="card-body">' +
            `<span class="badge mb-2" style="background:#2196F3;">השוואה</span>` +
            `<h3 class="h6 mb-1">${title}</h3>` +
            `<p class="small text-white-50 mb-0">${desc}</p>` +
            '</div></a></div>';
        }).join('') +
        '</div></section>';
    }

    // Add a "Comparisons" link to the HE sidebar categories list
    categoriesHtml += '<li><a href="/he/compare">השוואות <span class="badge bg-primary rounded-pill" style="font-size:0.7rem;">←</span></a></li>';

    // Build Ticker HTML
    let tickerHtml = '';
    if (articles.length > 0) {
      const tickerItems = articles.slice(0, 5).map((article, i) => {
        const catSlug = sectionMap[article.category] ? sectionMap[article.category].slug : 'technology';
        const href = '/he/' + (catSlug || 'technology') + '/' + (article.slug || '');
        return `<a href="${href}" class="ticker-item ${i === 0 ? 'active' : ''}">${esc(article.title)}</a>`;
      }).join('');
      tickerHtml = `
      <div class="container mt-2 mb-1">
        <div class="news-ticker-container container-boxed" dir="rtl">
          <div class="ticker-label"><div class="pulsing-dot"></div> <span class="ms-2">מבזקים</span></div>
          <div class="ticker-content" id="news-ticker-content">
            ${tickerItems}
          </div>
        </div>
      </div>
      `;
    }

    const html = buildHeHomepageHtml(featuredHtml, mainGridHtml, categorySectionsHtml, categoriesHtml, comparisonsHtml, tickerHtml);

    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    logger.error('handleHeHomepage error:', err);
    res.redirect('/he/he-home-fallback.html');
  }
}

const HE_PODCASTS_SIDEBAR = [
  { name: 'עושים היסטוריה עם רן לוי', category: 'טכנולוגיה', letter: 'ע', gradient: 'linear-gradient(135deg,#667eea,#764ba2)', spotifyQuery: '%D7%A2%D7%95%D7%A9%D7%99%D7%9D%20%D7%94%D7%99%D7%A1%D7%98%D7%95%D7%A8%D7%99%D7%94' },
  { name: 'Geektime Podcast', category: 'טכנולוגיה', letter: 'G', gradient: 'linear-gradient(135deg,#11998e,#38ef7d)', spotifyQuery: 'Geektime%20Podcast' },
  { name: 'מדברים סייבר', category: 'סייבר', letter: 'מ', gradient: 'linear-gradient(135deg,#f43b47,#453a94)', spotifyQuery: '%D7%9E%D7%93%D7%91%D7%A8%D7%99%D7%9D%20%D7%A1%D7%99%D7%99%D7%91%D7%A8' },
  { name: 'ספקולציות', category: 'בינה מלאכותית', letter: 'ס', gradient: 'linear-gradient(135deg,#f7971e,#ffd200)', spotifyQuery: '%D7%A1%D7%A4%D7%A7%D7%95%D7%9C%D7%A6%D7%99%D7%95%D7%AA' },
  { name: 'StartUp Nation Stories', category: 'סטארטאפים', letter: 'S', gradient: 'linear-gradient(135deg,#0072ff,#00c6ff)', spotifyQuery: 'StartUp%20Nation%20Stories' },
];

function buildPodcastSidebarHtml() {
  let html = '<div class="sidebar-section mb-4" style="background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.25rem;">' +
    '<div class="d-flex align-items-center justify-content-between mb-3">' +
    '<h5 class="mb-0" style="font-weight:700;font-size:1rem;"><i class="bi bi-headphones me-2" style="color:#2196F3;"></i>פודקאסטים מומלצים</h5>' +
    '<a href="/he/podcasts" style="font-size:0.8rem;color:#2196F3;">כל הפודקאסטים <i class="bi bi-arrow-left"></i></a>' +
    '</div>';

  HE_PODCASTS_SIDEBAR.forEach(p => {
    html += '<div class="d-flex align-items-center gap-2 mb-3">' +
      '<div style="flex-shrink:0;width:42px;height:42px;border-radius:10px;background:' + p.gradient + ';display:flex;align-items:center;justify-content:center;font-weight:900;color:#fff;font-size:1rem;">' + p.letter + '</div>' +
      '<div style="min-width:0;flex:1;">' +
      '<div style="font-size:0.85rem;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.name + '</div>' +
      '<div style="display:flex;align-items:center;justify-content:space-between;">' +
      '<span style="font-size:0.72rem;color:#aaa;">' + p.category + '</span>' +
      '<a href="https://open.spotify.com/search/' + p.spotifyQuery + '" target="_blank" rel="noopener" style="font-size:0.72rem;color:#1DB954;text-decoration:none;"><i class="bi bi-spotify me-1"></i>האזן</a>' +
      '</div></div></div>';
  });

  html += '</div>';
  return html;
}

function buildHeHomepageHtml(featuredHtml, mainGridHtml, categorySectionsHtml, categoriesHtml, comparisonsHtml = '', tickerHtml = '') {
  const podcastSidebarHtml = buildPodcastSidebarHtml();
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-M68CNVMQ');</script>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TrendingTech Daily - חדשות טכנולוגיה, קריפטו, AI וסטארטאפים</title>
  <meta name="description" content="הישארו מעודכנים בחדשות הטכנולוגיה האחרונות, בינה מלאכותית, סייבר וסטארטאפים ישראלים. TrendingTech Daily מספק סיקור טכנולוגי יומיומי בעברית." />
  <link rel="canonical" href="https://www.trendingtechdaily.com/he" />
  <link rel="alternate" hreflang="he" href="https://www.trendingtechdaily.com/he" />
  <link rel="alternate" hreflang="en" href="https://www.trendingtechdaily.com/" />
  <link rel="alternate" hreflang="x-default" href="https://www.trendingtechdaily.com/" />
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"WebSite","url":"https://www.trendingtechdaily.com/he","name":"TrendingTech Daily","inLanguage":"he","publisher":{"@type":"Organization","name":"TrendingTech Daily","logo":{"@type":"ImageObject","url":"https://www.trendingtechdaily.com/img/logo.png"}}}
  </script>
  <script>
    window.closeHePopup = function() {
      var overlay = document.getElementById('welcome-popup-overlay');
      if (overlay) overlay.style.display = 'none';
      try { localStorage.setItem('he_popup_seen', '1'); } catch(e) {}
      window._hePopupDismissed = true;
    };
    // Signal to he-app.js that articles are already server-rendered — skip Firestore fetch
    window.HE_SSR_READY = true;
  </script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js" defer></script>
  <script src="https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js" defer></script>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
  <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.0/font/bootstrap-icons.css" rel="stylesheet" />
  <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/he/styles.css">
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

  ${tickerHtml || ''}

  <h1 class="visually-hidden">TrendingTech Daily - חדשות הטכנולוגיה האחרונות</h1>

  <!-- Welcome Popup -->
  <div id="welcome-popup-overlay" class="welcome-popup-overlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:9999; align-items:center; justify-content:center;">
    <div class="welcome-popup" style="background:#fff; border-radius:16px; max-width:520px; width:90%; padding:2rem; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.3);">
      <button id="popup-close-btn" type="button" onclick="window.closeHePopup()" style="position:absolute; top:1rem; left:1rem; background:none; border:none; font-size:1.5rem; cursor:pointer; z-index:10001;" aria-label="סגור"><i class="bi bi-x"></i></button>
      <div style="text-align:center; margin-bottom:1.5rem;">
        <div style="font-size:3rem; color:#2196F3; margin-bottom:1rem;"><i class="bi bi-hand-thumbs-up"></i></div>
        <h2 style="font-family:'Heebo',sans-serif; font-weight:900; color:#1A1A2E;">ברוכים הבאים לTrendingTech Daily!</h2>
        <p style="color:#555;">הצטרפו לקהילה שלנו ופתחו תכונות בלעדיות לשיפור חוויית קריאת חדשות הטכנולוגיה שלכם.</p>
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1.5rem;">
        <div style="background:#f8f9fa; border-radius:12px; padding:1rem; text-align:center;"><div style="color:#2196F3; font-size:1.5rem; margin-bottom:0.5rem;"><i class="bi bi-bookmark-heart"></i></div><h4 style="font-size:0.9rem; font-weight:700; color:#1A1A2E;">שמירת מאמרים</h4><p style="font-size:0.8rem; color:#555; margin:0;">סמנו מאמרים לקריאה מאוחרת.</p></div>
        <div style="background:#f8f9fa; border-radius:12px; padding:1rem; text-align:center;"><div style="color:#4CAF50; font-size:1.5rem; margin-bottom:0.5rem;"><i class="bi bi-eye-fill"></i></div><h4 style="font-size:0.9rem; font-weight:700; color:#1A1A2E;">מעקב קריאה</h4><p style="font-size:0.8rem; color:#555; margin:0;">עקבו אחר מאמרים שקראתם.</p></div>
        <div style="background:#f8f9fa; border-radius:12px; padding:1rem; text-align:center;"><div style="color:#FFC107; font-size:1.5rem; margin-bottom:0.5rem;"><i class="bi bi-chat-dots"></i></div><h4 style="font-size:0.9rem; font-weight:700; color:#1A1A2E;">השתתפו בדיונים</h4><p style="font-size:0.8rem; color:#555; margin:0;">השאירו תגובות ושתפו תובנות.</p></div>
        <div style="background:#f8f9fa; border-radius:12px; padding:1rem; text-align:center;"><div style="color:#E91E63; font-size:1.5rem; margin-bottom:0.5rem;"><i class="bi bi-graph-up"></i></div><h4 style="font-size:0.9rem; font-weight:700; color:#1A1A2E;">רשימת מעקב</h4><p style="font-size:0.8rem; color:#555; margin:0;">עקבו אחר מניות טכנולוגיה.</p></div>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.75rem;">
        <a href="/he/signup" style="background:#2196F3; color:#fff; border:none; border-radius:8px; padding:0.75rem; text-align:center; font-weight:700; text-decoration:none; font-size:1rem;"><i class="bi bi-person-plus me-2"></i>צרו חשבון חינם</a>
        <button id="popup-maybe-later" onclick="window.closeHePopup()" style="background:transparent; color:#555; border:2px solid #e9ecef; border-radius:8px; padding:0.75rem; font-weight:600; cursor:pointer; font-size:0.95rem;">אולי מאוחר יותר</button>
      </div>
      <p style="text-align:center; margin-top:1rem; font-size:0.85rem; color:#888;">כבר יש לכם חשבון? <a href="/he/login" style="color:#2196F3;">התחברו כאן</a></p>
    </div>
  </div>

  <!-- Stories Section -->
  <section class="container mt-4 mb-3 stories-container">
    <div class="stories-wrapper" id="stories-wrapper">
        <!-- Story circles will be injected here via JS -->
    </div>
  </section>

  <!-- Story Viewer Modal -->
  <div class="story-viewer-modal" id="story-viewer-modal" dir="ltr">
    <div class="story-viewer-close" id="story-viewer-close"><i class="bi bi-x"></i></div>
    <div class="story-viewer-content">
        <div class="story-progress-container" id="story-progress-container"></div>
        <video id="story-video-player" playsinline autoplay></video>
    </div>
  </div>

  <!-- Featured Article — server-rendered, no spinner -->
  <section class="container mb-5" id="featured-article-container">
    ${featuredHtml}
  </section>

  <!-- Main Content -->
  <main class="container">
    <div class="row">
      <!-- Main Column -->
      <div class="col-lg-8">

        <!-- Latest Articles Grid -->
        <div class="d-flex align-items-center justify-content-between mb-3">
          <h2 class="section-title mb-0">כתבות אחרונות</h2>
          <a href="/he/technology" style="font-size:0.85rem;color:#2196F3;">הכל <i class="bi bi-arrow-left"></i></a>
        </div>
        <div id="articles-container">
          ${mainGridHtml}
        </div>

        <!-- Comparison pages strip -->
        ${comparisonsHtml ? `<hr style="border-color:rgba(255,255,255,0.08);margin:2.5rem 0;">${comparisonsHtml}` : ''}

        <!-- Category Sections -->
        ${categorySectionsHtml ? `
        <hr style="border-color:rgba(255,255,255,0.08);margin:2.5rem 0;">
        <h3 style="font-size:1.1rem;font-weight:700;margin-bottom:0.5rem;"><i class="bi bi-grid-3x3-gap me-2" style="color:#2196F3;"></i>לפי קטגוריה</h3>
        ${categorySectionsHtml}
        ` : ''}

      </div>

      <!-- Sidebar -->
      <aside class="col-lg-4">

        <!-- Newsletter Subscription (HE) -->
        <div class="sidebar-section mb-4" style="background:#0d1117;border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:1.5rem;text-align:center;">
          <h4 class="mb-2" style="font-weight:700;font-size:1.1rem;"><i class="bi bi-envelope-paper ms-2" style="color:#2196F3;"></i>ניוזלטר שבועי</h4>
          <p class="small mb-3" style="color: rgba(255,255,255,0.7);">קבלו את חדשות הטכנולוגיה המובילות ישירות למייל בכל יום שישי.</p>
          <form class="d-flex flex-column gap-2" onsubmit="event.preventDefault(); const btn=this.querySelector('button'); btn.innerHTML='<span class=\\'spinner-border spinner-border-sm\\'></span>'; btn.disabled=true; fetch('https://subscribenewsletter-xa54maubsa-uc.a.run.app?lang=he&email='+encodeURIComponent(this.querySelector('input').value)).then(r=>r.json()).then(d=>{if(d.success){btn.innerHTML='נרשמת בהצלחה!';btn.classList.replace('btn-primary','btn-success');}else{btn.innerHTML='שגיאה';btn.disabled=false;}}); return false;">
            <input type="email" class="form-control form-control-sm text-center" placeholder="הזינו את האימייל שלכם" required style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#fff;">
            <button type="submit" class="btn btn-sm btn-primary w-100" style="font-weight:bold;">הירשמו עכשיו</button>
          </form>
        </div>

        <!-- Podcast Recommendations -->
        ${podcastSidebarHtml}

        <!-- Trending Topics -->
        <div class="sidebar-section mb-4">
          <h5 style="font-weight:700;font-size:1rem;margin-bottom:0.75rem;"><i class="bi bi-fire me-2" style="color:#ff6b35;"></i>נושאים פופולריים</h5>
          <ul class="trending-topics-list" id="categories-list">
            ${categoriesHtml}
          </ul>
        </div>

        <!-- Automation Banner -->
        <div class="sidebar-section automation-banner mb-5">
          <a href="https://www.automationbymeir.com/" target="_blank" rel="noopener" class="automation-banner-link" style="text-decoration:none; color:inherit; display:block;">
            <h4 class="mb-2" style="color:#fff;">Automation by Meir</h4>
            <p class="small mb-0" style="color:#aaa;">שדרגו את העסק שלכם עם אוטומציה מותאמת אישית</p>
          </a>
        </div>

      </aside>
    </div>
  </main>

  <footer class="footer">
    <div class="container">
      <div class="row">
        <div class="col-md-3 mb-4 mb-md-0">
          <h5>TrendingTech Daily</h5>
          <p class="small" style="color:#aaa;">הישארו מעודכנים עם חדשות הטכנולוגיה האחרונות, עדכוני בינה מלאכותית וניתוחי שוק.</p>
        </div>
        <div class="col-md-3 mb-4 mb-md-0">
          <h5>קישורים מהירים</h5>
          <ul class="footer-links">
            <li><a href="/he/">ראשי</a></li>
            <li><a href="/he/podcasts">פודקאסטים</a></li>
            <li><a href="/he/about">אודות</a></li>
            <li><a href="/he/privacy">מדיניות פרטיות</a></li>
            <li><a href="/he/terms">תנאי שימוש</a></li>
            <li><a href="/">גרסה אנגלית</a></li>
          </ul>
        </div>
        <div class="col-md-3 mb-4 mb-md-0">
          <h5>קטגוריות</h5>
          <ul class="footer-links">
            <li><a href="/he/ai">בינה מלאכותית</a></li>
            <li><a href="/he/technology">טכנולוגיה</a></li>
            <li><a href="/he/startups">סטארטאפים</a></li>
            <li><a href="/he/gadgets">גאדג'טים</a></li>
            <li><a href="/he/security">אבטחה</a></li>
            <li><a href="/he/crypto">קריפטו</a></li>
          </ul>
        </div>
        <div class="col-md-3">
          <h5>צרו קשר</h5>
          <p class="small" style="color:#aaa;"><i class="bi bi-envelope-fill me-1"></i>info@trendingtechdaily.com<br>
          <i class="bi bi-globe me-1"></i><a href="/" style="color:#aaa;">English Version</a></p>
        </div>
      </div>
      <div class="copyright"><p style="margin:0;">© 2025 TrendingTech Daily. כל הזכויות שמורות.</p></div>
    </div>
  </footer>

  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" defer></script>
  <script src="/he/js/he-app.js" defer></script>
  <script src="/he/js/he-ai-agent.js" defer></script>
  <script src="/js/stories.js" defer></script>
  <script src="/js/ticker.js" defer></script>
  <script src="/he/js/he-cookie-consent.js" defer></script>
</body>
</html>`;
}

module.exports = { handleHeHomepage };
