// js/profile.js

// Global Firebase service variables (db, auth, storage, functions) and currentUser
// are now assumed to be initialized and made globally available by app-base.js.
// We will assign to them or use them directly if app-base.js has set them on the window object,
// or rely on them being in the global scope if app-base.js declared them with 'var' or no keyword.

// Bootstrap Modal objects (will be initialized in DOMContentLoaded)
let profilePicModalInstance, displayNameModalInstance, bioModalInstance;

// Function to load the navbar (assuming nav.html exists at the root)
async function loadNavbar() {
    console.log("profile.js - loadNavbar: Function called.");
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    if (navbarPlaceholder) {
        try {
            const response = await fetch('/nav.html');
            if (!response.ok) throw new Error(`Failed to fetch navbar: ${response.status}`);
            const navbarHTML = await response.text();
            if (navbarHTML.trim() === "") {
                navbarPlaceholder.innerHTML = '<p class="text-danger text-center p-2">Error: Navbar content is empty.</p>';
                return;
            }
            navbarPlaceholder.innerHTML = navbarHTML;
            console.log("profile.js - loadNavbar: Navbar HTML successfully injected.");
            // After navbar is loaded, update its state based on current auth
            // Ensure currentUser is available or fetched if app-base.js doesn't set it globally directly
             if (typeof auth !== 'undefined' && auth.currentUser) {
                currentUser = auth.currentUser; // Make sure currentUser is set before calling updateNavbarAuthState
            }
            updateNavbarAuthState();
        } catch (error) {
            console.error("profile.js - loadNavbar: Error:", error);
            navbarPlaceholder.innerHTML = `<p class="text-danger text-center p-2">Navbar could not be loaded: ${error.message}</p>`;
        }
    } else {
        console.error("profile.js - loadNavbar: #navbar-placeholder div not found!");
    }
}

// Function to update navbar based on auth state
function updateNavbarAuthState() {
    // Ensure currentUser is available. It should be set by onAuthStateChanged or by loadNavbar.
    const userForNav = window.currentUser || (typeof auth !== 'undefined' ? auth.currentUser : null);
    console.log("profile.js - updateNavbarAuthState: Called. Current user:", userForNav ? userForNav.uid : "None");

    const loginLink = document.getElementById('auth-login-link');
    const signupLink = document.getElementById('auth-signup-link');
    const profileMenu = document.getElementById('auth-profile-menu');
    const profilePicNav = document.getElementById('user-profile-pic-nav');
    const displayNameNav = document.getElementById('user-display-name-nav');
    const logoutBtn = document.getElementById('auth-logout-btn');

    if (userForNav) {
        if (loginLink) loginLink.style.display = 'none';
        if (signupLink) signupLink.style.display = 'none';
        if (profileMenu) {
            profileMenu.style.display = 'list-item'; // Or 'block' or 'flex' depending on your CSS
            // Make "My Profile" link active
            const profileLinkInDropdown = profileMenu.querySelector('a[href="/profile.html"]');
            if (profileLinkInDropdown) {
                // Remove 'active' from other nav links if necessary (e.g., Home)
                document.querySelectorAll('#navbarMain .nav-link.active').forEach(el => el.classList.remove('active'));
                profileLinkInDropdown.classList.add('active');
            }
        }
        if (profilePicNav) profilePicNav.src = userForNav.photoURL || '/img/default-avatar.png';
        if (displayNameNav) displayNameNav.textContent = userForNav.displayName || userForNav.email?.split('@')[0] || 'User';

        if (logoutBtn) {
            const newLogoutBtn = logoutBtn.cloneNode(true); // Clone to remove old listeners
            logoutBtn.parentNode?.replaceChild(newLogoutBtn, logoutBtn);
            newLogoutBtn.addEventListener('click', () => {
                if (typeof auth !== 'undefined') {
                    auth.signOut().then(() => {
                        console.log("profile.js: User signed out, redirecting to home.");
                        window.location.href = '/';
                    }).catch(error => console.error("profile.js: Sign out error", error));
                }
            });
        }
    } else {
        // This case should ideally not happen on profile page due to redirect
        if (loginLink) loginLink.style.display = 'list-item';
        if (signupLink) signupLink.style.display = 'list-item';
        if (profileMenu) profileMenu.style.display = 'none';
    }
}


document.addEventListener('DOMContentLoaded', async () => {
    console.log("profile.js: DOMContentLoaded event fired.");

    // Load Navbar first
    await loadNavbar();

    // Initialize Firebase services (assuming app-base.js might have already initialized firebase.app())
    try {
        // Check if Firebase app is initialized (typically by app-base.js)
        if (typeof firebase === 'undefined' || !firebase.apps.length) {
            console.error("profile.js: Firebase app not initialized. Ensure app-base.js runs first and initializes Firebase.");
            // Display a critical error to the user if Firebase isn't ready
            const profileErrorEl = document.getElementById('profile-error') || document.body;
            profileErrorEl.innerHTML = '<div class="alert alert-danger m-3">Critical Error: Firebase services not available. Please try refreshing.</div>';
            return; // Stop further execution if Firebase is not ready
        }
        
        // Assign globally initialized services from app-base.js
        // These should already be in the global scope if app-base.js declared them with 'var' or no keyword.
        // If app-base.js sets them on window, use window.db, window.auth etc.
        // For simplicity, assuming they are global or will be assigned if app-base.js uses 'var'
        if (typeof db === 'undefined' && firebase.firestore) db = firebase.firestore();
        if (typeof auth === 'undefined' && firebase.auth) auth = firebase.auth();
        if (typeof storage === 'undefined' && firebase.storage) storage = firebase.storage();
        if (typeof functions === 'undefined' && firebase.functions) functions = firebase.functions();

        console.log("profile.js: Firebase services (auth, db, storage, functions) obtained/confirmed.");

        // Initialize Bootstrap modals
        const profilePicModalEl = document.getElementById('profilePicModal');
        if (profilePicModalEl) profilePicModalInstance = new bootstrap.Modal(profilePicModalEl);
        
        const displayNameModalEl = document.getElementById('displayNameModal');
        if (displayNameModalEl) displayNameModalInstance = new bootstrap.Modal(displayNameModalEl);
        
        const bioModalEl = document.getElementById('bioModal');
        if (bioModalEl) bioModalInstance = new bootstrap.Modal(bioModalEl);

        // Auth state listener
        if (auth) {
            auth.onAuthStateChanged(user => {
                console.log("profile.js: Auth state changed. User:", user ? user.uid : "No user");
                currentUser = user; // This is the global currentUser for this script
                window.currentUser = user; // Also set on window if app-base.js needs it for navbar
                updateNavbarAuthState(); // Update navbar based on new auth state

                if (user) {
                    loadUserProfile(user);
                    setupProfilePictureModal();
                    setupDisplayNameModal();
                    setupBioModal();
                } else {
                    console.log("profile.js: No user logged in, redirecting to login page.");
                    window.location.href = '/login.html';
                }
            });
        } else {
            console.error("profile.js: Firebase auth service is not available to set onAuthStateChanged listener.");
        }

    } catch (error) {
        console.error("profile.js: FATAL - Initialization failed:", error);
        const profileContent = document.getElementById('profile-content');
        const profileLoading = document.getElementById('profile-loading');
        const profileErrorEl = document.getElementById('profile-error');

        if(profileContent) profileContent.style.display = 'none';
        if(profileLoading) profileLoading.style.display = 'none';
        if(profileErrorEl) {
            profileErrorEl.textContent = 'Critical application error. Please refresh or contact support.';
            profileErrorEl.style.display = 'block';
        }
    }
});

// Load user profile data
async function loadUserProfile(user) {
    if (!user) {
        console.error("profile.js - loadUserProfile: Called without a user object.");
        window.location.href = '/login.html'; // Should be caught by onAuthStateChanged too
        return;
    }

    const profileLoading = document.getElementById('profile-loading');
    const profileContent = document.getElementById('profile-content');
    const profileErrorEl = document.getElementById('profile-error');

    const profilePicElement = document.getElementById('profile-pic');
    const displayNameElement = document.getElementById('profile-display-name');
    const emailElement = document.getElementById('profile-email');
    const joinedElement = document.getElementById('profile-joined');
    const profileBioElement = document.getElementById('profile-bio');
    const profileLogoutBtn = document.getElementById('profile-logout-btn');

    if (profileErrorEl) profileErrorEl.style.display = 'none';
    if (profileLoading) profileLoading.style.display = 'block';
    if (profileContent) profileContent.style.display = 'none';

    try {
        console.log("profile.js - loadUserProfile: Populating from Auth data...");
        if (profilePicElement) profilePicElement.src = user.photoURL || '/img/default-avatar.png';
        if (displayNameElement) displayNameElement.textContent = user.displayName || user.email?.split('@')[0] || 'User';
        if (emailElement) emailElement.textContent = user.email;

        console.log(`profile.js - loadUserProfile: Fetching Firestore document for user: ${user.uid}`);
        const userDocRef = db.collection('users').doc(user.uid); // db should be available
        const userDoc = await userDocRef.get();
        let userData = {};

        if (userDoc.exists) {
            userData = userDoc.data();
            console.log("profile.js - loadUserProfile: Firestore user data found:", userData);
            if (joinedElement && userData.createdAt?.toDate) {
                joinedElement.textContent = `Joined: ${new Date(userData.createdAt.toDate()).toLocaleDateString()}`;
            } else if (joinedElement) {
                joinedElement.textContent = 'Joined: Date unavailable';
            }
            if (profileBioElement) {
                profileBioElement.innerHTML = userData.bio ? escapeHtml(userData.bio).replace(/\n/g, '<br>') : '<span class="text-muted fst-italic">No bio added yet.</span>';
            }
        } else {
            console.warn("profile.js - loadUserProfile: User document not found for UID:", user.uid, ". Creating one.");
            if (joinedElement) joinedElement.textContent = 'Joined: Just now!';
            if (profileBioElement) profileBioElement.innerHTML = '<span class="text-muted fst-italic">No bio added yet.</span>';
            userData = {
                email: user.email,
                displayName: user.displayName || user.email?.split('@')[0] || 'User',
                bio: '',
                photoURL: user.photoURL || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp() // firebase should be global
            };
            await userDocRef.set(userData, { merge: true });
        }

        // Populate modal form fields
        const editDisplayNameInput = document.getElementById('edit-display-name');
        if (editDisplayNameInput) editDisplayNameInput.value = user.displayName || '';
        const editBioTextarea = document.getElementById('edit-bio');
        if (editBioTextarea) editBioTextarea.value = userData.bio || '';

        // Setup profile page logout button
        if (profileLogoutBtn) {
            const newLogoutBtn = profileLogoutBtn.cloneNode(true);
            profileLogoutBtn.parentNode?.replaceChild(newLogoutBtn, profileLogoutBtn);
            newLogoutBtn.addEventListener('click', () => {
                if (auth) auth.signOut().then(() => { window.location.href = '/'; });
            });
        }
        
        // Load activity data
        loadSavedArticles(user);
        loadReadHistory(user);
        loadMyComments(user);
        loadStockWatchlist(user);

        if (profileLoading) profileLoading.style.display = 'none';
        if (profileContent) profileContent.style.display = 'block';

    } catch (error) {
        console.error("profile.js - loadUserProfile: Error loading profile data:", error);
        if (profileLoading) profileLoading.style.display = 'none';
        if (profileContent) profileContent.style.display = 'none';
        if (profileErrorEl) {
            profileErrorEl.textContent = `Error loading profile: ${error.message}`;
            profileErrorEl.style.display = 'block';
        }
    }
}

// Setup Profile Picture Modal
function setupProfilePictureModal() {
    const fileInput = document.getElementById('profile-pic-upload');
    const previewContainer = document.getElementById('profile-pic-preview-container');
    const previewImg = document.getElementById('profile-pic-preview');
    const saveBtn = document.getElementById('save-profile-pic-btn');
    const saveSpinner = document.getElementById('profile-pic-spinner');
    const feedbackDiv = document.getElementById('profile-pic-feedback');

    if (!fileInput || !saveBtn || !previewContainer || !previewImg || !saveSpinner || !feedbackDiv) {
        console.warn("profile.js - setupProfilePictureModal: One or more modal elements missing.");
        return;
    }

    fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            if (!file.type.startsWith('image/')) {
                feedbackDiv.innerHTML = '<div class="alert alert-danger alert-sm">Please select an image file.</div>';
                previewContainer.style.display = 'none';
                fileInput.value = ''; return;
            }
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                feedbackDiv.innerHTML = '<div class="alert alert-danger alert-sm">Image too large (max 5MB).</div>';
                previewContainer.style.display = 'none';
                fileInput.value = ''; return;
            }
            const reader = new FileReader();
            reader.onload = (e) => { previewImg.src = e.target.result; previewContainer.style.display = 'block'; };
            reader.readAsDataURL(file);
            feedbackDiv.innerHTML = '';
        } else {
            previewContainer.style.display = 'none';
        }
    });

    saveBtn.addEventListener('click', async () => {
        const userToUpdate = window.currentUser || (auth ? auth.currentUser : null);
        if (!userToUpdate) { feedbackDiv.innerHTML = '<div class="alert alert-danger alert-sm">Authentication error.</div>'; return; }
        if (!fileInput.files || !fileInput.files[0]) { feedbackDiv.innerHTML = '<div class="alert alert-warning alert-sm">Please select an image.</div>'; return; }
        
        const file = fileInput.files[0];
        saveBtn.disabled = true;
        saveSpinner.classList.remove('d-none');
        feedbackDiv.innerHTML = '';

        try {
            const filePath = `profile_pics/${userToUpdate.uid}/${file.name}_${Date.now()}`;
            const fileRef = storage.ref().child(filePath); // storage should be available
            const uploadTask = await fileRef.put(file);
            const photoURL = await uploadTask.ref.getDownloadURL();

            await userToUpdate.updateProfile({ photoURL: photoURL });
            await db.collection('users').doc(userToUpdate.uid).update({ // db should be available
                photoURL: photoURL,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            document.getElementById('profile-pic').src = photoURL;
            const navPic = document.getElementById('user-profile-pic-nav');
            if (navPic) navPic.src = photoURL;

            feedbackDiv.innerHTML = '<div class="alert alert-success alert-sm">Profile picture updated!</div>';
            setTimeout(() => {
                if (profilePicModalInstance) profilePicModalInstance.hide();
                fileInput.value = ''; // Reset file input
                previewContainer.style.display = 'none';
                feedbackDiv.innerHTML = '';
            }, 1500);
        } catch (error) {
            console.error('profile.js - Error updating profile picture:', error);
            feedbackDiv.innerHTML = `<div class="alert alert-danger alert-sm">Upload failed: ${error.message}</div>`;
        } finally {
            saveBtn.disabled = false;
            saveSpinner.classList.add('d-none');
        }
    });
}

// Setup Display Name Modal
function setupDisplayNameModal() {
    const form = document.getElementById('display-name-form');
    const displayNameInput = document.getElementById('edit-display-name');
    const saveBtn = document.getElementById('save-display-name-btn');
    const saveSpinner = document.getElementById('display-name-spinner');
    const feedbackDiv = document.getElementById('display-name-feedback');

    if (!form || !displayNameInput || !saveBtn || !saveSpinner || !feedbackDiv) {
        console.warn("profile.js - setupDisplayNameModal: One or more modal elements missing.");
        return;
    }
    
    saveBtn.addEventListener('click', async () => {
        const userToUpdate = window.currentUser || (auth ? auth.currentUser : null);
        if (!userToUpdate) { feedbackDiv.innerHTML = '<div class="alert alert-danger alert-sm">Authentication error.</div>'; return; }
        
        const newDisplayName = displayNameInput.value.trim();
        if (!newDisplayName) {
            displayNameInput.classList.add('is-invalid');
            feedbackDiv.innerHTML = '<div class="alert alert-warning alert-sm">Display name cannot be empty.</div>';
            return;
        }
        displayNameInput.classList.remove('is-invalid');
        
        saveBtn.disabled = true;
        saveSpinner.classList.remove('d-none');
        feedbackDiv.innerHTML = '';

        try {
            await userToUpdate.updateProfile({ displayName: newDisplayName });
            await db.collection('users').doc(userToUpdate.uid).update({ // db should be available
                displayName: newDisplayName,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            document.getElementById('profile-display-name').textContent = newDisplayName;
            const navName = document.getElementById('user-display-name-nav');
            if (navName) navName.textContent = newDisplayName;

            feedbackDiv.innerHTML = '<div class="alert alert-success alert-sm">Display name updated!</div>';
            setTimeout(() => {
                if (displayNameModalInstance) displayNameModalInstance.hide();
                feedbackDiv.innerHTML = '';
            }, 1500);
        } catch (error) {
            console.error('profile.js - Error updating display name:', error);
            feedbackDiv.innerHTML = `<div class="alert alert-danger alert-sm">Update failed: ${error.message}</div>`;
        } finally {
            saveBtn.disabled = false;
            saveSpinner.classList.add('d-none');
        }
    });
}

// Setup Bio Modal
function setupBioModal() {
    const form = document.getElementById('bio-form');
    const bioTextarea = document.getElementById('edit-bio');
    const saveBtn = document.getElementById('save-bio-btn');
    const saveSpinner = document.getElementById('bio-spinner');
    const feedbackDiv = document.getElementById('bio-feedback');

    if (!form || !bioTextarea || !saveBtn || !saveSpinner || !feedbackDiv) {
        console.warn("profile.js - setupBioModal: One or more modal elements missing.");
        return;
    }

    saveBtn.addEventListener('click', async () => {
        const userToUpdate = window.currentUser || (auth ? auth.currentUser : null);
        if (!userToUpdate) { feedbackDiv.innerHTML = '<div class="alert alert-danger alert-sm">Authentication error.</div>'; return; }
        
        const newBio = bioTextarea.value.trim();
        
        saveBtn.disabled = true;
        saveSpinner.classList.remove('d-none');
        feedbackDiv.innerHTML = '';

        try {
            await db.collection('users').doc(userToUpdate.uid).update({ // db should be available
                bio: newBio,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const profileBioEl = document.getElementById('profile-bio');
            if(profileBioEl) profileBioEl.innerHTML = newBio ? escapeHtml(newBio).replace(/\n/g, '<br>') : '<span class="text-muted fst-italic">No bio added yet.</span>';

            feedbackDiv.innerHTML = '<div class="alert alert-success alert-sm">Bio updated!</div>';
            setTimeout(() => {
                if (bioModalInstance) bioModalInstance.hide();
                feedbackDiv.innerHTML = '';
            }, 1500);
        } catch (error) {
            console.error('profile.js - Error updating bio:', error);
            feedbackDiv.innerHTML = `<div class="alert alert-danger alert-sm">Update failed: ${error.message}</div>`;
        } finally {
            saveBtn.disabled = false;
            saveSpinner.classList.add('d-none');
        }
    });
}

// Helper to escape HTML (basic version)
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}


// --- Load and Display Saved Articles ---
async function loadSavedArticles(user) {
    const listContainer = document.getElementById('saved-articles-list');
    if (!listContainer) { console.error("profile.js - #saved-articles-list not found."); return; }
    if (!user || typeof db === 'undefined') { listContainer.innerHTML = '<p class="text-danger small">Error loading (user/db missing).</p>'; return; }

    listContainer.innerHTML = '<p class="text-muted small fst-italic">Loading saved articles...</p>';
    try {
        const savedRef = db.collection('users').doc(user.uid).collection('savedArticles');
        const snapshot = await savedRef.orderBy('savedAt', 'desc').limit(10).get(); // Limit to 10 for brevity

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-muted small">You haven\'t saved any articles yet.</p>';
            return;
        }
        let articlesHTML = '<ul class="list-group list-group-flush">';
        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.articleTitle || 'Untitled Article';
            const slug = data.articleSlug || '#';
            const url = slug !== '#' ? `/article.html?slug=${slug}` : '#';
            const date = data.savedAt?.toDate ? new Date(data.savedAt.toDate()).toLocaleDateString() : 'N/A';
            articlesHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <a href="${url}" class="text-decoration-none">${title}</a>
                    <span class="text-muted small">Saved: ${date}</span>
                </li>`;
        });
        articlesHTML += '</ul>';
        listContainer.innerHTML = articlesHTML;
    } catch (error) {
        console.error("profile.js - Error loading saved articles:", error);
        listContainer.innerHTML = '<p class="text-danger small">Could not load saved articles.</p>';
    }
}

// --- Load and Display Read History ---
async function loadReadHistory(user) {
    const listContainer = document.getElementById('read-history-list');
    if (!listContainer) { console.error("profile.js - #read-history-list not found."); return; }
    if (!user || typeof db === 'undefined') { listContainer.innerHTML = '<p class="text-danger small">Error loading (user/db missing).</p>'; return; }

    listContainer.innerHTML = '<p class="text-muted small fst-italic">Loading read history...</p>';
    try {
        const historyRef = db.collection('users').doc(user.uid).collection('readHistory');
        const snapshot = await historyRef.orderBy('lastReadAt', 'desc').limit(10).get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-muted small">No recently read articles found.</p>';
            return;
        }
        let historyHTML = '<ul class="list-group list-group-flush">';
        snapshot.forEach(doc => {
            const data = doc.data();
            const title = data.articleTitle || 'Untitled Article';
            const slug = data.articleSlug || '#';
            const url = slug !== '#' ? `/article.html?slug=${slug}` : '#';
            const date = data.lastReadAt?.toDate ? new Date(data.lastReadAt.toDate()).toLocaleString() : 'N/A';
            historyHTML += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <a href="${url}" class="text-decoration-none">${title}</a>
                    <span class="text-muted small">Read: ${date}</span>
                </li>`;
        });
        historyHTML += '</ul>';
        listContainer.innerHTML = historyHTML;
    } catch (error) {
        console.error("profile.js - Error loading read history:", error);
        listContainer.innerHTML = '<p class="text-danger small">Could not load read history.</p>';
    }
}

// --- Load and Display User's Comments ---
async function loadMyComments(user) {
    const listContainer = document.getElementById('my-comments-list');
    if (!listContainer) { console.error("profile.js - #my-comments-list not found."); return; }
    if (!user || typeof db === 'undefined') { listContainer.innerHTML = '<p class="text-danger small">Error loading (user/db missing).</p>'; return; }

    listContainer.innerHTML = '<p class="text-muted small fst-italic">Loading your comments...</p>';
    try {
        const commentsQuery = db.collectionGroup('comments')
                                .where('userId', '==', user.uid)
                                .orderBy('timestamp', 'desc')
                                .limit(10);
        const snapshot = await commentsQuery.get();

        if (snapshot.empty) {
            listContainer.innerHTML = '<p class="text-muted small">You haven\'t posted any comments yet.</p>';
            return;
        }
        let commentsHTML = '<ul class="list-group list-group-flush">';
        snapshot.forEach(doc => {
            const data = doc.data();
            const text = data.text ? (data.text.length > 100 ? data.text.substring(0, 97) + '...' : data.text) : '<i>No text</i>';
            const date = data.timestamp?.toDate ? new Date(data.timestamp.toDate()).toLocaleDateString() : 'N/A';
            const articleTitle = data.articleTitle || 'Article';
            const articleSlug = data.articleSlug || '#';
            const articleUrl = articleSlug !== '#' ? `/article.html?slug=${articleSlug}#comment-${doc.id}` : '#';
            commentsHTML += `
                <li class="list-group-item">
                    <p class="mb-1 fst-italic">"${escapeHtml(text)}"</p>
                    <small class="text-muted">
                        On: <a href="${articleUrl}" class="text-decoration-none text-muted">${escapeHtml(articleTitle)}</a> (${date})
                    </small>
                </li>`;
        });
        commentsHTML += '</ul>';
        listContainer.innerHTML = commentsHTML;
    } catch (error) {
        console.error("profile.js - Error loading user comments:", error);
        if (error.code === 'failed-precondition') {
            listContainer.innerHTML = '<p class="text-danger small">Error loading comments: Database index required. Please check the Firebase console for index creation instructions.</p>';
            console.error("Firestore requires a composite index for this query. The console error from Firebase should provide a direct link to create it.");
        } else {
            listContainer.innerHTML = '<p class="text-danger small">Could not load your comments.</p>';
        }
    }
}

// --- Load and Display Stock Watchlist ---
async function loadStockWatchlist(user) {
    const contentElement = document.getElementById('stock-watchlist-content');
    const loadingElement = document.getElementById('stock-watchlist-loading');
    if (!contentElement) { console.error("profile.js - #stock-watchlist-content not found."); return; }
    if (!user || typeof db === 'undefined') { contentElement.innerHTML = '<p class="text-danger small">Error loading (user/db missing).</p>'; return; }

    if (loadingElement) loadingElement.style.display = 'block';
    contentElement.innerHTML = '';

    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists || !userDoc.data().stockWatchlist || userDoc.data().stockWatchlist.length === 0) {
            contentElement.innerHTML = '<p class="text-muted small">Your stock watchlist is empty. Add stocks from the <a href="/stock-data.html">Market Data</a> page.</p>';
            if (loadingElement) loadingElement.style.display = 'none';
            return;
        }
        const watchlistSymbols = userDoc.data().stockWatchlist;
        
        let stockDetailsMap = {};
        try {
            const response = await fetch('/json/stock-data.json'); 
            if (response.ok) {
                const allStockDetails = await response.json();
                allStockDetails.forEach(stock => stockDetailsMap[stock.symbol] = stock);
            }
        } catch (e) { console.warn("profile.js - Could not load local stock details JSON for watchlist enrichment:", e); }

        let watchlistHTML = '<div class="row row-cols-1 row-cols-md-2 g-3">'; 
        watchlistSymbols.forEach(symbol => {
            const details = stockDetailsMap[symbol] || { name: symbol, logoUrl: '/img/default-stock.png' }; 
            watchlistHTML += `
                <div class="col">
                    <div class="card h-100 stock-watchlist-card">
                        <div class="card-body d-flex flex-column">
                            <div class="d-flex align-items-center mb-2">
                                <img src="${details.logoUrl}" alt="${symbol}" class="stock-logo me-2" onerror="this.style.display='none'; this.src='/img/default-stock.png';">
                                <div>
                                    <h5 class="card-title mb-0">${symbol}</h5>
                                    <small class="text-muted">${details.name}</small>
                                </div>
                            </div>
                            <div id="watchlist-stock-${symbol}" class="mt-auto stock-price-data">
                                <span class="spinner-border spinner-border-sm" role="status"></span> Loading...
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        watchlistHTML += '</div>';
        contentElement.innerHTML = watchlistHTML;
        if (loadingElement) loadingElement.style.display = 'none';

        const FINNHUB_API_KEY = "c9te7a2ad3i9jqpntq40"; // This should be handled via a backend function for security

        for (const symbol of watchlistSymbols) {
            const stockDataElement = document.getElementById(`watchlist-stock-${symbol}`);
            if (!stockDataElement) continue;

            try {
                await new Promise(resolve => setTimeout(resolve, 500)); 

                if (FINNHUB_API_KEY && FINNHUB_API_KEY !== "YOUR_FINNHUB_KEY") { 
                    // In a real app, this fetch should be via a secure Cloud Function
                    // to protect the API key and handle rate limits gracefully.
                    // For now, this client-side fetch is a placeholder.
                    const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`);
                    if (!response.ok) {
                         // If rate limited or error, show a message but don't break the loop for other stocks.
                        console.warn(`Finnhub API error for ${symbol}: ${response.status}`);
                        stockDataElement.innerHTML = `<span class="text-warning small">Data temporarily unavailable</span>`;
                        continue; // Move to the next symbol
                    }
                    const data = await response.json();
                    const price = data.c?.toFixed(2) || 'N/A';
                    const change = data.d?.toFixed(2) || 'N/A';
                    const changePercent = data.dp?.toFixed(2) || 'N/A';
                    const isPositive = parseFloat(change) >= 0;
                    stockDataElement.innerHTML = `
                        <span class="fs-5 fw-bold">$${price}</span>
                        <span class="ms-2 badge ${isPositive ? 'bg-success-subtle text-success-emphasis' : 'bg-danger-subtle text-danger-emphasis'}">
                            ${isPositive ? '+' : ''}${change} (${isPositive ? '+' : ''}${changePercent}%)
                        </span>`;
                } else {
                     stockDataElement.innerHTML = `<span class="text-muted small">Live data unavailable (API key missing)</span>`;
                }
            } catch (error) {
                console.error(`profile.js - Error fetching stock data for ${symbol}:`, error);
                stockDataElement.innerHTML = `<span class="text-danger small">Data error</span>`;
            }
        }

    } catch (error) {
        console.error("profile.js - Error loading stock watchlist:", error);
        contentElement.innerHTML = '<p class="text-danger small">Could not load your stock watchlist.</p>';
        if (loadingElement) loadingElement.style.display = 'none';
    }
}
