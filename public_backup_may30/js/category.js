// Get category slug from URL
function getCategorySlugFromUrl() {
    const pathParts = window.location.pathname.split('/').filter(Boolean);
    return pathParts[0] || '';
}

// Initialize Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
    authDomain: "trendingtech-daily.firebaseapp.com",
    projectId: "trendingtech-daily",
    storageBucket: "trendingtech-daily.appspot.com",
    messagingSenderId: "343812872871",
    appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Cache for storing section data
const sectionsCache = {};

// Get category slug from URL
const categorySlug = getCategorySlugFromUrl();

// Load data
document.addEventListener('DOMContentLoaded', function() {
    loadSections();
    loadRecentArticles();
    loadSiteSettings();

    if (!categorySlug) {
        showError('No category specified. Please check the URL and try again.');
    } else {
        loadCategory(categorySlug);
    }
});

// Function to load sections for navigation
function loadSections() {
    db.collection('sections')
        .where('active', '==', true)
        .orderBy('order')
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                return;
            }

            let sectionsNavHTML = '';
            let footerLinksHTML = '';
            let categoriesListHTML = '';

            snapshot.forEach(doc => {
                const section = doc.data();

                // Store in cache
                sectionsCache[section.slug] = {
                    id: doc.id,
                    ...section
                };

                const isActive = section.slug === categorySlug ? 'active' : '';

                // Add to navigation
                sectionsNavHTML += `
                    <li class="nav-item">
                        <a class="nav-link ${isActive}" href="/${section.slug}">${section.name}</a>
                    </li>
                `;

                // Add to footer links
                footerLinksHTML += `
                    <li><a href="/${section.slug}">${section.name}</a></li>
                `;

                // Add to categories list
                categoriesListHTML += `
                    <li>
                        <a href="/${section.slug}" ${isActive ? 'class="fw-bold"' : ''}>${section.name}</a>
                    </li>
                `;
            });

            // Update navigation
            document.getElementById('sections-nav').innerHTML = sectionsNavHTML;

            // Update footer links
            document.getElementById('footer-links').innerHTML = footerLinksHTML;

            // Update categories list
            document.getElementById('categories-list').innerHTML = categoriesListHTML;
        })
        .catch(error => {
            console.error('Error loading sections:', error);
        });
}

// Function to load category by slug
function loadCategory(slug) {
    db.collection('sections')
        .where('slug', '==', slug)
        .where('active', '==', true)
        .limit(1)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                showError('Category not found or is not active.');
                return;
            }

            const categoryDoc = snapshot.docs[0];
            const category = categoryDoc.data();
            const categoryId = categoryDoc.id;

            // Update Title and Meta Description
            const categoryName = category.name || 'Category';
            const categoryDescription = category.description || `Articles related to ${categoryName}.`;
            document.title = `${categoryName} Articles - TrendingTech Daily`;

            let metaDescriptionTag = document.querySelector('meta[name="description"]');
            if (!metaDescriptionTag) {
                metaDescriptionTag = document.createElement('meta');
                metaDescriptionTag.setAttribute('name', 'description');
                document.head.appendChild(metaDescriptionTag);
            }
            metaDescriptionTag.setAttribute('content', categoryDescription.substring(0, 160));
            console.log(`Updated Title and Meta Description for ${categoryName}`);

            // Update category header on page
            document.getElementById('category-title').textContent = category.name;
            document.getElementById('category-description').textContent = category.description || '';

            // Load articles for this category ID
            loadCategoryArticles(categoryId);
        })
        .catch(error => {
            console.error('Error loading category:', error);
            showError('Failed to load the category information.');
        });
}

// Helper function to ensure a reading time exists
function ensureReadingTime(article) {
    if (typeof article.readingTimeMinutes === 'number' && article.readingTimeMinutes > 0) {
        return article;
    }

    const content = article.content || '';
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || tempDiv.innerText || '';
    const words = textContent.trim().split(/\s+/).filter(Boolean);
    const wordCount = words.length;
    const wpm = 225;
    const minutes = Math.ceil(wordCount / wpm) || 1;

    return {
        ...article,
        readingTimeMinutes: minutes
    };
}

// Function to load articles for a category
function loadCategoryArticles(categoryId) {
    const articlesContainer = document.getElementById('articles-container');

    db.collection('articles')
        .where('category', '==', categoryId)
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                articlesContainer.innerHTML = `
                    <div class="text-center py-5">
                        <h3>No articles found</h3>
                        <p>There are no articles in this category yet.</p>
                    </div>
                `;
                return;
            }

            let articlesHtml = '<div class="article-grid">';

            snapshot.forEach(doc => {
                const rawArticle = doc.data();
                const article = ensureReadingTime(rawArticle);
                const date = article.createdAt ? new Date(article.createdAt.toDate()).toLocaleDateString() : 'N/A';
                
                let categoryName = '';
                if (article.category) {
                    for (let slug in sectionsCache) {
                        if (sectionsCache[slug].id === article.category) {
                            categoryName = sectionsCache[slug].name;
                            break;
                        }
                    }
                }

                const readingTime = article.readingTimeMinutes || 0;

                articlesHtml += `
                    <div class="article-card ${!article.featuredImage ? 'no-image' : ''}">
                        <div class="article-image-container ${!article.featuredImage ? 'no-image' : ''}">
                            ${article.featuredImage ? `
                                <div class="category-badge" data-category="${categoryName}">${categoryName}</div>
                                <img src="${article.featuredImage}" alt="${article.title}" class="article-image">
                            ` : ''}
                        </div>
                        <div class="article-content">
                            <h3 class="article-title">
                                <a href="/${categorySlug}/${article.slug}">${article.title}</a>
                            </h3>
                            <p class="article-description">${article.excerpt || ''}</p>
                            <div class="article-meta">
                                <span>Published on ${date}</span>
                                ${readingTime ? `<span class="ms-auto text-muted small"><i class="bi bi-clock-history me-1"></i>${readingTime} min read</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });

            articlesHtml += '</div>';
            articlesContainer.innerHTML = articlesHtml;
        })
        .catch(error => {
            console.error('Error loading articles:', error);
            articlesContainer.innerHTML = `
                <div class="alert alert-danger">
                    <p>Failed to load articles. Please try again later.</p>
                </div>
            `;
        });
}

// Function to load recent articles
function loadRecentArticles() {
    db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                document.getElementById('recent-articles-list').innerHTML = '<li>No articles found</li>';
                return;
            }

            let recentHTML = '';
            snapshot.forEach(doc => {
                const article = doc.data();
                const section = sectionsCache[article.category] || { slug: 'article' };
                recentHTML += `
                    <li>
                        <a href="/${section.slug}/${article.slug}">${article.title}</a>
                    </li>
                `;
            });

            document.getElementById('recent-articles-list').innerHTML = recentHTML;
        })
        .catch(error => {
            console.error('Error loading recent articles:', error);
            document.getElementById('recent-articles-list').innerHTML = '<li>Failed to load articles</li>';
        });
}

// Function to load site settings
function loadSiteSettings() {
    Promise.all([
        db.collection('settings').doc('footer').get(),
        db.collection('settings').doc('general').get()
    ])
    .then(([footerDoc, generalDoc]) => {
        if (footerDoc.exists) {
            const footerData = footerDoc.data();
            if (footerData.footerText) document.getElementById('footer-text').textContent = footerData.footerText;
            if (footerData.contactEmail) document.getElementById('contact-email').textContent = footerData.contactEmail;
            if (footerData.contactAddress) document.getElementById('contact-address').textContent = footerData.contactAddress;
        }

        if (generalDoc.exists) {
            const generalData = generalDoc.data();
            const navbarBrand = document.querySelector('.navbar-brand');
            if (navbarBrand) {
                if (generalData.siteLogo) {
                    navbarBrand.innerHTML = `<img src="${generalData.siteLogo}" alt="${generalData.siteTitle || 'TrendingTech Daily'}" style="max-height: 40px;">`;
                } else if (generalData.siteTitle) {
                    navbarBrand.textContent = generalData.siteTitle;
                }
            }
        }
    })
    .catch(error => {
        console.error('Error loading site settings:', error);
    });
}

// Function to show error message
function showError(message) {
    document.getElementById('category-title').textContent = 'Error';
    document.getElementById('category-description').textContent = '';
    document.getElementById('articles-container').innerHTML = `
        <div class="alert alert-danger">
            <h3>Oops!</h3>
            <p>${message}</p>
            <a href="/" class="btn btn-primary mt-3">Go to Homepage</a>
        </div>
    `;
}