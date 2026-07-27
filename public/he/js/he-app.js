// he-app.js — All-in-one JS for the Hebrew TrendingTech Daily site

// Firebase config (same project)
const HE_FIREBASE_CONFIG = {
  apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
  authDomain: "trendingtech-daily.firebaseapp.com",
  projectId: "trendingtech-daily",
  storageBucket: "trendingtech-daily.firebasestorage.app",
  messagingSenderId: "343812872871",
  appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

// Wait for Firebase to be available, then initialize
function waitForFirebase(callback, attempts) {
  attempts = attempts || 0;
  if (typeof firebase !== 'undefined') {
    // Only initialize if not already initialized
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(HE_FIREBASE_CONFIG);
    }
    callback(firebase.firestore(), firebase.auth());
  } else if (attempts < 50) {
    setTimeout(function () {
      waitForFirebase(callback, attempts + 1);
    }, 100);
  } else {
    console.error('he-app.js: Firebase SDK not available after 5 seconds.');
  }
}

// Category cache: maps sectionId → { name, slug }
var heCategoryCache = {};

// ── Utility ──────────────────────────────────────────────────────────────────

function heFormatDate(timestamp) {
  if (!timestamp) return '';
  var d;
  if (timestamp && timestamp.toDate) {
    d = timestamp.toDate();
  } else if (timestamp instanceof Date) {
    d = timestamp;
  } else {
    d = new Date(timestamp);
  }
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
}

function heCreateSlug(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ── Sections / Categories ─────────────────────────────────────────────────────

function loadHeSections(db) {
  return db.collection('he_sections').orderBy('order', 'asc').get()
    .then(function (snapshot) {
      heCategoryCache = {};
      if (!snapshot.empty) {
        snapshot.forEach(function (doc) {
          var data = doc.data();
          heCategoryCache[doc.id] = {
            name: data.name || '',
            slug: data.slug || heCreateSlug(data.name || doc.id)
          };
        });
      }
      return heCategoryCache;
    })
    .catch(function (err) {
      console.warn('he-app: Could not load he_sections:', err.message);
      return {};
    });
}

function loadHeCategories(db) {
  var categoriesList = document.getElementById('categories-list');
  if (!categoriesList) return;

  db.collection('he_sections').orderBy('order', 'asc').get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        categoriesList.innerHTML = '<li class="text-muted small fst-italic" style="padding:0.5rem 0;">אין קטגוריות זמינות</li>';
        return;
      }
      var html = '';
      snapshot.forEach(function (doc) {
        var data = doc.data();
        var slug = data.slug || heCreateSlug(data.name || doc.id);
        html += '<li><a href="/he/' + slug + '">' + data.name + ' <span class="badge bg-primary rounded-pill" style="font-size:0.7rem;">→</span></a></li>';
      });
      categoriesList.innerHTML = html;
    })
    .catch(function (err) {
      console.warn('he-app: Could not load categories list:', err.message);
    });
}

function initHeNavCategories(db) {
  var placeholder = document.getElementById('category-nav-placeholder');
  if (!placeholder) return;

  var DEFAULT_CATEGORIES = [
    { name: 'בינה מלאכותית', slug: 'ai' },
    { name: 'טכנולוגיה', slug: 'technology' },
    { name: 'סטארטאפים', slug: 'startups' },
    { name: 'גאדג\'טים', slug: 'gadgets' }
  ];

  function renderNavCategories(categories) {
    var navbarNav = document.querySelector('#navbarMain .navbar-nav');
    var moreDropdownMenu = document.getElementById('more-dropdown-menu');
    var moreDropdown = document.getElementById('more-dropdown');

    if (!navbarNav) return;

    // Remove existing category items
    navbarNav.querySelectorAll('[data-he-category="true"]').forEach(function (el) { el.remove(); });

    var maxVisible = window.innerWidth >= 1200 ? 3 : 2;
    var visible = categories.slice(0, maxVisible);
    var hidden = categories.slice(maxVisible);

    var insertBefore = moreDropdown || navbarNav.querySelector('.nav-item:not([data-he-category="true"])');

    visible.forEach(function (cat) {
      var li = document.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('data-he-category', 'true');
      var a = document.createElement('a');
      a.className = 'nav-link';
      a.href = '/he/' + cat.slug;
      a.textContent = cat.name;
      li.appendChild(a);
      if (insertBefore) {
        navbarNav.insertBefore(li, insertBefore);
      } else {
        navbarNav.appendChild(li);
      }
    });

    if (moreDropdownMenu && moreDropdown) {
      moreDropdownMenu.innerHTML = '';
      hidden.forEach(function (cat) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = '/he/' + cat.slug;
        a.textContent = cat.name;
        li.appendChild(a);
        moreDropdownMenu.appendChild(li);
      });
      if (moreDropdownMenu.children.length > 0) {
        moreDropdown.classList.remove('d-none');
      }
    }

    fitHeNavToWidth();
  }

  // RTL-aware overflow guard: fold inline categories into the "עוד" dropdown
  // until the expanded navbar fits its container. Collapse handles < xl.
  function fitHeNavToWidth() {
    var collapse = document.getElementById('navbarMain');
    var moreDropdown = document.getElementById('more-dropdown');
    var moreDropdownMenu = document.getElementById('more-dropdown-menu');
    var navbarNav = document.querySelector('#navbarMain .navbar-nav');
    if (!collapse || !moreDropdown || !moreDropdownMenu || !navbarNav) return;
    if (window.innerWidth < 1200) return;

    function overflows() {
      if (collapse.scrollWidth > collapse.clientWidth) return true;
      var container = collapse.closest('.container');
      if (!container) return false;
      var cr = container.getBoundingClientRect();
      var lr = navbarNav.getBoundingClientRect();
      // RTL: items spill past the container's LEFT edge
      return lr.left < cr.left + 8 || lr.right > cr.right - 8;
    }

    var guard = 20;
    while (overflows() && guard-- > 0) {
      var inlineCats = navbarNav.querySelectorAll('li[data-he-category="true"]');
      var lastCat = inlineCats[inlineCats.length - 1];
      if (!lastCat) break;
      var link = lastCat.querySelector('a');
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.className = 'dropdown-item';
      a.href = link.getAttribute('href');
      a.textContent = link.textContent;
      li.appendChild(a);
      moreDropdownMenu.insertBefore(li, moreDropdownMenu.firstChild);
      lastCat.remove();
      moreDropdown.classList.remove('d-none');
    }
  }

  db.collection('he_sections').orderBy('order', 'asc').get()
    .then(function (snapshot) {
      var cats = [];
      if (!snapshot.empty) {
        snapshot.forEach(function (doc) {
          var data = doc.data();
          if (data.active !== false) {
            cats.push({
              id: doc.id,
              name: data.name,
              slug: data.slug || heCreateSlug(data.name || doc.id),
              order: data.order || 999
            });
          }
        });
      }
      if (cats.length === 0) cats = DEFAULT_CATEGORIES;
      renderNavCategories(cats);

      var resizeTimeout;
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () { renderNavCategories(cats); }, 150);
      });
    })
    .catch(function (err) {
      console.warn('he-app: Nav categories fallback:', err.message);
      renderNavCategories(DEFAULT_CATEGORIES);
    });
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function setupHeAuthListener(auth) {
  var loginLink = document.getElementById('auth-login-link');
  var signupLink = document.getElementById('auth-signup-link');
  var profileMenu = document.getElementById('auth-profile-menu');
  var logoutBtn = document.getElementById('auth-logout-btn');
  var displayNameEl = document.getElementById('user-display-name-nav');
  var profilePicEl = document.getElementById('user-profile-pic-nav');

  if (!loginLink && !signupLink) return;

  auth.onAuthStateChanged(function (user) {
    if (user) {
      if (loginLink) loginLink.style.display = 'none';
      if (signupLink) signupLink.style.display = 'none';
      if (profileMenu) profileMenu.style.display = '';
      if (displayNameEl) displayNameEl.textContent = user.displayName || 'פרופיל';
      if (profilePicEl && user.photoURL) profilePicEl.src = user.photoURL;
    } else {
      if (loginLink) loginLink.style.display = '';
      if (signupLink) signupLink.style.display = '';
      if (profileMenu) profileMenu.style.display = 'none';
    }
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      auth.signOut().catch(function (err) {
        console.error('Logout error:', err);
      });
    });
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

function setupHeSearch() {
  var searchToggleBtn = document.getElementById('search-toggle-btn');
  var searchForm = document.getElementById('nav-search-form');
  var searchInput = document.getElementById('nav-search-input');

  if (!searchToggleBtn || !searchForm || !searchInput) return;

  searchToggleBtn.addEventListener('click', function (e) {
    e.preventDefault();
    searchForm.classList.toggle('active');
    if (searchForm.classList.contains('active')) {
      searchInput.focus();
    }
  });

  document.addEventListener('click', function (e) {
    var nav = document.querySelector('.navbar');
    if (nav && !nav.contains(e.target)) {
      searchForm.classList.remove('active');
    }
  });

  searchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var query = searchInput.value.trim();
    if (query) {
      window.location.href = '/he/search?q=' + encodeURIComponent(query);
    }
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderHeArticleCard(article) {
  var catInfo = heCategoryCache[article.category] || { name: '', slug: 'technology' };
  var slug = article.slug || heCreateSlug(article.title || '');
  var href = '/he/' + catInfo.slug + '/' + slug;
  var imgSrc = article.featuredImage || 'https://via.placeholder.com/400x200?text=TrendingTech+Daily';
  var imgAlt = article.imageAltText || article.title || '';
  var dateStr = heFormatDate(article.createdAt);
  var readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
  var catName = catInfo.name || '';
  var catSlug = catInfo.slug || 'technology';
  var excerpt = article.excerpt || '';

  return '<div class="article-card">' +
    '<a href="' + href + '" class="article-card-link">' +
    '<img src="' + imgSrc + '" alt="' + heEscape(imgAlt) + '" class="article-card-img" loading="lazy">' +
    '</a>' +
    '<div class="article-card-body">' +
    (catName ? '<div class="mb-2"><a href="/he/' + catSlug + '" class="category-badge">' + catName + '</a></div>' : '') +
    '<a href="' + href + '" class="article-card-link">' +
    '<h3 class="article-card-title">' + heEscape(article.title || '') + '</h3>' +
    '<p class="article-card-excerpt">' + heEscape(excerpt) + '</p>' +
    '</a>' +
    '<div class="article-card-meta">' +
    (dateStr ? '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>' : '') +
    (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
    '</div>' +
    '</div>' +
    '</div>';
}

function renderHeFeaturedArticle(article) {
  var catInfo = heCategoryCache[article.category] || { name: '', slug: 'technology' };
  var slug = article.slug || heCreateSlug(article.title || '');
  var href = '/he/' + catInfo.slug + '/' + slug;
  var imgSrc = article.featuredImage || 'https://via.placeholder.com/800x400?text=TrendingTech+Daily';
  var imgAlt = article.imageAltText || article.title || '';
  var dateStr = heFormatDate(article.createdAt);
  var readTime = article.readingTimeMinutes ? article.readingTimeMinutes + ' דק\' קריאה' : '';
  var catName = catInfo.name || '';
  var catSlug = catInfo.slug || 'technology';
  var excerpt = article.excerpt || '';

  return '<article class="featured-article">' +
    '<a href="' + href + '">' +
    '<img src="' + imgSrc + '" alt="' + heEscape(imgAlt) + '" class="featured-article-img">' +
    '</a>' +
    '<div class="featured-article-body">' +
    '<div class="mb-3 d-flex gap-2 align-items-center">' +
    '<span class="featured-badge">כתבה נבחרת</span>' +
    (catName ? '<a href="/he/' + catSlug + '" class="category-badge">' + catName + '</a>' : '') +
    '</div>' +
    '<a href="' + href + '" style="text-decoration:none; color:inherit;">' +
    '<h2 class="featured-article-title mb-3">' + heEscape(article.title || '') + '</h2>' +
    '</a>' +
    '<p class="text-muted mb-3">' + heEscape(excerpt) + '</p>' +
    '<div class="d-flex gap-3 text-muted small mb-3">' +
    (dateStr ? '<span><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</span>' : '') +
    (readTime ? '<span><i class="bi bi-clock me-1"></i>' + readTime + '</span>' : '') +
    '</div>' +
    '<a href="' + href + '" class="btn btn-primary">קרא עוד <i class="bi bi-arrow-left me-1"></i></a>' +
    '</div>' +
    '</article>';
}

function heEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Articles loading ───────────────────────────────────────────────────────────

// De-duplicate articles: filter out articles whose title shares 3+ words with a previous one
function deduplicateHeArticles(articles) {
  var seen = [];
  return articles.filter(function(article) {
    var words = (article.title || '')
      .toLowerCase()
      .replace(/[^\u0590-\u05FFa-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(function(w) { return w.length >= 3; })
      .slice(0, 6);
    for (var i = 0; i < seen.length; i++) {
      var shared = 0;
      for (var j = 0; j < words.length; j++) {
        if (seen[i].indexOf(words[j]) !== -1) shared++;
        if (shared >= 3) return false;
      }
    }
    seen.push(words);
    return true;
  });
}

function loadHeFeaturedArticle(db) {
  // Skip client-side fetch when page was server-rendered
  if (window.HE_SSR_READY) return;
  var container = document.getElementById('featured-article-container');
  if (!container) return;

  db.collection('he_articles')
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        container.innerHTML = '<div class="alert alert-info">אין כתבות זמינות עדיין.</div>';
        return;
      }
      var doc = snapshot.docs[0];
      var article = Object.assign({ id: doc.id }, doc.data());
      container.innerHTML = renderHeFeaturedArticle(article);
      // Store featured article ID to skip in latest articles
      window._heFeaturedId = doc.id;
      // Now load latest articles
      loadHeLatestArticles(db, doc.id);
    })
    .catch(function (err) {
      console.error('he-app: loadHeFeaturedArticle error:', err);
      container.innerHTML = '<div class="alert alert-danger">שגיאה בטעינת הכתבה המובחרת.</div>';
      loadHeLatestArticles(db, null);
    });
}

function loadHeLatestArticles(db, skipId) {
  // Skip client-side fetch when page was server-rendered
  if (window.HE_SSR_READY) return;
  var container = document.getElementById('articles-container');
  if (!container) return;

  db.collection('he_articles')
    .where('published', '==', true)
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get()
    .then(function (snapshot) {
      if (snapshot.empty) {
        container.innerHTML = '<div class="alert alert-info">אין כתבות זמינות עדיין.</div>';
        return;
      }

      var articles = [];
      snapshot.forEach(function (doc) {
        if (skipId && doc.id === skipId) return;
        articles.push(Object.assign({ id: doc.id }, doc.data()));
      });

      // Limit to 9 after skipping featured
      articles = articles.slice(0, 9);
      // Remove topic duplicates before rendering
      articles = deduplicateHeArticles(articles);

      if (articles.length === 0) {
        container.innerHTML = '<div class="alert alert-info">אין כתבות נוספות זמינות.</div>';
        return;
      }

      var html = '<div class="article-grid">';
      articles.forEach(function (article) {
        html += renderHeArticleCard(article);
      });
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(function (err) {
      console.error('he-app: loadHeLatestArticles error:', err);
      container.innerHTML = '<div class="alert alert-danger">שגיאה בטעינת הכתבות.</div>';
    });
}

// ── Navbar loading ─────────────────────────────────────────────────────────────

function loadHeNavbar(db, auth) {
  var placeholder = document.getElementById('navbar-placeholder');
  if (!placeholder) {
    // Navbar already in DOM, just initialize
    setupHeSearch();
    initHeNavCategories(db);
    setupHeAuthListener(auth);
    loadHeCategories(db);
    loadHeFeaturedArticle(db);
    return;
  }

  fetch('/he/nav.html')
    .then(function (res) {
      if (!res.ok) throw new Error('Failed to load /he/nav.html');
      return res.text();
    })
    .then(function (html) {
      placeholder.innerHTML = html;
      setupHeSearch();
      initHeNavCategories(db);
      setupHeAuthListener(auth);
      loadHeCategories(db);

      // Only load articles on the homepage
      var isHomepage = window.location.pathname === '/he' || window.location.pathname === '/he/' || window.location.pathname === '/he/index.html';
      if (isHomepage) {
        loadHeFeaturedArticle(db);
      }
    })
    .catch(function (err) {
      console.error('he-app: Failed to load navbar:', err);
      // Still try to load content
      var isHomepage = window.location.pathname === '/he' || window.location.pathname === '/he/' || window.location.pathname === '/he/index.html';
      if (isHomepage) {
        loadHeFeaturedArticle(db);
      }
    });
}

// ── Welcome popup ──────────────────────────────────────────────────────────────

function initHeWelcomePopup(auth) {
  var overlay = document.getElementById('welcome-popup-overlay');
  if (!overlay) return;
  if (localStorage.getItem('he_popup_seen')) return;

  // closeHePopup is defined as a global in index.html <script> so onclick always works.
  // Also wire overlay background click.
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay && window.closeHePopup) window.closeHePopup();
  });

  // Show popup 3 s after page load if the user is not signed in.
  auth.onAuthStateChanged(function (user) {
    if (!user && !window._hePopupDismissed && !localStorage.getItem('he_popup_seen')) {
      setTimeout(function () {
        if (!window._hePopupDismissed && !localStorage.getItem('he_popup_seen')) {
          overlay.style.display = 'flex';
        }
      }, 3000);
    }
  });
}

// ── Main entry point ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {
  waitForFirebase(function (db, auth) {
    loadHeSections(db).then(function () {
      loadHeNavbar(db, auth);
      initHeWelcomePopup(auth);
    });
  });
});

// Export for use by he-article.js and he-category.js
window.heApp = {
  waitForFirebase: waitForFirebase,
  loadHeSections: loadHeSections,
  heCategoryCache: heCategoryCache,
  heFormatDate: heFormatDate,
  heCreateSlug: heCreateSlug,
  heEscape: heEscape,
  renderHeArticleCard: renderHeArticleCard,
  loadHeNavbar: loadHeNavbar,
  setupHeAuthListener: setupHeAuthListener,
  setupHeSearch: setupHeSearch,
  initHeNavCategories: initHeNavCategories,
  loadHeCategories: loadHeCategories
};
