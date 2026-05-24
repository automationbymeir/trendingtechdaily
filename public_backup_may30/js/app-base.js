// public/js/app-base.js (Corrected Version with New URL Structure)
console.log("app-base.js loading...");

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg", // Use your actual key
    authDomain: "trendingtech-daily.firebaseapp.com",
    projectId: "trendingtech-daily",
    storageBucket: "trendingtech-daily.firebasestorage.app", // Corrected bucket name
    messagingSenderId: "343812872871",
    appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

// --- Global Firebase Variables ---
let db, functions, auth;

// --- Initialize Firebase & Core Logic ---
try {
    console.log("Initializing Firebase...");
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    functions = firebase.functions();
    auth = firebase.auth();
    console.log("Firebase Initialized Successfully.");
} catch (error) {
    console.error("FATAL: Firebase initialization failed in app-base.js:", error);
    document.addEventListener('DOMContentLoaded', () => {
         const body = document.body;
         if (body) { body.innerHTML = '<div class="alert alert-danger m-5" role="alert">Application critical error. Please refresh.</div>'; }
         else { alert("Critical Error: Failed to initialize Firebase."); }
    });
    throw new Error("Firebase init failed - stopping app-base.js execution");
}

// --- Helper Function ---
function getSafe(fn, defaultValue = '') {
    try { const value = fn(); return (value !== null && value !== undefined) ? value : defaultValue; }
    catch (e) { console.warn("getSafe caught an error:", e); return defaultValue; }
}

// --- Global Cache ---
const categoryCache = {};

// --- Attach all event listeners and loaders after the DOM is ready ---
document.addEventListener('DOMContentLoaded', function() {
    console.log("app-base.js: DOM Loaded.");

    function loadNavbarAndDependentContent() {
        const placeholder = document.getElementById('navbar-placeholder');
        if (!placeholder) {
            console.error("Critical: Navbar placeholder not found in HTML!");
            return;
        }

        fetch('/nav.html')
            .then(response => {
                if (!response.ok) throw new Error(`nav.html load failed: ${response.status}`);
                return response.text();
            })
            .then(html => {
                placeholder.innerHTML = html;
                console.log("Navbar HTML successfully injected.");

                setupAuthListener(); 

                const path = window.location.pathname;
                document.querySelectorAll('#navbar-placeholder .nav-link').forEach(link => {
                    if (new URL(link.href).pathname === path) {
                        link.classList.add('active');
                    }
                });

                // =================================================================
                //  *** FIX IMPLEMENTATION: CHAIN DEPENDENT FUNCTIONS ***
                //  We now ensure sections load first, then anything that
                //  depends on the categoryCache (like latest articles) runs after.
                // =================================================================
                if (typeof loadSiteSettings === 'function') loadSiteSettings();

                if (typeof loadSections === 'function') {
                    // loadSections() now returns a promise
                    loadSections().then(() => {
                        console.log("Sections and category cache loaded successfully.");
                        // Now it's safe to load components that rely on the cache
                        if (typeof loadLatestArticles === 'function') {
                            loadLatestArticles();
                        }
                    }).catch(error => {
                        console.error("Error during the sequential loading process:", error);
                    });
                }
                
                if (typeof loadRealTimeStockData === 'function') loadRealTimeStockData();
            })
            .catch(err => {
                console.error('Error loading nav.html:', err);
                placeholder.innerHTML = '<div style="text-align:center; color:red; padding: 1rem;">Failed to load navigation.</div>';
            });
    }

    loadNavbarAndDependentContent();
});

// --- Auth State Management ---
function setupAuthListener() {
    auth.onAuthStateChanged(user => {
        console.log("Auth state changed:", user ? `User UID: ${user.uid}` : "No user logged in");
        
        const loginLink = document.getElementById('auth-login-link');
        const signupLink = document.getElementById('auth-signup-link');
        const profileMenu = document.getElementById('auth-profile-menu');
        const profilePicNav = document.getElementById('user-profile-pic-nav');
        const displayNameNav = document.getElementById('user-display-name-nav');
        const logoutBtnNav = document.getElementById('auth-logout-btn');

        if (user) {
            if (loginLink) loginLink.style.display = 'none';
            if (signupLink) signupLink.style.display = 'none';
            if (profileMenu) profileMenu.style.display = 'list-item';
            if (profilePicNav) profilePicNav.src = user.photoURL || '/img/default-avatar.png';
            if (displayNameNav) displayNameNav.textContent = user.displayName || user.email?.split('@')[0] || 'User';
            if (logoutBtnNav) {
                const newLogoutBtn = logoutBtnNav.cloneNode(true);
                logoutBtnNav.parentNode?.replaceChild(newLogoutBtn, logoutBtnNav);
                newLogoutBtn.addEventListener('click', () => { 
                    auth.signOut().catch(error => console.error("Sign out error", error)); 
                });
            }
        } else {
            if (loginLink) loginLink.style.display = 'list-item';
            if (signupLink) signupLink.style.display = 'list-item';
            if (profileMenu) profileMenu.style.display = 'none';
        }
    });
}

// =================================================================
//  *** UPDATED FUNCTION: LOAD LATEST ARTICLES WITH NEW URL STRUCTURE ***
// =================================================================
function loadLatestArticles() {
    const container = document.getElementById('latest-articles-container');
    // Exit if the container isn't on the current page
    if (!container) {
        return; 
    }

    container.innerHTML = `<div class="spinner-container"><div class="spinner-border" role="status"></div><p>Loading Latest Articles...</p></div>`;

    db.collection('articles')
      .where('published', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(6)
      .get()
      .then(snapshot => {
          if (snapshot.empty) {
              container.innerHTML = '<p class="text-muted text-center">No articles found.</p>';
              return;
          }

          let articlesHtml = '<div class="article-grid">';
          snapshot.forEach(doc => {
              const article = { id: doc.id, ...doc.data() };
              const title = getSafe(() => article.title, 'Untitled Article');
              
              // Get category info from cache
              const categoryId = getSafe(() => article.category);
              const categoryInfo = categoryCache[categoryId] || { name: 'Uncategorized', slug: 'uncategorized' };
              const categoryName = typeof categoryInfo === 'string' ? categoryInfo : categoryInfo.name;
              const categorySlug = typeof categoryInfo === 'object' ? categoryInfo.slug : categoryId?.toLowerCase() || 'uncategorized';
              
              // Use new URL structure
              const url = article.slug ? `/${categorySlug}/${article.slug}` : '#';
              
              const imageUrl = getSafe(() => article.featuredImage);
              const publishedDate = getSafe(() => {
                  if (article.createdAt && article.createdAt.toDate) {
                      return new Date(article.createdAt.toDate()).toLocaleDateString();
                  }
                  return 'N/A';
              });

              articlesHtml += `
                <div class="article-card ${!imageUrl ? 'no-image' : ''}">
                  <div class="article-image-container ${!imageUrl ? 'no-image' : ''}">
                    ${imageUrl ? `<div class="category-badge" data-category-id="${categoryId}">${categoryName}</div><a href="${url}"><img src="${imageUrl}" alt="${title}" class="article-image" loading="lazy" onerror="this.parentElement.style.display='none';"></a>` : `<div class="article-placeholder">No Image</div>`}
                  </div>
                  <div class="article-content">
                    <h3 class="article-title"><a href="${url}">${title}</a></h3>
                    <div class="article-meta">
                      <span>${publishedDate}</span>
                    </div>
                  </div>
                </div>`;
          });
          articlesHtml += '</div>';
          container.innerHTML = articlesHtml;
      })
      .catch(error => {
          console.error("Error loading latest articles:", error);
          container.innerHTML = '<p class="text-danger text-center">Could not load latest articles.</p>';
      });
}

// *** UPDATED: This function now uses new URL structure ***
function loadSections() {
  const categoryNavPlaceholder = document.getElementById('category-nav-placeholder');
  const footerCategoriesList = document.getElementById('footer-categories-list');
  const sidebarContainer = document.getElementById('categories-list');
  
  // Return the promise chain
  return db.collection('sections').where('active', '==', true).orderBy('order').limit(10).get()
    .then(snap => {
        let navHTML = '';
        let footerCategoriesHTML = '';
        let sideHTML = '';
        let apiSections = [];
        
        if (!snap.empty) {
            snap.forEach(doc => {
                const section = { id: doc.id, ...doc.data() };
                // Use clean URLs instead of query parameters
                const url = `/${getSafe(() => section.slug, doc.id.toLowerCase())}`;
                const name = getSafe(() => section.name, 'Unnamed Section');
                
                navHTML += `<li class="nav-item"><a class="nav-link" href="${url}">${name}</a></li>`;
                footerCategoriesHTML += `<li><a href="${url}">${name}</a></li>`;
                if (sidebarContainer) sideHTML += `<li><a href="${url}">${name}</a></li>`;
                
                // Populate the cache with both name and slug
                categoryCache[doc.id] = {
                    name: name,
                    slug: getSafe(() => section.slug, doc.id.toLowerCase())
                };
                
                if (section.api) apiSections.push(section);
            });
        }
        
        // Add stock data link
        const stockDataUrl = '/stock-data';
        const stockDataLinkText = 'Stock Data';
        navHTML += `<li class="nav-item"><a class="nav-link" href="${stockDataUrl}">${stockDataLinkText}</a></li>`;
        footerCategoriesHTML += `<li><a href="${stockDataUrl}">${stockDataLinkText}</a></li>`;
        if (sidebarContainer) sideHTML += `<li><a href="${stockDataUrl}">${stockDataLinkText}</a></li>`;

        if (categoryNavPlaceholder && navHTML) {
            const fragment = document.createDocumentFragment();
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = navHTML;
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            categoryNavPlaceholder.parentNode.insertBefore(fragment, categoryNavPlaceholder);
        }
        
        if (footerCategoriesList) footerCategoriesList.innerHTML = footerCategoriesHTML || '<li>No categories found.</li>';
        if (sidebarContainer) sidebarContainer.innerHTML = sideHTML || '<li>No categories found.</li>';
        
        const apiContainer = document.getElementById('api-articles-container');
        document.getElementById('api-loading-initial')?.remove();
        
        if (apiSections.length > 0 && apiContainer) {
            if (typeof loadAndRenderApiArticles === 'function') {
                apiContainer.innerHTML = '';
                apiSections.forEach(cat => loadAndRenderApiArticles(cat));
            } else {
                console.error("loadAndRenderApiArticles function is not defined!");
            }
        } else if (apiContainer) {
            apiContainer.innerHTML = ''; // Clear if no API sections
        }
    }).catch(error => {
        console.error('Error loading sections:', error);
        if (sidebarContainer) sidebarContainer.innerHTML = '<li>Error loading categories</li>';
        if (footerCategoriesList) footerCategoriesList.innerHTML = '<li>Error loading categories</li>';
        // Propagate the error to be caught by the caller
        throw error;
    });
}

function loadSiteSettings() {
    if (!db) { console.error("Firestore (db) not initialized for loadSiteSettings"); return; }
      Promise.all([
          db.collection('settings').doc('general').get(),
          db.collection('settings').doc('footer').get(),
          db.collection('settings').doc('social').get()
      ]).then(([gD, fD, sD]) => {
          const siteTitleDefault = 'TrendingTech Daily';
          let siteTitle = siteTitleDefault;
          if (gD.exists) {
              const g = gD.data();
              siteTitle = getSafe(() => g.siteTitle, siteTitleDefault);
              const desc = getSafe(() => g.siteDescription,'Latest tech news...');
              const siteLogo = getSafe(() => g.siteLogo);
              document.title = `${siteTitle} - Latest Tech News`;
              document.getElementById('masthead-title').textContent = siteTitle;
              document.getElementById('masthead-description').textContent = desc;
              document.getElementById('footer-site-title').textContent = siteTitle;
              document.getElementById('footer-description').textContent = desc.substring(0,150)+(desc.length>150?'...':'');
              const brand = document.querySelector('.navbar-brand');
              if (brand) { brand.innerHTML = siteLogo ? `<img src="${siteLogo}" alt="${siteTitle}" style="max-height:40px;width:auto;">` : siteTitle; }
          }
          if (fD.exists) {
              const f = fD.data();
              document.getElementById('footer-text').textContent = getSafe(() => f.footerText, `© ${new Date().getFullYear()} ${siteTitle}`);
              document.getElementById('contact-email').textContent = getSafe(() => f.contactEmail,'N/A');
              document.getElementById('contact-address').textContent = getSafe(() => f.contactAddress,'N/A');
          } else { document.getElementById('footer-text').textContent = `© ${new Date().getFullYear()} ${siteTitle}`; }
          const socialContainer = document.getElementById('footer-social-links');
          if (sD.exists && socialContainer) {
              const s = sD.data(); let html = '';
              if (getSafe(()=>s.facebookUrl)) html += `<a href="${s.facebookUrl}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm me-2" title="Facebook"><i class="bi bi-facebook"></i></a>`;
              if (getSafe(()=>s.twitterUrl)) html += `<a href="${s.twitterUrl}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm me-2" title="Twitter"><i class="bi bi-twitter-x"></i></a>`;
              if (getSafe(()=>s.instagramUrl)) html += `<a href="${s.instagramUrl}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm me-2" title="Instagram"><i class="bi bi-instagram"></i></a>`;
              if (getSafe(()=>s.linkedinUrl)) html += `<a href="${s.linkedinUrl}" target="_blank" rel="noopener" class="btn btn-outline-secondary btn-sm me-2" title="LinkedIn"><i class="bi bi-linkedin"></i></a>`;
              socialContainer.innerHTML = html ? `<h6 class="mt-2">Follow Us</h6><div>${html}</div>` : '';
          } else if (socialContainer) { socialContainer.innerHTML = ''; }
      }).catch(error => { console.error('Error loading site settings:', error); });
}

function loadRealTimeStockData() {
    const tickerContainer = document.getElementById('stock-ticker');
      if (!tickerContainer) return;
      const innerContent = tickerContainer.querySelector('.stock-ticker-inner-content');
      const errorElement = tickerContainer.querySelector('.stock-ticker-error');
      if (!innerContent || !errorElement || !functions) { console.warn("Stock ticker elements or Functions service not ready."); return; }
      errorElement.textContent = 'Loading stock data...';
      errorElement.style.display = 'block';
      innerContent.innerHTML = '';
      const symbols = ['AAPL','MSFT','AMZN','GOOGL','META','NVDA','TSLA'];
      const getStocksCallable = functions.httpsCallable('getStockDataForCompanies');
      getStocksCallable({ symbols: symbols })
        .then(result => {
          const stockData = getSafe(() => result.data.stockData, []);
          if (!Array.isArray(stockData) || stockData.length === 0) throw new Error("No stock data received.");
          let stockHtml = '';
          let validDataCount = 0;
          stockData.forEach(stock => {
            const symbol = getSafe(() => stock.symbol,'ERR');
            if (stock.error || typeof stock.c === 'undefined' || typeof stock.dp === 'undefined') {
              console.warn(`Error/incomplete data for stock: ${symbol}`, stock.message || '');
              stockHtml += `<div class="stock-item"><span class="stock-symbol">${symbol}</span><span class="stock-price text-muted">--</span><span class="stock-change text-muted">Error</span></div>`;
            } else {
              const price = getSafe(() => stock.c, 0);
              const percentChange = getSafe(() => stock.dp, 0);
              const changeClass = percentChange >= 0 ? 'text-success' : 'text-danger';
              stockHtml += `<div class="stock-item"><span class="stock-symbol">${symbol}</span><span class="stock-price">${price.toFixed(2)}</span><span class="stock-change ${changeClass}">${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%</span></div>`;
               validDataCount++;
            }
          });
           if (validDataCount > 0) {
                innerContent.innerHTML = stockHtml + stockHtml;
                errorElement.style.display = 'none';
           } else { throw new Error("No valid stock data retrieved."); }
        })
        .catch(error => {
          console.error('Error loading stock data:', error);
          errorElement.textContent = `Stock data unavailable: ${getSafe(()=>error.message,'Error')}`;
          errorElement.style.display = 'block';
          innerContent.innerHTML = '';
        });
}

// --- MOVED FROM INDEX.HTML: Load/Render API Articles ---
function loadAndRenderApiArticles(category) {
      const apiContainer = document.getElementById('api-articles-container');
      if (!apiContainer || !functions) { console.warn("API container or Functions service not ready."); return; }
      const categoryId = `cat-api-${category.id}`;
      let categorySection = document.getElementById(categoryId);

      const categorySlug = getSafe(() => category.slug, category.id.toLowerCase());

      if (!categorySection) {
        apiContainer.insertAdjacentHTML('beforeend', `
        <div id="${categoryId}" class="category-articles-section">
        <div class="section-header">
            <h2 class="section-title">${getSafe(() => category.name, 'News')}</h2><a href="/${categorySlug}" class="see-all">See All</a></div>
            <div class="spinner-container"><div class="spinner-border" role="status"></div><p>Loading ${getSafe(() => category.name, 'news')} articles...</p></div>
          </div>`);
        categorySection = document.getElementById(categoryId);
      } else { categorySection.querySelector('.spinner-container')?.remove(); categorySection.insertAdjacentHTML('beforeend', `<div class="spinner-container"><div class="spinner-border" role="status"></div><p>Loading...</p></div>`); }
      if (!categorySection) { console.error(`Could not create/find container ${categoryId}`); return; }

      let functionName = ''; let params = {};
      const sourceApi = getSafe(() => category.api, '');
      const customQuery = getSafe(() => category.apiQuery, '').trim();
      const categoryName = getSafe(() => category.name, '');
      let actualQuery = '';

      if (customQuery) { actualQuery = customQuery; }
      else {
          const lower = categoryName.toLowerCase();
          if (sourceApi === 'newsapi') { actualQuery = ['gadgets','crypto','ai','startups'].includes(lower) ? (lower==='crypto'?'cryptocurrency':lower==='ai'?'"artificial intelligence"':`tech ${lower}`) : 'technology'; }
          else if (sourceApi === 'gnews') { actualQuery = lower === 'ai' ? '"artificial intelligence"' : lower === 'startups' ? '"tech startup"' : categoryName || 'technology'; }
          else { actualQuery = categoryName || 'technology';}
      }

      if (!actualQuery) { renderApiError(category, new Error("No query configured.")); return; }

      switch (sourceApi) {
          case 'newsapi':
              functionName = 'getNewsApiArticles';
              params = (actualQuery !== 'technology' || customQuery) ? { endpoint: 'everything', query: actualQuery } : { endpoint: 'top-headlines', category: 'technology' };
              break;
          case 'gnews':
              functionName = 'getGnewsArticles';
              params = { query: actualQuery };
              break;
          default: renderApiError(category, new Error(`Unsupported API: ${sourceApi || 'N/A'}`)); return;
      }

      if (!functionName) { renderApiError(category, new Error("Config error.")); return; }

      console.log(`Calling ${functionName} for ${categoryName} with params:`, params);
      const callableFunction = functions.httpsCallable(functionName);
      callableFunction(params)
        .then(result => { renderApiArticles(category, getSafe(() => result.data.articles, []), sourceApi); })
        .catch(error => { renderApiError(category, error); });
}

// --- UPDATED: Render API Articles with new URL structure ---
function renderApiArticles(category, articles, sourceApi) {
      const categoryId = `cat-api-${category.id}`;
      const categorySection = document.getElementById(categoryId);
      if (!categorySection) return;

      const categorySlug = getSafe(() => category.slug, category.id.toLowerCase());
      const categoryUrl = `/${categorySlug}`;
      const categoryName = getSafe(() => category.name, 'News');

      let sectionHtml = `<div class="section-header"><h2 class="section-title">${categoryName}</h2><a href="${categoryUrl}" class="see-all">See All</a></div>`;
      if (!articles || articles.length === 0) { sectionHtml += `<p class="text-center text-muted mt-3">No recent articles found via ${sourceApi} for ${categoryName}.</p>`; }
      else {
          sectionHtml += '<div class="article-grid">';
          articles.slice(0, 3).forEach(article => {
              const title = getSafe(() => article.title, 'Untitled');
              let description = getSafe(() => article.description, '');
              if (description.length > 150) description = description.substring(0, 147) + '...';
              const url = getSafe(() => article.url, '#');
              const imageUrl = sourceApi === 'newsapi' ? article.urlToImage : article.image;
              const publishedDate = article.publishedAt ? new Date(article.publishedAt).toLocaleDateString() : 'N/A';
              const sourceName = getSafe(() => article.source?.name, '');
              sectionHtml += `
                <div class="article-card ${!imageUrl ? 'no-image' : ''}">
                  <div class="article-image-container ${!imageUrl ? 'no-image' : ''}">
                    ${imageUrl ? `<div class="category-badge" data-category="${categoryName}">${categoryName}</div><a href="${url}" target="_blank" rel="noopener noreferrer"><img src="${imageUrl}" alt="${title}" class="article-image" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'article-placeholder\\'>Image Error</div>';"></a>` : `<div class="article-placeholder">No Image</div>`}
                  </div>
                  <div class="article-content">
                    <h3 class="article-title"><a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
                    <p class="article-description">${description || 'No description.'}</p>
                    <div class="article-meta"><span>${publishedDate}</span>${sourceName ? `<span title="Source: ${sourceName}">Source: ${sourceName.substring(0,15)}${sourceName.length > 15 ? '...': ''}</span>` : ''}</div>
                  </div>
                </div>`;
          });
          sectionHtml += '</div>';
      }
      categorySection.innerHTML = sectionHtml;
}

// --- UPDATED: Render API Error with new URL structure ---
function renderApiError(category, error) {
  const categoryId = `cat-api-${category.id}`;
  const categorySection = document.getElementById(categoryId);
  if (!categorySection) return;

  const errorMessage = getSafe(() => error.message, '');
  // Check if the error is the specific rate-limit error from NewsAPI
  const isRateLimitError = errorMessage.includes('too many requests');

  if (isRateLimitError) {
      // If it's a rate limit error, hide the entire section and log a warning.
      console.warn(`Hiding section "${getSafe(() => category.name)}" due to API rate limit.`);
      categorySection.style.display = 'none';
      categorySection.innerHTML = ''; // Also clear its content
  } else {
      // For any other type of error, display the original error message.
      const categorySlug = getSafe(() => category.slug, category.id.toLowerCase());
      const categoryUrl = `/${categorySlug}`;
      const categoryName = getSafe(() => category.name, 'News');
      console.error(`Rendering API error for ${categoryName}:`, error);
      categorySection.innerHTML = `
      <div class="section-header"><h2 class="section-title">${categoryName}</h2><a href="${categoryUrl}" class="see-all">See All</a></div>
        <p class="text-danger text-center mt-3">Could not load articles.<br><small>(${errorMessage || 'Please try again later.'})</small></p>`;
  }
}

// Import email components when needed
function loadEmailComponent(componentName) {
  // Get the current script path
  const scripts = document.getElementsByTagName('script');
  const scriptPath = scripts[scripts.length - 1].src;
  const basePath = scriptPath.substring(0, scriptPath.lastIndexOf('/'));
  
  // Create a new script element
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = `/admin/components/email/${componentName}.js`;
  script.onload = function() {
    // Initialize the component once loaded
    const component = new window[`Email${componentName}`]();
    component.render('content-container');
  };
  script.onerror = function() {
    console.error(`Failed to load email ${componentName} component`);
    document.getElementById('content-container').innerHTML = 
      `<div class="alert alert-danger">Failed to load ${componentName} component</div>`;
  };
  
  // Add the script to the document
  document.head.appendChild(script);
}

// Define global functions to load each component
window.loadEmailCampaigns = function() {
  loadEmailComponent('Campaigns');
};

window.loadEmailTemplates = function() {
  loadEmailComponent('Templates');
};

window.loadEmailSubscribers = function() {
  loadEmailComponent('Subscribers');
};

window.loadEmailWorkflows = function() {
  loadEmailComponent('Workflows');
};

window.loadEmailAnalytics = function() {
  loadEmailComponent('Analytics');
};

window.loadEmailDashboard = function() {
  loadEmailComponent('Dashboard');
};

console.log("app-base.js loaded.");