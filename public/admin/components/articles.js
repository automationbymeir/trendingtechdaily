// public/components/articles.js

// --- Initialization Check ---
if (typeof window.articlesManagerInitialized === 'undefined') {
    window.articlesManagerInitialized = true;
    console.log("Initializing Articles Manager script...");

    // Ensure global Firebase services are available
    if (typeof db === 'undefined' || typeof storage === 'undefined' || typeof functions === 'undefined') {
        console.error("Firebase services (db, storage, functions) are not available globally in articles.js!");
        alert("Error: Firebase services not initialized correctly. Please check dashboard.html.");
        throw new Error("Firebase services not initialized correctly."); // Stop execution
    }

    const articlesCollection = db.collection('articles');
    const sectionsCollection = db.collection('sections');
    const storageRef = storage.ref();

    let quillEditorInstance = null; // Global Quill instance for the editor

    // --- HELPER: Button Loading State ---
    function setButtonLoading(buttonId, isLoading) {
        const button = document.getElementById(buttonId);
        if (!button) {
            console.warn(`Button with ID '${buttonId}' not found for loading state.`);
            return;
        }
        const spinner = button.querySelector('.spinner-border');
        button.disabled = isLoading;
        if (spinner) {
            spinner.classList.toggle('d-none', !isLoading);
        }
    }
    // --- END HELPER ---

    // --- HELPER: Update AI Feedback Area ---
    function setAIFeedback(message, type = 'info') { // Default to 'info'
        const aiFeedbackDiv = document.getElementById('ai-feedback');
        if (!aiFeedbackDiv) {
            console.warn("AI Feedback div (#ai-feedback) not found.");
            return;
        }
        aiFeedbackDiv.textContent = message;
        aiFeedbackDiv.className = `small mt-2 text-${type}`; // Bootstrap text color classes

        if (type === 'success' || type === 'info' || type === 'warning') {
            setTimeout(() => {
                if (aiFeedbackDiv.textContent === message) {
                    aiFeedbackDiv.textContent = '';
                    aiFeedbackDiv.className = 'small mt-2'; // Reset class
                }
            }, 7000); // Clear after 7 seconds
        }
    }
    // --- END HELPER ---

    // Safely get potentially missing object properties
    function getSafe(fn, defaultValue = '') {
        try {
            const value = fn();
            return (value !== null && value !== undefined) ? value : defaultValue;
        } catch (e) {
            return defaultValue;
        }
    }

    // --- Load Articles List View ---
    function loadArticlesSection() {
        console.log("Loading Articles Section UI...");
        const contentArea = document.getElementById('content-area');
        if (!contentArea) { console.error("Content area not found!"); return; }

        const articlesHTML = `
            <div class="section-container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3>Manage Articles</h3>
                    <div>
                        <button id="top10-article-btn" class="btn btn-outline-secondary me-2">
                            <i class="bi bi-list-ol me-2"></i>Top 10 Article
                        </button>
                        <button id="new-article-btn" class="btn btn-primary">
                            <i class="bi bi-plus-circle me-2"></i>New Article
                        </button>
                    </div>
                </div>
                <div class="row mb-3">
                    <div class="col-md-6">
                        <input type="text" id="article-search" class="form-control" placeholder="Search titles or categories...">
                    </div>
                     <div class="col-md-6 text-md-end">
                        <span id="article-count" class="text-muted"></span>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle">
                        <thead>
                            <tr>
                                <th style="width: 30%;">Title</th>
                                <th style="width: 15%;">Category</th>
                                <th style="width: 10%;">Date</th>
                                <th style="width: 10%;">Status</th>
                                <th style="width: 20%;">URL</th>
                                <th style="width: 15%;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="articles-table-body">
                            <tr>
                                <td colspan="6" class="text-center p-5">Loading articles... <span class="spinner-border spinner-border-sm"></span></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                 <div id="pagination-controls" class="mt-3 d-flex justify-content-center">
                 </div>
            </div>`;
        contentArea.innerHTML = articlesHTML;

        document.getElementById('new-article-btn')?.addEventListener('click', () => openArticleEditor());

        document.getElementById('top10-article-btn')?.addEventListener('click', () => {
            if (typeof loadTop10Generator === 'function') {
                loadTop10Generator();
                document.querySelectorAll('#admin-sidebar .nav-link').forEach(l => l.classList.remove('active'));
                document.querySelector('#admin-sidebar .nav-link[data-section="top10"]')?.classList.add('active');
            } else {
                alert('Top 10 generator not available.');
            }
        });

        const searchInput = document.getElementById('article-search');
        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', function() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => filterArticles(this.value.toLowerCase()), 300);
            });
        }
        loadArticles();
    }

    // --- Estimate Reading Time ---
     function estimateReadingTime(htmlContent) {
        if (!htmlContent) return 0;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const textContent = tempDiv.textContent || tempDiv.innerText || "";
        const words = textContent.trim().split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const wpm = 225;
        const minutes = Math.ceil(wordCount / wpm);
        return minutes > 0 ? minutes : 1;
    }

    // --- Load Articles from Firestore ---
    async function loadArticles() {
        const tableBody = document.getElementById('articles-table-body');
        const articleCountSpan = document.getElementById('article-count');
        if (!tableBody) { console.error("Articles table body not found!"); return; }

        tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-5">Loading articles... <span class="spinner-border spinner-border-sm"></span></td></tr>`;
        if (articleCountSpan) articleCountSpan.textContent = '';

        try {
            // Load sections first to get names and slugs
            const sectionsSnapshot = await sectionsCollection.get();
            const sectionMap = {};
            sectionsSnapshot.forEach(doc => {
                sectionMap[doc.id] = {
                    name: getSafe(() => doc.data().name, 'Unknown Section'),
                    slug: getSafe(() => doc.data().slug, doc.id)
                };
            });

            const articlesSnapshot = await articlesCollection.orderBy('createdAt', 'desc').get();
            if (articleCountSpan) articleCountSpan.textContent = `${articlesSnapshot.size} article(s) found`;

            if (articlesSnapshot.empty) {
                tableBody.innerHTML = `<tr><td colspan="6" class="text-center p-4">No articles found. Create one!</td></tr>`;
                return;
            }

            let articlesHTML = '';
            articlesSnapshot.forEach((doc) => {
                const article = { id: doc.id, ...doc.data() };
                const date = getSafe(() => new Date(article.createdAt.toDate()).toLocaleDateString(), 'N/A');
                const slug = getSafe(() => article.slug, '#');
                
                // Get section info
                const section = sectionMap[article.category] || { name: 'Uncategorized', slug: 'uncategorized' };
                const sectionSlug = section.slug;
                const fullArticleUrl = `${window.location.origin}/${sectionSlug}/${slug}`;
                
                const title = getSafe(() => article.title, 'Untitled');

                articlesHTML += `
                    <tr data-id="${article.id}" data-search-terms="${title.toLowerCase()} ${section.name.toLowerCase()}">
                        <td>${title}</td>
                        <td>${section.name}</td>
                        <td>${date}</td>
                        <td>
                            <span class="badge ${article.published ? 'bg-success' : 'bg-secondary'}">
                                ${article.published ? 'Published' : 'Draft'}
                            </span>
                        </td>
                        <td>
                            <a href="/${sectionSlug}/${slug}" target="_blank" class="text-truncate d-inline-block text-decoration-none" style="max-width: 180px;" title="${fullArticleUrl}">
                                /${sectionSlug}/${slug}
                                <i class="bi bi-box-arrow-up-right small"></i>
                            </a>
                            <button class="btn btn-sm btn-outline-secondary copy-url-btn ms-1 py-0 px-1" data-url="${fullArticleUrl}">
                                <i class="bi bi-clipboard"></i>
                            </button>
                        </td>
                        <td>
                            <div class="btn-group btn-group-sm" role="group">
                                <button class="btn btn-outline-primary edit-article-btn" data-id="${article.id}" title="Edit">
                                    <i class="bi bi-pencil"></i>
                                </button>
                                <button class="btn btn-outline-danger delete-article-btn" data-id="${article.id}" title="Delete">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </div>
                        </td>
                    </tr>`;
            });
            tableBody.innerHTML = articlesHTML;
            addArticleActionListeners();
        } catch (error) {
            console.error('Error loading articles:', error);
            tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Error loading articles: ${error.message}</td></tr>`;
            if (articleCountSpan) articleCountSpan.textContent = 'Error loading';
        }
    }

    // --- Add Action Listeners for List View ---
    function addArticleActionListeners() {
        document.querySelectorAll('.edit-article-btn').forEach(button => {
            button.addEventListener('click', function() { openArticleEditor(this.dataset.id); });
        });
        document.querySelectorAll('.delete-article-btn').forEach(button => {
            button.addEventListener('click', function() { confirmDeleteArticle(this.dataset.id); });
        });
        document.querySelectorAll('.copy-url-btn').forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                const url = this.getAttribute('data-url');
                navigator.clipboard.writeText(url).then(() => {
                    const icon = this.querySelector('i');
                    if (!icon) return;
                    const originalClass = icon.className;
                    this.setAttribute('title', 'Copied!');
                    icon.className = 'bi bi-check-lg text-success';
                    setTimeout(() => {
                        icon.className = originalClass;
                        this.setAttribute('title', 'Copy full URL');
                    }, 2000);
                }).catch(err => console.error('Failed to copy URL:', err));
            });
        });
    }

    // --- Filter Articles List ---
    function filterArticles(searchTerm) {
        const rows = document.querySelectorAll('#articles-table-body tr');
        let visibleCount = 0;
        rows.forEach(row => {
            if (row.hasAttribute('data-search-terms')) {
                const searchData = row.dataset.searchTerms;
                if (searchData.includes(searchTerm)) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            }
        });
        const articleCountSpan = document.getElementById('article-count');
        if (articleCountSpan) {
            const totalRows = document.querySelectorAll('#articles-table-body tr[data-search-terms]').length;
            articleCountSpan.textContent = `Showing ${visibleCount} of ${totalRows} article(s)`;
        }
    }

    // --- Open Article Editor ---
    async function openArticleEditor(articleId = null) {
        const contentArea = document.getElementById('content-area');
        if (!contentArea) { console.error("Content area not found!"); return; }
        const isEditMode = !!articleId;
        quillEditorInstance = null;

        contentArea.innerHTML = `<div class="section-container text-center p-5">Loading ${isEditMode ? 'editor' : 'new article form'}... <span class="spinner-border"></span></div>`;

        try {
            const categoriesSnapshot = await sectionsCollection.where('active', '==', true).orderBy('name').get();
            const categories = categoriesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let article = { title: '', slug: '', content: '', excerpt: '', featuredImage: '', imageAltText: '', category: '', tags: [], published: false, readingTimeMinutes: 0 };
            if (isEditMode) {
                const articleDoc = await articlesCollection.doc(articleId).get();
                if (!articleDoc.exists) throw new Error(`Article ${articleId} not found`);
                article = { id: articleDoc.id, ...articleDoc.data() };
            }

            // Create category options with section IDs as values
            const categoryOptions = categories.map(cat => {
                return `<option value="${cat.id}" ${article.category === cat.id ? 'selected' : ''}>${cat.name}</option>`;
            }).join('');
            
            const tagsValue = Array.isArray(article.tags) ? article.tags.join(', ') : '';

            // --- EDITOR HTML (Ensure all element IDs match the JS) ---
            const editorHTML = `
            <div class="section-container">
                <div class="d-flex justify-content-between align-items-center mb-4">
                    <h3>${isEditMode ? 'Edit Article' : 'Create New Article'}</h3>
                    <button type="button" class="btn btn-outline-secondary btn-sm" id="back-to-articles-list">
                        <i class="bi bi-arrow-left me-2"></i>Back to List
                    </button>
                </div>
                <form id="article-form" novalidate>
                    <div class="row">
                        <div class="col-md-8">
                            <div class="card mb-3"><div class="card-body">
                                <div class="mb-3">
                                    <label for="title" class="form-label">Title <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" id="title" value="${getSafe(()=>article.title)}" required>
                                    <div class="invalid-feedback">Title is required.</div>
                                </div>
                                <div class="mb-3">
                                    <label for="slug" class="form-label">Slug</label>
                                    <input type="text" class="form-control" id="slug" value="${getSafe(()=>article.slug)}" aria-describedby="slugHelpArticle">
                                    <div id="slugHelpArticle" class="form-text">URL path (auto-generated if blank). Lowercase, numbers, hyphens.</div>
                                </div>
                                <div class="mb-3">
                                    <label for="excerpt" class="form-label">Excerpt</label>
                                    <textarea class="form-control" id="excerpt" rows="3" aria-describedby="excerptHelp">${getSafe(()=>article.excerpt)}</textarea>
                                    <div id="excerptHelp" class="form-text">Brief summary (optional).</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Content <span class="text-danger">*</span></label>
                                    <div id="editor-container" style="min-height: 350px; border: 1px solid #ced4da; border-radius: 0.25rem;"></div>
                                </div>
                            </div></div>
                        </div>
                        <div class="col-md-4">
                            <div class="card mb-3"><div class="card-header">Publish Settings</div><div class="card-body">
                                <div class="form-check form-switch mb-3">
                                    <input type="checkbox" class="form-check-input" id="published" ${getSafe(() => article.published) ? 'checked' : ''} role="switch">
                                    <label class="form-check-label" for="published">${getSafe(() => article.published) ? 'Published' : 'Draft'}</label>
                                </div>
                                <div class="d-flex justify-content-end flex-wrap gap-1">
                                    <button type="button" class="btn btn-sm btn-outline-info" id="preview-btn" title="Preview"><i class="bi bi-eye me-1"></i>Preview</button>
                                    <button type="button" class="btn btn-sm btn-outline-secondary" id="save-draft-btn" title="Save Draft"><span class="spinner-border spinner-border-sm d-none me-1"></span>Save Draft</button>
                                    <button type="submit" class="btn btn-sm btn-primary" id="publish-btn" title="Publish/Update"><span class="spinner-border spinner-border-sm d-none me-1"></span>${isEditMode ? 'Update' : 'Publish'}</button>
                                </div>
                            </div></div>
                            <div class="card mb-3"><div class="card-header">AI Content Tools</div><div class="card-body">
                                <div class="mb-3">
                                    <button type="button" class="btn btn-outline-info btn-sm w-100 mb-2" id="ai-suggest-topic-btn">
                                        <i class="bi bi-lightbulb me-1"></i>Suggest Topic
                                        <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                    </button>
                                    <div id="suggested-topic-container" class="alert alert-info d-none">
                                        <div id="suggested-topic-text"></div>
                                        <div id="suggested-topic-reason" class="small text-muted mt-1"></div>
                                        <div class="mt-3 d-flex gap-2">
                                            <button type="button" class="btn btn-sm btn-success" id="use-suggested-topic-btn">Use This Topic</button>
                                            <button type="button" class="btn btn-sm btn-outline-secondary" id="try-another-topic-btn">
                                                <i class="bi bi-arrow-clockwise me-1"></i>Try Another
                                                <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label for="ai-prompt" class="form-label">Topic / Prompt for Full Draft</label>
                                    <textarea class="form-control form-control-sm" id="ai-prompt" rows="3" placeholder="Enter topic for full draft..."></textarea>
                                </div>
                                <button type="button" class="btn btn-info btn-sm w-100 mb-2" id="ai-generate-full-btn">
                                    <i class="bi bi-stars me-1"></i>Generate Full Draft
                                    <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                </button><hr>
                                <button type="button" class="btn btn-outline-secondary btn-sm w-100 mb-2" id="ai-rephrase-title-btn">
                                    <i class="bi bi-arrow-repeat me-1"></i>Rephrase Title
                                    <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                </button>
                                <input type="text" id="ai-rephrase-title-prompt" class="form-control form-control-sm mb-2" placeholder="Optional: Rephrase title instructions">
                                <button type="button" class="btn btn-outline-secondary btn-sm w-100 mb-2" id="ai-rephrase-content-btn">
                                    <i class="bi bi-arrow-repeat me-1"></i>Rephrase Content
                                    <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                </button>
                                <textarea id="ai-rephrase-content-prompt" class="form-control form-control-sm mb-2" rows="2" placeholder="Optional: Rephrase content instructions"></textarea><hr>
                                <button type="button" class="btn btn-outline-secondary btn-sm w-100 mb-2" id="ai-generate-image-prompt-btn">
                                    <i class="bi bi-image me-1"></i>Suggest Image Prompt & Alt Text
                                    <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                </button>
                                <button type="button" class="btn btn-outline-primary btn-sm w-100 mb-2" id="ai-generate-image-btn">
                                    <i class="bi bi-image-fill me-1"></i>Get Article Image
                                    <span class="spinner-border spinner-border-sm d-none ms-1"></span>
                                </button>
                                <div id="ai-image-prompt-output" class="form-text bg-light border rounded p-2 mt-2" style="display: none; white-space: pre-wrap; word-wrap: break-word; font-size: 0.85em;"></div>
                                <div id="ai-feedback" class="small mt-2"></div>
                            </div></div>
                            <div class="card mb-3"><div class="card-header">Metadata</div><div class="card-body">
                                <div class="mb-3">
                                    <label for="category" class="form-label">Category</label>
                                    <select class="form-select form-select-sm" id="category"><option value="">-- Select --</option>${categoryOptions}</select>
                                </div>
                                <div class="mb-3">
                                    <label for="tags" class="form-label">Tags</label>
                                    <input type="text" class="form-control form-control-sm" id="tags" value="${tagsValue}" aria-describedby="tagsHelp">
                                    <div id="tagsHelp" class="form-text">Comma-separated.</div>
                                </div>
                            </div></div>
                            <div class="card shadow-sm mb-3"><div class="card-header">Featured Image</div><div class="card-body">
                                <div id="image-preview-container" class="mb-2 text-center ${!getSafe(()=>article.featuredImage) ? 'd-none' : ''}">
                                    <img id="featured-image-preview" src="${getSafe(()=>article.featuredImage, '#')}" alt="Featured image preview" class="img-fluid rounded" style="max-height: 150px; border: 1px solid #eee;">
                                </div>
                                <div class="input-group input-group-sm mb-2">
                                    <input type="text" class="form-control form-control-sm" id="featuredImage" value="${getSafe(()=>article.featuredImage)}" placeholder="Image URL or Upload/Generate">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" id="upload-image-btn" title="Upload"><i class="bi bi-upload"></i><span class="spinner-border spinner-border-sm d-none ms-1"></span></button>
                                    <button type="button" class="btn btn-sm btn-outline-danger ${!getSafe(()=>article.featuredImage) ? 'd-none' : ''}" id="remove-image-btn" title="Remove"><i class="bi bi-x-lg"></i></button>
                                </div>
                                <input type="file" id="image-upload-input" style="display: none;" accept="image/*">
                                <div class="mt-2">
                                    <label for="featuredImageAlt" class="form-label form-label-sm">Image Alt Text</label>
                                    <input type="text" class="form-control form-control-sm" id="featuredImageAlt" value="${getSafe(()=>article.imageAltText)}" aria-describedby="altHelp">
                                    <div id="altHelp" class="form-text small">Describe image for accessibility.</div>
                                </div>
                            </div></div>
                        </div>
                    </div>
                    <input type="hidden" id="article-id" value="${getSafe(()=>article.id)}">
                    <div class="mt-4 border-top pt-3 d-flex justify-content-between">
                        <button type="button" class="btn btn-outline-warning btn-sm" id="clear-form-btn"><i class="bi bi-eraser me-1"></i>Clear Fields</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="cancel-edit-btn">Cancel</button>
                    </div>
                </form>
            </div>`;
            contentArea.innerHTML = editorHTML;
            initializeQuillEditor(getSafe(() => article.content));
            addEditorEventListeners(isEditMode);
        } catch (error) {
            console.error('Error loading article editor:', error);
            contentArea.innerHTML = `<div class="alert alert-danger m-3">Failed to load editor: ${error.message} <button onclick="window.loadArticlesSection()" class="btn btn-sm btn-link p-0 align-baseline">Back to List</button></div>`;
        }
    }

    // --- Initialize Quill Editor ---
    function initializeQuillEditor(content) {
        if (typeof Quill === 'undefined') {
            console.error("Quill library is not loaded!");
            const editorContainer = document.getElementById('editor-container');
            if (editorContainer) editorContainer.innerHTML = '<div class="alert alert-danger">Editor library (Quill) failed to load.</div>';
            return;
        }
        try {
            quillEditorInstance = new Quill('#editor-container', {
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        [{ 'indent': '-1'}, { 'indent': '+1' }],
                        ['link', 'image', 'video'],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'align': [] }],
                        ['clean']
                    ]
                },
                theme: 'snow',
                placeholder: 'Write your amazing article here...'
            });
            if (content) {
                quillEditorInstance.root.innerHTML = content;
            }
            // Add custom HTML embed button
            setTimeout(() => {
                const toolbar = document.querySelector('#editor-container .ql-toolbar');
                if (toolbar) {
                    const customButtonContainer = document.createElement('span');
                    customButtonContainer.className = 'ql-formats custom-html-button-container';
                    const htmlButton = document.createElement('button');
                    htmlButton.type = 'button';
                    htmlButton.className = 'ql-embedHtml';
                    htmlButton.innerHTML = '<i class="bi bi-code-slash"></i>';
                    htmlButton.title = 'Embed HTML Code';
                    customButtonContainer.appendChild(htmlButton);
                    toolbar.appendChild(customButtonContainer);
                    htmlButton.addEventListener('click', (e) => {
                        e.preventDefault(); e.stopPropagation(); openHtmlEmbedModal(); return false;
                    });
                }
            }, 100);
        } catch (error) {
            console.error("Error initializing Quill:", error);
            const editorContainer = document.getElementById('editor-container');
            if (editorContainer) editorContainer.innerHTML = `<div class="alert alert-danger">Editor error: ${error.message}</div>`;
        }
    }

    // --- Open HTML Embed Modal ---
    function openHtmlEmbedModal() {
        const modalHTML = `
        <div class="modal fade" id="embedHtmlModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Embed HTML</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="embedType" class="form-label">Type</label>
                            <select class="form-select" id="embedType">
                                <option value="custom">Custom HTML</option>
                                <option value="twitter">Twitter/X</option>
                                <option value="facebook">Facebook</option>
                                <option value="instagram">Instagram</option>
                                <option value="linkedin">LinkedIn</option>
                                <option value="youtube">YouTube</option>
                            </select>
                        </div>
                        <div id="embedHelpText" class="mb-3 small text-muted">Paste HTML embed code.</div>
                        <textarea class="form-control font-monospace" id="embedHtmlCode" rows="8" placeholder="<iframe src='...'></iframe>"></textarea>
                        <div class="form-check mt-3">
                            <input class="form-check-input" type="checkbox" id="wrapEmbed" checked>
                            <label class="form-check-label" for="wrapEmbed">Wrap in centered container</label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="insertHtmlBtn">Insert</button>
                    </div>
                </div>
            </div>
        </div>`;
        const existingModal = document.getElementById('embedHtmlModal');
        if (existingModal) existingModal.remove();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const embedModal = new bootstrap.Modal(document.getElementById('embedHtmlModal'));
        embedModal.show();

        const embedTypeSelect = document.getElementById('embedType');
        const embedHelpText = document.getElementById('embedHelpText');
        const embedHtmlTextarea = document.getElementById('embedHtmlCode');

        embedTypeSelect.addEventListener('change', function() {
            const type = embedTypeSelect.value;
            embedHelpText.textContent = 'Paste HTML embed code.';
            embedHtmlTextarea.placeholder = '<iframe src="..."></iframe>';
            if (type === 'twitter') {
                embedHelpText.textContent = 'Enter the full X/Twitter post URL.';
                embedHtmlTextarea.placeholder = 'https://twitter.com/...';
            } else if (type === 'facebook') {
                embedHelpText.textContent = 'Enter the Facebook post URL.';
                embedHtmlTextarea.placeholder = 'https://www.facebook.com/...';
            } else if (type === 'instagram') {
                embedHelpText.textContent = 'Enter the Instagram post URL.';
                embedHtmlTextarea.placeholder = 'https://www.instagram.com/...';
            } else if (type === 'linkedin') {
                embedHelpText.textContent = 'Enter the LinkedIn post URL.';
                embedHtmlTextarea.placeholder = 'https://www.linkedin.com/...';
            }
        });

        document.getElementById('insertHtmlBtn').addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            let htmlCode = embedHtmlTextarea.value.trim();
            if (!htmlCode) { alert('Please enter HTML or URL.'); return; }
            const shouldWrap = document.getElementById('wrapEmbed').checked;
            let finalHtml = htmlCode;

            const type = embedTypeSelect.value;
            if (type === 'twitter') {
                finalHtml = `<blockquote class="twitter-tweet"><a href="${htmlCode}"></a></blockquote>`;
            } else if (type === 'facebook') {
                finalHtml = `<div class="fb-post" data-href="${htmlCode}" data-width="500"></div>`;
            } else if (type === 'instagram') {
                finalHtml = `<blockquote class="instagram-media" data-instgrm-permalink="${htmlCode}" data-instgrm-version="14"></blockquote>`;
            } else if (type === 'linkedin') {
                const idMatch = htmlCode.match(/(?:\/|%3A)([0-9]+)(?:\?|$)/);
                const shareId = idMatch ? idMatch[1] : '';
                finalHtml = `<iframe src="https://www.linkedin.com/embed/feed/update/urn:li:share:${shareId}" height="480" width="640" frameborder="0" allowfullscreen="" title="LinkedIn Post"></iframe>`;
            }

            if (shouldWrap) {
                finalHtml = `<div class="embedded-content-container" style="display: flex; justify-content: center; margin: 20px 0;">${finalHtml}</div>`;
            }
            if (quillEditorInstance) {
                const range = quillEditorInstance.getSelection(true);
                quillEditorInstance.clipboard.dangerouslyPasteHTML(range.index, finalHtml);
            }
            embedModal.hide(); return false;
        });
    }

    // --- Add ALL Editor Event Listeners ---
    function addEditorEventListeners(isEditMode) {
        console.log("Adding editor event listeners...");

        document.getElementById('back-to-articles-list')?.addEventListener('click', () => {
            if (confirm('Discard unsaved changes?')) loadArticlesSection();
        });
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
            if (confirm('Discard unsaved changes?')) loadArticlesSection();
        });

        const titleField = document.getElementById('title');
        const slugField = document.getElementById('slug');
        if (titleField && slugField) {
            titleField.addEventListener('blur', (e) => {
                if (!slugField.value.trim()) { slugField.value = createSlug(e.target.value); }
            });
        }

        const uploadImageBtn = document.getElementById('upload-image-btn');
        const imageUploadInput = document.getElementById('image-upload-input');
        if(uploadImageBtn && imageUploadInput) {
            uploadImageBtn.addEventListener('click', () => imageUploadInput.click());
            imageUploadInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) uploadImage(e.target.files[0], uploadImageBtn, document.getElementById('featuredImage'), document.getElementById('remove-image-btn'));
            });
        }

        const removeImageBtn = document.getElementById('remove-image-btn');
        const featuredImageInput = document.getElementById('featuredImage');
        const previewContainer = document.getElementById('image-preview-container');
        const previewImg = document.getElementById('featured-image-preview');
        if(removeImageBtn && featuredImageInput && previewContainer && previewImg) {
            removeImageBtn.addEventListener('click', () => {
                featuredImageInput.value = '';
                previewContainer.classList.add('d-none');
                previewImg.src = '#';
                removeImageBtn.classList.add('d-none');
                document.getElementById('featuredImageAlt').value = '';
            });
        }
        if (featuredImageInput && previewContainer && previewImg && removeImageBtn) {
            featuredImageInput.addEventListener('input', (e) => {
                const url = e.target.value.trim();
                if(url) {
                    previewImg.src = url;
                    previewContainer.classList.remove('d-none');
                    removeImageBtn.classList.remove('d-none');
                } else {
                    previewContainer.classList.add('d-none');
                    removeImageBtn.classList.add('d-none');
                    document.getElementById('featuredImageAlt').value = '';
                }
            });
        }
        
        // Topic Suggestion
        const suggestTopicBtn = document.getElementById('ai-suggest-topic-btn');
        if (suggestTopicBtn) {
            suggestTopicBtn.addEventListener('click', async () => {
                setButtonLoading('ai-suggest-topic-btn', true);
                setAIFeedback('Suggesting topic...', 'info');
                try {
                    const suggestFunction = functions.httpsCallable('suggestArticleTopic');
                    const result = await suggestFunction();
                    const data = result.data;
                    if (data.topic) {
                        document.getElementById('suggested-topic-text').textContent = data.topic;
                        document.getElementById('suggested-topic-reason').textContent = data.reason || '';
                        document.getElementById('suggested-topic-container').classList.remove('d-none');
                        setAIFeedback('Topic suggested!', 'success');
                    } else { throw new Error(data.message || 'No topic suggested.'); }
                } catch (error) {
                    console.error("Error suggesting topic:", error);
                    setAIFeedback('Sorry, topic suggestion failed. Please try again later.', 'danger');
                } finally {
                    setButtonLoading('ai-suggest-topic-btn', false);
                }
            });
        }
        document.getElementById('try-another-topic-btn')?.addEventListener('click', () => {
             document.getElementById('ai-suggest-topic-btn')?.click();
        });
        document.getElementById('use-suggested-topic-btn')?.addEventListener('click', () => {
            const topicText = document.getElementById('suggested-topic-text')?.textContent;
            if (topicText) document.getElementById('ai-prompt').value = topicText;
            document.getElementById('suggested-topic-container')?.classList.add('d-none');
            setAIFeedback('Topic loaded into prompt field.', 'success');
        });


        // Generate Full Article
        const generateFullBtn = document.getElementById('ai-generate-full-btn');
        if (generateFullBtn) {
            generateFullBtn.addEventListener('click', async () => {
                const topic = document.getElementById('ai-prompt')?.value.trim();
                if (!topic) { alert('Please enter a topic/prompt for full draft.'); return; }
                if (!confirm(`Generate full draft for "${topic}"? This will replace existing Title, Content, Excerpt, Tags, and Image Prompt.`)) return;

                setButtonLoading('ai-generate-full-btn', true);
                setAIFeedback('Generating full draft... (This may take up to a minute)', 'info');
                document.getElementById('ai-image-prompt-output')?.style.setProperty('display', 'none', 'important');


                let generatedData = null;
                try {
                    const generateDraftFunction = functions.httpsCallable('generateArticleContent');
                    const result = await generateDraftFunction({ prompt: topic });
                    generatedData = result.data;
                    console.log("AI Full Draft Response:", JSON.stringify(generatedData, null, 2));

                    if (generatedData.error) {
                        let detailedError = generatedData.message || 'Unknown backend error.';
                        if (generatedData.rawText) console.error("Raw AI Response causing error:", generatedData.rawText);
                        throw new Error(detailedError);
                    }
                    if (!generatedData.title || !generatedData.content || !generatedData.slug) {
                         console.warn("Generated data missing required fields:", generatedData);
                         throw new Error("AI response missing critical fields (title, content, slug).");
                    }

                    document.getElementById('title').value = getSafe(() => generatedData.title);
                    document.getElementById('slug').value = getSafe(() => generatedData.slug);
                    if (quillEditorInstance) quillEditorInstance.root.innerHTML = getSafe(() => generatedData.content);
                    document.getElementById('excerpt').value = getSafe(() => generatedData.excerpt);
                    document.getElementById('tags').value = getSafe(() => generatedData.tags, []).join(', ');
                    
                    const imagePromptText = getSafe(() => generatedData.imagePrompt);
                    const imageAltText = getSafe(() => generatedData.imageAltText, getSafe(() => generatedData.title));
                    
                    const imgPromptOutputDiv = document.getElementById('ai-image-prompt-output');
                    if (imagePromptText && imgPromptOutputDiv) {
                        imgPromptOutputDiv.textContent = `IMAGE PROMPT: ${imagePromptText}`;
                        if (imageAltText) imgPromptOutputDiv.textContent += `\n\nALT TEXT: ${imageAltText}`;
                        imgPromptOutputDiv.style.display = 'block';
                    }
                    document.getElementById('featuredImageAlt').value = imageAltText; // Set alt text

                    setAIFeedback('Article draft generated! Now attempting to get image...', 'info');

                    // Now, attempt to get the image using the generated prompt
                    if (imagePromptText) {
                        const generateImageFunction = functions.httpsCallable('generateArticleImage');
                        const imageResult = await generateImageFunction({ 
                            prompt: imagePromptText, 
                            articleTitle: generatedData.title,
                            articleContent: generatedData.excerpt // or some content sample
                        });
                        const imageData = imageResult.data;
                        console.log("Image Generation Response (within full draft):", JSON.stringify(imageData, null, 2));

                        if (imageData.success && imageData.imageUrl) {
                            document.getElementById('featuredImage').value = imageData.imageUrl;
                            document.getElementById('featuredImage').dispatchEvent(new Event('input'));
                            // Alt text might have been refined by generateArticleImage
                            if (imageData.imageAltText) document.getElementById('featuredImageAlt').value = imageData.imageAltText;
                            setAIFeedback(`Draft & Image (${imageData.source}) loaded!`, 'success');
                        } else {
                            setAIFeedback(`Draft generated. Image: ${imageData.message || 'failed or no image found.'}`, 'warning');
                        }
                    } else {
                         setAIFeedback('Article draft generated (no image prompt provided by AI).', 'success');
                    }
                     // Stock Data Integration Step (if applicable)
                    if (generatedData.mentionedCompanies && generatedData.mentionedCompanies.length > 0) {
                        // ... (your existing stock data integration logic) ...
                        console.log("Mentioned companies found, stock data integration would happen here if implemented.");
                    }


                } catch (error) {
                    console.error("Error during full article generation:", error);
                    setAIFeedback(`Full Draft Error: ${error.message || 'An unexpected error occurred.'}`, 'danger');
                } finally {
                    setButtonLoading('ai-generate-full-btn', false);
                }
            });
        }

        // Rephrase Title
        document.getElementById('ai-rephrase-title-btn')?.addEventListener('click', async () => {
            const titleInput = document.getElementById('title');
            const currentTitle = titleInput?.value.trim();
            if (!currentTitle) { alert('Enter a title first.'); return; }
            const instructions = document.getElementById('ai-rephrase-title-prompt')?.value.trim();
            setButtonLoading('ai-rephrase-title-btn', true);
            setAIFeedback('Rephrasing title...', 'info');
            try {
                const rephraseFunction = functions.httpsCallable('rephraseText');
                const result = await rephraseFunction({ text: currentTitle, mode: 'title', instructions });
                const newTitle = getSafe(() => result.data.rephrasedText, '').trim();
                if (newTitle) {
                    if(titleInput) titleInput.value = newTitle;
                    const slugInput = document.getElementById('slug');
                    if (slugInput && (!slugInput.value.trim() || slugInput.value === createSlug(currentTitle))) {
                         slugInput.value = createSlug(newTitle);
                    }
                    setAIFeedback('Title rephrased.', 'success');
                } else { throw new Error('Received empty response for title rephrasing.'); }
            } catch (error) {
                console.error("Error rephrasing title:", error);
                setAIFeedback(`Rephrase Title Error: ${error.message}`, 'danger');
            } finally {
                setButtonLoading('ai-rephrase-title-btn', false);
            }
        });
        
        // Rephrase Content
        document.getElementById('ai-rephrase-content-btn')?.addEventListener('click', async () => {
            if (!quillEditorInstance || quillEditorInstance.getLength() <= 1) { alert('Enter content first.'); return; }
            if (!confirm("Rephrase entire content? Existing content will be replaced.")) return;
            const instructions = document.getElementById('ai-rephrase-content-prompt')?.value.trim();
            const currentContent = quillEditorInstance.root.innerHTML;
            setButtonLoading('ai-rephrase-content-btn', true);
            setAIFeedback('Rephrasing content... (This may take a moment)', 'info');
            try {
                const rephraseFunction = functions.httpsCallable('rephraseText');
                const result = await rephraseFunction({ text: currentContent, mode: 'content', instructions });
                const newContent = getSafe(() => result.data.rephrasedText, '').trim();
                if (newContent) {
                    quillEditorInstance.setText('');
                    quillEditorInstance.clipboard.dangerouslyPasteHTML(0, newContent);
                    setAIFeedback('Content rephrased.', 'success');
                } else { throw new Error('Received empty response for content rephrasing.'); }
            } catch (error) {
                console.error("Error rephrasing content:", error);
                setAIFeedback(`Rephrase Content Error: ${error.message}`, 'danger');
            } finally {
                setButtonLoading('ai-rephrase-content-btn', false);
            }
        });

        // Suggest Image Prompt & Alt Text
        document.getElementById('ai-generate-image-prompt-btn')?.addEventListener('click', async () => {
            const title = document.getElementById('title')?.value.trim();
            const excerpt = document.getElementById('excerpt')?.value.trim();
            if (!title && !excerpt) { alert('Please enter a Title or Excerpt first for context.'); return; }
            
            const contextPrompt = `Generate a short, descriptive prompt (around 15-25 words) for an AI image generator (like Midjourney or DALL-E) based ONLY on the following article idea:\nTitle: ${title}\nExcerpt: ${excerpt}\n\nRespond ONLY with the prompt text followed by a short, descriptive alt text for accessibility purposes. Format your response STRICTLY as:\nIMAGE PROMPT: [your image prompt here]\n\nALT TEXT: [your alt text here]`;
            
            setButtonLoading('ai-generate-image-prompt-btn', true);
            setAIFeedback('Suggesting image prompt & alt text...', 'info');
            const imgPromptOutputDiv = document.getElementById('ai-image-prompt-output');
            if (imgPromptOutputDiv) imgPromptOutputDiv.style.display = 'none';

            try {
                const suggestFunction = functions.httpsCallable('rephraseText'); // Using rephraseText with a specific mode.
                const result = await suggestFunction({ text: contextPrompt, mode: 'image_prompt_and_alt' }); // A new mode for backend to handle
                let responseText = getSafe(() => result.data.rephrasedText, '').trim();
                console.log("Raw response for image prompt/alt text suggestion:", responseText);

                const imagePromptMatch = responseText.match(/IMAGE PROMPT:\s*([\s\S]+?)\n\nALT TEXT:/);
                const altTextMatch = responseText.match(/ALT TEXT:\s*([\s\S]+)/);
                const suggestedImagePrompt = imagePromptMatch && imagePromptMatch[1] ? imagePromptMatch[1].trim() : null;
                const suggestedAltText = altTextMatch && altTextMatch[1] ? altTextMatch[1].trim() : null;

                if (suggestedImagePrompt && imgPromptOutputDiv) {
                    imgPromptOutputDiv.textContent = `IMAGE PROMPT: ${suggestedImagePrompt}`;
                    if (suggestedAltText) {
                        imgPromptOutputDiv.textContent += `\n\nALT TEXT: ${suggestedAltText}`;
                        const altTextInput = document.getElementById('featuredImageAlt');
                        if(altTextInput) altTextInput.value = suggestedAltText;
                    }
                    imgPromptOutputDiv.style.display = 'block';
                    setAIFeedback('Image prompt and alt text suggested.', 'success');
                } else {
                    console.error("Could not parse IMAGE PROMPT or ALT TEXT from response:", responseText);
                    throw new Error("AI did not provide a valid image prompt/alt text in the expected format.");
                }
            } catch (error) {
                console.error("Error generating image prompt/alt text:", error);
                setAIFeedback(`Suggest Prompt Error: ${error.message || 'An unexpected error occurred.'}`, 'danger');
                if (imgPromptOutputDiv) {
                    imgPromptOutputDiv.textContent = 'Error loading suggestion.';
                    imgPromptOutputDiv.style.display = 'block';
                }
            } finally {
                setButtonLoading('ai-generate-image-prompt-btn', false);
            }
        });

        // Get Article Image (using suggested or derived prompt)
        document.getElementById('ai-generate-image-btn')?.addEventListener('click', async () => {
            let imagePrompt = '';
            let suggestedAltText = '';
            const imgPromptOutputDiv = document.getElementById('ai-image-prompt-output');
            const outputText = imgPromptOutputDiv ? imgPromptOutputDiv.textContent : '';

            if (outputText && outputText.includes('IMAGE PROMPT:')) {
                const promptMatch = outputText.match(/IMAGE PROMPT:\s*([\s\S]+?)(\n\nALT TEXT:|$)/);
                if (promptMatch && promptMatch[1]) imagePrompt = promptMatch[1].trim();
                
                const altMatch = outputText.match(/ALT TEXT:\s*([\s\S]+)/);
                if (altMatch && altMatch[1]) suggestedAltText = altMatch[1].trim();
            }

            if (!imagePrompt) {
                const title = document.getElementById('title')?.value.trim();
                const excerpt = document.getElementById('excerpt')?.value.trim();
                if (!title) { alert('Please enter a title or use "Suggest Image Prompt" first.'); return; }
                imagePrompt = `Professional news article illustration for: ${title}. ${excerpt ? excerpt.substring(0, 100) : ''}`;
            }

            setButtonLoading('ai-generate-image-btn', true);
            setAIFeedback(`Getting image for prompt: "${imagePrompt.substring(0,50)}..."`, 'info');
            
            try {
                const generateImageFunction = functions.httpsCallable('generateArticleImage');
                const result = await generateImageFunction({ 
                    prompt: imagePrompt, 
                    articleTitle: document.getElementById('title')?.value.trim(),
                });
                const imageData = result.data;
                console.log("Response from generateArticleImage:", JSON.stringify(imageData, null, 2));

                if (imageData.success && imageData.imageUrl) {
                    document.getElementById('featuredImage').value = imageData.imageUrl;
                    document.getElementById('featuredImage').dispatchEvent(new Event('input'));
                    
                    const altInput = document.getElementById('featuredImageAlt');
                    if (altInput) {
                        altInput.value = imageData.imageAltText || suggestedAltText || `Image related to: ${imagePrompt.substring(0,30)}`;
                    }
                    setAIFeedback(`Image from ${imageData.source} loaded. ${imageData.message || ''}`, 'success');
                } else {
                    throw new Error(imageData.message || 'Failed to get image or no image URL returned.');
                }
            } catch (error) {
                setAIFeedback('Sorry, image generation failed. Please try again later.', 'danger');
                console.error("Error getting article image:", error);
            } finally {
                setButtonLoading('ai-generate-image-btn', false);
            }
        });
        
        // Form submit (Publish/Update)
        document.getElementById('article-form')?.addEventListener('submit', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (!e.target.checkValidity()) { e.target.classList.add('was-validated'); return; }
             if (!quillEditorInstance || quillEditorInstance.getLength() <= 1) {
                alert("Article content cannot be empty.");
                document.getElementById('editor-container').style.borderColor = 'red';
                return;
            } else {
                document.getElementById('editor-container').style.borderColor = '#ced4da';
            }
            handleSaveArticle(true, document.getElementById('publish-btn')); // true for published
        });
        
        // Save Draft
        document.getElementById('save-draft-btn')?.addEventListener('click', () => {
            const titleInput = document.getElementById('title');
            if (!titleInput || !titleInput.value.trim()) { alert("Title is required to save a draft."); titleInput?.focus(); return; }
            handleSaveArticle(false, document.getElementById('save-draft-btn')); // false for not published
        });

        // Preview
        document.getElementById('preview-btn')?.addEventListener('click', previewArticle);

        // Clear Form
        document.getElementById('clear-form-btn')?.addEventListener('click', () => {
            if (confirm('Clear all fields? This cannot be undone.')) {
                document.getElementById('article-form')?.reset();
                if (quillEditorInstance) quillEditorInstance.setText('');
                if (slugField) slugField.value = '';
                if (featuredImageInput) featuredImageInput.value = '';
                if (previewContainer) previewContainer.classList.add('d-none');
                if (previewImg) previewImg.src = '#';
                if (removeImageBtn) removeImageBtn.classList.add('d-none');
                document.getElementById('featuredImageAlt').value = '';
                document.getElementById('ai-image-prompt-output').style.display = 'none';
                document.getElementById('ai-image-prompt-output').textContent = '';
                setAIFeedback('Form cleared.', 'info');
            }
        });
        
        // Handle published switch label
        const publishedSwitch = document.getElementById('published');
        const publishedLabel = document.querySelector('label[for="published"]');
        if (publishedSwitch && publishedLabel) {
            publishedSwitch.addEventListener('change', function() {
                publishedLabel.textContent = this.checked ? 'Published' : 'Draft';
            });
        }


        console.log("All editor event listeners added.");
    }

    // --- Handle Save Article (main logic) ---
    function handleSaveArticle(isActuallyPublished, buttonElement) {
        if (!quillEditorInstance) { alert("Editor not initialized."); return; }

        const articleId = document.getElementById('article-id').value;
        const title = document.getElementById('title').value.trim();
        let slug = document.getElementById('slug').value.trim();
        if (!slug && title) slug = createSlug(title);
        else if (slug) slug = createSlug(slug); // Ensure formatting

        const excerpt = document.getElementById('excerpt').value.trim();
        const category = document.getElementById('category').value; // This gets the section ID
        const tags = document.getElementById('tags').value.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
        const featuredImage = document.getElementById('featuredImage').value.trim();
        const imageAltText = document.getElementById('featuredImageAlt').value.trim();
        const content = quillEditorInstance.root.innerHTML;
        const publishedState = isActuallyPublished; // Use the passed parameter
        let readingTimeMinutes = estimateReadingTime(content);

        if (!title || (isActuallyPublished && quillEditorInstance.getLength() <= 1)) {
            alert(isActuallyPublished ? "Title and Content are required." : "Title is required.");
            if(!title) document.getElementById('title').classList.add('is-invalid');
            if(isActuallyPublished && quillEditorInstance.getLength() <= 1) document.getElementById('editor-container').style.borderColor = 'red';
            return;
        }
        document.getElementById('title').classList.remove('is-invalid');
        document.getElementById('editor-container').style.borderColor = '#ced4da';

        if (!isActuallyPublished && quillEditorInstance.getLength() <= 1) {
            readingTimeMinutes = 0;
        }


        setButtonLoading(buttonElement.id, true);

        saveArticleToFirestore({
            id: articleId, title, slug, excerpt, category, tags,
            featuredImage, imageAltText, content, 
            published: publishedState, 
            readingTimeMinutes
        }, buttonElement);
    }

    // --- Save Article to Firestore ---
    async function saveArticleToFirestore(articleDataToSave, buttonElement) {
        const isNewArticle = !articleDataToSave.id;
        let operation = isNewArticle ? 'add' : 'update';
        let collectionRef = articlesCollection;
        let docRef = isNewArticle ? null : collectionRef.doc(articleDataToSave.id);

        const firestorePayload = {
            title: articleDataToSave.title,
            slug: articleDataToSave.slug,
            excerpt: articleDataToSave.excerpt,
            category: articleDataToSave.category, // This is the section ID
            tags: articleDataToSave.tags,
            featuredImage: articleDataToSave.featuredImage,
            imageAltText: articleDataToSave.imageAltText,
            content: articleDataToSave.content,
            published: articleDataToSave.published,
            readingTimeMinutes: articleDataToSave.readingTimeMinutes,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (isNewArticle) {
            firestorePayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        
        try {
            // Slug uniqueness check
            const slugQuery = await articlesCollection.where('slug', '==', firestorePayload.slug).get();
            let slugExistsOnAnotherDoc = false;
            slugQuery.forEach(doc => {
                if (doc.id !== articleDataToSave.id) { // If it's not the current article being edited
                    slugExistsOnAnotherDoc = true;
                }
            });
            if (slugExistsOnAnotherDoc) {
                throw new Error(`Slug "${firestorePayload.slug}" already exists on another article. Please choose a unique slug.`);
            }

            if (isNewArticle) {
                const newDocRef = await collectionRef.add(firestorePayload);
                console.log(`Article created with ID: ${newDocRef.id}`);
                alert(`Article created successfully!`);
            } else {
                await docRef.update(firestorePayload);
                console.log(`Article updated: ${articleDataToSave.id}`);
                alert(`Article updated successfully!`);
            }
            loadArticlesSection(); // Reload list view
        } catch (error) {
            console.error(`Error ${isNewArticle ? 'creating' : 'updating'} article:`, error);
            alert(`Error saving article: ${error.message}`);
        } finally {
            if (buttonElement) setButtonLoading(buttonElement.id, false);
        }
    }
    
    // --- Confirm and Delete Article ---
    function confirmDeleteArticle(articleId) {
        const articleRow = document.querySelector(`tr[data-id="${articleId}"]`);
        const articleTitle = articleRow ? articleRow.cells[0].textContent : 'this article';
        if (confirm(`Delete "${articleTitle}"? This cannot be undone.`)) {
            deleteArticleFromFirestore(articleId, articleRow);
        }
    }

    async function deleteArticleFromFirestore(articleId, articleRow) {
        const deleteBtn = articleRow ? articleRow.querySelector('.delete-article-btn') : null;
        if (deleteBtn) deleteBtn.disabled = true;
        try {
            await articlesCollection.doc(articleId).delete();
            alert(`Article deleted successfully!`);
            if (articleRow) {
                articleRow.remove();
                const articleCountSpan = document.getElementById('article-count');
                if(articleCountSpan) { /* Update count */ }
            } else { loadArticles(); }
        } catch (error) {
            console.error('Error deleting article:', error);
            alert(`Error deleting article: ${error.message}`);
            if (deleteBtn) deleteBtn.disabled = false;
        }
    }

    // --- Upload Image to Storage ---
    function uploadImage(file, uploadBtn, urlInput, removeBtn) {
        const filePath = `article-images/${Date.now()}_${file.name}`;
        const fileRef = storageRef.child(filePath);
        setButtonLoading(uploadBtn.id, true);
        const uploadTask = fileRef.put(file);
        uploadTask.on('state_changed', 
            (snapshot) => {}, 
            (error) => {
                console.error('Error uploading image:', error);
                alert(`Upload Error: ${error.code}`);
                setButtonLoading(uploadBtn.id, false);
            }, 
            async () => {
                try {
                    const downloadURL = await uploadTask.snapshot.ref.getDownloadURL();
                    console.log('File available at', downloadURL);
                    if (urlInput) {
                        urlInput.value = downloadURL;
                        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                } catch (error) {
                    console.error('Error getting download URL:', error);
                    alert('Error getting URL after upload.');
                } finally {
                     setButtonLoading(uploadBtn.id, false);
                }
            }
        );
    }

    // --- Create Slug ---
    function createSlug(text) {
        if (!text) return '';
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-') // Replace spaces with -
            .replace(/[^\w\-]+/g, '') // Remove all non-word chars
            .replace(/\-\-+/g, '-') // Replace multiple - with single -
            .replace(/^-+/, '') // Trim - from start of text
            .replace(/-+$/, ''); // Trim - from end of text
    }

    // --- Article Preview ---
    function previewArticle() {
        if (!quillEditorInstance) { alert("Editor not ready."); return; }
        const previewData = {
            title: document.getElementById('title').value || 'Untitled Preview',
            content: quillEditorInstance.root.innerHTML || '<p><i>No content.</i></p>',
            excerpt: document.getElementById('excerpt').value || '',
            featuredImage: document.getElementById('featuredImage').value || '',
            imageAltText: document.getElementById('featuredImageAlt').value || '',
            previewTimestamp: new Date().toISOString(),
            hasEmbeds: {
                twitter: quillEditorInstance.root.innerHTML.includes('twitter-tweet') || quillEditorInstance.root.innerHTML.includes('platform.twitter.com'),
                instagram: quillEditorInstance.root.innerHTML.includes('instagram-media') || quillEditorInstance.root.innerHTML.includes('platform.instagram.com'),
            }
        };
        try {
            localStorage.setItem('articlePreviewData', JSON.stringify(previewData));
            window.open('/admin/article-preview.html', '_blank');
        } catch (error) {
            console.error("Error saving preview data to localStorage:", error);
            alert("Could not open preview: LocalStorage error.");
        }
    }

    // --- Global Export ---
    window.loadArticlesSection = loadArticlesSection;
    console.log("Articles Manager script initialized successfully.");

} else {
    console.warn("Articles Manager script already initialized. Skipping re-initialization.");
}