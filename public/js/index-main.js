// public/js/index-main.js - Real-Time Homepage Intelligence & Breaking News Engine

// Helper function to safely extract properties
function getSafe(fn, defaultValue = '') {
  try {
    const value = fn();
    return value !== null && value !== undefined ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

// Master Taxonomy Resolver Dictionary
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
  'top-stories': { name: 'Top Tech Stories', nameHe: 'חדשות מובילות' }
};

// Category Badge Color Classifier
function getCategoryBadgeClass(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('chip') || cat.includes('שבב') || cat.includes('computing') || cat.includes('מחשוב') || cat.includes('חומרה') || cat.includes('hardware')) {
    return 'badge-chips';
  }
  if (cat.includes('dev') || cat.includes('פיתוח') || cat.includes('code') || cat.includes('קוד') || cat.includes('open-source')) {
    return 'badge-dev';
  }
  if (cat.includes('security') || cat.includes('סייבר') || cat.includes('cyber')) {
    return 'badge-security';
  }
  if (cat.includes('market') || cat.includes('שוק') || cat.includes('הון') || cat.includes('equity') || cat.includes('crypto') || cat.includes('ביטקוין')) {
    return 'badge-purple';
  }
  return 'badge-ai';
}

// Check if article belongs to current language (Hebrew vs English)
function isArticleInLanguage(article, isHePage) {
  if (!article) return false;

  if (article.language) {
    const lang = String(article.language).toLowerCase().trim();
    if (isHePage) {
      return lang === 'he' || lang === 'iw' || lang === 'hebrew';
    } else {
      return lang === 'en' || lang === 'english' || (!lang.startsWith('he') && !lang.startsWith('iw'));
    }
  }

  if (article.isHebrew !== undefined) {
    return isHePage ? Boolean(article.isHebrew) : !Boolean(article.isHebrew);
  }

  const sample = (article.title || '') + ' ' + (article.excerpt || '') + ' ' + (article.content || '').slice(0, 300);
  const hasHebrew = /[\u0590-\u05FF]/.test(sample);
  return isHePage ? hasHebrew : !hasHebrew;
}

// Universal human-readable category name resolver
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

// Ensure accurate reading time calculation
function ensureReadingTime(article) {
  if (!article.readingTimeMinutes || article.readingTimeMinutes <= 0) {
    const contentLength = (article.content || '').length;
    const wordsPerMinute = 200;
    const estimatedWords = contentLength / 5;
    article.readingTimeMinutes = Math.max(2, Math.ceil(estimatedWords / wordsPerMinute)) || 5;
  }
  return article;
}

// Global cached state for real-time snapshots
let heArticlesStore = new Map();
let enArticlesStore = new Map();
let realtimeListenersAttached = false;

// Master Real-Time Homepage Loader
function loadHomepageIntelligence() {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';

  if (window.ensureFirebaseInitialized) {
    window.ensureFirebaseInitialized();
  }

  const firestoreDb = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
  if (!firestoreDb) {
    setTimeout(loadHomepageIntelligence, 200);
    return;
  }

  // Render static spotlights / Bento once
  loadAutonomousAgentsSpotlight(isHe);
  loadBentoIntelligenceHubs(isHe);

  if (realtimeListenersAttached) return;
  realtimeListenersAttached = true;

  if (isHe) {
    // ── 1. Hebrew Real-Time Listener for `he_articles` ──────────────────────────
    try {
      firestoreDb.collection('he_articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .onSnapshot(snap => {
          if (snap) {
            snap.forEach(doc => {
              heArticlesStore.set(doc.id, ensureReadingTime({ id: doc.id, isHebrewDoc: true, ...doc.data() }));
            });
            snap.docChanges().forEach(change => {
              if (change.type === 'removed') {
                heArticlesStore.delete(change.doc.id);
              }
            });
            processAndRenderArticles(Array.from(heArticlesStore.values()), true);
          }
        }, err => {
          console.warn('Real-time he_articles note (fallback query):', err);
          firestoreDb.collection('he_articles').limit(30).onSnapshot(s => {
            if (s) {
              s.forEach(doc => {
                const d = doc.data();
                if (d.published) heArticlesStore.set(doc.id, ensureReadingTime({ id: doc.id, isHebrewDoc: true, ...d }));
              });
              processAndRenderArticles(Array.from(heArticlesStore.values()), true);
            }
          });
        });
    } catch (e) {
      console.warn('Error attaching he_articles listener:', e);
    }

    // ── 2. Hebrew Real-Time Listener for `articles` (where language == 'he') ───
    try {
      firestoreDb.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(30)
        .onSnapshot(snap => {
          if (snap) {
            snap.forEach(doc => {
              const d = doc.data();
              if (isArticleInLanguage(d, true)) {
                heArticlesStore.set(doc.id, ensureReadingTime({ id: doc.id, ...d }));
              }
            });
            processAndRenderArticles(Array.from(heArticlesStore.values()), true);
          }
        }, () => {});
    } catch (e) {}

  } else {
    // ── English Real-Time Listener for `articles` ──────────────────────────────
    try {
      firestoreDb.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(40)
        .onSnapshot(snap => {
          if (snap) {
            snap.forEach(doc => {
              const d = doc.data();
              if (d.published !== false && isArticleInLanguage(d, false)) {
                enArticlesStore.set(doc.id, ensureReadingTime({ id: doc.id, ...d }));
              }
            });
            snap.docChanges().forEach(change => {
              if (change.type === 'removed') {
                enArticlesStore.delete(change.doc.id);
              }
            });
            processAndRenderArticles(Array.from(enArticlesStore.values()), false);
          }
        }, err => {
          console.warn('Real-time en articles note:', err);
          firestoreDb.collection('articles').limit(40).onSnapshot(s => {
            if (s) {
              s.forEach(doc => {
                const d = doc.data();
                if (d.published !== false && isArticleInLanguage(d, false)) {
                  enArticlesStore.set(doc.id, ensureReadingTime({ id: doc.id, ...d }));
                }
              });
              processAndRenderArticles(Array.from(enArticlesStore.values()), false);
            }
          });
        });
    } catch (e) {
      console.warn('Error attaching en articles listener:', e);
    }
  }
}

// Process and re-render homepage sections when real-time data arrives
function processAndRenderArticles(rawArticles, isHe) {
  if (!rawArticles || rawArticles.length === 0) return;

  // Deduplicate and sort chronologically (newest first)
  const uniqueMap = new Map();
  rawArticles.forEach(a => {
    if (a && a.id && isArticleInLanguage(a, isHe)) {
      uniqueMap.set(a.id, a);
    }
  });

  const articles = Array.from(uniqueMap.values());
  articles.sort((a, b) => {
    const getTimestamp = (item) => {
      if (!item) return 0;
      if (item.createdAt?.toMillis) return item.createdAt.toMillis();
      if (item.createdAt?.toDate) return item.createdAt.toDate().getTime();
      if (item.createdAt?._seconds) return item.createdAt._seconds * 1000;
      if (typeof item.createdAt === 'number') return item.createdAt;
      if (typeof item.createdAt === 'string') {
        const t = new Date(item.createdAt).getTime();
        if (!isNaN(t)) return t;
      }
      return 0;
    };
    return getTimestamp(b) - getTimestamp(a);
  });

  if (articles.length === 0) return;

  // 1. Lead Hero Feature (Top Lead Headline)
  renderLeadHeroFeature(articles[0], isHe);

  // 2. Trending Top 4 (Top Right Column)
  renderTrendingTop4(articles.slice(1, 5), isHe);

  // 3. Featured Dispatches / מבזקים (Sub-Header 3-Column Grid)
  const dispatches = articles.slice(5, 8);
  if (dispatches.length > 0) {
    renderSecondaryDispatches(dispatches, isHe);
  }

  // 4. Latest Articles Feed Stream (Below Bento)
  const stream = articles.slice(8);
  renderLatestNewsStream(stream, isHe);

  // 5. Breaking News Flash Ticker Strip
  updateBreakingNewsTicker(articles, isHe);
}

// ── Update Breaking News / Dispatches Ticker Strip in Real-Time ───────────────
function updateBreakingNewsTicker(articles, isHe) {
  const tickerContent = document.querySelector('.ticker-content');
  if (!tickerContent || !articles || articles.length === 0) return;

  const topNews = articles.slice(0, 3);
  const flashItemsHtml = topNews.map((art, idx) => {
    const title = art.title || (isHe ? 'מבזק חדשות טכנולוגיה' : 'Breaking Tech Dispatch');
    const link = getArticleCleanUrl(art, isHe);
    const badgeText = idx === 0 ? (isHe ? 'מבזק חם' : 'BREAKING') : (isHe ? 'עדכון' : 'FLASH');
    return `
      <span class="ticker-item" style="cursor:pointer;" onclick="window.location.href='${link}'">
        <span class="ticker-badge" style="background:#E63946; color:#fff; font-weight:800;">${badgeText}</span>
        <span>${title}</span>
      </span>
    `;
  }).join('');

  // Find existing breaking news items or append
  const existingFlash = tickerContent.querySelectorAll('.ticker-breaking-news');
  if (existingFlash.length > 0) {
    existingFlash.forEach(el => el.remove());
  }

  const spanWrap = document.createElement('span');
  spanWrap.className = 'ticker-breaking-news';
  spanWrap.innerHTML = flashItemsHtml;
  tickerContent.appendChild(spanWrap);
}

// 1. Render Lead Hero Feature (Left 68% Column)
function renderLeadHeroFeature(article, isHe) {
  const container = document.getElementById('featured-article-container');
  if (!container || !article) return;

  const title = article.title || (isHe ? 'מבזק טכנולוגיה מוביל' : 'Breaking Tech Intelligence');
  const excerpt = article.excerpt || article.summary || (isHe ? 'קרא עוד על מחקר והתפתחויות טכנולוגיות...' : 'Inside the latest architectural shifts shaping technology...');
  const author = article.author || (isHe ? 'מערכת האתר' : 'Julianne Reyes');
  const readingTime = article.readingTimeMinutes || 6;
  const image = article.featuredImage || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80';
  const link = getArticleCleanUrl(article, isHe);
  const cat = resolveCategoryDisplayName(article.category, isHe, article);
  const badgeClass = getCategoryBadgeClass(article.category);

  container.innerHTML = `
    <article class="hero-lead-card" onclick="window.location.href='${link}'" style="cursor:pointer;">
      <div class="hero-bg-media">
        <img src="${image}" alt="${title}" loading="eager" onerror="this.src='https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&auto=format&fit=crop&q=80'" />
      </div>
      <div class="hero-overlay-shade"></div>
      <div class="hero-lead-content">
        <div class="hero-title-wrap">
          <div class="hero-red-bar"></div>
          <div class="hero-title-inner">
            <span class="badge ${badgeClass} mb-2">${cat}</span>
            <h1 class="hero-lead-title">
              <a href="${link}">${title}</a>
            </h1>
          </div>
        </div>
        <p class="hero-lead-excerpt">${excerpt}</p>
        <div class="hero-lead-meta">
          <span>${author}</span>
          <span>·</span>
          <span><i class="bi bi-clock me-1"></i>${readingTime} ${isHe ? 'דקות קריאה' : 'min read'}</span>
        </div>
      </div>
    </article>
  `;
}

// 2. Render Trending Top 4 List (Right 32% Column)
function renderTrendingTop4(articles, isHe) {
  const container = document.getElementById('trending-stories-list');
  if (!container || !articles || articles.length === 0) return;

  const numbers = ['01', '02', '03', '04'];
  let html = '';

  articles.slice(0, 4).forEach((art, index) => {
    const num = numbers[index] || `0${index + 1}`;
    const title = art.title || (isHe ? 'ידיעה טכנולוגית חמה' : 'Breaking Tech Dispatch');
    const author = art.author || (isHe ? 'מערכת האתר' : 'Staff');
    const link = getArticleCleanUrl(art, isHe);
    const cat = resolveCategoryDisplayName(art.category, isHe, art);
    const badgeClass = getCategoryBadgeClass(art.category);

    html += `
      <div class="trending-item" onclick="window.location.href='${link}'" style="cursor:pointer;">
        <span class="trending-num">${num}</span>
        <div class="trending-info">
          <div class="mb-1">
            <span class="badge ${badgeClass}">${cat}</span>
          </div>
          <a href="${link}" class="trending-title">${title}</a>
          <div class="trending-meta mt-1">
            <span>${author}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}
const renderTrendingStories = renderTrendingTop4;

// 3. Render Secondary 3-Column Dispatches (מבזקים)
function renderSecondaryDispatches(articles, isHe) {
  const container = document.getElementById('top-stories-container');
  if (!container || !articles || articles.length === 0) return;

  const pillVariants = [
    '<div class="triple-pill-indicator"><span class="pill pill-active"></span><span class="pill"></span><span class="pill"></span></div>',
    '<div class="triple-pill-indicator"><span class="pill"></span><span class="pill pill-active"></span><span class="pill"></span></div>',
    '<div class="triple-pill-indicator"><span class="pill"></span><span class="pill"></span><span class="pill pill-active"></span></div>'
  ];

  let html = '';
  articles.slice(0, 3).forEach((art, index) => {
    const title = art.title || (isHe ? 'ניתוח מעמיק' : 'Deep Technical Analysis');
    const excerpt = art.excerpt || art.summary || (isHe ? 'קרא עוד על מחקר והתפתחויות טכנולוגיות...' : 'Read full technology analysis and architectural breakdown...');
    const author = art.author || (isHe ? 'מערכת האתר' : 'TrendingTech');
    const image = art.featuredImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80';
    const link = getArticleCleanUrl(art, isHe);
    const cat = resolveCategoryDisplayName(art.category, isHe, art);
    const badgeClass = getCategoryBadgeClass(art.category);
    const pill = pillVariants[index % pillVariants.length];

    html += `
      <div class="col-12 col-md-4">
        <article class="dispatch-card" onclick="window.location.href='${link}'" style="cursor:pointer;">
          <div class="dispatch-media-wrap">
            <img src="${image}" alt="${title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'" />
            <span class="badge ${badgeClass} dispatch-category-badge">${cat}</span>
          </div>
          <div class="dispatch-body">
            ${pill}
            <h3 class="dispatch-title">
              <a href="${link}">${title}</a>
            </h3>
            <p class="dispatch-excerpt">${excerpt}</p>
            <div class="dispatch-meta">
              <span>${author}</span>
              <span><i class="bi bi-clock me-1"></i>${art.readingTimeMinutes || 4} ${isHe ? 'דקות' : 'min'}</span>
            </div>
          </div>
        </article>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 4. Render Latest Articles Feed Stream (Clean Editorial Cards)
function renderLatestNewsStream(articles, isHe) {
  const container = document.getElementById('latest-articles-stream') || document.getElementById('articles-container');
  if (!container || !articles || articles.length === 0) return;

  let html = '';
  articles.slice(0, 8).forEach(art => {
    const title = art.title || (isHe ? 'ללא כותרת' : 'Untitled');
    const excerpt = art.excerpt || art.summary || (isHe ? 'קרא עוד על מחקר והתפתחויות טכנולוגיות...' : 'Read full technology analysis and architectural breakdown...');
    const author = art.author || (isHe ? 'מערכת האתר' : 'Staff');
    const readingTime = art.readingTimeMinutes || 5;
    const date = art.createdAt?.toDate ? art.createdAt.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric' }) : 'Today';
    const image = art.featuredImage || 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80';
    const link = getArticleCleanUrl(art, isHe);
    const cat = resolveCategoryDisplayName(art.category, isHe, art);
    const badgeClass = getCategoryBadgeClass(art.category);

    html += `
      <article class="article-stream-card" onclick="window.location.href='${link}'" style="cursor:pointer;">
        <div class="article-stream-media">
          <img src="${image}" alt="${title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80'" />
        </div>
        <div class="article-stream-body">
          <div class="d-flex align-items-center gap-2 mb-2">
            <span class="badge ${badgeClass}">${cat}</span>
            <span class="text-muted" style="font-size:0.75rem; font-family:var(--font-mono);">${date}</span>
          </div>
          <h3 class="article-stream-title">
            <a href="${link}">${title}</a>
          </h3>
          <p class="article-stream-excerpt">${excerpt}</p>
          <div class="article-stream-meta">
            <span>${author}</span>
            <span>·</span>
            <span><i class="bi bi-clock me-1"></i>${readingTime} ${isHe ? 'דקות קריאה' : 'min read'}</span>
          </div>
        </div>
      </article>
    `;
  });

  container.innerHTML = html;
}

// 5. Spotlight: Autonomous Agents
function loadAutonomousAgentsSpotlight(isHe) {
  const container = document.getElementById('autonomous-agents-container');
  if (!container) return;

  const spotlightData = isHe ? [
    {
      title: 'סוכני קוד ו-Claude 3.7 Sonnet: מעבר מחיפוש להרצה אוטונומית',
      excerpt: 'ניתוח ארכיטקטורות Tool-Calling, פרוטוקול MCP והרצת קוד עצמאית בסביבות פיתוח מקומיות.',
      tag: 'סוכנים אוטונומיים',
      category: 'ai',
      slug: 'claude-3-7-sonnet-agentic-execution',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
    },
    {
      title: 'רשת סוכני בינה מלאכותית: תיאום משימות מקביליות ומנגנוני קונצנזוס',
      excerpt: 'כיצד ארגונים רב-לאומיים מיישמים מערכי סוכנים עצמאיים לניהול שרשראות אספקה ופיתוח תוכנה.',
      tag: 'ארכיטקטורת סוכנים',
      category: 'ai',
      slug: 'multi-agent-swarms-consensus',
      image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80'
    }
  ] : [
    {
      title: 'Claude 3.7 Sonnet & Autonomous Code Execution: Moving from Search to Action',
      excerpt: 'Deep breakdown of Tool-Calling architectures, the Model Context Protocol (MCP), and self-healing execution runs.',
      tag: 'Autonomous Agents',
      category: 'ai',
      slug: 'claude-3-7-sonnet-agentic-execution',
      image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
    },
    {
      title: 'Multi-Agent Swarm Coordination & Consensus Mechanisms in Enterprise Production',
      excerpt: 'How leading software architectures coordinate distributed agent teams with verifiable audit trails.',
      tag: 'Agent Swarms',
      slug: 'multi-agent-swarms-consensus',
      image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=800&auto=format&fit=crop&q=80'
    }
  ];

  let html = '<div class="row g-4">';
  spotlightData.forEach(item => {
    const link = getArticleCleanUrl(item, isHe);
    html += `
      <div class="col-12 col-md-6">
        <div class="dispatch-card" style="background:var(--bg-surface-elevated); border-color:var(--accent-red);">
          <div class="dispatch-media-wrap">
            <img src="${item.image}" alt="${item.title}" loading="lazy" />
            <span class="badge badge-ai" style="position:absolute; bottom:12px; inset-inline-start:12px;">${item.tag}</span>
          </div>
          <div class="dispatch-body">
            <h3 class="dispatch-title"><a href="${link}">${item.title}</a></h3>
            <p class="dispatch-excerpt">${item.excerpt}</p>
          </div>
        </div>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

// 6. Dynamic Bento Intelligence Hubs with Live Rotating Catalogs
const BENTO_AI_TOOLS_CATALOG = [
  {
    name: 'Claude 3.7 Sonnet',
    name_he: 'Claude 3.7 Sonnet',
    tagline: "Anthropic's hybrid reasoning model combining instantaneous response tokens with verified extended thinking.",
    tagline_he: 'מודל ההיסק ההיברידי של Anthropic המשלב חשיבה מהירה עם אימות שלבי היסק מתקדמים.',
    pricing: 'Freemium',
    pricing_he: 'חינם / פרימיום',
    score: '9.9',
    icon: '✨',
    slug: 'claude-3-7-sonnet'
  },
  {
    name: 'Cursor AI IDE',
    name_he: 'Cursor AI IDE',
    tagline: 'AI-native code editor built on VS Code with whole-codebase indexing, multi-file Composer, and autonomous linting.',
    tagline_he: 'עורך קוד מבוסס AI עם אינדוקס מלא של כל הקוד, מחולל קבצים רב-שכבתי ותיקון שגיאות אוטונומי.',
    pricing: 'Freemium',
    pricing_he: 'חינם / פרימיום',
    score: '9.8',
    icon: '⚡',
    slug: 'cursor-ai-ide'
  },
  {
    name: 'v0 by Vercel',
    name_he: 'v0 מבית Vercel',
    tagline: 'Generative UI development platform that turns natural language prompts into production React & Tailwind components.',
    tagline_he: 'פלטפורמת UI גנרטיבית הממירה פרומפטים בעברית ובאנגלית לקומפוננטות React ו-Tailwind מוכנות לפרודקשן.',
    pricing: 'Freemium',
    pricing_he: 'חינם / פרימיום',
    score: '9.7',
    icon: '🎨',
    slug: 'v0-vercel'
  },
  {
    name: 'Devin AI Engineer',
    name_he: 'Devin AI מהנדס תוכנה',
    tagline: 'Autonomous AI software engineer by Cognition Labs capable of building, testing, and debugging complex GitHub repositories.',
    tagline_he: 'מהנדס תוכנה אוטונומי המסוגל לתכנת, לבדוק ולתקן ריפוזיטורים שלמים ב-GitHub באופן עצמאי.',
    pricing: 'Enterprise',
    pricing_he: 'ארגוני',
    score: '9.6',
    icon: '🤖',
    slug: 'devin-ai-engineer'
  },
  {
    name: 'DeepSeek R1',
    name_he: 'DeepSeek R1',
    tagline: 'Open-weights reasoning model matching closed frontier benchmarks across mathematics, competitive coding, and logic.',
    tagline_he: 'מודל היסק בקוד פתוח המשתווה לביצועי המודלים המובילים בעולם במתמטיקה, קוד ולוגיקה מורכבת.',
    pricing: 'Open Source',
    pricing_he: 'קוד פתוח',
    score: '9.8',
    icon: '🧠',
    slug: 'deepseek-r1'
  }
];

const BENTO_DESIGN_SYSTEMS_CATALOG = [
  {
    name: 'NewsKit',
    name_he: 'NewsKit',
    company: 'News Corp',
    company_he: 'News Corp',
    tagline: 'The open-source design system powering WSJ, The Times, and The Sun with multi-brand theme token orchestration.',
    tagline_he: 'מערכת העיצוב בקוד פתוח המניעה את הוול סטריט ג׳ורנל והטיימס עם סנכרון טוקנים רב-מותגי.',
    framework: 'React · Tokens Studio',
    framework_he: 'React · Tokens Studio',
    colors: ['#090A0E', '#E63946', '#10B981', '#F4F6F9'],
    slug: 'newskit'
  },
  {
    name: 'Material Design 3',
    name_he: 'Material Design 3',
    company: 'Google',
    company_he: 'Google',
    tagline: "Google's open-source design system featuring dynamic color extraction, tonal palettes, and cross-platform tokens.",
    tagline_he: 'מערכת העיצוב של גוגל הכוללת הפקת צבעים דינמית, פלטות גוונים וטוקנים מותאמים לכל פלטפורמה.',
    framework: 'Flutter · Jetpack · Web',
    framework_he: 'Flutter · Jetpack · Web',
    colors: ['#6750A4', '#D0BCFF', '#625B71', '#CCC2DC'],
    slug: 'material-design-3'
  },
  {
    name: 'Carbon Design System',
    name_he: 'Carbon Design System',
    company: 'IBM',
    company_he: 'IBM',
    tagline: "IBM's open-source design system built with rigorous accessibility standards, data visualization patterns, and tokens.",
    tagline_he: 'מערכת העיצוב של IBM שנבנתה בסטנדרטים מחמירים של נגישות, ויזואליזציית נתונים וטוקנים.',
    framework: 'React · Vue · Web Components',
    framework_he: 'React · Vue · Web Components',
    colors: ['#0F62FE', '#393939', '#8D8D8D', '#F4F4F4'],
    slug: 'carbon'
  },
  {
    name: 'Apple Human Interface',
    name_he: 'Apple HIG',
    company: 'Apple',
    company_he: 'Apple',
    tagline: 'Spatial design paradigms, Liquid Glass surfaces, typography hierarchies, and tactile feedback patterns.',
    tagline_he: 'עקרונות עיצוב מרחבי, משטחי זכוכית נוזלית, היררכיית טיפוגרפיה ומשוב מגע ב-iOS ו-macOS.',
    framework: 'SwiftUI · UIKit · HIG',
    framework_he: 'SwiftUI · UIKit · HIG',
    colors: ['#0071E3', '#000000', '#F5F5F7', '#86868B'],
    slug: 'apple-hig'
  },
  {
    name: 'Polaris',
    name_he: 'Polaris',
    company: 'Shopify',
    company_he: 'Shopify',
    tagline: 'Design system designed for high-conversion commerce, merchant workflow ergonomics, and micro-interactions.',
    tagline_he: 'מערכת עיצוב לאתרי מסחר עתירי המרות, ארגונומיית עבודה לסוחרים ומיקרו-אינטראקציות.',
    framework: 'React · Polaris Tokens',
    framework_he: 'React · Polaris Tokens',
    colors: ['#008060', '#202223', '#F6F6F7', '#5C5F62'],
    slug: 'polaris'
  }
];

const BENTO_MARKETS_CATALOG = [
  {
    title: 'Tech Leaders Wishlist',
    title_he: 'רשימת המעקב של ענקיות הטק',
    desc: 'Automated watchlist tracking price action, P/E ratios, and enterprise revenue across semiconductor and AI foundries.',
    desc_he: 'רשימת מעקב אוטומטית אחר ביצועי מניות, מכפילי רווח והכנסות מפעלי שבבים ומאיצי AI.',
    badge: 'Market Watch',
    badge_he: 'שוק ההון',
    count: '48 Equities',
    count_he: '48 מניות מובילות',
    icon: 'bi-graph-up',
    link: '/stock-data.html',
    link_he: '/he/shuk-hon.html'
  },
  {
    title: 'AI Foundry & Silicon Titans',
    title_he: 'ענקיות השבבים והתשתיות',
    desc: 'Live tracking NVDA, TSM, ASML, AMD & AVGO wafer allocation, gross margins, and next-gen node roadmaps.',
    desc_he: 'מעקב חי אחר מניות אנבידיה, TSMC, ASML, אינטל ומפת הדרכים למפעלי 2 ננומטר.',
    badge: 'Semiconductors',
    badge_he: 'שבבים ומוליכים',
    count: 'NVDA · TSM · ASML',
    count_he: 'NVDA · TSM · ASML',
    icon: 'bi-cpu',
    link: '/stock-data.html',
    link_he: '/he/shuk-hon.html'
  },
  {
    title: 'Hyperscale Cloud & Infrastructure',
    title_he: 'תשתיות ענן ודאטה סנטרס',
    desc: 'Financial velocity tracking Microsoft Azure, Google Cloud, and Amazon AWS enterprise Capex deployment.',
    desc_he: 'מעקב אחר השקעות עתק בחוות שרתים ומרכזי נתונים של מיקרוסופט, גוגל ואמזון.',
    badge: 'Cloud Giants',
    badge_he: 'ענקיות הענן',
    count: 'MSFT · GOOGL · AMZN',
    count_he: 'MSFT · GOOGL · AMZN',
    icon: 'bi-cloud-check',
    link: '/stock-data.html',
    link_he: '/he/shuk-hon.html'
  }
];

let bentoCurrentAiIndex = 0;
let bentoCurrentDsIndex = 0;
let bentoCurrentMarketIndex = 0;
let bentoRotationTimer = null;

function loadBentoIntelligenceHubs(isHe) {
  const grid = document.getElementById('bento-intelligence-grid');
  if (!grid) return;

  function renderBentoCards(aiItem, dsItem, marketItem) {
    const aiCard = document.getElementById('bento-ai-tool-card');
    const dsCard = document.getElementById('bento-ds-card');
    const marketCard = document.getElementById('bento-market-card');

    // 1. AI Tool Card Update
    if (aiCard && aiItem) {
      const titleEl = document.getElementById('bento-ai-title');
      const descEl = document.getElementById('bento-ai-desc');
      const pricingEl = document.getElementById('bento-ai-pricing');
      const ratingEl = document.getElementById('bento-ai-rating');
      const iconEl = document.getElementById('bento-ai-icon');
      const linkEl = document.getElementById('bento-ai-link');

      const toolTitle = isHe ? (aiItem.name_he || aiItem.name) : aiItem.name;
      const toolDesc = isHe ? (aiItem.tagline_he || aiItem.description_he || aiItem.tagline || aiItem.description) : (aiItem.tagline || aiItem.description);
      const toolPricing = isHe ? (aiItem.pricing_he || aiItem.pricing || 'חינם / פרימיום') : (aiItem.pricing || 'Freemium');
      const toolScore = aiItem.score || '9.8';
      const toolSlug = aiItem.slug || 'ai-tools';
      const toolLink = isHe ? `/he/ai-tools-detail.html?tool=${encodeURIComponent(toolSlug)}` : `/ai-tools-detail.html?tool=${encodeURIComponent(toolSlug)}`;

      if (titleEl) titleEl.textContent = toolTitle;
      if (descEl) descEl.textContent = toolDesc;
      if (pricingEl) pricingEl.textContent = toolPricing;
      if (ratingEl) ratingEl.textContent = isHe ? `ציון: ${toolScore}/10` : `Rating: ${toolScore}/10`;
      if (iconEl && aiItem.icon) iconEl.textContent = aiItem.icon;
      if (linkEl) {
        linkEl.href = toolLink;
        linkEl.textContent = isHe ? 'צפה במפרט' : 'View Spec';
      }
    }

    // 2. Design System Card Update
    if (dsCard && dsItem) {
      const dsTitleEl = document.getElementById('bento-ds-title');
      const dsDescEl = document.getElementById('bento-ds-desc');
      const dsFrameworkEl = document.getElementById('bento-ds-framework');
      const dsLinkEl = document.getElementById('bento-ds-link');
      const swatchesEl = document.getElementById('bento-ds-swatches');

      const dsTitle = isHe ? (dsItem.name_he || dsItem.name) : dsItem.name;
      const dsCompany = isHe ? (dsItem.company_he || dsItem.company || '') : (dsItem.company || '');
      const fullDsTitle = dsCompany ? `${dsTitle} (${dsCompany})` : dsTitle;
      const dsDesc = isHe ? (dsItem.tagline_he || dsItem.description_he || dsItem.tagline || dsItem.description) : (dsItem.tagline || dsItem.description);
      const dsFramework = isHe ? (dsItem.framework_he || dsItem.framework || 'React · Design Tokens') : (dsItem.framework || 'React · Design Tokens');
      const dsSlug = dsItem.slug || 'design-systems';
      const dsLink = isHe ? `/he/design-systems-detail.html?slug=${encodeURIComponent(dsSlug)}` : `/design-systems-detail.html?slug=${encodeURIComponent(dsSlug)}`;

      if (dsTitleEl) dsTitleEl.textContent = fullDsTitle;
      if (dsDescEl) dsDescEl.textContent = dsDesc;
      if (dsFrameworkEl) dsFrameworkEl.textContent = dsFramework;
      if (dsLinkEl) {
        dsLinkEl.href = dsLink;
        dsLinkEl.textContent = isHe ? 'קרא ניתוח' : 'Read Review';
      }

      if (swatchesEl && Array.isArray(dsItem.colors) && dsItem.colors.length > 0) {
        swatchesEl.innerHTML = dsItem.colors.slice(0, 4).map(c => 
          `<span class="ds-swatch-dot" style="background:${c};"></span>`
        ).join('');
      }
    }

    // 3. Market Watch Spotlight Card Update
    if (marketCard && marketItem) {
      const mTitleEl = document.getElementById('bento-market-title');
      const mDescEl = document.getElementById('bento-market-desc');
      const mCountEl = document.getElementById('bento-market-count');
      const mBadgeEl = marketCard.querySelector('.badge');
      const mLinkEl = marketCard.querySelector('.ai-tool-footer a');

      const mTitle = isHe ? (marketItem.title_he || marketItem.title) : marketItem.title;
      const mDesc = isHe ? (marketItem.desc_he || marketItem.desc) : marketItem.desc;
      const mCount = isHe ? (marketItem.count_he || marketItem.count) : marketItem.count;
      const mBadge = isHe ? (marketItem.badge_he || marketItem.badge) : marketItem.badge;
      const mLink = isHe ? (marketItem.link_he || marketItem.link) : marketItem.link;

      if (mTitleEl) mTitleEl.textContent = mTitle;
      if (mDescEl) mDescEl.textContent = mDesc;
      if (mCountEl) mCountEl.textContent = mCount;
      if (mBadgeEl) mBadgeEl.textContent = mBadge;
      if (mLinkEl) {
        mLinkEl.href = mLink;
        mLinkEl.textContent = isHe ? 'פתח לוח נתונים' : 'Open Board';
      }
    }
  }

  // Initial render
  renderBentoCards(
    BENTO_AI_TOOLS_CATALOG[bentoCurrentAiIndex],
    BENTO_DESIGN_SYSTEMS_CATALOG[bentoCurrentDsIndex],
    BENTO_MARKETS_CATALOG[bentoCurrentMarketIndex]
  );

  // Auto-rotate every 7.5 seconds
  if (bentoRotationTimer) clearInterval(bentoRotationTimer);
  bentoRotationTimer = setInterval(() => {
    bentoCurrentAiIndex = (bentoCurrentAiIndex + 1) % BENTO_AI_TOOLS_CATALOG.length;
    bentoCurrentDsIndex = (bentoCurrentDsIndex + 1) % BENTO_DESIGN_SYSTEMS_CATALOG.length;
    bentoCurrentMarketIndex = (bentoCurrentMarketIndex + 1) % BENTO_MARKETS_CATALOG.length;

    // Smooth subtle transition
    [document.getElementById('bento-ai-tool-card'), document.getElementById('bento-ds-card'), document.getElementById('bento-market-card')].forEach(card => {
      if (card) {
        card.style.opacity = '0.75';
        card.style.transition = 'opacity 0.25s ease';
      }
    });

    setTimeout(() => {
      renderBentoCards(
        BENTO_AI_TOOLS_CATALOG[bentoCurrentAiIndex],
        BENTO_DESIGN_SYSTEMS_CATALOG[bentoCurrentDsIndex],
        BENTO_MARKETS_CATALOG[bentoCurrentMarketIndex]
      );
      [document.getElementById('bento-ai-tool-card'), document.getElementById('bento-ds-card'), document.getElementById('bento-market-card')].forEach(card => {
        if (card) card.style.opacity = '1';
      });
    }, 250);
  }, 7500);

  // Optional: Merge real Firestore published items if available
  const firestoreDb = window.db || (typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null);
  if (firestoreDb) {
    firestoreDb.collection('ai_tools').limit(5).get().then(snap => {
      if (!snap.empty) {
        snap.forEach(doc => {
          const d = doc.data();
          if (d.published !== false) {
            BENTO_AI_TOOLS_CATALOG.unshift({ id: doc.id, ...d });
          }
        });
      }
    }).catch(() => {});

    firestoreDb.collection('design_systems').limit(5).get().then(snap => {
      if (!snap.empty) {
        snap.forEach(doc => {
          const d = doc.data();
          if (d.published !== false) {
            BENTO_DESIGN_SYSTEMS_CATALOG.unshift({ id: doc.id, ...d });
          }
        });
      }
    }).catch(() => {});
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadHomepageIntelligence();
});