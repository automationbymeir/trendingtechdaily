// js/search.js — Resilient Full-Text Search Engine for TrendingTech Daily (Figma Tech News Design System)

document.addEventListener('DOMContentLoaded', () => {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const articleBaseUrl = isHe ? '/he/article.html' : '/article.html';

  const searchInput = document.getElementById('searchInput');
  const searchQueryDisplay = document.getElementById('searchQueryDisplay');
  const searchResultsDiv = document.getElementById('searchResults');
  const searchMeta = document.getElementById('searchMeta');
  const resultCount = document.getElementById('resultCount');
  const searchPageForm = document.getElementById('searchPageForm');

  const aiSummarySection = document.getElementById('aiSummarySection');
  const aiSummaryContent = document.getElementById('aiSummaryContent');
  const trendingTopicsList = document.getElementById('trendingTopicsList');
  const categoryFilter = document.getElementById('categoryFilter');
  const sortFilter = document.getElementById('sortFilter');

  let currentResults = [];
  let currentQuery = '';

  const getDb = () => (typeof firebase !== 'undefined' && firebase.firestore) ? firebase.firestore() : null;

  // Initialize search engine
  function initSearch() {
    const db = getDb();
    if (!db) {
      setTimeout(initSearch, 150);
      return;
    }

    // Check for query in URL
    const urlParams = new URLSearchParams(window.location.search);
    const queryFromUrl = urlParams.get('q');

    if (queryFromUrl) {
      if (searchInput) searchInput.value = queryFromUrl;
      performSearch(queryFromUrl);
    }

    loadTrendingTopics();
  }

  // Master Search Execution
  async function performSearch(query, filters = {}) {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      if (searchResultsDiv) {
        searchResultsDiv.innerHTML = `
          <div class="text-center py-5">
            <i class="bi bi-search" style="font-size: 3rem; color: var(--text-faint);"></i>
            <h3 class="mt-3" style="font-size:1.25rem; font-weight:700; color:var(--text-main);">${isHe ? 'התחילו בחיפוש' : 'Start Your Search'}</h3>
            <p class="text-muted" style="font-size:0.9rem;">${isHe ? 'הזינו מילת מפתח או נושא למעלה כדי למצוא כתבות ומאמרים רלוונטיים.' : 'Enter a keyword or topic above to discover articles and intelligence briefings.'}</p>
          </div>
        `;
      }
      if (searchMeta) searchMeta.style.display = 'none';
      if (aiSummarySection) aiSummarySection.style.display = 'none';
      return;
    }

    currentQuery = trimmed;
    if (searchQueryDisplay) searchQueryDisplay.textContent = trimmed;
    document.title = `${trimmed} — ${isHe ? 'תוצאות חיפוש' : 'Search Results'} — TrendingTech Daily`;

    if (searchResultsDiv) {
      searchResultsDiv.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-danger" role="status" style="width: 2.5rem; height: 2.5rem;"></div>
          <p class="text-muted mt-3" style="font-family:var(--font-mono); font-size:0.875rem;">${isHe ? 'מחפש במאגר הכתבות והטכנולוגיה...' : 'Searching technology intelligence base...'}</p>
        </div>
      `;
    }

    if (aiSummarySection) aiSummarySection.style.display = 'none';

    const db = getDb();
    if (!db) return;

    try {
      const candidates = [];
      const seenIds = new Set();

      if (isHe) {
        // 1. Query Hebrew articles collection
        try {
          const heSnap = await db.collection('he_articles').limit(80).get();
          heSnap.forEach(doc => {
            if (!seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              candidates.push({ id: doc.id, isHebrewDoc: true, ...doc.data() });
            }
          });
        } catch (e) {
          console.warn('Search he_articles query:', e);
        }

        // 2. Query articles collection for Hebrew
        try {
          const artSnap = await db.collection('articles').limit(60).get();
          artSnap.forEach(doc => {
            const d = doc.data();
            const sample = (d.title || '') + ' ' + (d.content || '');
            if ((d.language === 'he' || /[\u0590-\u05FF]/.test(sample)) && !seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              candidates.push({ id: doc.id, ...d });
            }
          });
        } catch (e) {}

      } else {
        // Query English articles collection
        try {
          const artSnap = await db.collection('articles').limit(80).get();
          artSnap.forEach(doc => {
            const d = doc.data();
            if (d.published !== false && !seenIds.has(doc.id)) {
              seenIds.add(doc.id);
              candidates.push({ id: doc.id, ...d });
            }
          });
        } catch (e) {
          console.warn('Search articles query:', e);
        }
      }

      // Keyword Scoring Algorithm
      const searchTerms = trimmed.toLowerCase().split(/\s+/).filter(t => t.length > 1);
      const exactPhrase = trimmed.toLowerCase();

      const matchedArticles = [];

      candidates.forEach(art => {
        const title = (art.title || '').toLowerCase();
        const excerpt = (art.excerpt || '').toLowerCase();
        const content = (art.content || '').replace(/<[^>]+>/g, ' ').toLowerCase();
        const category = (art.category || art.categoryName || '').toLowerCase();
        const tags = Array.isArray(art.tags) ? art.tags.map(t => String(t).toLowerCase()) : [];

        let score = 0;

        // Exact full phrase match
        if (title.includes(exactPhrase)) score += 100;
        if (excerpt.includes(exactPhrase)) score += 50;
        if (tags.some(t => t === exactPhrase)) score += 40;
        if (content.includes(exactPhrase)) score += 20;

        // Individual term matches
        searchTerms.forEach(term => {
          if (title.includes(term)) score += 30;
          if (excerpt.includes(term)) score += 15;
          if (tags.some(t => t.includes(term))) score += 20;
          if (category.includes(term)) score += 15;
          if (content.includes(term)) score += 5;
        });

        if (score > 0) {
          matchedArticles.push({
            ...art,
            searchScore: score
          });
        }
      });

      // Populate Category Filter Dropdown
      populateCategoryFilter(matchedArticles);

      // Apply User Filters
      let filtered = [...matchedArticles];
      const activeCategory = filters.category || (categoryFilter ? categoryFilter.value : '');
      const activeSort = filters.sort || (sortFilter ? sortFilter.value : 'relevance');

      if (activeCategory) {
        filtered = filtered.filter(a => {
          const cat = String(a.category || a.categoryName || '').toLowerCase();
          return cat === activeCategory.toLowerCase();
        });
      }

      // Sorting
      if (activeSort === 'date') {
        filtered.sort((a, b) => getArticleTimestamp(b) - getArticleTimestamp(a));
      } else if (activeSort === 'views') {
        filtered.sort((a, b) => (b.views || 0) - (a.views || 0));
      } else {
        // Relevance + Recency
        filtered.sort((a, b) => b.searchScore - a.searchScore);
      }

      currentResults = filtered;

      // Render Results
      renderResults(filtered, trimmed);

      // Generate AI Synthesis
      renderAiSummary(filtered, trimmed);

    } catch (err) {
      console.error('Search error:', err);
      if (searchResultsDiv) {
        searchResultsDiv.innerHTML = `
          <div class="alert alert-danger my-4">
            <i class="bi bi-exclamation-triangle me-2"></i>${isHe ? 'אירעה שגיאה בביצוע החיפוש. אנא נסה שוב.' : 'Search error occurred. Please try again.'}
          </div>
        `;
      }
    }
  }

  function getArticleTimestamp(item) {
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
  }

  function renderResults(articles, query) {
    if (!searchResultsDiv) return;

    if (articles.length === 0) {
      searchResultsDiv.innerHTML = `
        <div class="text-center py-5" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:3rem 1.5rem;">
          <i class="bi bi-file-earmark-x" style="font-size: 3rem; color: var(--accent-red);"></i>
          <h3 class="mt-3" style="font-size:1.25rem; font-weight:700; color:var(--text-main);">${isHe ? 'לא נמצאו תוצאות' : 'No Results Found'}</h3>
          <p class="text-muted" style="font-size:0.9rem; max-width:450px; margin:0 auto;">
            ${isHe ? `לא נמצאו כתבות התואמות לחיפוש "${query}". נסו מילות מפתח אחרות או בדקו את הנושאים החמים.` : `No articles found matching "${query}". Try different keywords or browse trending topics.`}
          </p>
        </div>
      `;
      if (searchMeta) searchMeta.style.display = 'none';
      return;
    }

    if (resultCount) resultCount.textContent = articles.length;
    if (searchMeta) searchMeta.style.display = 'block';

    let html = '<div class="d-flex flex-column gap-3">';

    articles.forEach(article => {
      const slug = article.slug || article.id;
      const artId = article.id || '';
      const link = typeof getArticleCleanUrl === 'function' ? getArticleCleanUrl(article, isHe) : `${articleBaseUrl}?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(artId)}`;
      const title = article.title || (isHe ? 'ללא כותרת' : 'Untitled Article');
      const excerpt = article.excerpt || (article.content ? article.content.replace(/<[^>]+>/g, ' ').slice(0, 160) + '...' : '');
      const image = article.featuredImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=600&q=80';
      const category = article.category || (isHe ? 'טכנולוגיה' : 'Technology');

      const dateStr = article.createdAt?.toDate 
        ? article.createdAt.toDate().toLocaleDateString(isHe ? 'he-IL' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : (isHe ? 'השבוע' : 'This week');

      const readingTime = article.readingTimeMinutes || 3;

      html += `
        <article class="card p-3" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); transition:border-color var(--transition-fast);">
          <div class="d-flex flex-column flex-sm-row gap-3">
            <a href="${link}" style="flex-shrink:0;">
              <img src="${image}" alt="${title}" style="width:100%; max-width:200px; height:120px; object-fit:cover; border-radius:var(--radius-sm); border:1px solid var(--border-color);" loading="lazy">
            </a>
            <div class="d-flex flex-column justify-content-between flex-grow-1">
              <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                  <span class="badge badge-ai" style="font-size:0.65rem;">${category.toUpperCase()}</span>
                  <span class="text-muted small" style="font-family:var(--font-mono); font-size:0.75rem;">${dateStr}</span>
                </div>
                <h2 style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; line-height:1.3; margin-bottom:0.4rem;">
                  <a href="${link}" class="text-main text-decoration-none hover-red">${title}</a>
                </h2>
                <p class="text-secondary small mb-2 line-clamp-2" style="line-height:1.5;">${excerpt}</p>
              </div>
              <div class="d-flex align-items-center justify-content-between text-muted small" style="font-family:var(--font-mono); font-size:0.75rem;">
                <span><i class="bi bi-clock me-1"></i>${readingTime} ${isHe ? 'דק׳ קריאה' : 'min read'}</span>
                <a href="${link}" class="text-danger fw-bold text-decoration-none">${isHe ? 'קרא עוד ←' : 'Read Article →'}</a>
              </div>
            </div>
          </div>
        </article>
      `;
    });

    html += '</div>';
    searchResultsDiv.innerHTML = html;
  }

  function renderAiSummary(articles, query) {
    if (!aiSummarySection || !aiSummaryContent) return;
    if (articles.length === 0) {
      aiSummarySection.style.display = 'none';
      return;
    }

    const topArticle = articles[0];
    const categoryCount = new Set(articles.map(a => a.category || 'tech')).size;

    let summary = '';
    if (isHe) {
      summary = `נמצאו ${articles.length} תוצאות בנושא "${query}" ב-${categoryCount} תחומי טכנולוגיה שונים. התוצאה המובילה היא "${topArticle.title}"${topArticle.excerpt ? ' — ' + topArticle.excerpt.slice(0, 140) + '...' : '.'}`;
    } else {
      summary = `Found ${articles.length} intelligence dispatches for "${query}" across ${categoryCount} specialized tech verticals. The primary dispatch is "${topArticle.title}"${topArticle.excerpt ? ' — ' + topArticle.excerpt.slice(0, 140) + '...' : '.'}`;
    }

    aiSummaryContent.textContent = summary;
    aiSummarySection.style.display = 'block';
  }

  function populateCategoryFilter(articles) {
    if (!categoryFilter) return;
    const categories = new Set();
    articles.forEach(a => {
      if (a.category) categories.add(a.category);
    });

    const currentVal = categoryFilter.value;
    let html = `<option value="">${isHe ? 'כל הקטגוריות' : 'All Categories'}</option>`;
    categories.forEach(cat => {
      html += `<option value="${cat}" ${cat === currentVal ? 'selected' : ''}>${cat.charAt(0).toUpperCase() + cat.slice(1)}</option>`;
    });
    categoryFilter.innerHTML = html;
  }

  async function loadTrendingTopics() {
    if (!trendingTopicsList) return;
    const defaultTopics = isHe 
      ? ['בינה מלאכותית', 'OpenAI o3', 'סוכנים אוטונומיים', 'שבבי NVIDIA', 'כלי AI למפתחים', 'אבטחת סייבר']
      : ['Reasoning Models', 'Autonomous Agents', 'NVIDIA Blackwell', 'Claude 3.7 Sonnet', 'Silicon & Foundries', 'Cybersecurity'];

    let html = '';
    defaultTopics.forEach(topic => {
      const searchUrl = isHe ? `/he/search.html?q=${encodeURIComponent(topic)}` : `/search.html?q=${encodeURIComponent(topic)}`;
      html += `
        <li>
          <a href="${searchUrl}" class="d-flex align-items-center justify-content-between p-2 rounded text-decoration-none text-main small" style="background:var(--bg-surface-elevated); border:1px solid var(--border-color);">
            <span><i class="bi bi-hash text-danger me-1"></i>${topic}</span>
            <i class="bi bi-arrow-right-short text-muted"></i>
          </a>
        </li>
      `;
    });
    trendingTopicsList.innerHTML = html;
  }

  // Form Submission
  if (searchPageForm) {
    searchPageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = searchInput ? searchInput.value.trim() : '';
      if (q) {
        const newUrl = isHe ? `/he/search.html?q=${encodeURIComponent(q)}` : `/search.html?q=${encodeURIComponent(q)}`;
        window.history.pushState({}, '', newUrl);
        performSearch(q);
      }
    });
  }

  // Filter Listeners
  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      if (currentQuery) performSearch(currentQuery);
    });
  }

  if (sortFilter) {
    sortFilter.addEventListener('change', () => {
      if (currentQuery) performSearch(currentQuery);
    });
  }

  // Start initialization
  initSearch();
});