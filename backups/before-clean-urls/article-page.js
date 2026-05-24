// /js/article-page.js - FIXED VERSION

// Helper function
function getSafe(fn, defaultValue = '') {
    try {
        const value = fn();
        return (value !== null && value !== undefined) ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// Get article info from URL
function getArticleInfoFromUrl() {
    const pathParts = window.location.pathname.split('/').filter(part => part && part !== '');
    console.log('URL path parts:', pathParts);
    
    // Check for section-slug/article-slug pattern
    if (pathParts.length >= 2) {
        const sectionSlug = pathParts[0];
        const articleSlug = pathParts[1];
        
        console.log('Found section/article URL:', { sectionSlug, articleSlug });
        return { sectionSlug, articleSlug };
    }
    
    // Legacy fallback for query parameter
    const urlParams = new URLSearchParams(window.location.search);
    const slugParam = urlParams.get('slug');
    if (slugParam) {
        console.log('Found slug in query params:', slugParam);
        return { articleSlug: slugParam };
    }
    
    console.log('No article info found in URL');
    return null;
}

// Global article info
const articleInfo = getArticleInfoFromUrl();

// Main article loading function
async function loadArticle(articleInfo) {
    const articleContainer = document.getElementById('article-container');
    if (!articleContainer || typeof db === 'undefined' || typeof auth === 'undefined') {
        console.error("Article container, DB, or Auth service not ready.");
        document.title = "Error Loading Article | TrendingTechDaily";
        showError("Failed to initialize page components.");
        return;
    }

    if (!articleInfo || !articleInfo.articleSlug) {
        console.error('No article slug found in URL');
        showError('Article not found.');
        document.title = "Article Not Found | TrendingTechDaily";
        return;
    }

    try {
        console.log('Loading article with:', articleInfo);
        
        // Query for the article
        let query = db.collection('articles')
            .where('slug', '==', articleInfo.articleSlug)
            .where('published', '==', true);
        
        const snapshot = await query.limit(1).get();

        if (snapshot.empty) {
            console.error('Article not found in database');
            showError('Article not found or is not published.');
            document.title = "Article Not Found | TrendingTechDaily";
            return;
        }

        const articleDoc = snapshot.docs[0];
        const article = { id: articleDoc.id, ...articleDoc.data() };
        console.log('Article found:', article.title);

        // Get section info
        const sectionDoc = await db.collection('sections').doc(article.category).get();
        if (!sectionDoc.exists) {
            console.error('Section not found for article');
            showError('Article category not found.');
            return;
        }

        const section = { id: sectionDoc.id, ...sectionDoc.data() };

        // If we have a section slug in the URL, verify it matches
        if (articleInfo.sectionSlug && articleInfo.sectionSlug !== section.slug) {
            // Redirect to the correct URL
            window.location.href = `/${section.slug}/${article.slug}`;
            return;
        }
        
        // Update page metadata
        updatePageMetadata(article);
        
        // Render article content
        await renderArticle(article, section);
        
        // Post-render actions
        await handlePostRenderActions(article);

    } catch (error) {
        console.error('Error loading article:', error);
        showError(`Failed to load the article. Please try again later.`);
    }
}

// Update page metadata
function updatePageMetadata(article) {
    const pageTitle = getSafe(() => article.title, 'Article') + ' - TrendingTech Daily';
    const pageDescription = getSafe(() => article.excerpt, getSafe(() => article.content, '').substring(0, 160).replace(/<[^>]*>/g, '')) + '...';
    
    document.title = pageTitle;
    
    // Update meta description
    let metaDescriptionTag = document.querySelector('meta[name="description"]');
    if (!metaDescriptionTag) {
        metaDescriptionTag = document.createElement('meta');
        metaDescriptionTag.setAttribute('name', 'description');
        document.head.appendChild(metaDescriptionTag);
    }
    metaDescriptionTag.setAttribute('content', pageDescription);
    
    // Call the updateMetaTags function if it exists
    if (typeof updateMetaTags === 'function') {
        updateMetaTags({
            title: article.title,
            description: pageDescription,
            category: article.category,
            slug: article.slug
        });
    }
}

// Render article content
async function renderArticle(article, section) {
    const articleContainer = document.getElementById('article-container');
    const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
    
    // Get category name from sections collection
    let categoryName = 'Uncategorized';
    let categorySlug = 'uncategorized';
    if (section) {
        categoryName = section.name;
        categorySlug = section.slug;
    }
    
    const articleHTML = `
        <article>
            <header class="article-header mb-3">
                <h1 class="article-title">${getSafe(() => article.title, 'Untitled Article')}</h1>
                <div class="article-meta text-muted small">
                    <span>Published on ${date}</span> |
                    <span id="category-display">Category: <a href="/${categorySlug}">${categoryName}</a></span>
                    ${getSafe(() => article.author) ? ` | <span>By ${article.author}</span>` : ''}
                    ${getSafe(() => article.readingTimeMinutes) ? 
                        `<span class="ms-2">
                            <i class="bi bi-clock-history me-1"></i>
                            ${article.readingTimeMinutes} min read
                        </span>` : ''
                    }
                </div>
            </header>

            <div class="article-share-buttons my-3 py-2 border-top border-bottom d-flex align-items-center flex-wrap gap-1">
                <span class="me-2 fw-bold small text-uppercase">Share:</span>
                <a href="#" id="share-twitter" target="_blank" rel="noopener noreferrer" class="btn btn-link text-secondary btn-sm p-1" title="Share on Twitter/X">
                    <i class="bi bi-twitter-x"></i>
                </a>
                <a href="#" id="share-facebook" target="_blank" rel="noopener noreferrer" class="btn btn-link text-secondary btn-sm p-1" title="Share on Facebook">
                    <i class="bi bi-facebook"></i>
                </a>
                <a href="#" id="share-linkedin" target="_blank" rel="noopener noreferrer" class="btn btn-link text-secondary btn-sm p-1" title="Share on LinkedIn">
                    <i class="bi bi-linkedin"></i>
                </a>
                <a href="#" id="share-email" class="btn btn-link text-secondary btn-sm p-1" title="Share via Email">
                    <i class="bi bi-envelope-fill"></i>
                </a>
                <button type="button" id="share-copy-link" class="btn btn-link text-secondary btn-sm p-1" title="Copy Link">
                    <i class="bi bi-link-45deg"></i> Copy Link
                </button>
                <span id="copy-link-feedback" class="ms-2 small text-success" style="display: none; opacity: 0;">Link Copied!</span>
                <button type="button" id="save-article-btn" class="btn btn-outline-primary btn-sm ms-auto" style="display: none;">
                    <i class="bi bi-bookmark me-1"></i> <span>Save Article</span>
                </button>
            </div>

            ${article.featuredImage ? `
                <div class="article-page-featured-image-container">
                    <img src="${article.featuredImage}" alt="${getSafe(() => article.imageAltText, getSafe(() => article.title))}" class="article-page-featured-image">
                </div>
            ` : ''}

            <div class="article-body-content">
                ${getSafe(() => article.content, '<p>Article content could not be loaded.</p>')}
            </div>
        </article>

        <section id="comments-section" class="mt-5 pt-4 border-top">
            <h3 class="mb-4">Comments</h3>
            <div id="comment-form-container" style="display: none;">
                <form id="comment-form" class="mb-4">
                    <div class="mb-2">
                        <label for="comment-text" class="form-label small text-muted">Leave a comment</label>
                        <textarea class="form-control form-control-sm" id="comment-text" rows="3" required placeholder="Write your comment here..."></textarea>
                        <div class="invalid-feedback">Comment cannot be empty.</div>
                    </div>
                    <button type="submit" id="submit-comment-btn" class="btn btn-primary btn-sm">
                        <span class="spinner-border spinner-border-sm d-none me-1" role="status"></span>
                        Post Comment
                    </button>
                    <div id="comment-feedback" class="small mt-2"></div>
                </form>
            </div>
            <div id="comment-login-prompt" class="mb-4" style="display: block;">
                <p class="text-muted small"><a href="/login">Log in</a> or <a href="/signup">sign up</a> to leave a comment.</p>
            </div>
            <div id="comments-list">
                <p class="text-muted small">Loading comments...</p>
            </div>
        </section>
    `;
    
    articleContainer.innerHTML = articleHTML;
}

// Handle post-render actions
async function handlePostRenderActions(article) {
    const currentUser = auth.currentUser;
    
    // Initialize embeds
    initializeEmbeds();
    
    // Update AI agent context
    if (window.aiTechAgent && typeof window.aiTechAgent.checkPageContextAndReact === 'function') {
        window.aiTechAgent.checkPageContextAndReact();
    }
    
    // Update read history
    if (currentUser) {
        const readHistoryRef = db.collection('users').doc(currentUser.uid).collection('readHistory').doc(article.id);
        readHistoryRef.set({
            lastReadAt: firebase.firestore.FieldValue.serverTimestamp(),
            articleTitle: getSafe(() => article.title, 'Untitled'),
            articleSlug: getSafe(() => article.slug, '')
        }, { merge: true }).catch(err => console.error("Error updating read history:", err));
    }
    
    // Setup share buttons
    setupShareButtons(article);
    
    // Setup save button
    if (currentUser) {
        setupSaveArticleButton(currentUser, article.id, article);
    }
    
    // Load comments
    loadComments(article.id);
    
    // Setup comment form
    setupCommentForm(article);
    
    // Load related articles
    if (article.category) {
        loadRelatedArticles(article.category, article.id);
    } else {
        const relatedContainer = document.getElementById('related-articles-container');
        if (relatedContainer) relatedContainer.style.display = 'none';
    }
    
    // Load trending articles for sidebar
    loadTrendingArticles();
}

// Setup share buttons
async function setupShareButtons(article) {
    try {
        // Get section slug for the URL
        let sectionSlug = 'article';
        if (article.category) {
            const sectionDoc = await db.collection('sections').doc(article.category).get();
            if (sectionDoc.exists) {
                sectionSlug = sectionDoc.data().slug;
            }
        }
        
        const shareUrl = `${window.location.origin}/${sectionSlug}/${getSafe(() => article.slug, '')}`;
        const shareTitle = encodeURIComponent(getSafe(() => article.title, document.title));
        const shareExcerpt = encodeURIComponent(getSafe(() => article.excerpt, '').substring(0, 250));
        
        const twitterBtn = document.getElementById('share-twitter');
        if (twitterBtn) twitterBtn.href = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${shareTitle}`;
        
        const facebookBtn = document.getElementById('share-facebook');
        if (facebookBtn) facebookBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        
        const linkedinBtn = document.getElementById('share-linkedin');
        if (linkedinBtn) linkedinBtn.href = `https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${shareTitle}&summary=${shareExcerpt}`;
        
        const emailBtn = document.getElementById('share-email');
        if (emailBtn) emailBtn.href = `mailto:?subject=${shareTitle}&body=${encodeURIComponent('Check out this article: ' + shareUrl)}`;
        
        const copyBtn = document.getElementById('share-copy-link');
        const copyFeedback = document.getElementById('copy-link-feedback');
        if (copyBtn && copyFeedback) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(shareUrl).then(() => {
                    copyFeedback.style.opacity = '1';
                    copyFeedback.style.display = 'inline';
                    setTimeout(() => {
                        copyFeedback.style.opacity = '0';
                        setTimeout(() => {
                            copyFeedback.style.display = 'none';
                        }, 500);
                    }, 1500);
                }).catch(err => {
                    console.error('Failed to copy link: ', err);
                    alert('Failed to copy link.');
                });
            });
        }
    } catch (shareError) {
        console.error("Error setting up share buttons:", shareError);
    }
}

// Setup save article button
async function setupSaveArticleButton(user, articleId, articleData) {
    const saveBtn = document.getElementById('save-article-btn');
    if (!saveBtn || !user || !articleId || !db) {
        if (saveBtn) saveBtn.style.display = 'none';
        return;
    }
    
    const savedDocRef = db.collection('users').doc(user.uid).collection('savedArticles').doc(articleId);
    let isCurrentlySaved = false;
    
    try {
        const docSnap = await savedDocRef.get();
        isCurrentlySaved = docSnap.exists;
        updateSaveButtonUI(isCurrentlySaved);
        saveBtn.style.display = 'inline-block';
    } catch (error) {
        console.error("Error checking saved status:", error);
        saveBtn.style.display = 'none';
        return;
    }
    
    saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
            if (isCurrentlySaved) {
                await savedDocRef.delete();
                isCurrentlySaved = false;
            } else {
                await savedDocRef.set({
                    savedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    articleTitle: getSafe(() => articleData.title, 'Untitled'),
                    articleSlug: getSafe(() => articleData.slug, '')
                });
                isCurrentlySaved = true;
            }
            updateSaveButtonUI(isCurrentlySaved);
        } catch (error) {
            console.error("Error saving/unsaving article:", error);
            alert(`Error ${isCurrentlySaved ? 'unsaving' : 'saving'} article.`);
        } finally {
            saveBtn.disabled = false;
        }
    });
}

// Update save button UI
function updateSaveButtonUI(isSaved) {
    const saveBtn = document.getElementById('save-article-btn');
    if (!saveBtn) return;
    
    const icon = saveBtn.querySelector('i');
    const textSpan = saveBtn.querySelector('span');
    
    if (isSaved) {
        saveBtn.classList.remove('btn-outline-primary');
        saveBtn.classList.add('btn-primary');
        if (icon) icon.className = 'bi bi-bookmark-fill me-1';
        if (textSpan) textSpan.textContent = 'Saved';
    } else {
        saveBtn.classList.remove('btn-primary');
        saveBtn.classList.add('btn-outline-primary');
        if (icon) icon.className = 'bi bi-bookmark me-1';
        if (textSpan) textSpan.textContent = 'Save Article';
    }
}

// Setup comment form
function setupCommentForm(article) {
    const commentFormContainer = document.getElementById('comment-form-container');
    const commentLoginPrompt = document.getElementById('comment-login-prompt');
    const commentForm = document.getElementById('comment-form');
    
    const user = auth.currentUser;
    
    if (user) {
        if (commentFormContainer) commentFormContainer.style.display = 'block';
        if (commentLoginPrompt) commentLoginPrompt.style.display = 'none';
        if (commentForm) {
            commentForm.addEventListener('submit', (e) => handleCommentSubmit(e, article.id, article.slug, article.title, user));
        }
    } else {
        if (commentFormContainer) commentFormContainer.style.display = 'none';
        if (commentLoginPrompt) commentLoginPrompt.style.display = 'block';
    }
}

// Handle comment submission
async function handleCommentSubmit(event, articleId, articleSlug, articleTitle, user) {
    event.preventDefault();
    
    if (!user || !db) {
        alert("You must be logged in to comment.");
        return;
    }
    
    const form = document.getElementById('comment-form');
    const textArea = document.getElementById('comment-text');
    const feedbackDiv = document.getElementById('comment-feedback');
    const submitButton = document.getElementById('submit-comment-btn');
    
    if (!form || !textArea || !feedbackDiv || !submitButton) return;
    
    const commentText = textArea.value.trim();
    if (!commentText) {
        textArea.classList.add('is-invalid');
        feedbackDiv.textContent = 'Comment cannot be empty.';
        feedbackDiv.className = 'small mt-2 text-danger';
        return;
    } else {
        textArea.classList.remove('is-invalid');
    }
    
    setButtonLoading('submit-comment-btn', true);
    feedbackDiv.textContent = 'Posting comment...';
    feedbackDiv.className = 'small mt-2 text-muted';
    
    try {
        const commentData = {
            text: commentText,
            userId: user.uid,
            displayName: user.displayName || user.email?.split('@')[0] || 'Anonymous',
            photoURL: user.photoURL || null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            articleId: articleId,
            articleSlug: articleSlug || '',
            articleTitle: articleTitle || ''
        };
        
        await db.collection('articles').doc(articleId).collection('comments').add(commentData);
        
        textArea.value = '';
        feedbackDiv.textContent = 'Comment posted!';
        feedbackDiv.className = 'small mt-2 text-success';
        
        loadComments(articleId);
        
        setTimeout(() => {
            feedbackDiv.textContent = '';
        }, 4000);
    } catch (error) {
        console.error("Error posting comment:", error);
        feedbackDiv.textContent = `Error: ${error.message}`;
        feedbackDiv.className = 'small mt-2 text-danger';
    } finally {
        setButtonLoading('submit-comment-btn', false);
    }
}

// Load comments
async function loadComments(articleId) {
    const commentsListDiv = document.getElementById('comments-list');
    if (!commentsListDiv || !db) {
        console.error("Comments list container or DB not ready.");
        if (commentsListDiv) commentsListDiv.innerHTML = '<p class="text-danger small">Could not load comments.</p>';
        return;
    }
    
    commentsListDiv.innerHTML = '<p class="text-muted small">Loading comments...</p>';
    
    try {
        const commentsRef = db.collection('articles').doc(articleId).collection('comments');
        const snapshot = await commentsRef.orderBy('timestamp', 'asc').limit(50).get();
        
        if (snapshot.empty) {
            commentsListDiv.innerHTML = '<p class="text-muted small">Be the first to comment!</p>';
            return;
        }
        
        let commentsHTML = '<div class="list-group list-group-flush">';
        snapshot.forEach(doc => {
            const comment = doc.data();
            const timestamp = getSafe(() => new Date(comment.timestamp?.toDate()).toLocaleString(), 'Timestamp error');
            const userName = getSafe(() => comment.displayName, 'Anonymous');
            const userPhoto = getSafe(() => comment.photoURL, '/img/default-avatar.png');
            
            commentsHTML += `
                <div class="list-group-item px-0 py-3">
                    <div class="d-flex w-100">
                        <img src="${userPhoto}" alt="${userName}" class="rounded-circle me-2" style="width: 35px; height: 35px; object-fit: cover;">
                        <div class="flex-grow-1">
                            <div class="d-flex w-100 justify-content-between mb-1">
                                <h6 class="mb-0 small fw-bold">${userName}</h6>
                                <small class="text-muted">${timestamp}</small>
                            </div>
                            <p class="mb-0 small">${getSafe(() => comment.text, '')}</p>
                        </div>
                    </div>
                </div>
            `;
        });
        commentsHTML += '</div>';
        
        commentsListDiv.innerHTML = commentsHTML;
    } catch (error) {
        console.error("Error loading comments:", error);
        commentsListDiv.innerHTML = '<p class="text-danger small">Error loading comments.</p>';
    }
}

// Load related articles
async function loadRelatedArticles(categoryId, currentArticleId) {
    const container = document.getElementById('related-articles-list');
    const sectionContainer = document.getElementById('related-articles-container');
    if (!container || !sectionContainer || !db) return;
    
    try {
        const snapshot = await db.collection('articles')
            .where('category', '==', categoryId)
            .where('published', '==', true)
            .limit(4)
            .get();
        
        if (snapshot.docs.length <= 1) {
            sectionContainer.style.display = 'none';
            return;
        }
        
        // Get section info for URL generation
        const sectionDoc = await db.collection('sections').doc(categoryId).get();
        const sectionSlug = sectionDoc.exists ? sectionDoc.data().slug : 'article';
        
        let relatedHTML = '';
        let count = 0;
        
        snapshot.forEach(doc => {
            if (doc.id === currentArticleId || count >= 3) return;
            count++;
            
            const article = doc.data();
            relatedHTML += `
                <div class="col-md-4 mb-3">
                    <div class="card h-100 shadow-sm">
                        <div class="card-body d-flex flex-column">
                            <h5 class="card-title small">
                                <a href="/${sectionSlug}/${getSafe(() => article.slug, '#')}">${getSafe(() => article.title, 'Untitled')}</a>
                            </h5>
                            <p class="card-text text-muted small flex-grow-1">${getSafe(() => article.excerpt, '').substring(0, 80)}...</p>
                            <a href="/${sectionSlug}/${getSafe(() => article.slug, '#')}" class="btn btn-sm btn-outline-secondary mt-auto">Read More</a>
                        </div>
                    </div>
                </div>
            `;
        });
        
        if (relatedHTML) {
            container.innerHTML = relatedHTML;
            sectionContainer.style.display = 'block';
        } else {
            sectionContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading related articles:', error);
        sectionContainer.style.display = 'none';
    }
}

// Load trending articles for sidebar
async function loadTrendingArticles() {
    const container = document.getElementById('trending-articles-list');
    if (!container || !db) return;
    
    container.innerHTML = '<li>Loading...</li>';
    
    try {
        const snapshot = await db.collection('articles')
            .where('published', '==', true)
            .orderBy('createdAt', 'desc')
            .limit(6)
            .get();
        
        if (snapshot.empty) {
            container.innerHTML = '<li>No articles found</li>';
            return;
        }
        
        // Create a map of section IDs to slugs
        const sectionSlugs = {};
        const sectionIds = [...new Set(snapshot.docs.map(doc => doc.data().category).filter(Boolean))];
        
        if (sectionIds.length > 0) {
            const sectionsSnapshot = await db.collection('sections').where(firebase.firestore.FieldPath.documentId(), 'in', sectionIds).get();
            sectionsSnapshot.forEach(doc => {
                sectionSlugs[doc.id] = doc.data().slug;
            });
        }
        
        let trendingHTML = '';
        let count = 0;
        
        snapshot.forEach(doc => {
            const article = doc.data();
            // Skip the current article
            if (articleInfo && article.slug === articleInfo.articleSlug) return;
            if (count >= 5) return;
            count++;
            
            const sectionSlug = sectionSlugs[article.category] || 'article';
            trendingHTML += `<li><a href="/${sectionSlug}/${getSafe(() => article.slug, '#')}">${getSafe(() => article.title, 'Untitled')}</a></li>`;
        });
        
        container.innerHTML = trendingHTML || '<li>No trending articles</li>';
    } catch (error) {
        console.error('Error loading trending articles:', error);
        container.innerHTML = '<li>Failed to load</li>';
    }
}

// Button loading state helper
function setButtonLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    const spinner = button.querySelector('.spinner-border');
    if (spinner) spinner.classList.toggle('d-none', !isLoading);
    button.disabled = isLoading;
}

// Show error message
function showError(message) {
    const articleContainer = document.getElementById('article-container');
    if (articleContainer) {
        articleContainer.innerHTML = `
            <div class="alert alert-danger text-center mt-4">
                <h1 class="alert-heading">Oops!</h1>
                <p>${message}</p>
                <a href="/" class="btn btn-primary mt-3">Go to Homepage</a>
            </div>
        `;
    }
    
    const relatedContainer = document.getElementById('related-articles-container');
    if (relatedContainer) relatedContainer.style.display = 'none';
}

// Embed handling functions
function loadEmbedScripts() {
    const articleBody = document.querySelector('.article-body-content');
    if (!articleBody) return;
    
    const articleHtml = articleBody.innerHTML;
    
    function loadScriptIfNeeded(src, id, callback) {
        if (!document.getElementById(id)) {
            const script = document.createElement('script');
            script.src = src;
            script.id = id;
            script.async = true;
            script.charset = 'utf-8';
            if (callback) {
                script.onload = callback;
            }
            document.body.appendChild(script);
            console.log(`Loaded embed script: ${id}`);
        } else if (callback) {
            callback();
        }
    }
    
    // Twitter/X embeds
    if (articleHtml.includes('twitter-tweet') || articleHtml.includes('platform.twitter.com')) {
        loadScriptIfNeeded('https://platform.twitter.com/widgets.js', 'twitter-embed-script', function() {
            if (window.twttr && window.twttr.widgets) {
                console.log("Initializing Twitter widgets...");
                window.twttr.widgets.load();
            }
        });
    }
    
    // Instagram embeds
    if (articleHtml.includes('instagram-media') || articleHtml.includes('platform.instagram.com')) {
        loadScriptIfNeeded('https://www.instagram.com/embed.js', 'instagram-embed-script');
    }
    
    // TikTok embeds
    if (articleHtml.includes('tiktok-embed') || articleHtml.includes('tiktok.com')) {
        loadScriptIfNeeded('https://www.tiktok.com/embed.js', 'tiktok-embed-script');
    }
}

function addEmbedStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .embedded-content-container {
            display: flex;
            justify-content: center;
            margin: 20px 0;
            width: 100%;
            overflow: hidden;
        }
        
        .article-body-content iframe {
            max-width: 100%;
        }
        
        .article-body-content iframe[src*="youtube.com"],
        .article-body-content iframe[src*="youtu.be"] {
            aspect-ratio: 16/9;
            width: 100%;
            height: auto;
            max-width: 560px;
        }
        
        .twitter-tweet {
            margin-left: auto;
            margin-right: auto;
        }
        
        .instagram-media {
            margin-left: auto !important;
            margin-right: auto !important;
        }
    `;
    document.head.appendChild(style);
}

function initializeEmbeds() {
    loadEmbedScripts();
    
    setTimeout(function() {
        if (window.twttr && window.twttr.widgets) {
            window.twttr.widgets.load();
        }
    }, 1500);
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('Article page DOM loaded');
    
    if (articleInfo) {
        console.log('Loading article with info:', articleInfo);
        loadArticle(articleInfo);
    } else {
        console.error('No article info found');
        showError('Invalid article URL.');
        document.title = "Article Not Found | TrendingTechDaily";
    }
});
