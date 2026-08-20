// js/nav-loader.js — Responsive Figma Tech News Navigation & Category Loader

let firebaseReadyFired = false;
let navigationInitialized = false;

/**
 * The main function to initialize the entire navigation system.
 */
function initializeNavigation() {
  navigationInitialized = true;

  const loadHTML = (url, placeholderId, callback) => {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        return response.text();
      })
      .then(data => {
        const placeholder = document.getElementById(placeholderId);
        if (placeholder) {
          placeholder.innerHTML = data;
          if (callback) callback();
        }
      })
      .catch(error => console.error(`Error loading content for ${placeholderId}:`, error));
  };

  const path = window.location.pathname;
  const isHebrew = path.startsWith('/he') || path.includes('/he/') || document.documentElement.getAttribute('dir') === 'rtl' || document.documentElement.getAttribute('lang') === 'he';
  const navFile = isHebrew ? '/he/nav.html?v=20260820_he5' : '/nav.html?v=20260820_he5';

  const navAlreadyLoaded = document.getElementById('site-header');

  if (navAlreadyLoaded) {
    setupNavInteractions();
    initializeResponsiveCategories();
    if (window.initializeAuth) {
      window.initializeAuth();
    } else if (window.updateAuthUI && typeof firebase !== 'undefined' && firebase.auth) {
      window.updateAuthUI(firebase.auth().currentUser);
    }
  } else {
    loadHTML(navFile, 'navbar-placeholder', () => {
      setupNavInteractions();
      initializeResponsiveCategories();
      if (window.initializeAuth) {
        window.initializeAuth();
      } else if (window.updateAuthUI && typeof firebase !== 'undefined' && firebase.auth) {
        window.updateAuthUI(firebase.auth().currentUser);
      }
    });
  }

  // Load footer based on language with cache-busting
  const footerFile = isHebrew ? '/he/footer.html?v=20260820_he5' : '/footer.html?v=20260820_he5';
  loadHTML(footerFile, 'footer-placeholder', () => {
    if (typeof firebase !== 'undefined' && firebase.apps.length) {
      loadFooterCategories();
    }
  });

  // Ensure Cookie Consent banner is initialized for new users
  initializeCookieConsent(isHebrew);
}

/**
 * Initializes the Cookie Consent banner dynamically if not yet given.
 */
function initializeCookieConsent(isHebrew) {
  try {
    if (localStorage.getItem('cookie_consent')) return;
  } catch (e) {}

  if (!document.getElementById('cookie-consent-css')) {
    const link = document.createElement('link');
    link.id = 'cookie-consent-css';
    link.rel = 'stylesheet';
    link.href = '/css/cookie-consent.css';
    document.head.appendChild(link);
  }

  const scriptSrc = isHebrew ? '/he/js/he-cookie-consent.js' : '/js/cookie-consent.js';
  if (!document.querySelector('script[src*="cookie-consent.js"]')) {
    const script = document.createElement('script');
    script.src = scriptSrc;
    script.defer = true;
    document.body.appendChild(script);
  }
}

/**
 * Sets up all navigation event listeners: mobile drawer, search toggles, theme toggle.
 */
function setupNavInteractions() {
  const hamburgerBtn = document.getElementById('hamburger-menu-btn');
  const drawerCloseBtn = document.getElementById('drawer-close-btn');
  const mobileDrawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('drawer-backdrop');
  const mobileSearchBtn = document.getElementById('mobile-search-btn');
  const navSearchForm = document.getElementById('nav-search-form');
  const navSearchInput = document.getElementById('nav-search-input');
  const mobileDrawerSearchForm = document.getElementById('mobile-drawer-search-form');
  const mobileDrawerSearchInput = document.getElementById('mobile-drawer-search-input');
  const themeToggleBtn = document.getElementById('theme-mode-toggle-btn');

  // Open Drawer
  if (hamburgerBtn && mobileDrawer && backdrop) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      mobileDrawer.classList.add('open');
      backdrop.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
  }

  // Close Drawer Function
  const closeDrawer = () => {
    if (mobileDrawer) mobileDrawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    document.body.style.overflow = '';
  };

  if (drawerCloseBtn) {
    drawerCloseBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', closeDrawer);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileDrawer && mobileDrawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // Desktop/Mobile Search Handling
  const handleSearch = (query) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const isHe = window.location.pathname.startsWith('/he');
    const searchBase = isHe ? '/he/search.html' : '/search.html';
    if ((window.location.pathname === '/stock-data.html' || window.location.pathname === '/he/shuk-hon.html') && typeof searchStock === 'function') {
      if (navSearchInput) navSearchInput.value = trimmed.toUpperCase();
      searchStock();
    } else {
      window.location.href = `${searchBase}?q=${encodeURIComponent(trimmed)}`;
    }
  };

  if (navSearchForm && navSearchInput) {
    navSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSearch(navSearchInput.value);
    });
  }

  if (mobileDrawerSearchForm && mobileDrawerSearchInput) {
    mobileDrawerSearchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSearch(mobileDrawerSearchInput.value);
    });
  }

  if (mobileSearchBtn) {
    mobileSearchBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (mobileDrawer && backdrop) {
        mobileDrawer.classList.add('open');
        backdrop.classList.add('open');
        if (mobileDrawerSearchInput) mobileDrawerSearchInput.focus();
      }
    });
  }

  // Theme Toggle (Light / Dark)
  const savedMode = localStorage.getItem('ttd-theme-mode') || 'dark';
  document.documentElement.setAttribute('data-mode', savedMode);

  if (themeToggleBtn) {
    const updateThemeIcon = (mode) => {
      const icon = themeToggleBtn.querySelector('i');
      if (icon) {
        icon.className = mode === 'dark' ? 'bi bi-sun' : 'bi bi-moon-stars';
      }
    };

    updateThemeIcon(savedMode);

    themeToggleBtn.addEventListener('click', () => {
      const currentMode = document.documentElement.getAttribute('data-mode') || 'dark';
      const nextMode = currentMode === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-mode', nextMode);
      localStorage.setItem('ttd-theme-mode', nextMode);
      updateThemeIcon(nextMode);
    });
  }
}

/**
 * Initializes category loading from Firebase Firestore
 */
function initializeResponsiveCategories() {
  const DEFAULT_CATEGORIES = [
    { name: 'AI', slug: 'ai', icon: 'bi-robot' },
    { name: 'Dev', slug: 'dev', icon: 'bi-code-slash' },
    { name: 'Computing', slug: 'computing', icon: 'bi-cpu' },
    { name: 'Markets', slug: 'stock-data', icon: 'bi-graph-up' },
    { name: 'Podcasts', slug: 'podcasts', icon: 'bi-headphones' },
    { name: 'Design Systems', slug: 'design-systems', icon: 'bi-palette' },
    { name: 'AI Tools', slug: 'ai-tools', icon: 'bi-tools' }
  ];

  const waitForFirebase = () => new Promise(resolve => {
    let attempts = 0;
    const interval = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
        clearInterval(interval);
        resolve(true);
      } else if (++attempts >= 25) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  const fetchCategories = async () => {
    const ready = await waitForFirebase();
    if (!ready) return DEFAULT_CATEGORIES;

    try {
      const db = firebase.firestore();
      let snapshot = await db.collection('sections').where('active', '==', true).orderBy('order', 'asc').get();
      if (snapshot.empty) {
        snapshot = await db.collection('categories').orderBy('order', 'asc').get();
      }
      if (snapshot.empty) return DEFAULT_CATEGORIES;

      const categories = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        categories.push({
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
          icon: data.icon || 'bi-newspaper'
        });
      });
      return categories;
    } catch (e) {
      console.warn("Using default categories due to fetch error:", e);
      return DEFAULT_CATEGORIES;
    }
  };

  fetchCategories().then(cats => {
    // Categories are loaded and available
    console.log("Navigation categories ready:", cats.length);
  });
}

/**
 * Load categories in footer
 */
function loadFooterCategories() {
  const isHebrew = window.location.pathname.startsWith('/he');
  const footerDesc = document.getElementById('footer-description');
  if (footerDesc && isHebrew) {
    footerDesc.textContent = 'מודיעין טכנולוגי בזמן אמת, פריצות דרך בבינה מלאכותית, ניתוחי חומרה ומערכות עיצוב למהנדסים ולמובילי טכנולוגיה.';
  }
}

// Event Listeners for Firebase initialization
document.addEventListener('firebase-ready', () => {
  firebaseReadyFired = true;
  if (!navigationInitialized) {
    initializeNavigation();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!navigationInitialized && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      initializeNavigation();
    } else if (!navigationInitialized) {
      initializeNavigation();
    }
  }, 300);
});

window.initializeNavigation = initializeNavigation;
