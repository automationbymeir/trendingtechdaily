// public/js/article-page.js - Complete Article Engine for TrendingTech Daily

// Helper functions
function getSafe(fn, defaultValue = '') {
  try {
    const value = fn();
    return (value !== null && value !== undefined) ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Master Taxonomy Resolver
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

// Check if article belongs to the current page language
function isArticleInLanguage(article, isHePage) {
  if (!article) return false;
  if (article.language) {
    const lang = String(article.language).toLowerCase().trim();
    if (isHePage) return lang === 'he' || lang === 'iw' || lang === 'hebrew';
    return lang === 'en' || lang === 'english' || (!lang.startsWith('he') && !lang.startsWith('iw'));
  }
  if (article.isHebrew !== undefined) {
    return isHePage ? Boolean(article.isHebrew) : !Boolean(article.isHebrew);
  }
  const sample = (article.title || '') + ' ' + (article.excerpt || '') + ' ' + (article.content || '').slice(0, 300);
  const hasHebrew = /[\u0590-\u05FF]/.test(sample);
  return isHePage ? hasHebrew : !hasHebrew;
}

// Universal human-readable category name resolver (Never shows raw IDs)
function resolveCategoryDisplayName(catValue, isHe, article) {
  if (!catValue && article) {
    catValue = article.section || article.categoryName || article.topic;
  }
  if (!catValue) return isHe ? 'בינה מלאכותית' : 'Artificial Intelligence';

  if (window.categoryCache && window.categoryCache[catValue]) {
    const cached = window.categoryCache[catValue];
    if (typeof cached === 'object') {
      return isHe ? (cached.nameHe || cached.name) : cached.name;
    }
    return cached;
  }

  const clean = String(catValue).toLowerCase().trim();
  if (KNOWN_TAXONOMY[clean]) {
    const item = KNOWN_TAXONOMY[clean];
    return isHe ? (item.nameHe || item.name) : item.name;
  }

  if (/^[A-Za-z0-9_-]{16,}$/.test(catValue)) {
    if (article && Array.isArray(article.tags) && article.tags.length > 0) {
      const tag = article.tags[0];
      const tagItem = KNOWN_TAXONOMY[tag.toLowerCase()];
      if (tagItem) return isHe ? (tagItem.nameHe || tagItem.name) : tagItem.name;
      return tag;
    }
    return isHe ? 'בינה מלאכותית' : 'Artificial Intelligence';
  }

  return catValue;
}

// Extract article identifier from URL
// Extract article identifier from URL
function getArticleInfoFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const slugParam = urlParams.get('slug') || urlParams.get('article');
  const idParam = urlParams.get('id');

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  let pathSlug = '';
  if (pathParts.length >= 2) {
    const lastPart = pathParts[pathParts.length - 1];
    if (lastPart && !lastPart.includes('.html')) {
      pathSlug = lastPart;
    }
  }

  return { 
    articleSlug: (slugParam || pathSlug || '').trim(),
    articleId: (idParam || '').trim()
  };
}

const articleInfo = getArticleInfoFromUrl();

// Load and render article
async function loadArticle(info) {
  const articleContainer = document.getElementById('article-container');
  if (!articleContainer) return;

  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';

  if (window.ensureFirebaseInitialized) {
    window.ensureFirebaseInitialized();
  }

  // 0. Instant Hydration check: if server-rendered data is present
  const serverDataEl = document.getElementById('server-article-data');
  if (serverDataEl && serverDataEl.textContent.trim()) {
    try {
      const serverArticle = JSON.parse(serverDataEl.textContent);
      if (serverArticle && serverArticle.title) {
        if (articleContainer.querySelector('.article-main-heading') && articleContainer.querySelector('.article-sources-card')) {
          setupReadAloud(serverArticle, isHe);
          setupShareButtons(serverArticle);
          setupCommentForm(serverArticle, isHe);
          loadComments(serverArticle.id);
          loadRelatedArticles(serverArticle.category, serverArticle.id, isHe);
          loadSidebarTrending(isHe);
          return;
        } else {
          renderArticle(serverArticle, isHe);
          setupReadAloud(serverArticle, isHe);
          setupShareButtons(serverArticle);
          setupCommentForm(serverArticle, isHe);
          loadComments(serverArticle.id);
          loadRelatedArticles(serverArticle.category, serverArticle.id, isHe);
          loadSidebarTrending(isHe);
          return;
        }
      }
    } catch (e) {
      console.warn("Failed to parse server-article-data:", e);
    }
  }

  const firestoreDb = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);

  if (!firestoreDb) {
    setTimeout(() => loadArticle(info), 200);
    return;
  }

  try {
    let article = null;
    const targetSlug = info ? (info.articleSlug || '').trim() : '';
    const targetId = info ? (info.articleId || '').trim() : '';

    // 1. Direct ID Lookup (Most Accurate & Direct)
    if (targetId) {
      if (isHe) {
        try {
          const docSnap = await firestoreDb.collection('he_articles').doc(targetId).get();
          if (docSnap.exists) {
            article = { id: docSnap.id, isHebrewDoc: true, ...docSnap.data() };
          }
        } catch (e) {}
      }
      if (!article) {
        try {
          const docSnap = await firestoreDb.collection('articles').doc(targetId).get();
          if (docSnap.exists) {
            article = { id: docSnap.id, ...docSnap.data() };
          }
        } catch (e) {}
      }
    }

    // 2. Exact Slug Lookup in primary collections
    if (!article && targetSlug) {
      if (isHe) {
        try {
          const snap = await firestoreDb.collection('he_articles')
            .where('slug', '==', targetSlug)
            .limit(1)
            .get();

          if (!snap.empty) {
            article = { id: snap.docs[0].id, isHebrewDoc: true, ...snap.docs[0].data() };
          }
        } catch (e) {}

        if (!article) {
          try {
            const docSnap = await firestoreDb.collection('he_articles').doc(targetSlug).get();
            if (docSnap.exists) {
              article = { id: docSnap.id, isHebrewDoc: true, ...docSnap.data() };
            }
          } catch (e) {}
        }
      }

      if (!article) {
        try {
          const snap = await firestoreDb.collection('articles')
            .where('slug', '==', targetSlug)
            .limit(1)
            .get();

          if (!snap.empty) {
            article = { id: snap.docs[0].id, ...snap.docs[0].data() };
          }
        } catch (e) {}

        if (!article) {
          try {
            const docSnap = await firestoreDb.collection('articles').doc(targetSlug).get();
            if (docSnap.exists) {
              article = { id: docSnap.id, ...docSnap.data() };
            }
          } catch (e) {}
        }
      }
    }

    // 3. Case-Insensitive / Fuzzy Slug Scan
    if (!article && targetSlug) {
      const lowerSlug = targetSlug.toLowerCase();
      const collectionsToScan = isHe ? ['he_articles', 'articles'] : ['articles', 'he_articles'];
      for (const col of collectionsToScan) {
        if (article) break;
        try {
          const scanSnap = await firestoreDb.collection(col).limit(50).get();
          scanSnap.forEach(doc => {
            if (!article) {
              const d = doc.data();
              const artSlug = (d.slug || '').toLowerCase();
              const artId = doc.id.toLowerCase();
              if (artSlug === lowerSlug || artId === lowerSlug || (artSlug && lowerSlug && (artSlug.includes(lowerSlug) || lowerSlug.includes(artSlug)))) {
                article = { id: doc.id, ...(col === 'he_articles' ? { isHebrewDoc: true } : {}), ...d };
              }
            }
          });
        } catch (e) {}
      }
    }

    // 4. If URL was root without parameters, load the freshest lead article
    if (!article && !targetSlug && !targetId) {
      const primaryCol = isHe ? 'he_articles' : 'articles';
      try {
        const latestSnap = await firestoreDb.collection(primaryCol)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        if (!latestSnap.empty) {
          article = { id: latestSnap.docs[0].id, ...(isHe ? { isHebrewDoc: true } : {}), ...latestSnap.docs[0].data() };
        }
      } catch (e) {}
    }

    // Fallback if DB completely empty
    if (!article) {
      article = getFallbackArticle(targetSlug, isHe);
    }

    // Update metadata & document title
    updatePageMetadata(article, isHe);

    // Render article HTML
    renderArticle(article, isHe);

    // Setup interactive features
    setupReadAloud(article, isHe);
    setupShareButtons(article);
    setupCommentForm(article, isHe);
    loadComments(article.id);
    loadRelatedArticles(article.category, article.id, isHe);
    loadSidebarTrending(isHe);

  } catch (error) {
    console.error('Error in loadArticle:', error);
    const fallback = getFallbackArticle(info ? info.articleSlug : '', isHe);
    renderArticle(fallback, isHe);
    setupReadAloud(fallback, isHe);
    setupShareButtons(fallback);
  }
}

// Render article HTML markup
function renderArticle(article, isHe) {
  const articleContainer = document.getElementById('article-container');
  if (!articleContainer) return;

  const title = article.title || (isHe ? 'ללא כותרת' : 'Untitled Article');
  const date = article.createdAt?.toDate ? article.createdAt.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'August 2026';
  const author = article.author || (isHe ? 'מערכת TrendingTech' : 'TrendingTech Staff');
  const readingTime = article.readingTimeMinutes || Math.max(3, Math.ceil((article.content || '').length / 1000)) || 5;
  const categoryName = resolveCategoryDisplayName(article.category, isHe, article);
  const categorySlug = (typeof article.category === 'string' && !/^[A-Za-z0-9_-]{16,}$/.test(article.category)) ? article.category.toLowerCase() : 'ai';
  const categoryUrl = isHe ? `/he/category.html?slug=${encodeURIComponent(categorySlug)}` : `/category.html?slug=${encodeURIComponent(categorySlug)}`;
  const image = article.featuredImage || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80';

  const html = `
    <article class="article-content-wrapper">
      <header class="article-header mb-4">
        <div class="d-flex align-items-center gap-2 mb-3">
          <a href="${categoryUrl}" class="badge badge-ai" style="text-decoration:none;">${categoryName}</a>
          <span style="font-family:var(--font-mono); font-size:0.8125rem; color:var(--text-muted);">${date}</span>
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
        <a href="#" id="share-twitter" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="X (Twitter)" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-twitter-x"></i></a>
        <a href="#" id="share-linkedin" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="LinkedIn" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-linkedin"></i></a>
        <a href="#" id="share-facebook" target="_blank" rel="noopener noreferrer" class="btn-icon btn-sm" title="Facebook" style="color:var(--text-main); font-size:0.9rem;"><i class="bi bi-facebook"></i></a>
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
      ${article.excerpt ? `<p class="article-standfirst fs-5 fw-bold mb-4 pb-3 border-bottom" style="color:var(--text-main); line-height:1.6; border-color:var(--border-color) !important;">${article.excerpt}</p>` : ''}

      <!-- Main Body Content -->
      <div class="article-body-content mb-4" style="font-size:1.125rem; line-height:1.8; color:var(--text-main);">
        ${formatArticleBody(article.content || '', isHe)}
      </div>

      <!-- Social Post / Tweet Embed Quotes -->
      ${renderSocialMentions(article.socialMentions, isHe)}

      <!-- Primary Sources & References Box -->
      ${renderSourcesBox(article.sources, isHe, article)}

      <!-- Article Tags -->
      <div class="article-tags-section d-flex align-items-center flex-wrap gap-2 pt-4 border-top" style="border-color:var(--border-color) !important;">
        <span class="small fw-bold text-muted me-2" style="font-family:var(--font-mono); font-size:0.75rem;">${isHe ? 'תגיות:' : 'TAGS:'}</span>
        ${renderTags(article.tags, isHe)}
      </div>

      <!-- Telegram Channel CTA Banner -->
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

  articleContainer.innerHTML = html;

  // Safe AdSense initialization for newly rendered ad slots
  try {
    const uninitializedAds = articleContainer.querySelectorAll('.adsbygoogle:not([data-adsbygoogle-status])');
    uninitializedAds.forEach(() => {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    });
  } catch (e) {}
}

// Render Social Discussion / Tweet Quotes
function renderSocialMentions(socialMentions, isHe) {
  if (!Array.isArray(socialMentions) || socialMentions.length === 0) return '';

  return socialMentions.map(item => {
    const platform = item.platform || 'X';
    const author = item.author || (isHe ? 'מומחה טכנולוגיה' : 'Tech Analyst');
    const handle = item.handle || '@techdispatch';
    const quote = item.quote || '';
    const link = item.link || item.url || (handle.startsWith('@') ? `https://x.com/${handle.replace('@','')}` : 'https://x.com');
    const platformIcon = platform.toLowerCase() === 'github' ? 'bi-github' : (platform.toLowerCase() === 'linkedin' ? 'bi-linkedin' : 'bi-twitter-x');
    const quoteClass = platform.toLowerCase() === 'github' ? 'quote-github' : (platform.toLowerCase() === 'linkedin' ? 'quote-linkedin' : 'quote-x');

    return `
      <div class="article-social-quote ${quoteClass}">
        <div class="social-quote-header">
          <div class="social-quote-author">
            <span class="social-quote-name">${author}</span>
            <span class="social-quote-handle">${handle}</span>
            <i class="bi bi-patch-check-fill text-primary" style="font-size:0.85rem;" title="Verified"></i>
          </div>
          <i class="bi ${platformIcon} social-quote-platform-icon"></i>
        </div>
        <div class="social-quote-body">"${quote}"</div>
        <div class="social-quote-footer">
          <span>${item.context ? item.context + ' · ' : ''}</span>
          <a href="${link}" target="_blank" rel="noopener noreferrer" class="social-quote-link">
            ${isHe ? 'צפה בדיון המלא' : 'View Discussion'} <i class="bi bi-box-arrow-up-right ms-1"></i>
          </a>
        </div>
      </div>
    `;
  }).join('');
}

// Render Primary Sources & References Card
function renderSourcesBox(sources, isHe, article) {
  let list = Array.isArray(sources) && sources.length > 0 ? sources : [];

  // If no explicit sources in old articles, synthesize authoritative references from tags & topic
  if (list.length === 0 && article) {
    const titleLower = String(article.title || '').toLowerCase();
    if (titleLower.includes('anthropic') || titleLower.includes('claude')) {
      list.push({ title: 'Anthropic Research: Model Evaluation & Safety System Cards', url: 'https://www.anthropic.com/research', publisher: 'Anthropic' });
    } else if (titleLower.includes('openai') || titleLower.includes('gpt')) {
      list.push({ title: 'OpenAI Technical Report & System Specifications', url: 'https://openai.com/index', publisher: 'OpenAI' });
    } else if (titleLower.includes('nvidia') || titleLower.includes('tsmc') || titleLower.includes('chip')) {
      list.push({ title: 'Semiconductor Industry Association & Foundry Reports', url: 'https://www.semiconductors.org', publisher: 'SIA Research' });
    } else if (titleLower.includes('security') || titleLower.includes('cve') || titleLower.includes('סייבר')) {
      list.push({ title: 'CISA Cybersecurity Advisories & Threat Assessment', url: 'https://www.cisa.gov/news-events/cybersecurity-advisories', publisher: 'CISA' });
    } else {
      list.push({ title: isHe ? 'מחקר וניתוח טכנולוגי ראשוני מבית TrendingTech' : 'Primary Technology Research & Architecture Dispatch', url: 'https://www.trendingtechdaily.com', publisher: 'TrendingTech Intelligence' });
    }
  }

  if (list.length === 0) return '';

  let listHtml = '';
  list.forEach(src => {
    const title = src.title || (isHe ? 'מקור ראשוני ומסמך תיעוד' : 'Primary Research & Documentation');
    const url = src.url || '#';
    const publisher = src.publisher || src.domain || (isHe ? 'מקור רשמי' : 'Official Source');
    listHtml += `
      <li class="article-source-item">
        <a href="${url}" target="_blank" rel="noopener noreferrer" class="article-source-link">
          <i class="bi bi-link-45deg"></i>
          <span>${title}</span>
          <i class="bi bi-box-arrow-up-right small"></i>
        </a>
        <span class="article-source-publisher">${publisher}</span>
      </li>
    `;
  });

  return `
    <div class="article-sources-card mt-4 mb-4">
      <div class="article-sources-header">
        <i class="bi bi-journal-text text-danger"></i>
        <span>${isHe ? 'מקורות וסימוכין נוספים' : 'Sources & Primary References'}</span>
      </div>
      <ul class="article-sources-list">
        ${listHtml}
      </ul>
    </div>
  `;
}

// Format raw text or markdown into styled paragraphs and subheadings with safe ad slots
function formatArticleBody(content, isHe) {
  if (!content) {
    return `<p>${isHe ? 'תוכן הכתבה בטעינה...' : 'Article content loading...'}</p>`;
  }

  if (content.includes('<p>') || content.includes('<div>')) {
    return content;
  }

  const blocks = content.split(/\n\n+/);
  let pCount = 0;
  let adInserted = false;

  return blocks.map((block, idx) => {
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

    pCount++;
    let result = `<p class="mb-4" style="line-height:1.8;">${trimmed}</p>`;

    // Insert 1 clean, non-intrusive in-article ad slot only after paragraph 3 in articles with 5+ paragraphs
    const nextBlock = blocks[idx + 1] ? blocks[idx + 1].trim() : '';
    const isNextHeading = nextBlock.startsWith('##') || nextBlock.startsWith('###');

    if (pCount === 3 && !adInserted && blocks.length >= 5 && !isNextHeading) {
      adInserted = true;
      result += `
        <div class="ad-unit ad-in-article my-4">
          <span class="ad-label">${isHe ? 'תוכן ממומן' : 'ADVERTISEMENT'}</span>
          <ins class="adsbygoogle"
               style="display:block; text-align:center;"
               data-ad-layout="in-article"
               data-ad-format="fluid"
               data-ad-client="ca-pub-8142734137865758"></ins>
        </div>
      `;
    }

    return result;
  }).join('');
}

// Render tag badges
function renderTags(tags, isHe) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return `<span class="badge badge-ai">#Tech</span><span class="badge badge-dev">#AI</span>`;
  }
  return tags.map(t => `<span class="badge badge-ai">#${t}</span>`).join(' ');
}

// Update title, meta tags, and open graph
function updatePageMetadata(article, isHe) {
  const title = article.title ? `${article.title} — TrendingTech Daily` : 'TrendingTech Daily';
  document.title = title;

  const desc = article.excerpt || article.summary || (isHe ? 'חדשות טכנולוגיה, בינה מלאכותית ושוק ההון בעברית' : 'Latest technology dispatches and analysis');
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', desc);

  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', title);

  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', desc);
}

// Web Speech API: Real Read Aloud
let isSpeaking = false;
function setupReadAloud(article, isHe) {
  const readBtn = document.getElementById('read-aloud-btn');
  if (!readBtn) return;

  if (!('speechSynthesis' in window)) {
    readBtn.style.display = 'none';
    return;
  }

  window.speechSynthesis.cancel();
  isSpeaking = false;

  readBtn.onclick = function() {
    if (isSpeaking) {
      window.speechSynthesis.cancel();
      isSpeaking = false;
      readBtn.classList.remove('btn-danger');
      readBtn.classList.add('btn-outline-danger');
      readBtn.innerHTML = `<i class="bi bi-volume-up"></i> <span>${isHe ? 'האזן לכתבה' : 'Listen to Article'}</span>`;
      return;
    }

    const fullText = (article.title || '') + '. ' + (article.excerpt || '') + '. ' + (article.content || '').replace(/<[^>]*>?/gm, '');
    const cleanText = fullText.slice(0, 3000);
    const utterance = new SpeechSynthesisUtterance(cleanText);

    utterance.lang = isHe ? 'he-IL' : 'en-US';
    utterance.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchedVoice = voices.find(v => isHe ? (v.lang.startsWith('he') || v.lang.startsWith('iw')) : v.lang.startsWith('en'));
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onstart = () => {
      isSpeaking = true;
      readBtn.classList.remove('btn-outline-danger');
      readBtn.classList.add('btn-danger');
      readBtn.innerHTML = `<i class="bi bi-pause-fill"></i> <span>${isHe ? 'הפסק הקראה' : 'Pause Audio'}</span>`;
    };

    utterance.onend = () => {
      isSpeaking = false;
      readBtn.classList.remove('btn-danger');
      readBtn.classList.add('btn-outline-danger');
      readBtn.innerHTML = `<i class="bi bi-volume-up"></i> <span>${isHe ? 'האזן לכתבה' : 'Listen to Article'}</span>`;
    };

    utterance.onerror = () => {
      isSpeaking = false;
      readBtn.classList.remove('btn-danger');
      readBtn.classList.add('btn-outline-danger');
      readBtn.innerHTML = `<i class="bi bi-volume-up"></i> <span>${isHe ? 'האזן לכתבה' : 'Listen to Article'}</span>`;
    };

    window.speechSynthesis.speak(utterance);
  };
}

// Social Share Handlers
function setupShareButtons(article) {
  const title = encodeURIComponent(article.title || 'TrendingTech Daily Article');
  const url = encodeURIComponent(window.location.href);

  const twitterBtn = document.getElementById('share-twitter');
  if (twitterBtn) twitterBtn.href = `https://twitter.com/intent/tweet?text=${title}&url=${url}`;

  const linkedinBtn = document.getElementById('share-linkedin');
  if (linkedinBtn) linkedinBtn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;

  const fbBtn = document.getElementById('share-facebook');
  if (fbBtn) fbBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${url}`;

  const copyBtn = document.getElementById('share-copy-link');
  const copyFeedback = document.getElementById('copy-link-feedback');
  if (copyBtn) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(window.location.href).then(() => {
        if (copyFeedback) {
          copyFeedback.style.display = 'inline';
          setTimeout(() => { copyFeedback.style.display = 'none'; }, 3000);
        }
      }).catch(() => {});
    };
  }
}

// Comment Form Handler
function setupCommentForm(article, isHe) {
  const form = document.getElementById('comment-form');
  const textArea = document.getElementById('comment-text');
  const submitBtn = document.getElementById('comment-submit-btn');
  const feedback = document.getElementById('comment-feedback');
  if (!form || !textArea) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const commentText = textArea.value.trim();
    if (!commentText) return;

    const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
    if (!firestoreDb) return;

    const user = (typeof auth !== 'undefined' && auth.currentUser) ? auth.currentUser : null;

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> ${isHe ? 'מפרסם...' : 'Posting...'}`;
    }

    try {
      const commentData = {
        text: commentText,
        userId: user ? user.uid : 'reader_' + Date.now(),
        displayName: user ? (user.displayName || user.email?.split('@')[0] || (isHe ? 'משתמש רשום' : 'Member')) : (isHe ? 'קורא TrendingTech' : 'Tech Reader'),
        timestamp: firebase.firestore.FieldValue ? firebase.firestore.FieldValue.serverTimestamp() : new Date(),
        articleId: article.id,
        articleSlug: article.slug || ''
      };

      const targetCol = isHe ? 'he_articles' : 'articles';
      await firestoreDb.collection(targetCol).doc(article.id).collection('comments').add(commentData);

      textArea.value = '';
      if (feedback) {
        feedback.textContent = isHe ? 'התגובה פורסמה בהצלחה!' : 'Comment posted successfully!';
        feedback.className = 'small ms-2 text-success';
        setTimeout(() => { feedback.textContent = ''; }, 4000);
      }

      loadComments(article.id);
    } catch (err) {
      console.warn('Comment post error:', err);
      if (feedback) {
        feedback.textContent = isHe ? 'שגיאה בפרסום התגובה.' : 'Error posting comment.';
        feedback.className = 'small ms-2 text-danger';
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = isHe ? 'פרסם תגובה' : 'Post Comment';
      }
    }
  });
}

// Load comments list
async function loadComments(articleId) {
  const listContainer = document.getElementById('comments-list');
  if (!listContainer) return;

  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);

  if (!firestoreDb || !articleId) {
    listContainer.innerHTML = `<p class="text-muted small">${isHe ? 'היה הראשון להגיב לכתבה זו!' : 'Be the first to share your thoughts on this story!'}</p>`;
    return;
  }

  try {
    const targetCol = isHe ? 'he_articles' : 'articles';
    const snap = await firestoreDb.collection(targetCol).doc(articleId).collection('comments')
      .orderBy('timestamp', 'desc')
      .limit(30)
      .get();

    if (snap.empty) {
      listContainer.innerHTML = `<p class="text-muted small">${isHe ? 'היה הראשון להגיב לכתבה זו!' : 'Be the first to share your thoughts on this story!'}</p>`;
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const data = doc.data();
      const name = data.displayName || (isHe ? 'קורא' : 'Reader');
      const text = data.text || '';
      const date = data.timestamp?.toDate ? data.timestamp.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US') : (isHe ? 'עכשיו' : 'Just now');

      html += `
        <div class="p-3 rounded" style="background:var(--bg-surface); border:1px solid var(--border-color);">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="fw-bold text-main" style="font-size:0.9rem;">${name}</span>
            <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${date}</span>
          </div>
          <p class="mb-0" style="font-size:0.925rem; color:var(--text-secondary); line-height:1.6;">${text}</p>
        </div>
      `;
    });

    listContainer.innerHTML = html;
  } catch (e) {
    listContainer.innerHTML = `<p class="text-muted small">${isHe ? 'היה הראשון להגיב לכתבה זו!' : 'Be the first to share your thoughts on this story!'}</p>`;
  }
}

// Load related articles
async function loadRelatedArticles(category, currentArticleId, isHe) {
  const container = document.getElementById('related-articles-list');
  const section = document.getElementById('related-articles-container');
  if (!container || !section) return;

  const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
  if (!firestoreDb) return;

  try {
    const targetCol = isHe ? 'he_articles' : 'articles';
    const snap = await firestoreDb.collection(targetCol)
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get();

    if (snap.empty) {
      section.style.display = 'none';
      return;
    }

    let html = '';
    let count = 0;
    snap.forEach(doc => {
      if (doc.id === currentArticleId || count >= 3) return;
      const d = doc.data();
      const title = d.title || (isHe ? 'כתבה קשורה' : 'Related Article');
      const author = d.author || (isHe ? 'מערכת האתר' : 'TrendingTech');
      const image = d.featuredImage || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=600&auto=format&fit=crop&q=80';
      const link = getArticleCleanUrl({ id: doc.id, slug: d.slug, category: d.category }, isHe);
      const cat = resolveCategoryDisplayName(d.category, isHe, d);
      count++;

      html += `
        <div class="col-12 col-md-4 mb-3">
          <article class="card h-100" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
            <div style="position:relative; aspect-ratio:16/9; overflow:hidden; background:#000;">
              <a href="${link}" style="display:block; width:100%; height:100%;">
                <img src="${image}" alt="${title}" style="width:100%; height:100%; object-fit:cover;" loading="lazy" />
              </a>
              <span class="badge badge-ai" style="position:absolute; bottom:8px; inset-inline-start:8px;">${cat}</span>
            </div>
            <div class="card-body p-3">
              <h4 style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; line-height:1.2; margin-bottom:0.5rem;">
                <a href="${link}" style="color:var(--text-main); text-decoration:none;">${title}</a>
              </h4>
              <span class="text-muted" style="font-size:0.75rem; font-family:var(--font-mono);">${author}</span>
            </div>
          </article>
        </div>
      `;
    });

    if (count > 0) {
      container.innerHTML = html;
      section.style.display = 'block';
    } else {
      section.style.display = 'none';
    }
  } catch (e) {
    section.style.display = 'none';
  }
}

// Load sidebar trending articles
async function loadSidebarTrending(isHe) {
  const container = document.getElementById('sidebar-trending-list');
  if (!container) return;

  const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
  if (!firestoreDb) return;

  try {
    const targetCol = isHe ? 'he_articles' : 'articles';
    const snap = await firestoreDb.collection(targetCol)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (snap.empty) return;

    let html = '';
    snap.forEach((doc, idx) => {
      const d = doc.data();
      const title = d.title || (isHe ? 'ידיעה טכנולוגית' : 'Tech Story');
      const link = getArticleCleanUrl({ id: doc.id, slug: d.slug, category: d.category }, isHe);
      const num = `0${idx + 1}`;

      html += `
        <div class="d-flex align-items-start gap-2 mb-3 pb-2 border-bottom" style="border-color:var(--border-color) !important;">
          <span style="font-family:var(--font-display); font-weight:900; font-size:1.35rem; color:var(--accent-red); line-height:1;">${num}</span>
          <div>
            <a href="${link}" style="color:var(--text-main); font-size:0.875rem; font-weight:600; text-decoration:none; line-height:1.3; display:block;">
              ${title}
            </a>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (e) {}
}

// Fallback Article
function getFallbackArticle(slug, isHe) {
  return isHe ? {
    id: 'reasoning-models-advancements-he',
    title: 'הדור הבא של מודלי היסק: שילוב חשיבה רב-שלבית וסוכנים אוטונומיים',
    excerpt: 'ניתוח מעמיק של התפתחות מודלי שפה מתקדמים, הרצת חישובים בזמן מבחן והשפעתם על שוק התוכנה והתשתיות.',
    content: `## מהפכת מודלי ההיסק והסוכנים האוטונומיים

בשנה האחרונה אנו עדים למעבר דרמטי מאימון מודלי שפה קלאסיים (Pre-training scaling) לעבר הגדלת כושר החישוב בזמן הפעולה (Inference-time compute). שיטה זו מאפשרת למודלים לחשוב, לבצע בדיקות עצמיות, לבקר את תוצריהם ולתקן באגים לפני שהם מציגים תשובה למשתמש.

### נקודות מפתח בניתוח הארכיטקטורה:
- **סוכנים אוטונומיים רב-שלביים**: יכולת פירוק בעיות מורכבות לרצף פעולות עצמאי.
- **פרוטוקול MCP (Model Context Protocol)**: סטנדרט פתוח לחיבור מודלי שפה למאגרי מידע, כלי פיתוח וממשקי API מאובטחים.
- **יעילות חישובית ותשתיות**: אופטימיזציה של מעבדים גרפיים (GPUs) ושבבים ייעודיים להרצת מודלי היסק במהירות שיא.

ההתקדמות הזו מסמנת את תחילתו של עידן חדש שבו סוכני בינה מלאכותית אינם רק עונים על שאלות, אלא מתכננים, כותבים קוד ומבצעים משימות שלמות באופן עצמאי.`,
    author: 'מערכת TrendingTech Daily',
    category: 'ai-models',
    tags: ['בינה מלאכותית', 'מודלי היסק', 'סוכנים אוטונומיים', 'MCP'],
    readingTimeMinutes: 6,
    featuredImage: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80'
  } : {
    id: 'multimodal-reasoning-architectures',
    title: 'Multimodal Reasoning Architectures: Test-Time Compute and the Next Frontier of AI',
    excerpt: 'An architectural investigation into inference-time scaling, chain-of-thought verification, and autonomous agent workflows.',
    content: `## The Shift Toward Test-Time Compute

The artificial intelligence landscape is witnessing an architectural paradigm shift from raw pretraining parameter scaling to test-time compute optimization. By allowing models to allocate reasoning tokens dynamically, foundation systems achieve unprecedented accuracy in code generation, mathematics, and agentic orchestration.

### Key Architectural Shifts:
- **Autonomous Tool-Calling Swarms**: Multi-agent coordination mechanisms capable of breaking down complex engineering tasks into self-healing execution runs.
- **Model Context Protocol (MCP)**: Open standardization for connecting foundation models to enterprise databases, internal tooling, and IDE environments.
- **Silicon Acceleration**: Next-generation semiconductor packaging tailored for low-latency reasoning token throughput.`,
    author: 'Julianne Reyes',
    category: 'ai-models',
    tags: ['AI', 'Reasoning Models', 'Autonomous Agents', 'Silicon'],
    readingTimeMinutes: 6,
    featuredImage: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80'
  };
}

// Auto-run on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  loadArticle(articleInfo);
});