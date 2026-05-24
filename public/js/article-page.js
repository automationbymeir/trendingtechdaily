// /js/article-page.js - Fixed Version

// Helper function
function getSafe(fn, defaultValue = '') {
    try {
        const value = fn();
        return (value !== null && value !== undefined) ? value : defaultValue;
    } catch (e) {
        return defaultValue;
    }
}

// Get article info from URL or sessionStorage
function getArticleInfoFromUrl() {
    // First check if we have server-injected info
    if (window.__SERVER_INJECTED_ARTICLE_INFO__) {
        const info = window.__SERVER_INJECTED_ARTICLE_INFO__;
        console.log('Found server-injected article info:', info);
        return { 
            sectionSlug: info.sectionSlug, 
            articleSlug: info.articleSlug,
            fromServer: true 
        };
    }
    
    // Then check if we have routing info from the router
    const routingInfo = sessionStorage.getItem('articleRouting');
    if (routingInfo) {
        sessionStorage.removeItem('articleRouting');
        const parsed = JSON.parse(routingInfo);
        console.log('Found routing info in sessionStorage:', parsed);
        return { 
            sectionSlug: parsed.category, 
            articleSlug: parsed.slug,
            fromRouter: true 
        };
    }
    
    // Check current URL structure
    const pathParts = window.location.pathname.split('/').filter(part => part && part !== '');
    console.log('URL path parts:', pathParts);
    
    // Handle direct navigation to article.html (for backwards compatibility)
    if (window.location.pathname.includes('article.html')) {
        const urlParams = new URLSearchParams(window.location.search);
        const slugParam = urlParams.get('slug');
        if (slugParam) {
            console.log('Found slug in query params (legacy):', slugParam);
            return { articleSlug: slugParam, isLegacy: true };
        }
    }
    
    // Handle new URL structure: /category/article-slug
    if (pathParts.length >= 2) {
        const sectionSlug = pathParts[0];
        const articleSlug = pathParts[1];
        
        console.log('Found section/article URL:', { sectionSlug, articleSlug });
        return { sectionSlug, articleSlug };
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
        console.log('Article loaded:', {
            title: article.title,
            categoryId: article.category,
            slug: article.slug
        });

        // Initialize section with default values
        let section = null;
        
        // Get section info if category exists
        if (article.category) {
            try {
                const sectionDoc = await db.collection('sections').doc(article.category).get();
                if (sectionDoc.exists) {
                    section = { id: sectionDoc.id, ...sectionDoc.data() };
                    console.log('Section found:', section.name, 'Slug:', section.slug);
                    
                    // Update URL to the new structure if needed
                    const correctUrl = `/${section.slug}/${article.slug}`;
                    if (window.location.pathname !== correctUrl) {
                        console.log('Updating URL to new structure');
                        window.history.replaceState({}, '', correctUrl);
                    }
                } else {
                    console.warn('Section document not found for category:', article.category);
                }
            } catch (sectionError) {
                console.error('Error fetching section:', sectionError);
            }
        } else {
            console.warn('Article has no category assigned');
        }
        
        // Update page metadata
        updatePageMetadata(article);
        
        // Render article content - pass section even if null
        await renderArticle(article, section);
        
        // Post-render actions - pass both article and section
        await handlePostRenderActions(article, section);

    } catch (error) {
        console.error('Error loading article:', error);
        showError(`Failed to load the article. Please try again later.`);
        document.title = "Error | TrendingTechDaily";
    }
}

// Update page metadata
function updatePageMetadata(article) {
    const pageTitle = getSafe(() => article.title, 'Article') + ' - TrendingTech Daily';
    const pageDescription = getSafe(() => article.excerpt, 
        getSafe(() => article.content, '').substring(0, 160).replace(/<[^>]*>/g, '')
    ) + '...';
    
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
            title: getSafe(() => article.title, ''),
            description: pageDescription,
            category: getSafe(() => article.category, ''),
            slug: getSafe(() => article.slug, '')
        });
    }
}

// Render article content
async function renderArticle(article, section) {
    const articleContainer = document.getElementById('article-container');
    if (!articleContainer) {
        console.error('Article container not found');
        return;
    }
    
    const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
    
    // Get category name from section or use defaults
    let categoryName = 'Uncategorized';
    let categorySlug = 'uncategorized';
    
    if (section && section.name && section.slug) {
        categoryName = section.name;
        categorySlug = section.slug;
        console.log('Using section data for display:', categoryName, categorySlug);
    } else {
        console.log('No valid section data, using defaults');
    }
    
    const articleHTML = `
        <article>
            <header class="article-header mb-3">
                <h1 class="article-title">${getSafe(() => article.title, 'Untitled Article')}</h1>
                <div class="article-meta text-muted small">
                    <span>Published on ${date}</span> |
                    <span id="category-display">Category: <a href="/${categorySlug}">${categoryName}</a></span>
                    ${getSafe(() => article.author) ? ` | <span>By ${article.author}</span>` : ''}
                    ${getSafe(() => article.readingTimeMinutes) ? ` | <span><i class="bi bi-clock"></i> ${article.readingTimeMinutes} min read</span>` : ''}
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
                <button type="button" id="read-aloud-btn" class="btn btn-link text-secondary btn-sm p-1" title="Listen to article">
                    <i class="bi bi-volume-up"></i>
                </button>
                <span id="copy-link-feedback" class="ms-2 small text-success" style="display: none; opacity: 0;">Link Copied!</span>
                <button type="button" id="save-article-btn" class="btn btn-outline-primary btn-sm ms-auto" style="display: none;">
                    <i class="bi bi-bookmark me-1"></i> <span>Save Article</span>
                </button>
            </div>
            
            ${getSafe(() => article.featuredImage) ? `
            <div class="article-featured-image mb-4">
                <img src="${article.featuredImage}" alt="${getSafe(() => article.imageAltText, article.title)}" class="img-fluid">
            </div>` : ''}
            
            <div class="article-body-content">
                ${getSafe(() => article.content, '<p>No content available.</p>')}
            </div>
            
            ${Array.isArray(article.tags) && article.tags.length > 0 ? `
            <div class="article-tags mt-4">
                <i class="bi bi-tags"></i> Tags: 
                ${article.tags.map(tag => `<span class="badge bg-secondary me-1">${tag}</span>`).join('')}
            </div>` : ''}
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
    console.log('Article rendered successfully');
}

// Setup share buttons - SINGLE FUNCTION
async function setupShareButtons(article, section) {
    try {
        // Use section slug if provided, otherwise default to 'article'
        let sectionSlug = 'article';
        if (section && section.slug) {
            sectionSlug = section.slug;
        } else if (article.category) {
            // Try to fetch section if not provided
            try {
                const sectionDoc = await db.collection('sections').doc(article.category).get();
                if (sectionDoc.exists) {
                    sectionSlug = sectionDoc.data().slug;
                }
            } catch (err) {
                console.warn('Could not fetch section for share buttons:', err);
            }
        }
        
        const articleSlug = getSafe(() => article.slug, '');
        const shareUrl = `${window.location.origin}/${sectionSlug}/${articleSlug}`;
        const shareTitle = getSafe(() => article.title, 'Check out this article');
        const shareText = getSafe(() => article.excerpt, shareTitle);
        
        // Update share button links
        const twitterBtn = document.getElementById('share-twitter');
        if (twitterBtn) {
            twitterBtn.href = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`;
        }
        
        const facebookBtn = document.getElementById('share-facebook');
        if (facebookBtn) {
            facebookBtn.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
        }
        
        const linkedinBtn = document.getElementById('share-linkedin');
        if (linkedinBtn) {
            linkedinBtn.href = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`;
        }
        
        const emailBtn = document.getElementById('share-email');
        if (emailBtn) {
            emailBtn.href = `mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodeURIComponent(shareText + '\n\n' + shareUrl)}`;
        }
        
        // Copy link button - remove any existing listeners first
        const copyLinkBtn = document.getElementById('share-copy-link');
        const copyFeedback = document.getElementById('copy-link-feedback');
        if (copyLinkBtn) {
            // Clone node to remove all event listeners
            const newCopyBtn = copyLinkBtn.cloneNode(true);
            copyLinkBtn.parentNode.replaceChild(newCopyBtn, copyLinkBtn);
            
            // Add single event listener to the new button
            newCopyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    if (copyFeedback) {
                        copyFeedback.style.display = 'inline';
                        copyFeedback.style.opacity = '1';
                        setTimeout(() => {
                            copyFeedback.style.opacity = '0';
                            setTimeout(() => {
                                copyFeedback.style.display = 'none';
                            }, 300);
                        }, 2000);
                    }
                } catch (err) {
                    console.error('Failed to copy link:', err);
                    alert('Failed to copy link. Please copy manually: ' + shareUrl);
                }
            });
        }
        
    } catch (error) {
        console.error('Error setting up share buttons:', error);
    }
}

// Handle actions after article is rendered
async function handlePostRenderActions(article, section) {
    const currentUser = auth.currentUser;
    
    // Initialize embeds if function exists
    if (typeof initializeEmbeds === 'function') {
        initializeEmbeds();
    }
    
    // Update AI agent context
    if (window.aiTechAgent && typeof window.aiTechAgent.checkPageContextAndReact === 'function') {
        window.aiTechAgent.checkPageContextAndReact();
    }
    
    // Update read history
    if (currentUser && article.id) {
        const readHistoryRef = db.collection('users').doc(currentUser.uid).collection('readHistory').doc(article.id);
        readHistoryRef.set({
            lastReadAt: firebase.firestore.FieldValue.serverTimestamp(),
            articleTitle: getSafe(() => article.title, 'Untitled'),
            articleSlug: getSafe(() => article.slug, '')
        }, { merge: true }).catch(err => console.error("Error updating read history:", err));
    }
    
    // Setup share buttons with section info
    await setupShareButtons(article, section);
    if (typeof setupReadAloud === 'function') {
        setupReadAloud(article);
    }
    
    // Setup save button
    if (currentUser && typeof setupSaveArticleButton === 'function') {
        setupSaveArticleButton(currentUser, article.id, article);
    }
    
    // Load comments
    if (article.id && typeof loadComments === 'function') {
        loadComments(article.id);
    }
    
    // Setup comment form
    if (typeof setupCommentForm === 'function') {
        setupCommentForm(article);
    }
    
    // Load related articles
    if (article.category && typeof loadRelatedArticles === 'function') {
        // Pass section slug if available
        const sectionSlug = section ? section.slug : null;
        loadRelatedArticles(article.category, article.id, sectionSlug);
    } else {
        const relatedContainer = document.getElementById('related-articles-container');
        if (relatedContainer) relatedContainer.style.display = 'none';
    }
    
    // Load trending articles for sidebar
    if (typeof loadTrendingArticles === 'function') {
        loadTrendingArticles();
    }

    // Add code block copy/download functionality
    addCodeBlockActions();

    // Ensure Prism.js highlights after content is rendered
    if (typeof Prism !== 'undefined') {
        Prism.highlightAll();
    }
}

// Show error message
function showError(message) {
    const articleContainer = document.getElementById('article-container');
    if (articleContainer) {
        articleContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <h4 class="alert-heading">Error</h4>
                <p>${message}</p>
            </div>
        `;
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
    
    // Remove any existing listeners by cloning
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.addEventListener('click', async () => {
        newSaveBtn.disabled = true;
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
            newSaveBtn.disabled = false;
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
            // Clone to remove existing listeners
            const newForm = commentForm.cloneNode(true);
            commentForm.parentNode.replaceChild(newForm, commentForm);
            newForm.addEventListener('submit', (e) => handleCommentSubmit(e, article.id, article.slug, article.title, user));
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
    
    const form = event.target;
    const textArea = document.getElementById('comment-text');
    const feedbackDiv = document.getElementById('comment-feedback');
    const submitButton = document.getElementById('submit-comment-btn');
    
    if (!textArea || !feedbackDiv || !submitButton) return;
    
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
async function loadRelatedArticles(categoryId, currentArticleId, currentSectionSlug) {
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
        
        const sectionSlug = currentSectionSlug || 'article';
        
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
    if (!container || !db) {
        console.error('Trending articles container or DB not ready');
        return;
    }
    
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
            const sectionsSnapshot = await db.collection('sections')
                .where(firebase.firestore.FieldPath.documentId(), 'in', sectionIds)
                .get();
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
    addEmbedStyles();
    loadEmbedScripts();
    
    setTimeout(function() {
        if (window.twttr && window.twttr.widgets) {
            window.twttr.widgets.load();
        }
    }, 1500);
}

// --- Read Aloud Feature ---
function setupReadAloud(article) {
    const btn = document.getElementById('read-aloud-btn');
    if (!btn || typeof functions === 'undefined') return;
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
            const plainText = article.content.replace(/<[^>]+>/g, ' ').slice(0, 5000);
            const readFunc = functions.httpsCallable('readArticleAloud');
            const result = await readFunc({ text: plainText });
            const data = result.data || {};
            if (data.audioContent) {
                const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`);
                audio.play();
            } else {
                alert('Audio unavailable.');
            }
        } catch (err) {
            console.error('Read aloud error:', err);
            alert('Failed to generate audio.');
        } finally {
            btn.disabled = false;
        }
    });
}

// --- Code Block Enhancements ---
function addCodeBlockActions() {
    document.querySelectorAll('pre > code, pre.ql-syntax').forEach(block => {
        let pre = block.tagName === 'CODE' ? block.parentNode : block;
        let codeBlock = block.tagName === 'CODE' ? block : null;
        if (!codeBlock) {
            codeBlock = document.createElement('code');
            codeBlock.textContent = pre.textContent;
            pre.textContent = '';
            pre.appendChild(codeBlock);
        }
        const language = Array.from(codeBlock.classList).find(cls => cls.startsWith('language-'));
        const langName = language ? language.substring(9) : 'text';

        // Create wrapper div
        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(pre);

        // Create header with buttons
        const header = document.createElement('div');
        header.className = 'code-block-header';

        const langLabel = document.createElement('span');
        langLabel.className = 'language-label';
        langLabel.textContent = langName.toUpperCase();
        header.appendChild(langLabel);

        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'code-block-buttons';

        // Copy Button
        const copyButton = document.createElement('button');
        copyButton.className = 'btn btn-sm btn-outline-secondary copy-code-btn';
        copyButton.innerHTML = '<i class="bi bi-files me-1"></i>Copy';
        copyButton.title = 'Copy code to clipboard';
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                copyButton.innerHTML = '<i class="bi bi-check-lg me-1"></i>Copied!';
                copyButton.classList.add('btn-success');
                copyButton.classList.remove('btn-outline-secondary');
                setTimeout(() => {
                    copyButton.innerHTML = '<i class="bi bi-files me-1"></i>Copy';
                    copyButton.classList.remove('btn-success');
                    copyButton.classList.add('btn-outline-secondary');
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy code:', err);
                alert('Failed to copy code. Please try again.');
            });
        });
        buttonGroup.appendChild(copyButton);

        // Download Button
        const downloadButton = document.createElement('button');
        downloadButton.className = 'btn btn-sm btn-outline-secondary download-code-btn ms-2';
        downloadButton.innerHTML = '<i class="bi bi-download me-1"></i>Download';
        downloadButton.title = 'Download code snippet';
        downloadButton.addEventListener('click', () => {
            const filename = `snippet.${langName === 'text' ? 'txt' : langName}`;
            const blob = new Blob([codeBlock.textContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
        buttonGroup.appendChild(downloadButton);

        header.appendChild(buttonGroup);
        wrapper.parentNode.insertBefore(header, wrapper);

        if (typeof Prism !== 'undefined') {
            Prism.highlightElement(codeBlock);
        }
    });
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