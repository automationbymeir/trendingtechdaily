// index-main.js - Main functionality for the homepage

// Helper function to safely get properties
function getSafe(fn, defaultValue = '') {
    try {
        const value = fn();
        return (value !== null && value !== undefined) ? value : defaultValue;
    } catch {
        return defaultValue;
    }
}

// Helper function to ensure reading time exists
function ensureReadingTime(article) {
    if (!article.readingTimeMinutes || article.readingTimeMinutes <= 0) {
        // Calculate based on content length if not set
        const contentLength = (article.content || '').length;
        const wordsPerMinute = 200;
        const estimatedWords = contentLength / 5; // Rough estimate: 5 chars per word
        article.readingTimeMinutes = Math.max(1, Math.ceil(estimatedWords / wordsPerMinute));
    }
    return article;
}
// PASTE THIS FUNCTION AT THE TOP OF public/js/index-main.js

function initWelcomePopup() {
    const popupOverlay = document.getElementById('welcome-popup-overlay');
    const closeBtn = document.getElementById('popup-close-btn');
    const maybeLaterBtn = document.getElementById('popup-maybe-later');

    if (!popupOverlay || !closeBtn || !maybeLaterBtn) {
        console.warn('Welcome popup elements not found.');
        return;
    }

    // --- Condition 1: Don't show if the user is logged in ---
    // We check this by seeing if the profile menu is visible
    const profileMenu = document.getElementById('auth-profile-menu');
    if (profileMenu && profileMenu.style.display !== 'none') {
        return; // User is logged in
    }

    // --- Condition 2: Don't show if popup was dismissed recently (e.g., within 7 days) ---
    const dismissedTime = localStorage.getItem('welcomePopupDismissedTime');
    if (dismissedTime) {
        const daysSinceDismissed = (Date.now() - parseInt(dismissedTime)) / (1000 * 60 * 60 * 24);
        if (daysSinceDismissed < 7) {
            return; // Dismissed recently
        }
    }

    // A flag to ensure we only show the popup once per page load
    let popupHasBeenShown = false;

    // --- The main scroll handler function ---
    const scrollHandler = () => {
        if (popupHasBeenShown) return;

        const scrollPercent = (window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100;

        if (scrollPercent >= 20) {
            // Show the popup
            popupOverlay.classList.add('show');
            popupHasBeenShown = true;
            // IMPORTANT: Remove the listener so it doesn't keep firing
            window.removeEventListener('scroll', scrollHandler);
        }
    };

    // --- Function to hide the popup and remember the dismissal ---
    const dismissPopup = () => {
        popupOverlay.classList.remove('show');
        // Remember the dismissal for 7 days
        localStorage.setItem('welcomePopupDismissedTime', Date.now().toString());
    };

    // --- Attach event listeners ---
    window.addEventListener('scroll', scrollHandler, { passive: true });
    closeBtn.addEventListener('click', dismissPopup);
    maybeLaterBtn.addEventListener('click', dismissPopup);
}

// --- Functions specific to index.html rendering ---
// ... (the rest of your existing code)
// --- Functions specific to index.html rendering ---
function loadFeaturedArticle() {
    const container = document.getElementById('featured-article-container');
    if (!container || typeof db === 'undefined') {
        console.warn("Featured container or DB not ready for loadFeaturedArticle.");
        if(container) container.innerHTML = '<p class="text-muted text-center">Loading dependency error.</p>';
        return;
    }
    db.collection('articles').where('published', '==', true).where('featured', '==', true)
        .orderBy('createdAt', 'desc').limit(1).get()
        .then(snap => {
            if (!snap.empty) renderArticle(snap.docs[0], container, true);
            else loadMostRecentArticleAsFeatured();
        })
        .catch(error => {
            console.error('Error loading featured article:', error);
            container.innerHTML = '<p class="text-danger text-center">Failed to load featured article.</p>';
        });
}

function loadMostRecentArticleAsFeatured() {
    const container = document.getElementById('featured-article-container');
    if (!container || typeof db === 'undefined') {
        console.warn("Featured container or DB not ready for loadMostRecentArticleAsFeatured.");
        if(container) container.innerHTML = '<p class="text-muted text-center">Loading dependency error.</p>';
        return;
    }
    db.collection('articles').where('published','==',true).orderBy('createdAt','desc').limit(1).get()
        .then(snap => {
            if (snap.empty) container.innerHTML = '<p class="text-center text-muted">No articles available.</p>';
            else renderArticle(snap.docs[0], container, true);
        })
        .catch(error => {
            console.error('Error loading most recent article:', error);
            container.innerHTML = '<p class="text-danger text-center">Failed to load featured article.</p>';
        });
}

function loadLatestArticles() {
    const container = document.getElementById('articles-container');
    if (!container || typeof db === 'undefined') {
        console.warn("Articles container or DB not ready for loadLatestArticles.");
        if(container) container.innerHTML = '<p class="text-muted text-center">Loading dependency error.</p>';
        return;
    }
    db.collection('articles').where('published','==',true).orderBy('createdAt','desc').limit(7).get()
        .then(snap => {
            if (snap.empty) {
                container.innerHTML = '<p class="text-center text-muted">No recent articles found.</p>';
                return;
            }
            let featuredSlug = null;
            const featuredLink = document.querySelector('#featured-article-container .article-title a');
            if (featuredLink?.href) {
                try { featuredSlug = new URLSearchParams(new URL(featuredLink.href).search).get('slug'); } 
                catch(e) { console.warn("Could not parse featured slug"); }
            }

            let html = '<div class="article-grid">';
            let count = 0;
            snap.forEach(doc => {
                const rawArticle = { id: doc.id, ...doc.data() };
                const article = ensureReadingTime(rawArticle);
                
                if ((featuredSlug && article.slug === featuredSlug) || count >= 6) return;
                count++;
                html += renderArticleCard(article);
            });
            html += '</div>';

            container.innerHTML = count > 0 ? html : '<p class="text-center text-muted">No other recent articles found.</p>';
        })
        .catch(error => {
            console.error('Error loading latest articles:', error);
            container.innerHTML = '<p class="text-danger text-center">Failed to load articles.</p>';
        });
}

// Renders a single Firestore article (Used by Featured)
function renderArticle(doc, container, isFeatured = false) {
    if (!doc || !container) return;
    try {
        const article = { id: doc.id, ...doc.data() };
        const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
        const categoryName = getSafe(() => categoryCache[article.category], 'Uncategorized');
        const articleUrl = article.slug ? `/article/${article.slug}` : '#';
        const cardClass = isFeatured ? 'featured-article' : 'article-card';
        const titleTag = isFeatured ? 'h2' : 'h3';
        const title = getSafe(() => article.title, 'Untitled Article');
        const excerpt = getSafe(() => article.excerpt);
        const featuredImage = getSafe(() => article.featuredImage);
        const author = getSafe(() => article.author);
        const readingTime = getSafe(() => article.readingTimeMinutes);

        container.innerHTML = `
        <div class="${cardClass} ${!featuredImage ? 'no-image' : ''}" data-id="${article.id}">
            <div class="article-image-container ${!featuredImage ? 'no-image' : ''}">
            ${featuredImage ? `<div class="category-badge" data-category="${categoryName}">${categoryName}</div><a href="${articleUrl}"><img src="${featuredImage}" alt="${title}" class="article-image" loading="lazy" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=\\'article-placeholder\\'>No Image</div>');"></a>` : `<div class="article-placeholder">No Image Available</div>`}
            </div>
            <div class="article-content">
            <${titleTag} class="article-title"><a href="${articleUrl}">${title}</a></${titleTag}>
            <p class="article-description">${excerpt || (isFeatured ? 'Click to read more.' : '')}</p>
            <div class="article-meta">
                <span>${date}</span>
                ${author ? `<span>By ${author}</span>` : ''}
                ${readingTime ? `<span class="ms-auto text-muted small"><i class="bi bi-clock-history me-1"></i>${readingTime} min read</span>` : ''}
            </div>
            </div>
        </div>`;
    } catch(e) { 
        console.error("Error rendering article:", e, doc?.id); 
        container.innerHTML = '<p class="text-danger text-center">Error displaying article.</p>'; 
    }
}

// Renders an article card HTML string
function renderArticleCard(article) {
    try {
        const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
        const categoryName = categoryCache[article.category] || 'Uncategorized';
        const articleUrl = getSafe(() => article.slug) ? `/article/${getSafe(() => article.slug)}` : '#';
        const title = getSafe(() => article.title, 'Untitled Article');
        const excerpt = getSafe(() => article.excerpt, '');
        const featuredImage = getSafe(() => article.featuredImage);
        const author = getSafe(() => article.author);
        const readingTime = getSafe(() => article.readingTimeMinutes);

        return `
        <div class="article-card ${!featuredImage ? 'no-image' : ''}" data-id="${article.id}">
            <div class="article-image-container ${!featuredImage ? 'no-image' : ''}">
            ${featuredImage ? `<div class="category-badge" data-category="${categoryName}">${categoryName}</div><a href="${articleUrl}"><img src="${featuredImage}" alt="${title}" class="article-image" loading="lazy" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('beforeend', '<div class=\\'article-placeholder\\'>Image Error</div>');"></a>` : `<div class="article-placeholder">No Image Available</div>`}
            </div>
            <div class="article-content">
            <h3 class="article-title"><a href="${articleUrl}">${title}</a></h3>
            <p class="article-description">${excerpt || 'No description.'}</p>
            <div class="article-meta">
                <span class="text-muted small">${date}</span>
                ${ readingTime ? 
                   `<span class="ms-auto text-muted small">
                      <i class="bi bi-clock-history me-1"></i>
                      ${readingTime} min read
                    </span>`
                   : ''
                }
            </div>
            </div>
        </div>`;
    } catch(e) {
        console.error("Error rendering article card:", e, article);
        return '<div class="text-danger p-3 border">Error displaying article card.</div>';
    }
}

// --- Initialize Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    function attemptInitialLoad() {
        if (typeof firebase !== 'undefined' && firebase.app() && typeof db !== 'undefined' && typeof auth !== 'undefined') {
            console.log("index.html: DOM Loaded & Firebase Ready, calling page-specific functions.");

            // Call functions specific to index.html
            if (typeof loadFeaturedArticle === 'function') loadFeaturedArticle(); 
            else console.error("loadFeaturedArticle not defined");
            
            if (typeof loadLatestArticles === 'function') loadLatestArticles(); 
            else console.error("loadLatestArticles not defined");

            if (typeof loadRecommendedVideos === 'function') loadRecommendedVideos(); 
            else console.error("loadRecommendedVideos not defined");

            if (typeof loadSidebarPodcasts === 'function') loadSidebarPodcasts(); 
            else console.error("loadSidebarPodcasts not defined");

            if (typeof initWelcomePopup === 'function') initWelcomePopup(); 
            else console.error("initWelcomePopup not defined");

        } else {
            console.error("index.html: DOM loaded but Firebase services from app-base.js are not ready! Retrying in 500ms...");
            setTimeout(attemptInitialLoad, 500);
        }
    }
    attemptInitialLoad();
});