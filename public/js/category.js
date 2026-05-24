// /js/category.js - Complete rewrite

// Make functions globally accessible
window.loadCategory = loadCategory;
window.loadCategoryArticles = loadCategoryArticles;

// Helper function
function getSafe(fn, defaultValue = '') {
    try {
        const value = fn();
        return (value !== null && value !== undefined) ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// Load category data
function loadCategory(slug) {
    console.log('=== LOADING CATEGORY ===', slug);
    if (!slug) {
        showError('No category specified.');
        return;
    }
    
    // Wait for db to be ready if not already
    if (typeof db === 'undefined') {
        console.log('Waiting for database...');
        setTimeout(() => loadCategory(slug), 100);
        return;
    }

    // Update URL to new structure
    const correctUrl = `/${slug}`;
    if (window.location.pathname !== correctUrl) {
        console.log('Updating URL to:', correctUrl);
        window.history.replaceState({}, '', correctUrl);
    }

    console.log('Querying database for category:', slug);
    db.collection('sections')
        .where('slug', '==', slug)
        .where('active', '==', true)
        .limit(1)
        .get()
        .then(snapshot => {
            console.log('Query completed. Found documents:', snapshot.size);
            if (snapshot.empty) {
                console.error('Category not found for slug:', slug);
                showError('Category not found or is not active.');
                return;
            }
            
            const categoryDoc = snapshot.docs[0];
            const category = categoryDoc.data();
            const categoryId = categoryDoc.id;
            
            console.log('Category data:', { id: categoryId, name: category.name });

            // Update page elements
            document.title = `${category.name} Articles - TrendingTech Daily`;

            if (typeof updateMetaTags === 'function') {
                updateMetaTags({
                    title: category.name,
                    description: category.description || '',
                    slug
                });
            }
            
            const categoryTitle = document.getElementById('category-title');
            if (categoryTitle) {
                categoryTitle.textContent = category.name;
                console.log('Updated title element');
            } else {
                console.warn('category-title element not found - creating it');
                const main = document.querySelector('main');
                if (main) {
                    const container = main.querySelector('.container') || main;
                    container.innerHTML = `
                        <h1 id="category-title" class="mb-3">${category.name}</h1>
                        <p id="category-description" class="lead">${category.description || ''}</p>
                        <div id="articles-container">Loading articles...</div>
                    `;
                }
            }
            
            const categoryDescription = document.getElementById('category-description');
            if (categoryDescription) {
                categoryDescription.textContent = category.description || '';
            }
            
            // Load articles
            loadCategoryArticles(categoryId, slug);
        })
        .catch(error => {
            console.error('Database error:', error);
            showError('Failed to load category. Database error: ' + error.message);
        });
}

// Load articles for a category
function loadCategoryArticles(categoryId, categorySlug) {
    console.log('=== LOADING ARTICLES ===', { categoryId, categorySlug });
    
    if (typeof db === 'undefined') {
        console.error('Database not available');
        return;
    }
    
    let articlesContainer = document.getElementById('articles-container');
    
    if (!articlesContainer) {
        console.error('articles-container not found!');
        return;
    }

    console.log('Querying articles for category:', categoryId);
    db.collection('articles')
        .where('category', '==', categoryId)
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
        .then(snapshot => {
            console.log('Found articles:', snapshot.size);
            
            if (snapshot.empty) {
                articlesContainer.innerHTML = '<p class="text-center text-muted">No articles found in this category.</p>';
                return;
            }

            let articlesHTML = '<div class="row">';
            
            snapshot.forEach(doc => {
                const article = { id: doc.id, ...doc.data() };
                const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
                const title = getSafe(() => article.title, 'Untitled');
                const excerpt = getSafe(() => article.excerpt, '');
                const featuredImage = getSafe(() => article.featuredImage);
                const author = getSafe(() => article.author);
                const readingTime = getSafe(() => article.readingTimeMinutes);
                const articleSlug = getSafe(() => article.slug, '');
                
                const articleUrl = window.language === 'he'
                    ? `/article-he.html?slug=${articleSlug}`
                    : `/${categorySlug}/${articleSlug}`;

                articlesHTML += `
                    <div class="col-md-6 mb-4">
                        <div class="card h-100">
                            ${featuredImage ? `
                            <img src="${featuredImage}" class="card-img-top" alt="${title}" loading="lazy">
                            ` : ''}
                            <div class="card-body">
                                <h5 class="card-title">
                                    <a href="${articleUrl}" class="text-decoration-none">${title}</a>
                                </h5>
                                <p class="card-text">${excerpt}</p>
                                <div class="card-footer bg-transparent">
                                    <small class="text-muted">
                                        ${date}
                                        ${author ? ` • ${author}` : ''}
                                        ${readingTime ? ` • ${readingTime} min read` : ''}
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            });
            
            articlesHTML += '</div>';
            articlesContainer.innerHTML = articlesHTML;
            console.log('Articles rendered successfully');
        })
        .catch(error => {
            console.error('Error loading articles:', error);
            articlesContainer.innerHTML = '<p class="text-center text-danger">Failed to load articles.</p>';
        });
}

// Show error message
function showError(message) {
    console.error('ERROR:', message);
    const mainContent = document.querySelector('main') || document.querySelector('.container') || document.body;
    mainContent.innerHTML = `
        <div class="container mt-5">
            <div class="alert alert-danger" role="alert">
                <h4 class="alert-heading">Error</h4>
                <p>${message}</p>
                <hr>
                <p class="mb-0"><a href="/" class="btn btn-primary">Go to Homepage</a></p>
            </div>
        </div>
    `;
}

// Start initialization
console.log('Category.js loaded, starting initialization...');

// Get slug from sessionStorage or URL
let categorySlug = null;

// Check sessionStorage first
const routingInfo = sessionStorage.getItem('categoryRouting');
if (routingInfo) {
    categorySlug = routingInfo;
    sessionStorage.removeItem('categoryRouting');
    console.log('Found slug in sessionStorage:', categorySlug);
} else {
    // Check URL
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length === 1 && !pathParts[0].includes('.html')) {
        categorySlug = pathParts[0];
        console.log('Found slug in URL path:', categorySlug);
    } else {
        // Check query params as fallback
        const urlParams = new URLSearchParams(window.location.search);
        categorySlug = urlParams.get('slug');
        console.log('Found slug in query params:', categorySlug);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded, initializing category page...');
        if (categorySlug) {
            loadCategory(categorySlug);
        } else {
            showError('No category specified in the URL.');
        }
    });
} else {
    // DOM already loaded
    console.log('DOM already loaded, initializing category page...');
    if (categorySlug) {
        loadCategory(categorySlug);
    } else {
        showError('No category specified in the URL.');
    }
}