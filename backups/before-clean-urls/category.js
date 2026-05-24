// This file contains logic ONLY for the category page.
// It assumes that 'app-base.js' has already been loaded and has created the global 'db' variable.

document.addEventListener('DOMContentLoaded', function() {
    console.log("category.js: Script loaded. Running category page logic.");

    // This is a safety check. If 'db' doesn't exist, it means app-base.js failed or was not loaded first.
    if (typeof db === 'undefined') {
        console.error("FATAL ERROR in category.js: The Firebase 'db' object is not defined. Ensure 'app-base.js' is loaded before this script.");
        // Display a user-friendly error on the page
        document.body.innerHTML = '<div style="padding: 2rem; text-align: center;"><h1>Application Error</h1><p>A critical file failed to load. Please try refreshing the page.</p></div>';
        return; // Stop execution of this script
    }

    // Cache for storing section data
    const sectionsCache = {};

    // Get category slug from URL
    const urlParams = new URLSearchParams(window.location.search);
    const categorySlug = urlParams.get('slug');

    // All functions specific to the category page are defined here
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
                    sectionsCache[section.slug] = { id: doc.id, ...section };
                    const isActive = section.slug === categorySlug ? 'active' : '';

                    // This part seems to be for a secondary nav that was removed.
                    // If you are using the global navbar from app-base.js, this line might not have a target.
                    // sectionsNavHTML += `<li class="nav-item"><a class="nav-link ${isActive}" href="/category.html?slug=${section.slug}">${section.name}</a></li>`;
                    
                    footerLinksHTML += `<li><a href="/category.html?slug=${section.slug}">${section.name}</a></li>`;
                    categoriesListHTML += `<li><a href="/category.html?slug=${section.slug}" ${isActive ? 'class="fw-bold"' : ''}>${section.name}</a></li>`;
                });
                
                // If #sections-nav exists, update it. Otherwise, it will fail silently.
                const sectionsNavContainer = document.getElementById('sections-nav');
                if(sectionsNavContainer) sectionsNavContainer.innerHTML = sectionsNavHTML;

                document.getElementById('footer-links').innerHTML = footerLinksHTML;
                document.getElementById('categories-list').innerHTML = categoriesListHTML;
            })
            .catch(error => {
                console.error('Error loading sections:', error);
            });
    }

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

                document.title = `${category.name} Articles - TrendingTech Daily`;
                let metaDesc = document.querySelector('meta[name="description"]') || document.createElement('meta');
                if(!metaDesc.name) {
                    metaDesc.setAttribute('name', 'description');
                    document.head.appendChild(metaDesc);
                }
                metaDesc.setAttribute('content', (category.description || `Articles related to ${category.name}`).substring(0, 160));
                
                document.getElementById('category-title').textContent = category.name;
                document.getElementById('category-description').textContent = category.description || '';
                
                loadCategoryArticles(categoryId);
            })
            .catch(error => {
                console.error('Error loading category:', error);
                showError('Failed to load the category information.');
            });
    }

    function ensureReadingTime(article) {
        if (typeof article.readingTimeMinutes === 'number' && article.readingTimeMinutes > 0) return article;
        const content = article.content || '';
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';
        const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
        const minutes = Math.ceil(wordCount / 225) || 1;
        return { ...article, readingTimeMinutes: minutes };
    }

    function loadCategoryArticles(categoryId) {
        const articlesContainer = document.getElementById('articles-container');
        db.collection('articles')
            .where('category', '==', categoryId)
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .get()
            .then(snapshot => {
                if (snapshot.empty) {
                    articlesContainer.innerHTML = `<div class="text-center py-5"><h3>No articles found</h3><p>There are no articles in this category yet.</p></div>`;
                    return;
                }
                let articlesHtml = '<div class="article-grid">';
                snapshot.forEach(doc => {
                    const article = ensureReadingTime(doc.data());
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
                    const readingTime = article.readingTimeMinutes;
                    articlesHtml += `
                        <div class="article-card ${!article.featuredImage ? 'no-image' : ''}">
                            <div class="article-image-container ${!article.featuredImage ? 'no-image' : ''}">
                                ${article.featuredImage ? `<div class="category-badge" data-category="${categoryName}">${categoryName}</div><img src="${article.featuredImage}" alt="${article.title}" class="article-image">` : ''}
                            </div>
                            <div class="article-content">
                                <h3 class="article-title"><a href="/article.html?slug=${article.slug}">${article.title}</a></h3>
                                <p class="article-description">${article.excerpt || ''}</p>
                                <div class="article-meta">
                                    <span>Published on ${date}</span>
                                    ${readingTime ? `<span class="ms-auto text-muted small"><i class="bi bi-clock-history me-1"></i>${readingTime} min read</span>` : ''}
                                </div>
                            </div>
                        </div>`;
                });
                articlesHtml += '</div>';
                articlesContainer.innerHTML = articlesHtml;
            })
            .catch(error => {
                console.error('Error loading articles:', error);
                articlesContainer.innerHTML = `<div class="alert alert-danger"><p>Failed to load articles. Please try again later.</p></div>`;
            });
    }

    function loadRecentArticles() {
        db.collection('articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(5)
            .get()
            .then(snapshot => {
                const recentList = document.getElementById('recent-articles-list');
                if (snapshot.empty) {
                    recentList.innerHTML = '<li>No articles found</li>';
                    return;
                }
                let recentHTML = '';
                snapshot.forEach(doc => {
                    const article = doc.data();
                    recentHTML += `<li><a href="/article.html?slug=${article.slug}">${article.title}</a></li>`;
                });
                recentList.innerHTML = recentHTML;
            })
            .catch(error => {
                console.error('Error loading recent articles:', error);
                document.getElementById('recent-articles-list').innerHTML = '<li>Failed to load articles</li>';
            });
    }

    function loadSiteSettings() {
        Promise.all([
            db.collection('settings').doc('footer').get(),
            db.collection('settings').doc('general').get()
        ]).then(([footerDoc, generalDoc]) => {
            if (footerDoc.exists) {
                const data = footerDoc.data();
                if (data.footerText) document.getElementById('footer-text').textContent = data.footerText;
                if (data.contactEmail) document.getElementById('contact-email').textContent = data.contactEmail;
                if (data.contactAddress) document.getElementById('contact-address').textContent = data.contactAddress;
            }
            if (generalDoc.exists) {
                const data = generalDoc.data();
                const brand = document.querySelector('.navbar-brand');
                if (brand) {
                    if (data.siteLogo) {
                        brand.innerHTML = `<img src="${data.siteLogo}" alt="${data.siteTitle || 'TrendingTech Daily'}" style="max-height: 40px;">`;
                    } else if (data.siteTitle) {
                        brand.textContent = data.siteTitle;
                    }
                }
            }
        }).catch(error => {
            console.error('Error loading site settings:', error);
        });
    }

    function showError(message) {
        document.getElementById('category-title').textContent = 'Error';
        document.getElementById('category-description').textContent = '';
        document.getElementById('articles-container').innerHTML = `<div class="alert alert-danger"><h3>Oops!</h3><p>${message}</p><a href="/" class="btn btn-primary mt-3">Go to Homepage</a></div>`;
    }


    // --- SCRIPT EXECUTION STARTS HERE ---
    
    // Call the functions needed to build the category page
    loadSections();
    loadRecentArticles();
    loadSiteSettings();

    if (!categorySlug) {
        showError('No category specified. Please check the URL and try again.');
    } else {
        loadCategory(categorySlug);
    }
});