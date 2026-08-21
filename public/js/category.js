// public/js/category.js - Universal Category Architecture for TrendingTech Daily

// Make functions globally accessible
window.loadCategory = loadCategory;
window.loadCategoryArticles = loadCategoryArticles;

// Helper function
function getSafe(fn, defaultValue = '') {
  try {
    const value = fn();
    return value !== null && value !== undefined ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Master Taxonomy Resolver
const KNOWN_TAXONOMY = {
  'ai': {
    name: 'Artificial Intelligence',
    nameHe: 'בינה מלאכותית',
    description: 'Latest breakthroughs in large language models, multimodal reasoning systems, deep learning architectures, and agentic workflows.',
    descriptionHe: 'ההתפתחויות והחידושים האחרונים במודלי שפה גדולים, מערכות היסק רב-מודאליות, ארכיטקטורות למידה עמוקה וסוכנים אוטונומיים.',
    tagClass: 'badge-ai'
  },
  'ai-models': {
    name: 'Reasoning Models & LLMs',
    nameHe: 'מודלי היסק ו-LLM',
    description: 'Deep architectural dives into test-time compute scaling, verifiable chain-of-thought tokens, and foundation model benchmarks.',
    descriptionHe: 'ניתוחים מעמיקים של ארכיטקטורות חישוב בזמן מבחן, מודלי היסק מתקדמים ומבחני ביצועים של מודלי תשתית.',
    tagClass: 'badge-ai'
  },
  'autonomous-agents': {
    name: 'Autonomous AI Agents',
    nameHe: 'סוכנים אוטונומיים',
    description: 'Autonomous execution pipelines, tool-calling swarms, multi-agent coordination frameworks, and enterprise runtime environments.',
    descriptionHe: 'צינורות הרצה אוטונומיים, סביבות ריבוי סוכנים, חיבורי כלים (Tool-calling) ותשתיות סוכנים בארגונים.',
    tagClass: 'badge-ai'
  },
  'dev': {
    name: 'Developer Tools & Architecture',
    nameHe: 'פיתוח תוכנה',
    description: 'Next-gen toolchains, compiler innovations, agentic IDEs, web runtimes, and high-performance software engineering patterns.',
    descriptionHe: 'סביבות פיתוח מבוססות AI, קומפיילרים חדישים, ארכיטקטורת תוכנה וביצועים של מערכות קוד פתוח.',
    tagClass: 'badge-dev'
  },
  'computing': {
    name: 'Computing & Hardware',
    nameHe: 'מחשוב וחומרה',
    description: 'Semiconductor scaling, datacenter superclusters, optical interconnects, serverless hardware, and quantum processors.',
    descriptionHe: 'טכנולוגיות שבבים, אשכולות שרתים עתירי עיבוד, חיבורים אופטיים מהירים ומחשוב קוונטי.',
    tagClass: 'badge-chips'
  },
  'chips': {
    name: 'Silicon & Foundries',
    nameHe: 'שבבים ומפעלי ייצור',
    description: 'Advanced packaging, TSMC/Intel/NVIDIA wafer yields, sub-2nm nodes, EUV lithography, and sovereign chip supply chains.',
    descriptionHe: 'ייצור שבבים בתהליכי 2nm ומטה, נתוני תפוקה במפעלי ייצור, ליתוגרפיה מתקדמת ושרשראות אספקה גלובליות.',
    tagClass: 'badge-chips'
  },
  'markets': {
    name: 'Tech Equities & Markets',
    nameHe: 'שוק ההון ומניות',
    description: 'Financial analysis, public tech company earnings, semiconductor valuation multiples, and market momentum indicators.',
    descriptionHe: 'ניתוח מניות טכנולוגיה מובילות, דוחות רווח והפסד, מדדי תעשיית השבבים ומגמות בוול סטריט.',
    tagClass: 'badge-chips'
  },
  'startups': {
    name: 'VC & Tech Startups',
    nameHe: 'סטארטאפים והון סיכון',
    description: 'Venture funding trends, AI unicorn valuations, seed rounds, growth acceleration, and founder post-mortems.',
    descriptionHe: 'גיוסי הון סיכון, סטארטאפים בתחום ה-AI, חברות יוניקורן ומגמות בהשקעות טכנולוגיות.',
    tagClass: 'badge-ai'
  },
  'cybersecurity': {
    name: 'Cybersecurity & Defense',
    nameHe: 'סייבר ואבטחה',
    description: 'Zero-day vulnerability tracking, post-quantum cryptographic standards, cloud defense posture, and autonomous threat mitigation.',
    descriptionHe: 'חקר חולשות אבטחה, הצפנה פוסט-קוונטית, אבטחת ענן והגנה מבוססת מערכות למידה.',
    tagClass: 'badge-security'
  },
  'security': {
    name: 'Cybersecurity & Defense',
    nameHe: 'סייבר ואבטחה',
    description: 'Zero-day vulnerability tracking, post-quantum cryptographic standards, cloud defense posture, and autonomous threat mitigation.',
    descriptionHe: 'חקר חולשות אבטחה, הצפנה פוסט-קוונטית, אבטחת ענן והגנה מבוססת מערכות למידה.',
    tagClass: 'badge-security'
  },
  'top-stories': {
    name: 'Top Tech Stories',
    nameHe: 'חדשות מובילות',
    description: 'The most impactful technology stories, major corporate shifts, breakthrough research papers, and breaking dispatches.',
    descriptionHe: 'הידיעות המשפיעות ביותר בעולם הטכנולוגיה, מחקרים פורצי דרך ועדכונים שוטפים בזמן אמת.',
    tagClass: 'badge-ai'
  },
  'gadgets': {
    name: 'Consumer Tech & Hardware',
    nameHe: 'גאדגטים וחומרה',
    description: 'Spatial computing, smart wearables, next-gen display tech, and consumer electronics teardowns.',
    descriptionHe: 'מכשירי מחשוב מרחבי, מחשוב לביש, מסכי הדור הבא וגאדגטים טכנולוגיים מתקדמים.',
    tagClass: 'badge-dev'
  }
};

// Universal human-readable category name resolver (No raw IDs)
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

// Load category data
function loadCategory(slug) {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const cleanSlug = (slug || '').toLowerCase().trim();

  const taxonomyItem = KNOWN_TAXONOMY[cleanSlug] || {
    name: cleanSlug ? cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1) : 'Technology',
    nameHe: cleanSlug || 'חדשות טכנולוגיה',
    description: 'Curated technology articles and dispatches from TrendingTech Daily.',
    descriptionHe: 'מאמרים וניתוחים טכנולוגיים מקיפים מבית TrendingTech Daily.',
    tagClass: 'badge-ai'
  };

  const displayName = isHe ? (taxonomyItem.nameHe || taxonomyItem.name) : taxonomyItem.name;
  const displayDesc = isHe ? (taxonomyItem.descriptionHe || taxonomyItem.description) : taxonomyItem.description;

  document.title = `${displayName} — TrendingTech Daily`;

  const categoryTitle = document.getElementById('category-title');
  if (categoryTitle) categoryTitle.textContent = displayName;

  const categoryDesc = document.getElementById('category-description');
  if (categoryDesc) categoryDesc.textContent = displayDesc;

  const categoryBadge = document.getElementById('category-badge');
  if (categoryBadge) {
    categoryBadge.textContent = isHe ? 'ארכיון נושא' : 'TOPIC ARCHIVE';
    categoryBadge.className = `badge ${taxonomyItem.tagClass || 'badge-ai'}`;
  }

  // Load articles from Firestore
  loadCategoryArticles(cleanSlug, taxonomyItem);

  // Load sidebar items
  loadCategorySidebar(isHe);
}

// Load articles for category with language filter & real Firestore collections
async function loadCategoryArticles(categorySlug, taxonomyItem) {
  const container = document.getElementById('articles-container');
  if (!container) return;

  if (typeof db === 'undefined' && typeof window.db === 'undefined') {
    setTimeout(() => loadCategoryArticles(categorySlug, taxonomyItem), 200);
    return;
  }

  const firestoreDb = window.db || db;
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';

  try {
    const allArticles = [];
    const seenIds = new Set();

    if (isHe) {
      // 1. Fetch from he_articles
      try {
        const heSnap = await firestoreDb.collection('he_articles')
          .orderBy('createdAt', 'desc')
          .limit(40)
          .get();

        heSnap.forEach(doc => {
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            allArticles.push({ id: doc.id, isHebrewDoc: true, ...doc.data() });
          }
        });
      } catch (err) {
        console.warn('he_articles query warning:', err);
      }

      // 2. Also fetch from articles where language == 'he'
      try {
        const artSnap = await firestoreDb.collection('articles')
          .where('published', '==', true)
          .limit(30)
          .get();

        artSnap.forEach(doc => {
          const d = doc.data();
          const sample = (d.title || '') + ' ' + (d.content || '');
          const isHebrew = d.language === 'he' || d.isHebrew || /[\u0590-\u05FF]/.test(sample);
          if (isHebrew && !seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            allArticles.push({ id: doc.id, ...d });
          }
        });
      } catch (e) {
        console.warn('articles query warning:', e);
      }

    } else {
      // English category articles with resilient multi-tier fallback
      let snap;
      try {
        snap = await firestoreDb.collection('articles')
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();
      } catch (e1) {
        try {
          snap = await firestoreDb.collection('articles')
            .where('published', '==', true)
            .limit(50)
            .get();
        } catch (e2) {
          snap = await firestoreDb.collection('articles')
            .limit(50)
            .get();
        }
      }

      if (snap && !snap.empty) {
        snap.forEach(doc => {
          const d = doc.data();
          if (d.published !== false && !seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            allArticles.push({ id: doc.id, ...d });
          }
        });
      }
    }

    // Sort all articles chronologically descending (NEWEST FIRST)
    allArticles.sort((a, b) => {
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

    if (allArticles.length === 0) {
      renderFallbackCategoryArticles(container, categorySlug, taxonomyItem, isHe);
      return;
    }

    // Filter by category relevance
    let matching = allArticles.filter(art => {
      if (!categorySlug || categorySlug === 'all' || categorySlug === 'top-stories') return true;
      const cat = String(art.category || '').toLowerCase();
      const section = String(art.section || '').toLowerCase();
      const tags = Array.isArray(art.tags) ? art.tags.map(t => String(t).toLowerCase()) : [];
      const title = String(art.title || '').toLowerCase();
      
      return cat.includes(categorySlug) || 
             section.includes(categorySlug) ||
             tags.includes(categorySlug) || 
             title.includes(categorySlug);
    });

    // If specific filter yielded 0 results, show recent articles so page is never empty
    if (matching.length === 0) {
      matching = allArticles.slice(0, 8);
    }

    renderArticlesGrid(container, matching, isHe, taxonomyItem);

  } catch (err) {
    console.error('Error in loadCategoryArticles:', err);
    renderFallbackCategoryArticles(container, categorySlug, taxonomyItem, isHe);
  }
}

// Render dynamic article cards matching Figma Tech News tokens
function renderArticlesGrid(container, articles, isHe, taxonomyItem) {
  if (!articles || articles.length === 0) {
    container.innerHTML = `<p class="text-center text-muted my-4">${isHe ? 'לא נמצאו מאמרים בקטגוריה זו.' : 'No articles found in this category.'}</p>`;
    return;
  }

  let html = '<div class="row g-4">';
  articles.forEach(art => {
    const title = art.title || (isHe ? 'ללא כותרת' : 'Untitled');
    const excerpt = art.excerpt || art.summary || (isHe ? 'קרא עוד על מחקר והתפתחויות טכנולוגיות...' : 'Read full technology analysis and architectural breakdown...');
    const author = art.author || (isHe ? 'מערכת האתר' : 'TrendingTech Editorial');
    const readingTime = art.readingTimeMinutes || Math.max(3, Math.ceil((art.content || '').length / 1000)) || 5;
    const date = art.createdAt?.toDate ? art.createdAt.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '2026';
    const image = art.featuredImage || 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80';
    const slug = art.slug || art.id;
    const artId = art.id || '';
    const link = getArticleCleanUrl(art, isHe);
    const badgeClass = taxonomyItem?.tagClass || 'badge-ai';
    const categoryLabel = resolveCategoryDisplayName(art.category, isHe, art);

    html += `
      <div class="col-12 col-md-6 mb-3">
        <article class="card h-100" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden; transition:transform 0.15s ease, border-color 0.15s ease;">
          <div style="position:relative; aspect-ratio:16/9; overflow:hidden; background:#000;">
            <a href="${link}" style="display:block; width:100%; height:100%;">
              <img src="${image}" alt="${title}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.3s ease;" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80'">
            </a>
            <span class="badge ${badgeClass}" style="position:absolute; bottom:12px; inset-inline-start:12px;">${categoryLabel}</span>
          </div>
          <div class="card-body p-4 d-flex flex-column justify-content-between">
            <div>
              <h3 style="font-family:var(--font-display); font-size:1.45rem; font-weight:800; line-height:1.2; margin-bottom:0.75rem;">
                <a href="${link}" style="color:var(--text-main); text-decoration:none;">${title}</a>
              </h3>
              <p style="color:var(--text-secondary); font-size:0.925rem; line-height:1.6; margin-bottom:1.25rem;">${excerpt}</p>
            </div>
            <div class="d-flex align-items-center justify-content-between text-muted" style="font-size:0.8125rem; font-family:var(--font-mono); border-top:1px solid var(--border-color); padding-top:0.75rem;">
              <span>${author}</span>
              <span><i class="bi bi-clock me-1"></i>${readingTime} ${isHe ? 'דקות' : 'min'}</span>
            </div>
          </div>
        </article>
      </div>
    `;
  });
  html += '</div>';

  container.innerHTML = html;
}

// Load sidebar recent articles and category list
async function loadCategorySidebar(isHe) {
  const recentContainer = document.getElementById('recent-articles-list');
  const catContainer = document.getElementById('categories-list');

  // Populate categories list
  if (catContainer) {
    let catHtml = '';
    Object.entries(KNOWN_TAXONOMY).slice(0, 6).forEach(([key, item]) => {
      const name = isHe ? item.nameHe : item.name;
      const url = isHe ? `/he/category.html?slug=${key}` : `/category.html?slug=${key}`;
      catHtml += `<li><a href="${url}" class="d-flex justify-content-between align-items-center text-muted"><span class="text-main fw-bold">${name}</span><span class="badge ${item.tagClass}">HOT</span></a></li>`;
    });
    catContainer.innerHTML = catHtml;
  }

  // Populate recent articles list
  if (recentContainer) {
    const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);
    if (!firestoreDb) return;

    try {
      const collection = isHe ? 'he_articles' : 'articles';
      const snap = await firestoreDb.collection(collection).orderBy('createdAt', 'desc').limit(5).get();
      if (!snap.empty) {
        let recHtml = '';
        snap.forEach(doc => {
          const d = doc.data();
          const title = d.title || (isHe ? 'כתבה חדשה' : 'Recent Article');
          const link = getArticleCleanUrl({ id: doc.id, slug: d.slug, category: d.category }, isHe);
          recHtml += `
            <li class="mb-2 pb-2 border-bottom" style="border-color:var(--border-color) !important;">
              <a href="${link}" style="color:var(--text-main); font-size:0.9rem; font-weight:600; text-decoration:none; line-height:1.3; display:block;">
                ${title}
              </a>
            </li>
          `;
        });
        recentContainer.innerHTML = recHtml;
      }
    } catch (e) {
      console.warn('Error loading sidebar recent articles:', e);
    }
  }
}

// Fallback articles in respective language
function renderFallbackCategoryArticles(container, categorySlug, taxonomyItem, isHe) {
  const fallbackList = isHe ? [
    {
      title: 'הדור הבא של מודלי היסק: שילוב חשיבה רב-שלבית וסוכנים אוטונומיים',
      excerpt: 'ניתוח מעמיק של התפתחות מודלי שפה מתקדמים, הרצת חישובים בזמן מבחן והשפעתם על שוק התוכנה והתשתיות.',
      author: 'מערכת TrendingTech',
      readingTimeMinutes: 6,
      slug: 'reasoning-models-advancements-he',
      category: 'ai',
      featuredImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80'
    },
    {
      title: 'ייצור שבבים בתהליכי 2 ננומטר: תפוקות ייצור וביקוש עולמי למאיצי AI',
      excerpt: 'כיצד מפעלי הייצור המובילים מעלים את קצב הייצור של מאיצי למידה עמוקה ומעבדים גרפיים עבור מרכזי נתונים.',
      author: 'מערכת החדשות',
      readingTimeMinutes: 5,
      slug: 'sub-2nm-foundry-scaling-he',
      category: 'chips',
      featuredImage: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80'
    }
  ] : [
    {
      title: 'Next-Generation Test-Time Compute Scaling: Beyond Pretraining Plateaus',
      excerpt: 'An architectural investigation into reasoning models, chain-of-thought verification, and autonomous agent systems.',
      author: 'Julianne Reyes',
      readingTimeMinutes: 7,
      slug: 'next-gen-test-time-compute',
      category: 'ai',
      featuredImage: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=800&auto=format&fit=crop&q=80'
    }
  ];

  renderArticlesGrid(container, fallbackList, isHe, taxonomyItem);
}

// Auto-run on load
document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug') || urlParams.get('category') || 'ai';
  loadCategory(slug);
});