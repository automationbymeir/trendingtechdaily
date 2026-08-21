const fs = require("fs");
const path = require("path");
const { db, logger } = require("../config");

// Master Category Taxonomy
const KNOWN_TAXONOMY = {
  'ai': { name: 'Artificial Intelligence', nameHe: 'בינה מלאכותית' },
  'ai-models': { name: 'Reasoning Models & LLMs', nameHe: 'מודלי היסק ו-LLM' },
  'autonomous-agents': { name: 'Autonomous AI Agents', nameHe: 'סוכנים אוטונומיים' },
  'dev': { name: 'Developer Tools', nameHe: 'כלי פיתוח' },
  'computing': { name: 'Computing & Hardware', nameHe: 'מחשוב וחומרה' },
  'chips': { name: 'Silicon & Foundries', nameHe: 'שבבים ומפעלי ייצור' },
  'markets': { name: 'Tech Equities & Markets', nameHe: 'שוק ההון ומניות' },
  'startups': { name: 'VC & Tech Startups', nameHe: 'סטארטאפים והון סיכון' },
  'cybersecurity': { name: 'Cybersecurity & Defense', nameHe: 'סייבר ואבטחה' },
  'security': { name: 'Cybersecurity & Defense', nameHe: 'סייבר ואבטחה' },
  'top-stories': { name: 'Top Tech Stories', nameHe: 'חדשות מובילות' },
  'gadgets': { name: 'Consumer Tech', nameHe: 'גאדגטים וחומרה' }
};

function resolveCategoryName(catValue, isHe) {
  if (!catValue) return isHe ? 'בינה מלאכותית' : 'Artificial Intelligence';
  const clean = String(catValue).toLowerCase().trim();
  if (KNOWN_TAXONOMY[clean]) {
    return isHe ? (KNOWN_TAXONOMY[clean].nameHe || KNOWN_TAXONOMY[clean].name) : KNOWN_TAXONOMY[clean].name;
  }
  if (/^[A-Za-z0-9_-]{16,}$/.test(catValue)) {
    return isHe ? 'בינה מלאכותית' : 'Artificial Intelligence';
  }
  return catValue;
}

function formatArticleBody(content, isHe) {
  if (!content) {
    return `<p>${isHe ? 'תוכן הכתבה בטעינה...' : 'Article content loading...'}</p>`;
  }

  if (content.includes('<p>') || content.includes('<div>')) {
    return content;
  }

  const blocks = content.split(/\n\n+/);
  return blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('## ')) {
      return `<h2 class="mt-4 mb-3 fw-bold" style="font-family:var(--font-display); font-size:1.65rem; color:var(--text-main);">${trimmed.replace('## ', '')}</h2>`;
    }
    if (trimmed.startsWith('### ')) {
      return `<h3 class="mt-3 mb-2 fw-bold" style="font-size:1.35rem; color:var(--text-main);">${trimmed.replace('### ', '')}</h3>`;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = trimmed.split('\n').map(li => `<li>${li.replace(/^[-*]\s+/, '')}</li>`).join('');
      return `<ul class="my-3 ps-4">${items}</ul>`;
    }
    return `<p class="mb-3" style="line-height:1.8;">${trimmed}</p>`;
  }).join('\n');
}

function renderTagsHtml(tags, isHe) {
  if (!Array.isArray(tags) || tags.length === 0) return '';
  return tags.map(tag => {
    const tagUrl = isHe ? `/he/search.html?q=${encodeURIComponent(tag)}` : `/search.html?q=${encodeURIComponent(tag)}`;
    return `<a href="${tagUrl}" class="badge bg-dark text-light border border-secondary text-decoration-none me-1 mb-1 p-2" style="font-family:var(--font-mono); font-size:0.75rem;">#${tag}</a>`;
  }).join(' ');
}

/**
 * Universal SSR Renderer for Articles (English & Hebrew)
 */
async function renderArticleSSR(req, res, isHe = false) {
  try {
    const pathSegments = req.path.split("/").filter(Boolean);
    // Remove 'he' prefix if present in segments
    if (pathSegments[0] === 'he') {
      pathSegments.shift();
      isHe = true;
    }

    let categorySlug = 'ai';
    let articleSlug = '';
    let docId = '';

    // Check query parameters (?slug=... &id=... &article=...)
    if (req.query.slug) {
      articleSlug = String(req.query.slug).trim();
    }
    if (req.query.id) {
      docId = String(req.query.id).trim();
    }
    if (req.query.article) {
      articleSlug = String(req.query.article).trim();
    }

    // Check path segments if not provided via query
    if (!articleSlug && !docId) {
      if (pathSegments.length >= 2) {
        if (pathSegments[0] === 'article') {
          articleSlug = pathSegments[1];
        } else {
          categorySlug = pathSegments[0];
          articleSlug = pathSegments[1];
        }
      } else if (pathSegments.length === 1 && pathSegments[0] !== 'article') {
        articleSlug = pathSegments[0];
      }
    }

    if (!articleSlug && !docId) {
      logger.warn("No article slug or docId provided in request:", req.path);
      return serve404(res, isHe);
    }

    logger.info(`[SSR] Fetching article: slug="${articleSlug}", docId="${docId}" (isHe: ${isHe})`);

    // Fetch article from Firestore (scanning he_articles and articles)
    let articleData = null;
    let articleId = null;
    const collectionsToScan = isHe ? ['he_articles', 'articles'] : ['articles', 'he_articles'];

    // 1. Try finding by document ID if docId is provided
    if (docId) {
      for (const col of collectionsToScan) {
        if (articleData) break;
        try {
          const docSnap = await db.collection(col).doc(docId).get();
          if (docSnap.exists) {
            articleData = docSnap.data();
            articleId = docSnap.id;
          }
        } catch (err) {
          logger.warn(`[SSR] Error finding by docId "${docId}" in ${col}:`, err.message);
        }
      }
    }

    // 2. Try finding by slug
    if (!articleData && articleSlug) {
      for (const col of collectionsToScan) {
        if (articleData) break;
        try {
          const slugSnap = await db.collection(col)
            .where("slug", "==", articleSlug)
            .limit(1)
            .get();

          if (!slugSnap.empty) {
            const doc = slugSnap.docs[0];
            articleData = doc.data();
            articleId = doc.id;
          }
        } catch (err) {
          logger.warn(`[SSR] Error finding by slug "${articleSlug}" in ${col}:`, err.message);
        }
      }
    }

    // 3. Try finding by articleSlug as document ID
    if (!articleData && articleSlug) {
      for (const col of collectionsToScan) {
        if (articleData) break;
        try {
          const docSnap = await db.collection(col).doc(articleSlug).get();
          if (docSnap.exists) {
            articleData = docSnap.data();
            articleId = docSnap.id;
          }
        } catch (err) {
          logger.warn(`[SSR] Error finding by slug-as-docId in ${col}:`, err.message);
        }
      }
    }

    if (!articleData) {
      logger.warn(`[SSR] Article not found: slug="${articleSlug}", docId="${docId}"`);
      return serve404(res, isHe);
    }

    // Prepare metadata
    const title = articleData.title || (isHe ? 'ללא כותרת' : 'Untitled Article');
    const excerpt = articleData.excerpt || articleData.summary || (articleData.content ? articleData.content.slice(0, 200).replace(/<[^>]*>/g, '') + '...' : '');
    const cleanExcerpt = excerpt.replace(/["\n\r]/g, ' ').trim();
    const author = articleData.author || (isHe ? 'מערכת TrendingTech' : 'TrendingTech Staff');
    const image = articleData.featuredImage || articleData.imageUrl || articleData.image || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80';
    
    let datePublished = new Date().toISOString();
    let dateFormatted = 'August 2026';
    if (articleData.createdAt) {
      const d = articleData.createdAt.toDate ? articleData.createdAt.toDate() : new Date(articleData.createdAt);
      datePublished = d.toISOString();
      dateFormatted = d.toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }
    const dateModified = articleData.updatedAt ? (articleData.updatedAt.toDate ? articleData.updatedAt.toDate().toISOString() : new Date(articleData.updatedAt).toISOString()) : datePublished;

    const catValue = articleData.category || articleData.section || categorySlug || 'ai';
    const catDisplayName = resolveCategoryName(catValue, isHe);
    const catSlug = (typeof catValue === 'string' && !/^[A-Za-z0-9_-]{16,}$/.test(catValue)) ? catValue.toLowerCase() : 'ai';
    const finalSlug = articleData.slug || articleSlug;

    const baseUrl = 'https://trendingtechdaily.com';
    const canonicalPath = isHe ? `/he/${catSlug}/${finalSlug}` : `/${catSlug}/${finalSlug}`;
    const canonicalUrl = `${baseUrl}${canonicalPath}`;
    const readingTime = articleData.readingTimeMinutes || Math.max(3, Math.ceil((articleData.content || '').length / 1000)) || 5;

    // Load base HTML template (bundled in functions/templates or public)
    const bundledPath = path.resolve(__dirname, isHe ? '../templates/he-article.html' : '../templates/article.html');
    const publicPath = path.resolve(__dirname, isHe ? '../../public/he/article.html' : '../../public/article.html');
    const templatePath = fs.existsSync(bundledPath) ? bundledPath : publicPath;
    let html = fs.existsSync(templatePath) 
      ? fs.readFileSync(templatePath, 'utf-8') 
      : getFallbackArticleHtml(isHe);

    // Build Server-Rendered Article HTML for #article-container
    const articleInnerHtml = `
      <article class="article-content-wrapper">
        <header class="article-header mb-4">
          <div class="d-flex align-items-center gap-2 mb-3">
            <a href="${isHe ? `/he/category.html?slug=${encodeURIComponent(catSlug)}` : `/category.html?slug=${encodeURIComponent(catSlug)}`}" class="badge badge-ai" style="text-decoration:none;">${catDisplayName}</a>
            <span style="font-family:var(--font-mono); font-size:0.8125rem; color:var(--text-muted);">${dateFormatted}</span>
          </div>
          <h1 class="article-main-heading mb-3" style="font-family:var(--font-display); font-size:clamp(2rem, 4.5vw, 3.25rem); font-weight:900; line-height:1.1; color:var(--text-main);">
            ${title}
          </h1>
          <div class="article-meta-row d-flex align-items-center justify-content-between flex-wrap gap-2 py-3 border-top border-bottom" style="border-color:var(--border-color) !important; font-family:var(--font-mono); font-size:0.8125rem; color:var(--text-secondary);">
            <div class="d-flex align-items-center gap-2">
              <span>${isHe ? 'מאת' : 'By'} <strong class="text-main">${author}</strong></span>
              <span>·</span>
              <span><i class="bi bi-clock me-1"></i>${readingTime} ${isHe ? 'דקות קריאה' : 'min read'}</span>
            </div>
            <div class="d-flex align-items-center gap-2">
              <button type="button" id="read-aloud-btn" class="btn btn-sm btn-outline-danger d-inline-flex align-items-center gap-1" style="font-family:var(--font-mono); font-size:0.8125rem;">
                <i class="bi bi-volume-up"></i> <span>${isHe ? 'האזן לכתבה' : 'Listen to Article'}</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Share Action Bar -->
        <div class="d-flex align-items-center gap-2 mb-4 p-2 rounded" style="background:var(--bg-surface-elevated); border:1px solid var(--border-color);">
          <span class="small fw-bold px-2" style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${isHe ? 'שיתוף:' : 'SHARE:'}</span>
          <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(canonicalUrl)}" id="share-twitter" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="X (Twitter)" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-twitter-x"></i></a>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(canonicalUrl)}" id="share-linkedin" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="LinkedIn" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-linkedin"></i></a>
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonicalUrl)}" id="share-facebook" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="Facebook" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-facebook"></i></a>
          <button type="button" id="share-copy-link" class="btn btn-outline btn-sm d-inline-flex align-items-center gap-1 ms-auto" style="font-size:0.75rem;">
            <i class="bi bi-link-45deg"></i> <span>${isHe ? 'העתק קישור' : 'Copy Link'}</span>
          </button>
          <span id="copy-link-feedback" class="small text-success ms-2" style="display:none; font-family:var(--font-mono); font-size:0.75rem;">${isHe ? 'הקישור הועתק!' : 'Copied!'}</span>
        </div>

        <!-- Featured Image -->
        <div class="article-featured-media mb-4" style="border-radius:var(--radius-lg); overflow:hidden; border:1px solid var(--border-color); background:#000;">
          <img src="${image}" alt="${title}" style="width:100%; max-height:540px; object-fit:cover;" onerror="this.src='https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80'">
        </div>

        <!-- Standfirst / Excerpt -->
        ${articleData.excerpt ? `<p class="article-standfirst fs-5 fw-bold mb-4 pb-3 border-bottom" style="color:var(--text-main); line-height:1.6; border-color:var(--border-color) !important;">${articleData.excerpt}</p>` : ''}

        <!-- Main Body Content -->
        <div class="article-body-content mb-5" style="font-size:1.125rem; line-height:1.8; color:var(--text-main);">
          ${formatArticleBody(articleData.content || '', isHe)}
        </div>

        <!-- Article Tags -->
        <div class="article-tags-section d-flex align-items-center flex-wrap gap-2 pt-4 border-top" style="border-color:var(--border-color) !important;">
          <span class="small fw-bold text-muted me-2" style="font-family:var(--font-mono); font-size:0.75rem;">${isHe ? 'תגיות:' : 'TAGS:'}</span>
          ${renderTagsHtml(articleData.tags, isHe)}
        </div>

        <!-- Telegram CTA -->
        <div class="telegram-cta-card mt-4 p-4 rounded-3 d-flex align-items-center justify-content-between flex-wrap gap-3" style="background:linear-gradient(135deg, rgba(34, 158, 217, 0.14) 0%, rgba(14, 16, 22, 0.96) 100%); border:1px solid rgba(34, 158, 217, 0.4); box-shadow:0 8px 24px rgba(0,0,0,0.35);">
          <div class="d-flex align-items-center gap-3">
            <div style="width:50px; height:50px; border-radius:12px; background:#229ED9; display:flex; align-items:center; justify-content:center; color:#fff; font-size:1.75rem; flex-shrink:0; box-shadow:0 4px 14px rgba(34, 158, 217, 0.45);">
              <i class="bi bi-telegram"></i>
            </div>
            <div>
              <h4 class="mb-1 fw-bold" style="font-size:1.15rem; color:#fff; font-family:var(--font-display); line-height:1.2;">
                ${isHe ? 'רוצים לקבל עדכוני AI וטכנולוגיה בזמן אמת?' : 'Want real-time AI & tech intelligence dispatches?'}
              </h4>
              <p class="mb-0 text-muted" style="font-size:0.875rem; line-height:1.45;">
                ${isHe ? 'הצטרפו לערוץ הטלגרם הרשמי של TrendingTech Daily למבזקים חיים, מחקרים מעמיקים וכלים חדשים ישירות לנייד.' : 'Join the official TrendingTech Daily Telegram channel for breaking research, model launches, and market analysis.'}
              </p>
            </div>
          </div>
          <a href="${isHe ? 'https://t.me/+tXn569Iw7QpkNjlk' : 'https://t.me/+S6EM_ZmX9sAzNzU0'}" target="_blank" rel="noopener noreferrer" class="btn d-inline-flex align-items-center gap-2 px-3 py-2 fw-bold text-white" style="background:#229ED9; border-color:#229ED9; font-size:0.92rem; border-radius:8px; white-space:nowrap; box-shadow:0 4px 12px rgba(34, 158, 217, 0.35); text-decoration:none;">
            <i class="bi bi-telegram"></i> <span>${isHe ? 'הצטרפו לערוץ בטלגרם' : 'Join Telegram Channel'}</span>
          </a>
        </div>
      </article>
    `;

    // JSON-LD Structured Data Schema (schema.org/NewsArticle)
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": canonicalUrl
      },
      "headline": title,
      "description": cleanExcerpt,
      "image": [image],
      "datePublished": datePublished,
      "dateModified": dateModified,
      "author": {
        "@type": "Person",
        "name": author
      },
      "publisher": {
        "@type": "Organization",
        "name": "TrendingTech Daily",
        "logo": {
          "@type": "ImageObject",
          "url": "https://trendingtechdaily.com/images/trendingtech-logo.png"
        }
      }
    };

    const structuredDataScript = `<script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>`;

    // Hydration state script
    const clientState = {
      id: articleId,
      ...articleData,
      createdAt: datePublished,
      updatedAt: dateModified
    };
    const hydrationScript = `<script id="server-article-data" type="application/json">${JSON.stringify(clientState)}</script>`;

    // Inject metadata into HTML <head>
    html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title} - TrendingTech Daily</title>`);
    html = html.replace(/<link id="canonicalLink"[\s\S]*?>/i, `<link id="canonicalLink" rel="canonical" href="${canonicalUrl}" />`);
    html = html.replace(/<meta name="description"[\s\S]*?>/i, `<meta name="description" content="${cleanExcerpt}" />`);
    
    // OpenGraph & Twitter tags replacement or injection
    const ogTags = `
  <meta property="og:title" id="ogTitle" content="${title}" />
  <meta property="og:description" id="ogDescription" content="${cleanExcerpt}" />
  <meta property="og:url" id="ogUrl" content="${canonicalUrl}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:type" content="article" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" id="twitterTitle" content="${title}" />
  <meta name="twitter:description" id="twitterDescription" content="${cleanExcerpt}" />
  <meta name="twitter:image" content="${image}" />
  ${structuredDataScript}
    `;

    if (html.includes('</head>')) {
      html = html.replace('</head>', `${ogTags}\n</head>`);
    }

    // Replace #article-container content with pre-rendered HTML
    html = html.replace(/<article id="article-container">[\s\S]*?<\/article>/i, `<article id="article-container">${articleInnerHtml}</article>`);

    // Inject hydration script before </body>
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${hydrationScript}\n</body>`);
    }

    res.set('Content-Type', 'text/html; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(html);

  } catch (error) {
    logger.error("Error in renderArticleSSR:", error);
    return serve404(res, isHe);
  }
}

function serve404(res, isHe) {
  const bundledPath = path.resolve(__dirname, '../templates/404.html');
  const publicPath = path.resolve(__dirname, '../../public/404.html');
  const notFoundPath = fs.existsSync(bundledPath) ? bundledPath : publicPath;
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  if (fs.existsSync(notFoundPath)) {
    return res.status(404).send(fs.readFileSync(notFoundPath, 'utf-8'));
  }
  return res.status(404).send('<h1>404 Not Found</h1>');
}

function getFallbackArticleHtml(isHe) {
  return `<!DOCTYPE html>
<html lang="${isHe ? 'he' : 'en'}" dir="${isHe ? 'rtl' : 'ltr'}" data-mode="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Article - TrendingTech Daily</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="container my-4">
    <article id="article-container"></article>
  </div>
</body>
</html>`;
}

/**
 * Cloud Function Handlers
 */
exports.handleArticleRouting = async (req, res) => {
  return renderArticleSSR(req, res, false);
};

exports.handleHebrewRouting = async (req, res) => {
  return renderArticleSSR(req, res, true);
};

/**
 * Handles legacy redirects (301 Permanent Redirect)
 * from article.html?slug=... to /:category/:slug
 */
exports.handleLegacyRedirects = async (req, res) => {
  try {
    const isHe = req.path.startsWith('/he');
    const slug = req.query.slug || req.query.article || req.query.id;

    if (slug) {
      // Find category for clean canonical URL
      const snap = await db.collection("articles").where("slug", "==", slug).limit(1).get();
      let category = 'ai';
      if (!snap.empty) {
        const d = snap.docs[0].data();
        category = d.category || d.section || 'ai';
      }
      const targetUrl = isHe ? `/he/${category}/${slug}` : `/${category}/${slug}`;
      logger.info(`[301 Redirect] ${req.originalUrl} -> ${targetUrl}`);
      return res.redirect(301, targetUrl);
    }

    // Default category redirect
    if (req.path.includes('category.html')) {
      const catSlug = req.query.slug || 'ai';
      const targetUrl = isHe ? `/he/${catSlug}` : `/${catSlug}`;
      return res.redirect(301, targetUrl);
    }

    return res.redirect(301, isHe ? '/he' : '/');
  } catch (error) {
    logger.error("Error in handleLegacyRedirects:", error);
    return res.redirect(301, '/');
  }
};

exports.handleDynamicRouting = exports.handleArticleRouting;