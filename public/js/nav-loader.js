// js/nav-loader.js - Updated with proper category loading

let firebaseReadyFired = false;
let navigationInitialized = false; // Track initialization state

/**
 * The main function to initialize the entire navigation system.
 */
function initializeNavigation() {
  navigationInitialized = true; // Prevent duplicate initialization calls
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

  const navAlreadyLoaded = document.getElementById('navbarMain');
  const navFile = '/nav.html';

  if (navAlreadyLoaded) {
    // Navbar already exists; ensure helpers and categories are initialized
    initializeSearch();
    initializeResponsiveCategories();
    if (window.initializeAuth) {
      window.initializeAuth();
    }
  } else {
    // Load the navigation, then initialize all its interactive elements
    loadHTML(navFile, 'navbar-placeholder', () => {
      initializeSearch();
      initializeResponsiveCategories();
      if (window.initializeAuth) {
        window.initializeAuth();
      }
    });
  }

  // Load the footer
  const footerFile = '/footer.html';
  loadHTML(footerFile, 'footer-placeholder', () => {
    // After footer is loaded, populate categories if Firebase is ready
    if (typeof firebase !== 'undefined' && firebase.apps.length) {
      loadFooterCategories();
    }
  });
}

/**
 * Initializes the search bar toggle functionality.
 */
function initializeSearch() {
  const searchToggleBtn = document.getElementById('search-toggle-btn');
  const searchForm = document.getElementById('nav-search-form');
  const searchInput = document.getElementById('nav-search-input');

  if (!searchToggleBtn || !searchForm || !searchInput) {
    console.warn('Search elements not found.');
    return;
  }

  searchToggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    searchForm.classList.toggle('active');

    if (searchForm.classList.contains('active')) {
      searchInput.focus();
    }
  });

  // Close search when clicking outside
  document.addEventListener('click', (e) => {
    const nav = document.querySelector('.navbar');
    if (nav && !nav.contains(e.target)) {
      searchForm.classList.remove('active');
    }
  });
  
  // Handle search form submission
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value.trim();
    if (query) {
      // For stock data page, search stocks instead of redirecting
      if (window.location.pathname === '/stock-data.html' && typeof searchStock === 'function') {
        searchInput.value = query.toUpperCase();
        searchForm.classList.remove('active');
        searchStock();
      } else {
        // For other pages, redirect to search page
        window.location.href = `/search.html?q=${encodeURIComponent(query)}`;
      }
    }
  });
  
  // Handle Enter key in search input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      searchForm.dispatchEvent(new Event('submit'));
    }
  });
}

/**
 * Initializes responsive category loading and handling from Firebase.
 */
function initializeResponsiveCategories() {
  const DEFAULT_CATEGORIES = [
    { name: 'AI', slug: 'ai', order: 1 },
    { name: 'Gadgets', slug: 'gadgets', order: 2 },
    { name: 'Startups', slug: 'startups', order: 3 },
    { name: 'Crypto', slug: 'crypto', order: 4 }
  ];

  // Wait for Firebase to be ready before trying to fetch categories
  const waitForFirebase = () => new Promise(resolve => {
    let attempts = 0;
    const maxAttempts = 30; // ~3 seconds total
    const interval = setInterval(() => {
      if (typeof firebase !== 'undefined' && firebase.apps.length) {
        clearInterval(interval);
        resolve(true);
      } else if (++attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });

  const fetchCategoriesFromDB = async () => {
    const firebaseReady = await waitForFirebase();
    if (!firebaseReady) {
      console.warn("Firebase not initialized yet for categories; using defaults");
      return DEFAULT_CATEGORIES;
    }

    try {
      const db = firebase.firestore();

      // Try 'categories' collection first
      let snapshot = await db.collection('categories').orderBy('order', 'asc').get();

      // If categories collection is empty, try 'sections' collection
      if (snapshot.empty) {
        console.log("No documents in 'categories' collection, trying 'sections'");
        snapshot = await db.collection('sections').orderBy('order', 'asc').get();
      }

      if (snapshot.empty) {
        console.warn("No categories found in either 'categories' or 'sections' collections");
        return DEFAULT_CATEGORIES;
      }

      const categories = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        categories.push({
          id: doc.id,
          name: data.name,
          slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
          order: data.order || 999
        });
      });

      console.log('Categories loaded:', categories);
      return categories;

    } catch (error) {
      console.error("Error fetching categories from Firebase:", error);
      // Return default categories as fallback
      return DEFAULT_CATEGORIES;
    }
  };

  const renderCategories = (categories) => {
    const navbarNav = document.querySelector('#navbarMain .navbar-nav');
    const moreDropdownMenu = document.getElementById('more-dropdown-menu');
    const moreDropdown = document.getElementById('more-dropdown');
    const podcastsLabel = 'Podcasts';
    const stocksLabel = 'Stocks';

    if (!navbarNav) {
      console.error('Navbar nav element not found');
      return;
    }

    // First, remove any existing category items to prevent duplicates
    navbarNav.querySelectorAll('[data-category="true"]').forEach(el => el.remove());
    
    // Determine how many categories to show based on screen width
    const maxVisibleCategories = window.innerWidth >= 992 ? 5 : 3;
    const visibleCategories = categories.slice(0, maxVisibleCategories);
    const hiddenCategories = categories.slice(maxVisibleCategories);

    // Find where to insert categories (before the More dropdown)
    const insertBeforeElement = moreDropdown || navbarNav.querySelector('.nav-item:not([data-category="true"])');
    
    // Add visible categories
    visibleCategories.forEach(cat => {
      const li = document.createElement('li');
      li.className = 'nav-item';
      li.setAttribute('data-category', 'true'); // Mark as category item
      const a = document.createElement('a');
      a.className = 'nav-link';
      a.href = `/${cat.slug}`;
      a.textContent = cat.name;
      li.appendChild(a);
      
      if (insertBeforeElement) {
        navbarNav.insertBefore(li, insertBeforeElement);
      } else {
        navbarNav.appendChild(li);
      }
    });

    // Handle overflow categories in dropdown
    if (moreDropdownMenu && moreDropdown) {
      moreDropdownMenu.innerHTML = '';

      hiddenCategories.forEach(cat => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'dropdown-item';
        a.href = `/${cat.slug}`;
        a.textContent = cat.name;
        li.appendChild(a);
        moreDropdownMenu.appendChild(li);
      });

      // Always include Podcasts and Stock Data links
      const podcastsLi = document.createElement('li');
      const podcastsLink = document.createElement('a');
      podcastsLink.className = 'dropdown-item';
      podcastsLink.href = '/podcasts.html';
      podcastsLink.innerHTML = `<i class="bi bi-mic me-1"></i>${podcastsLabel}`;
      podcastsLi.appendChild(podcastsLink);
      moreDropdownMenu.appendChild(podcastsLi);

      const stocksLi = document.createElement('li');
      const stocksLink = document.createElement('a');
      stocksLink.className = 'dropdown-item';
      stocksLink.href = '/stock-data.html';
      stocksLink.innerHTML = `<i class="bi bi-graph-up me-1"></i>${stocksLabel}`;
      stocksLi.appendChild(stocksLink);
      moreDropdownMenu.appendChild(stocksLi);

      if (moreDropdownMenu.children.length > 0) {
        moreDropdown.classList.remove('d-none');
      } else {
        moreDropdown.classList.add('d-none');
      }
    }
    
    // Add Stock Data link after categories (only if not already present)
    const existingStockLink = navbarNav.querySelector('a[href="/stock-data.html"]');
    if (!existingStockLink) {
      const stockLi = document.createElement('li');
      stockLi.className = 'nav-item';
      stockLi.setAttribute('data-category', 'true');
      const stockLink = document.createElement('a');
      stockLink.className = 'nav-link';
      stockLink.href = '/stock-data.html';
      stockLink.innerHTML = `<i class="bi bi-graph-up me-1"></i>${stocksLabel}`;
      stockLi.appendChild(stockLink);
      
      // Insert stocks link after categories but before More dropdown
      if (moreDropdown) {
        navbarNav.insertBefore(stockLi, moreDropdown);
      } else if (insertBeforeElement) {
        navbarNav.insertBefore(stockLi, insertBeforeElement);
      } else {
        navbarNav.appendChild(stockLi);
      }
    }
  };
  
  // Load and render categories
  fetchCategoriesFromDB().then(categories => {
    renderCategories(categories);
    
    // Re-render on window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        // Remove existing category items before re-rendering
        const navbarNav = document.querySelector('#navbarMain .navbar-nav');
        if (navbarNav) {
          // Remove all category items
          navbarNav.querySelectorAll('[data-category="true"]').forEach(el => el.remove());
          // Re-render categories
          renderCategories(categories);
        }
      }, 150);
    });
  });
}

/**
 * Load categories in the footer
 */
function loadFooterCategories() {
  const footerCategoriesList = document.getElementById('footer-categories-list');
  if (!footerCategoriesList || typeof firebase === 'undefined') return;
  
  const db = firebase.firestore();
  
  // Try categories collection first, then sections
  db.collection('categories').orderBy('order', 'asc').get()
    .then(snapshot => {
      if (snapshot.empty) {
        // Try sections collection
        return db.collection('sections').orderBy('order', 'asc').get();
      }
      return snapshot;
    })
    .then(snapshot => {
      if (!snapshot.empty) {
        let categoriesHTML = '';
        snapshot.forEach(doc => {
          const category = doc.data();
          const slug = category.slug || category.name.toLowerCase().replace(/\s+/g, '-');
          const href = `/${slug}`;
          categoriesHTML += `<li><a href="${href}">${category.name}</a></li>`;
        });
        footerCategoriesList.innerHTML = categoriesHTML;
      } else {
        // Use default categories
        footerCategoriesList.innerHTML = `
          <li><a href="/ai">AI</a></li>
          <li><a href="/gadgets">Gadgets</a></li>
          <li><a href="/startups">Startups</a></li>
          <li><a href="/crypto">Crypto</a></li>
        `;
      }
    })
    .catch(error => {
      console.error('Error loading footer categories:', error);
      footerCategoriesList.innerHTML = '<li class="text-muted">Unable to load categories</li>';
    });
}


// Wait for Firebase to be ready
document.addEventListener('firebase-ready', () => {
  firebaseReadyFired = true;
  console.log('Firebase ready event fired');
  if (!navigationInitialized) {
    initializeNavigation();
  }
});

// Fallback initialization methods
document.addEventListener('DOMContentLoaded', () => {
  // Check if Firebase is already initialized after a delay
  setTimeout(() => {
    if (!navigationInitialized && !firebaseReadyFired && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
      console.log('Fallback: Initializing navigation without firebase-ready event');
      initializeNavigation();
    }
  }, 1000);

  // Also check immediately for pages that initialize Firebase synchronously
  if (!navigationInitialized && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0) {
    console.log('Firebase already initialized, loading navigation immediately');
    initializeNavigation();
  }
});

// Export for manual initialization if needed
window.initializeNavigation = initializeNavigation;
