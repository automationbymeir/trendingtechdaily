// he-category.js — Hebrew category page loader

(function () {
  'use strict';

  function initHeCategoryPage(db, auth) {
    var routingRaw = sessionStorage.getItem('heCategoryRouting');
    var routing = null;
    try {
      routing = routingRaw ? JSON.parse(routingRaw) : null;
    } catch (e) {
      routing = null;
    }

    var loadingEl = document.getElementById('category-loading');
    var errorEl = document.getElementById('category-error');
    var errorMsgEl = document.getElementById('category-error-message');
    var wrapperEl = document.getElementById('category-content-wrapper');

    function showError(msg) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = '';
        if (errorMsgEl) errorMsgEl.textContent = msg || 'לא ניתן לטעון את הקטגוריה.';
      }
    }

    function showContent() {
      if (loadingEl) loadingEl.style.display = 'none';
      if (wrapperEl) wrapperEl.style.display = '';
    }

    // Determine slug
    var categorySlug = null;
    if (routing && routing.slug) {
      categorySlug = routing.slug;
    } else if (routingRaw && typeof routingRaw === 'string' && !routingRaw.startsWith('{')) {
      // Legacy: plain string slug
      categorySlug = routingRaw;
    } else {
      // Fallback: parse from URL
      // window.location.pathname may be percent-encoded — always decode
      var rawPathname = window.location.pathname;
      var decodedPathname = rawPathname;
      try { decodedPathname = decodeURIComponent(rawPathname); } catch (e) {}
      var pathParts = decodedPathname.replace(/^\/he\//, '').split('/').filter(Boolean);
      if (pathParts.length >= 1) {
        categorySlug = pathParts[0];
      }
    }

    if (!categorySlug) {
      showError('לא נמצאו פרטי קטגוריה.');
      return;
    }

    // Clear sessionStorage after reading
    sessionStorage.removeItem('heCategoryRouting');

    // Query he_sections by slug
    db.collection('he_sections')
      .where('slug', '==', categorySlug)
      .limit(1)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          showError('הקטגוריה לא נמצאה: ' + categorySlug);
          return;
        }

        var sectionDoc = snapshot.docs[0];
        var section = Object.assign({ id: sectionDoc.id }, sectionDoc.data());
        var sectionId = sectionDoc.id;
        var sectionName = section.name || categorySlug;

        // Update page title and meta
        document.title = sectionName + ' | TrendingTech Daily';
        var metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc) {
          metaDesc.setAttribute('content', 'כתבות ' + sectionName + ' - TrendingTech Daily');
        }

        // Update canonical tag if not already set by SSR
        var canonicalPath = '/he/' + categorySlug;
        var canonicalFull = 'https://www.trendingtechdaily.com' + canonicalPath;
        var canonicalLink = document.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
          canonicalLink = document.createElement('link');
          canonicalLink.rel = 'canonical';
          document.head.appendChild(canonicalLink);
          canonicalLink.href = canonicalFull;
        }

        // Update UI elements
        var titleEl = document.getElementById('category-page-title');
        var descEl = document.getElementById('category-page-description');
        var breadcrumbEl = document.getElementById('breadcrumb-category-name');

        if (titleEl) titleEl.textContent = sectionName;
        if (descEl) descEl.textContent = 'כל הכתבות בנושא ' + sectionName;
        if (breadcrumbEl) breadcrumbEl.textContent = sectionName;

        showContent();

        // Load articles for this category
        loadCategoryArticles(db, sectionId);
      })
      .catch(function (err) {
        console.error('he-category.js: Error loading section:', err);
        showError('שגיאה בטעינת הקטגוריה.');
      });
  }

  function loadCategoryArticles(db, sectionId) {
    var container = document.getElementById('category-articles-container');
    var noArticlesEl = document.getElementById('category-no-articles');

    if (!container) return;

    db.collection('he_articles')
      .where('category', '==', sectionId)
      .where('published', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(24)
      .get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          container.innerHTML = '';
          if (noArticlesEl) noArticlesEl.style.display = '';
          return;
        }

        var html = '';
        snapshot.forEach(function (doc) {
          var article = Object.assign({ id: doc.id }, doc.data());
          html += renderCategoryArticleCard(article, sectionId);
        });
        container.innerHTML = html;
      })
      .catch(function (err) {
        console.error('he-category.js: Error loading articles:', err);
        container.innerHTML = '<div class="alert alert-danger">שגיאה בטעינת הכתבות.</div>';
      });
  }

  function formatDate(timestamp) {
    if (window.heApp && window.heApp.heFormatDate) {
      return window.heApp.heFormatDate(timestamp);
    }
    if (!timestamp) return '';
    var d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function heEsc(str) {
    if (window.heApp && window.heApp.heEscape) return window.heApp.heEscape(str);
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function heCreateSlug(text) {
    if (window.heApp && window.heApp.heCreateSlug) return window.heApp.heCreateSlug(text);
    if (!text) return '';
    return text.toLowerCase().replace(/[^\w\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').trim();
  }

  function renderCategoryArticleCard(article, sectionId) {
    var catInfo = (window.heApp && window.heApp.heCategoryCache)
      ? window.heApp.heCategoryCache[article.category]
      : null;

    var catSlug = catInfo ? catInfo.slug : 'technology';
    var catName = catInfo ? catInfo.name : '';
    var slug = article.slug || heCreateSlug(article.title || '');
    var href = '/he/' + catSlug + '/' + slug;
    var imgSrc = article.featuredImage || 'https://via.placeholder.com/400x200?text=TrendingTech+Daily';
    var imgAlt = article.imageAltText || article.title || '';
    var dateStr = formatDate(article.createdAt);
    var readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
    var excerpt = article.excerpt || '';

    return '<div class="article-card">' +
      '<a href="' + href + '" class="article-card-link">' +
      '<img src="' + heEsc(imgSrc) + '" alt="' + heEsc(imgAlt) + '" class="article-card-img" loading="lazy">' +
      '</a>' +
      '<div class="article-card-body">' +
      (catName ? '<div class="mb-2"><a href="/he/' + catSlug + '" class="category-badge">' + catName + '</a></div>' : '') +
      '<a href="' + href + '" class="article-card-link">' +
      '<h3 class="article-card-title">' + heEsc(article.title || '') + '</h3>' +
      '<p class="article-card-excerpt">' + heEsc(excerpt) + '</p>' +
      '</a>' +
      '<div class="article-card-meta">' +
      (dateStr ? '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>' : '') +
      (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
      '</div>' +
      '</div>' +
      '</div>';
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', function () {
    var attempts = 0;
    function tryInit() {
      if (window.heApp && window.heApp.waitForFirebase) {
        window.heApp.waitForFirebase(function (db, auth) {
          if (window.heApp.loadHeSections) {
            window.heApp.loadHeSections(db).then(function () {
              initHeCategoryPage(db, auth);
            });
          } else {
            initHeCategoryPage(db, auth);
          }
        });
      } else if (attempts < 30) {
        attempts++;
        setTimeout(tryInit, 200);
      } else {
        console.error('he-category.js: heApp not available.');
      }
    }
    tryInit();
  });
})();
