// js/login.js

// Function to load the navbar (copied from signup-scripts.js)
async function loadNavbar() {
    console.log("login.js - loadNavbar: Function called.");
    const navbarPlaceholder = document.getElementById('navbar-placeholder');

    if (navbarPlaceholder) {
        console.log("login.js - loadNavbar: Found #navbar-placeholder div.");
        try {
            console.log("login.js - loadNavbar: Attempting to fetch '/nav.html'...");
            const response = await fetch('/nav.html');
            console.log(`login.js - loadNavbar: Fetch response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch navbar: ${response.status} ${response.statusText}`);
            }
            const navbarHTML = await response.text();
            if (navbarHTML.trim() === "") {
                console.warn("login.js - loadNavbar: Fetched '/nav.html' but it was empty.");
                navbarPlaceholder.innerHTML = '<p style="text-align:center; padding: 1rem; color: red;">Error: Navbar content is empty.</p>';
                return;
            }
            navbarPlaceholder.innerHTML = navbarHTML;
            console.log("login.js - loadNavbar: Navbar HTML successfully injected.");

            // Initialize navigation features (search, categories, auth) after injecting the navbar
            if (typeof initializeNavigation === 'function') {
                initializeNavigation();
            }
        } catch (error) {
            console.error("login.js - loadNavbar: Error loading navbar:", error);
            navbarPlaceholder.innerHTML = `<p style="text-align:center; padding: 1rem; color: red;">Navbar could not be loaded. Error: ${error.message}.</p>`;
        }
    } else {
        console.error("login.js - loadNavbar: CRITICAL - #navbar-placeholder div not found in the login.html!");
    }
}


document.addEventListener('DOMContentLoaded', async () => { // Made async
    console.log("login.js: DOMContentLoaded event fired.");

    await loadNavbar(); // Load the navbar first
    console.log("login.js: loadNavbar() attempt finished.");

    // Firebase Config (Ensure this is your actual, correct config)
    const firebaseConfig = {
        apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg", // Replace with your actual API key
        authDomain: "trendingtech-daily.firebaseapp.com",
        projectId: "trendingtech-daily",
        storageBucket: "trendingtech-daily.appspot.com",
        messagingSenderId: "343812872871",
        appId: "1:343812872871:web:5bd68bd7d6140d83551982"
    };

    // Global Firebase variables
    let db, auth, functions;

    try {
        // Initialize Firebase if not already initialized
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
            console.log("login.js: Firebase Initialized Successfully.");
        } else {
            firebase.app(); // if already initialized, use that app
            console.log("login.js: Firebase already initialized, using existing app.");
        }

        db = firebase.firestore();
        auth = firebase.auth();
        functions = firebase.functions();

        // --- Auth State Listener (for Navbar UI) ---
        // This will run AFTER loadNavbar has injected the HTML, so IDs should be findable
        auth.onAuthStateChanged(user => {
            console.log("login.js: Auth state changed. User:", user ? user.uid : 'null');
            const loginLink = document.getElementById('auth-login-link');
            const signupLink = document.getElementById('auth-signup-link');
            const profileMenu = document.getElementById('auth-profile-menu');
            const profilePicNav = document.getElementById('user-profile-pic-nav');
            const displayNameNav = document.getElementById('user-display-name-nav');
            const logoutBtn = document.getElementById('auth-logout-btn');

            if (user) {
                if (loginLink) loginLink.style.display = 'none';
                if (signupLink) signupLink.style.display = 'none';
                if (profileMenu) profileMenu.style.display = 'list-item';
                if (profilePicNav) profilePicNav.src = user.photoURL || '/img/default-avatar.png';
                if (displayNameNav) displayNameNav.textContent = user.displayName || user.email?.split('@')[0] || 'User';

                if (logoutBtn) {
                    const newLogoutBtn = logoutBtn.cloneNode(true);
                    logoutBtn.parentNode?.replaceChild(newLogoutBtn, logoutBtn);
                    newLogoutBtn.addEventListener('click', () => {
                        auth.signOut().catch(error => {
                            console.error("login.js: Sign out error", error);
                            alert('Error signing out.');
                        });
                    });
                }
            } else {
                if (loginLink) loginLink.style.display = 'list-item';
                if (signupLink) signupLink.style.display = 'list-item';
                if (profileMenu) profileMenu.style.display = 'none';
            }
        });

        // --- Login Form Handler ---
        const loginForm = document.getElementById('login-form');
        const loginErrorDiv = document.getElementById('login-error');
        const securityTipDiv = document.getElementById('security-tip-message');

        if (loginForm && loginErrorDiv && securityTipDiv) {
            console.log("login.js: Login form and error divs found.");
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                console.log("login.js: Login form submitted.");
                loginErrorDiv.textContent = '';
                securityTipDiv.textContent = '';
                securityTipDiv.style.display = 'none';

                const emailInput = document.getElementById('login-email');
                const passwordInput = document.getElementById('login-password');
                const email = emailInput.value;
                const password = passwordInput.value;
                const submitButton = loginForm.querySelector('button[type="submit"]');

                if (!email || !password) {
                    loginErrorDiv.textContent = "Please enter both email and password.";
                    return;
                }

                submitButton.disabled = true;
                submitButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Logging in...';

                try {
                    const userCredential = await auth.signInWithEmailAndPassword(email, password);
                    console.log("login.js: User logged in:", userCredential.user.uid);
                    window.location.href = '/';
                } catch (error) {
                    console.error("login.js: Login Error:", error);
                    let errorMessage = "An unknown error occurred. Please try again.";
                    let fetchTip = false;

                    switch (error.code) {
                        case 'auth/invalid-email':
                            errorMessage = "Invalid email format.";
                            break;
                        case 'auth/user-disabled':
                            errorMessage = "This account has been disabled.";
                            break;
                        case 'auth/user-not-found':
                            errorMessage = "No account found with this email.";
                            break;
                        case 'auth/wrong-password':
                            errorMessage = "Incorrect password. Please try again.";
                            fetchTip = true;
                            break;
                        case 'auth/invalid-credential':
                             errorMessage = "Invalid credentials. Please check your email and password.";
                             fetchTip = true;
                             break;
                        default:
                            errorMessage = error.message;
                    }
                    loginErrorDiv.textContent = errorMessage;

                    if (fetchTip && functions) { // Ensure functions is initialized
                        try {
                            console.log("login.js: Fetching security tip for error:", error.code);
                            const getSecurityTip = functions.httpsCallable('getSecurityTip');
                            const tipResult = await getSecurityTip({ errorContext: error.code });
                            if (tipResult.data && tipResult.data.tip) {
                                securityTipDiv.innerHTML = `✨ <strong>Security Tip:</strong> ${tipResult.data.tip}`;
                                securityTipDiv.style.display = 'block';
                            }
                        } catch (tipError) {
                            console.error("login.js: Error fetching security tip:", tipError);
                        }
                    }
                } finally {
                    submitButton.disabled = false;
                    submitButton.innerHTML = 'Login';
                }
            });
        } else {
            console.error("login.js: Login form, error div, or security tip div not found.");
        }

        // --- Google Login Handler ---
        const googleLoginBtn = document.getElementById('google-login-btn');
        if (googleLoginBtn && loginErrorDiv) {
            console.log("login.js: Google login button found.");
            googleLoginBtn.addEventListener('click', () => {
                console.log("login.js: Google login button clicked.");
                const provider = new firebase.auth.GoogleAuthProvider();
                loginErrorDiv.textContent = '';
                if (securityTipDiv) {
                    securityTipDiv.textContent = '';
                    securityTipDiv.style.display = 'none';
                }
                googleLoginBtn.disabled = true;
                googleLoginBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';

                auth.signInWithPopup(provider)
                    .then((result) => {
                        const user = result.user;
                        const isNewUser = result.additionalUserInfo?.isNewUser;
                        console.log("login.js: Google sign-in successful. User:", user.uid, "New user:", isNewUser);

                        if (isNewUser) {
                            return db.collection('users').doc(user.uid).set({
                                email: user.email,
                                displayName: user.displayName,
                                photoURL: user.photoURL,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                provider: 'google',
                                isAdmin: false
                            }, { merge: true })
                            .then(() => {
                                console.log("login.js: New Google user profile created in Firestore.");
                                window.location.href = '/';
                            })
                            .catch(dbError => {
                                console.error("login.js: Error creating new user profile in Firestore:", dbError);
                                window.location.href = '/';
                            });
                        } else {
                            window.location.href = '/';
                        }
                    })
                    .catch((error) => {
                        console.error("login.js: Google Login Error:", error);
                        let errorMessage = "An unknown error occurred during Google login.";
                         switch (error.code) {
                            case 'auth/account-exists-with-different-credential':
                                errorMessage = "An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.";
                                break;
                            case 'auth/popup-closed-by-user':
                                errorMessage = "Google login popup was closed before completion.";
                                break;
                            case 'auth/cancelled-popup-request':
                                errorMessage = "Multiple login popups were opened. Please try again.";
                                break;
                            default:
                                errorMessage = `Google Login Failed: ${error.message}`;
                        }
                        loginErrorDiv.textContent = errorMessage;
                    })
                    .finally(() => {
                        googleLoginBtn.disabled = false;
                        googleLoginBtn.innerHTML = '<i class="bi bi-google me-2"></i>Log In with Google';
                    });
            });
        } else {
            console.error("login.js: Google login button or error div not found.");
        }

    } catch (error) {
         console.error("login.js: FATAL - Firebase initialization failed:", error);
         const mainContainer = document.querySelector('.auth-page-container main');
         if (mainContainer) {
            mainContainer.innerHTML = '<div class="alert alert-danger m-5 text-center">App initialization failed. Please try refreshing the page or contact support if the issue persists.</div>';
         } else {
            document.body.innerHTML = '<div class="alert alert-danger m-5 text-center">App initialization failed.</div>';
         }
    }
});
console.log("login.js: Script end.");
