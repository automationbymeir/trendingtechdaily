// Configuration for the website
const CONFIG = {
  siteName: "TrendingTech Daily",
  siteDescription: "Latest tech news, product releases, and market trends in one place",
  categories: ["AI", "Gadgets", "Startups", "Crypto"],
  fallbackImages: {
    "AI": "https://images.unsplash.com/photo-1677442135394-633f44004c86?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    "Gadgets": "https://images.unsplash.com/photo-1526570207772-2a4269e3ac40?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    "Startups": "https://images.unsplash.com/photo-1661956602116-661d5c25f9f4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    "Crypto": "https://images.unsplash.com/photo-1640340002902-a0588c2a6f38?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80",
    "default": "https://images.unsplash.com/photo-1488590528505-98fb2e5ea1c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"
  }
};

// DOMContentLoaded initialization
document.addEventListener('DOMContentLoaded', function() {
  // Set the current year in the footer and last updated time
  document.getElementById('current-year').textContent = new Date().getFullYear();
  document.getElementById('last-updated').textContent = new Date().toLocaleString();
  
  // Initialize Firebase
  try {
    const firebaseConfig = {
    apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg", // Replace with your actual config
    authDomain: "trendingtech-daily.firebaseapp.com",
    projectId: "trendingtech-daily",
    storageBucket: "trendingtech-daily.firebasestorage.app", // Corrected bucket name
    messagingSenderId: "343812872871",
    appId: "1:343812872871:web:5bd68bd7d6140d83551982"
  };
    
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully");
    // Load categories into navigation, sidebar, and footer
    loadCategories();
    

     // Load stock ticker data
  loadStockTicker();  // Add this line


    // Load news content from Firestore
    loadContentFromFirestore();
    
    // Set up the newsletter signup form
    setupNewsletterForm();
    
  } catch (error) {
    console.error("Firebase initialization error:", error);
    showErrorMessage("Unable to connect to the database. Please try again later.");
  }
});

// Display error messages in the main content area
function showErrorMessage(message) {
  const contentContainer = document.getElementById('content-container');
  contentContainer.innerHTML = `<div class="alert alert-danger my-5">${message}</div>`;
}

// Populate the navigation, trending topics, and footer with categories
function loadCategories() {
  const categoriesNav = document.getElementById('categories-nav');
  const trendingTopics = document.getElementById('trending-topics');
  const footerCategories = document.getElementById('footer-categories');
  
  // Clear any existing content
  categoriesNav.innerHTML = '';
  trendingTopics.innerHTML = '';
  footerCategories.innerHTML = '';
  
  // Add each category as a link or item in the different UI sections.
  CONFIG.categories.forEach(category => {
      const categorySlug = category.toLowerCase();
      
      // Main navigation - create proper li and a elements
      const navItem = document.createElement('li');
      navItem.className = 'nav-item';
      
      const navLink = document.createElement('a');
      navLink.href = `/${categorySlug}`; // Updated to new URL structure
      navLink.className = 'nav-link';
      navLink.textContent = category;
      
      navItem.appendChild(navLink);
      categoriesNav.appendChild(navItem);
      
      // Trending topics - create proper li and a elements
      const trendingItem = document.createElement('li');
      
      const trendingLink = document.createElement('a');
      trendingLink.href = `/${categorySlug}`; // Updated to new URL structure
      trendingLink.textContent = category;
      
      trendingItem.appendChild(trendingLink);
      trendingTopics.appendChild(trendingItem);
      
      // Footer categories - create proper li and a elements
      const footerItem = document.createElement('li');
      
      const footerLink = document.createElement('a');
      footerLink.href = `/${categorySlug}`; // Updated to new URL structure
      footerLink.textContent = category;
      
      footerItem.appendChild(footerLink);
      footerCategories.appendChild(footerItem);
    });
}

// Load content from Firestore and create a section per category with a loading indicator
async function loadContentFromFirestore() {
  const contentContainer = document.getElementById('content-container');
  // Show a main loading indicator during content fetch
  contentContainer.innerHTML = `
    <div class="text-center my-5" id="main-loading-indicator">
      <div class="spinner-border" role="status"></div>
      <p class="mt-3">Loading latest news...</p>
    </div>
  `;
  
  try {
    // Create category sections with titles and individual loading indicators
    CONFIG.categories.forEach(category => {
      const sectionElement = document.createElement('div');
      sectionElement.id = category.toLowerCase();
      sectionElement.className = 'mb-5';
      
      const titleElement = document.createElement('h2');
      titleElement.className = 'section-title';
      titleElement.textContent = category;
      sectionElement.appendChild(titleElement);
      
      const loadingElement = document.createElement('div');
      loadingElement.className = 'text-center py-3';
      loadingElement.id = `loading-${category.toLowerCase()}`;
      loadingElement.innerHTML = `
        <div class="spinner-border spinner-border-sm" role="status"></div>
        <p class="mt-2">Loading articles...</p>
      `;
      sectionElement.appendChild(loadingElement);
      
      contentContainer.appendChild(sectionElement);
    });
    
    const db = firebase.firestore();
    let hasAnyContent = false;
    
    // For each category, retrieve up to 10 news articles
    for (const category of CONFIG.categories) {
      const articles = [];
      
      // Query for articles (not news) with the new structure
      const snapshot = await db.collection('articles')
        .where('category', '==', category.toLowerCase()) // Assuming category IDs are lowercase
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();
      
      if (snapshot.empty) {
        console.log(`No articles found for ${category}`);
        const sectionElement = document.getElementById(category.toLowerCase());
        if (sectionElement) {
          // Remove the loading indicator but keep the title
          const loadingIndicator = document.getElementById(`loading-${category.toLowerCase()}`);
          if (loadingIndicator) loadingIndicator.remove();
          
          // Show a message that no articles are available for this category
          const noArticlesMsg = document.createElement('div');
          noArticlesMsg.className = 'alert alert-info';
          noArticlesMsg.textContent = 'No articles available for this category yet.';
          sectionElement.appendChild(noArticlesMsg);
        }
        continue;
      }
      
      hasAnyContent = true;
      snapshot.forEach(doc => {
        articles.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      renderCategoryContent(category, articles);
    }
    
    // Remove the main loading indicator after all categories have been processed
    const mainLoadingIndicator = document.getElementById('main-loading-indicator');
    if (mainLoadingIndicator) mainLoadingIndicator.remove();
    
    if (!hasAnyContent) {
      // If no articles were found in any category, provide a fallback message
      contentContainer.innerHTML = `
        <div class="alert alert-warning my-4">
          <h4><i class="fas fa-exclamation-triangle me-2"></i>No news content found</h4>
          <p>It looks like there are no articles available yet. Click the "Update News" button in the top navigation bar to fetch the latest content.</p>
          <button class="btn btn-primary" onclick="updateNews()">Update News Now</button>
        </div>
      `;
    }
  } catch (error) {
    console.error('Error loading content from Firestore:', error);
    contentContainer.innerHTML = `
      <div class="alert alert-danger my-4">
        <h4><i class="fas fa-exclamation-triangle me-2"></i>Error loading content</h4>
        <p>We encountered a problem loading news content. Please try again later.</p>
        <p><small>Technical details: ${error.message}</small></p>
      </div>
    `;
  }
}

// Render the articles for a given category.
// This function first removes the category's individual loading indicator,
// then adds the section title (if needed), the featured article, and the article grid.
function renderCategoryContent(category, articles) {
  if (!articles || articles.length === 0) return;
  
  const sectionId = category.toLowerCase();
  const sectionElement = document.getElementById(sectionId);
  if (!sectionElement) return;
  
  // Remove the category's loading indicator if it exists.
  const loadingIndicator = document.getElementById(`loading-${sectionId}`);
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
  
  // Clear any previous content
  sectionElement.innerHTML = '';
  
  // Always add the category header.
  const titleElement = document.createElement('h2');
  titleElement.className = 'section-title';
  titleElement.textContent = category;
  sectionElement.appendChild(titleElement);
  
  // Helper to format dates.
  function formatDate(dateValue) {
    let date;
    if (dateValue && dateValue.toDate) {
      // Firestore timestamp
      date = dateValue.toDate();
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      date = new Date();
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
  
  // Determine whether this category is "Crypto"
  const isCrypto = sectionId === 'crypto';
  
  if (!isCrypto) {
    // For non-Crypto categories, render a featured article and then the grid.
    const featuredArticle = articles[0];
    const featuredElement = document.createElement('div');
    featuredElement.className = 'featured-article';
    
    // Generate URL with new structure
    const articleUrl = featuredArticle.slug ? `/${sectionId}/${featuredArticle.slug}` : '#';
    
    const fallbackSrc = CONFIG.fallbackImages[category] || CONFIG.fallbackImages.default;
    featuredElement.innerHTML = `
      <div class="article-image-container">
        <span class="category-badge" data-category="${category}">
          ${category}
        </span>
        <img 
          src="${featuredArticle.featuredImage || fallbackSrc}"
          alt="${featuredArticle.title}" 
          class="article-image"
          onerror="this.onerror=null; this.src='${fallbackSrc}';" 
        />
      </div>
      <h3 class="article-title">
        <a href="${articleUrl}">${featuredArticle.title}</a>
      </h3>
      <p class="article-description">${featuredArticle.excerpt || featuredArticle.description || ''}</p>
      <div class="article-meta">
        ${featuredArticle.author ? `<div class="article-author">
          <i class="fas fa-user"></i> ${featuredArticle.author}
        </div>` : ''}
        <div class="article-date">
          <i class="far fa-clock"></i> ${formatDate(featuredArticle.createdAt || featuredArticle.publishedAt)}
        </div>
        ${featuredArticle.readingTimeMinutes ? `<div class="reading-time">
          <i class="bi bi-clock-history"></i> ${featuredArticle.readingTimeMinutes} min read
        </div>` : ''}
      </div>
    `;
    sectionElement.appendChild(featuredElement);
    
    // Render remaining articles as grid (starting from index 1)
    if (articles.length > 1) {
      const gridElement = document.createElement('div');
      gridElement.className = 'article-grid';
      
      articles.slice(1).forEach(article => {
        const articleCard = document.createElement('div');
        articleCard.className = 'article-card';
        
        const articleUrl = article.slug ? `/${sectionId}/${article.slug}` : '#';
        const fallbackSrc = CONFIG.fallbackImages[category] || CONFIG.fallbackImages.default;
        
        articleCard.innerHTML = `
          <div class="article-image-container">
            <span class="category-badge" data-category="${category}">
              ${category}
            </span>
            <img 
              src="${article.featuredImage || fallbackSrc}"
              alt="${article.title}" 
              class="article-image"
              onerror="this.onerror=null; this.src='${fallbackSrc}';" 
            />
          </div>
          <div class="article-content">
            <h3 class="article-title">
              <a href="${articleUrl}">${article.title}</a>
            </h3>
            <p class="article-description">${article.excerpt || article.description || ''}</p>
            <div class="article-meta">
              ${article.author ? `<div class="article-author"><i class="fas fa-user"></i> ${article.author}</div>` : ''}
              <div class="article-date"><i class="far fa-clock"></i> ${formatDate(article.createdAt || article.publishedAt)}</div>
              ${article.readingTimeMinutes ? `<div class="reading-time"><i class="bi bi-clock-history"></i> ${article.readingTimeMinutes} min</div>` : ''}
            </div>
          </div>
        `;
        gridElement.appendChild(articleCard);
      });
      
      sectionElement.appendChild(gridElement);
    }
  } else {
    // For Crypto category, skip rendering the featured article entirely.
    // Render all articles in a grid.
    const gridElement = document.createElement('div');
    gridElement.className = 'article-grid';
    
    articles.forEach(article => {
      const articleCard = document.createElement('div');
      articleCard.className = 'article-card';
      
      const articleUrl = article.slug ? `/${sectionId}/${article.slug}` : '#';
      const fallbackSrc = CONFIG.fallbackImages[category] || CONFIG.fallbackImages.default;
      
      articleCard.innerHTML = `
        <div class="article-image-container">
          <span class="category-badge" data-category="${category}">
            ${category}
          </span>
          <img 
            src="${article.featuredImage || fallbackSrc}"
            alt="${article.title}" 
            class="article-image"
            onerror="this.onerror=null; this.src='${fallbackSrc}';" 
          />
        </div>
        <div class="article-content">
          <h3 class="article-title">
            <a href="${articleUrl}">${article.title}</a>
          </h3>
          <p class="article-description">${article.excerpt || article.description || ''}</p>
          <div class="article-meta">
            ${article.author ? `<div class="article-author"><i class="fas fa-user"></i> ${article.author}</div>` : ''}
            <div class="article-date"><i class="far fa-clock"></i> ${formatDate(article.createdAt || article.publishedAt)}</div>
            ${article.readingTimeMinutes ? `<div class="reading-time"><i class="bi bi-clock-history"></i> ${article.readingTimeMinutes} min</div>` : ''}
          </div>
        </div>
      `;
      gridElement.appendChild(articleCard);
    });
    sectionElement.appendChild(gridElement);
  }
}





// Set up the newsletter form submission.
function setupNewsletterForm() {
  const newsletterForm = document.getElementById('newsletter-form');
  
  newsletterForm.addEventListener('submit', function(event) {
    event.preventDefault();
    
    const emailInput = this.querySelector('input[type="email"]');
    const email = emailInput.value;
    
    if (email) {
      try {
        // Save the subscriber to Firestore.
        if (firebase.firestore) {
          firebase.firestore().collection('subscribers').add({
            email: email,
            subscribedAt: firebase.firestore.FieldValue.serverTimestamp()
          })
          .then(() => {
            alert(`Thank you for subscribing with ${email}! You'll receive updates soon.`);
            emailInput.value = '';
          })
          .catch(error => {
            console.error('Error saving subscriber:', error);
            alert(`Thank you for subscribing with ${email}! You'll receive updates soon.`);
            emailInput.value = '';
          });
        } else {
          alert(`Thank you for subscribing with ${email}! You'll receive updates soon.`);
          emailInput.value = '';
        }
      } catch (error) {
        alert(`Thank you for subscribing with ${email}! You'll receive updates soon.`);
        emailInput.value = '';
      }
    }
  });
}

// Manually trigger a news fetch through a Cloud Function.
function updateNews() {
  const updateButton = document.querySelector('button[onclick="updateNews()"]');
  if (updateButton) {
    updateButton.disabled = true;
    updateButton.innerHTML = '<i class="fas fa-sync-alt fa-spin me-1"></i> Updating...';
  }
  
  fetch('https://us-central1-trendingtech-daily.cloudfunctions.net/fetchNewsManually')
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.text();
    })
    .then(data => {
      alert('News fetch triggered successfully: ' + data);
      // Reload the page after a short delay to display updated content.
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    })
    .catch(error => {
      console.error('Error triggering news fetch:', error);
      alert('Error triggering news fetch: ' + error.message);
      if (updateButton) {
        updateButton.disabled = false;
        updateButton.innerHTML = '<i class="fas fa-sync-alt me-1"></i> Update News';
      }
    });
}

function renderArticleImage(article, category) {
  // If it's Hacker News, return nothing - no container, no image
  if (article.source === "Hacker News") {
    return ''; // No container at all
  }
  
  // Otherwise, show the usual container + image
  const fallbackSrc = CONFIG.fallbackImages[category] || CONFIG.fallbackImages.default;
  const src = article.featuredImage || article.imageUrl || fallbackSrc;
  return `
    <div class="article-image-container">
      <span class="category-badge" data-category="${category}">${category}</span>
      <img 
        src="${src}" 
        alt="${article.title}" 
        class="article-image"
        onerror="this.onerror=null; this.src='${fallbackSrc}';" 
      />
    </div>
  `;
}

// Load stock ticker data from Firestore
async function loadStockTicker() {
  const stockTicker = document.getElementById('stock-ticker');
  stockTicker.innerHTML = '<div class="stock-item">Loading stock data...</div>';
  
  try {
    const db = firebase.firestore();
    const snapshot = await db.collection('stocks').limit(20).get();
    
    if (snapshot.empty) {
      stockTicker.innerHTML = '<div class="stock-ticker-error">No stock data available</div>';
      return;
    }
    
    stockTicker.innerHTML = '';
    
    snapshot.forEach(doc => {
      const stock = doc.data();
      const changeClass = parseFloat(stock.change) >= 0 ? 'text-success' : 'text-danger';
      const changeSign = parseFloat(stock.change) >= 0 ? '+' : '';
      
      const stockItem = document.createElement('div');
      stockItem.className = 'stock-item';
      stockItem.innerHTML = `
        <span class="stock-symbol">${stock.symbol}</span>
        <span class="stock-price">$${stock.price}</span>
        <span class="stock-change ${changeClass}">
          ${changeSign}${stock.change} (${stock.changePercent}%)
        </span>
      `;
      stockTicker.appendChild(stockItem);
    });
    
    // Clone stock items for continuous scrolling effect
    const stockItems = stockTicker.innerHTML;
    stockTicker.innerHTML += stockItems;
    
  } catch (error) {
    console.error('Error loading stock data:', error);
    stockTicker.innerHTML = '<div class="stock-ticker-error">Error loading stock data</div>';
  }
}

// Add this to your app.js file
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