// he-search.js — Hebrew search page logic
// Searches he_articles collection client-side with relevance scoring

(function () {
  'use strict';

  var PAGE_SIZE = 10;
  var currentResults = [];
  var currentOffset = 0;
  var currentQuery = '';

  // ── DOM refs ────────────────────────────────────────────────────────────────
  var searchForm     = document.getElementById('he-search-form');
  var searchInput    = document.getElementById('he-search-input');
  var promptEl       = document.getElementById('he-search-prompt');
  var loadingEl      = document.getElementById('he-search-loading');
  var noResultsEl    = document.getElementById('he-search-no-results');
  var errorEl        = document.getElementById('he-search-error');
  var errorMsgEl     = document.getElementById('he-search-error-msg');
  var resultsEl      = document.getElementById('he-search-results');
  var metaEl         = document.getElementById('he-search-meta');
  var resultCountEl  = document.getElementById('he-result-count');
  var queryDisplayEl = document.getElementById('he-search-query-display');
  var loadMoreBtn    = document.getElementById('he-load-more-btn');
  var loadMoreCont   = document.getElementById('he-load-more-container');

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function escHe(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function stripHtml(html) {
    return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function calcScore(article, terms) {
    var score = 0;
    var title   = (article.title   || '').toLowerCase();
    var excerpt = (article.excerpt || '').toLowerCase();
    var content = stripHtml(article.content || '').toLowerCase();
    var tags    = (article.tags    || []).map(function(t){ return t.toLowerCase(); });

    terms.forEach(function(term) {
      if (!term) return;
      // Title (highest weight)
      if (title === term) score += 20;
      else if (title.includes(term)) score += 10;
      // Excerpt
      if (excerpt.includes(term)) score += 6;
      // Tags
      tags.forEach(function(tag) {
        if (tag === term) score += 8;
        else if (tag.includes(term)) score += 3;
      });
      // Content
      var matches = (content.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      score += Math.min(matches * 0.5, 5);
    });

    return score;
  }

  function heFormatDate(ts) {
    if (!ts) return '';
    var d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function renderArticleCard(article) {
    var catInfo = (window.heApp && window.heApp.heCategoryCache && window.heApp.heCategoryCache[article.category]) || { name: '', slug: 'technology' };
    var slug   = article.slug || (article.id || '');
    var href   = '/he/' + (catInfo.slug || 'technology') + '/' + slug;
    var imgSrc = escHe(article.featuredImage || '/he/images/placeholder.jpg');
    var imgAlt = escHe(article.title || '');
    var date   = heFormatDate(article.createdAt);
    var readTime = article.readingTime ? article.readingTime + ' דק&apos; קריאה' : '';

    return '<div class="article-card">' +
      '<a href="' + href + '">' +
      '<img src="' + imgSrc + '" alt="' + imgAlt + '" class="article-card-img" loading="lazy" onerror="this.src=\'/he/images/placeholder.jpg\'">' +
      '</a>' +
      '<div class="article-card-body">' +
      (catInfo.name ? '<a href="/he/' + escHe(catInfo.slug) + '" class="category-badge mb-2 d-inline-block">' + escHe(catInfo.name) + '</a>' : '') +
      '<a href="' + href + '" style="text-decoration:none;color:inherit;">' +
      '<h3 class="article-card-title">' + escHe(article.title || '') + '</h3>' +
      '</a>' +
      '<p class="article-card-excerpt">' + escHe(article.excerpt || '') + '</p>' +
      '<div class="article-meta">' +
      (date ? '<span><i class="bi bi-calendar3 me-1"></i>' + date + '</span>' : '') +
      (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
      '</div>' +
      '</div>' +
      '</div>';
  }

  // ── State management ─────────────────────────────────────────────────────────
  function setState(state) {
    promptEl    && (promptEl.style.display    = state === 'prompt'  ? '' : 'none');
    loadingEl   && (loadingEl.style.display   = state === 'loading' ? '' : 'none');
    noResultsEl && (noResultsEl.style.display = state === 'empty'   ? '' : 'none');
    errorEl     && (errorEl.style.display     = state === 'error'   ? '' : 'none');
    metaEl      && (metaEl.style.display      = state === 'results' ? '' : 'none');
    loadMoreCont && (loadMoreCont.style.display = 'none');
    if (state !== 'results' && resultsEl) resultsEl.innerHTML = '';
  }

  // ── Search logic ─────────────────────────────────────────────────────────────
  function doSearch(db, query) {
    if (!query || query.trim().length < 2) return;
    currentQuery = query.trim();
    currentResults = [];
    currentOffset = 0;

    setState('loading');

    var terms = currentQuery.toLowerCase().split(/\s+/).filter(function(t){ return t.length >= 1; });

    // Fetch up to 200 recent published articles
    db.collection('he_articles')
      .where('published', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get()
      .then(function(snapshot) {
        var articles = [];
        snapshot.forEach(function(doc) {
          var data = Object.assign({ id: doc.id }, doc.data());
          var score = calcScore(data, terms);
          if (score > 0) articles.push(Object.assign({ _score: score }, data));
        });

        // Sort by relevance
        articles.sort(function(a, b) { return b._score - a._score; });
        currentResults = articles;

        if (articles.length === 0) {
          setState('empty');
          return;
        }

        setState('results');
        if (resultCountEl) resultCountEl.textContent = articles.length;
        if (queryDisplayEl) queryDisplayEl.textContent = currentQuery;

        // Render first page
        renderPage(0);
      })
      .catch(function(err) {
        console.error('he-search error:', err);
        setState('error');
        if (errorMsgEl) errorMsgEl.textContent = 'שגיאה בחיפוש. נסו שוב.';
      });
  }

  function renderPage(offset) {
    var page = currentResults.slice(offset, offset + PAGE_SIZE);
    if (offset === 0) {
      resultsEl.innerHTML = '';
    }
    page.forEach(function(article) {
      resultsEl.insertAdjacentHTML('beforeend', renderArticleCard(article));
    });
    currentOffset = offset + page.length;

    if (currentOffset < currentResults.length) {
      loadMoreCont && (loadMoreCont.style.display = '');
    } else {
      loadMoreCont && (loadMoreCont.style.display = 'none');
    }
  }

  // ── Event bindings ────────────────────────────────────────────────────────────
  function bindEvents(db) {
    if (searchForm) {
      searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        var q = searchInput ? searchInput.value.trim() : '';
        if (q.length >= 2) {
          // Update URL without reload
          var newUrl = '/he/search?q=' + encodeURIComponent(q);
          window.history.pushState({ q: q }, '', newUrl);
          doSearch(db, q);
        }
      });
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function() {
        renderPage(currentOffset);
      });
    }

    // Handle browser back/forward
    window.addEventListener('popstate', function(e) {
      var q = e.state && e.state.q ? e.state.q : getQueryParam('q');
      if (q) {
        if (searchInput) searchInput.value = q;
        doSearch(db, q);
      } else {
        setState('prompt');
      }
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name) || '';
  }

  function initHeSearch(db) {
    bindEvents(db);

    // Auto-search if ?q= param present
    var q = getQueryParam('q');
    if (q) {
      if (searchInput) searchInput.value = decodeURIComponent(q);
      doSearch(db, decodeURIComponent(q));
    } else {
      setState('prompt');
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    var attempts = 0;
    function tryInit() {
      if (window.heApp && window.heApp.waitForFirebase) {
        window.heApp.waitForFirebase(function(db) {
          initHeSearch(db);
        });
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryInit, 200);
      } else {
        console.error('he-search.js: heApp not available.');
      }
    }
    tryInit();
  });
})();
