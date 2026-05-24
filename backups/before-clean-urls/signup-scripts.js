// js/signup-scripts.js (with more debugging logs)
console.log("signup-scripts.js: Script start.");

// Function to load the navbar
async function loadNavbar() {
    console.log("loadNavbar: Function called.");
    const navbarPlaceholder = document.getElementById('navbar-placeholder');
    
    if (navbarPlaceholder) {
        console.log("loadNavbar: Found #navbar-placeholder div.");
        try {
            console.log("loadNavbar: Attempting to fetch '/nav.html'...");
            const response = await fetch('/nav.html'); // Path confirmed by user
            console.log(`loadNavbar: Fetch response status: ${response.status}`);

            if (!response.ok) {
                throw new Error(`Failed to fetch navbar: ${response.status} ${response.statusText}`);
            }
            const navbarHTML = await response.text();
            if (navbarHTML.trim() === "") {
                console.warn("loadNavbar: Fetched '/nav.html' but it was empty.");
                navbarPlaceholder.innerHTML = '<p class="critical-error-message" style="text-align:center; padding: 1rem;">Navbar content is empty.</p>';
                return;
            }
            navbarPlaceholder.innerHTML = navbarHTML;
            console.log("loadNavbar: Navbar HTML successfully injected into #navbar-placeholder.");
        } catch (error) {
            console.error("loadNavbar: Error loading navbar:", error);
            navbarPlaceholder.innerHTML = `<p class="critical-error-message" style="text-align:center; padding: 1rem;">Navbar could not be loaded. Error: ${error.message}. Path: /nav.html</p>`;
        }
    } else {
        console.error("loadNavbar: CRITICAL - #navbar-placeholder div not found in the HTML!");
    }
}

// Firebase Config (assuming Firebase SDKs are loaded globally via <script> tags in HTML head)
const firebaseConfig = {
    apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg", // Use your actual key
    authDomain: "trendingtech-daily.firebaseapp.com",
    projectId: "trendingtech-daily",
    storageBucket: "trendingtech-daily.firebasestorage.app", // Use correct bucket
    messagingSenderId: "343812872871",
    appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

// Main function to initialize scripts after DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log("signup-scripts.js: DOMContentLoaded event fired.");
    
    await loadNavbar(); // Load navbar first
    console.log("signup-scripts.js: loadNavbar() attempt finished.");

    // A function to set up the form handlers once Firebase auth is ready.
    function setupSignupForm() {
        console.log("setupSignupForm: Function called.");
        if (typeof firebase === 'undefined' || typeof firebase.auth === 'undefined') {
            console.error("setupSignupForm: Firebase auth is not available. Cannot set up signup form.");
            return;
        }
        const auth = firebase.auth(); // Assuming global firebase object
        const db = firebase.firestore(); // Assuming global firebase object
        console.log("setupSignupForm: Firebase auth and firestore services obtained.");


        const signupForm = document.getElementById('signup-form');
        const signupErrorDiv = document.getElementById('signup-error');

        if (signupForm && signupErrorDiv) {
            console.log("setupSignupForm: Signup form and error div found. Attaching submit listener.");
            signupForm.addEventListener('submit', (e) => {
                console.log("SIGNUP FORM SUBMITTED - EVENT FIRED"); // Added log
                e.preventDefault();
                console.log("setupSignupForm: Signup form submitted (after preventDefault).");
                signupErrorDiv.textContent = '';
                signupErrorDiv.style.display = 'none';

                const name = document.getElementById('signup-name').value.trim();
                const email = document.getElementById('signup-email').value;
                const password = document.getElementById('signup-password').value;
                const submitButton = signupForm.querySelector('button[type="submit"]');

                submitButton.disabled = true;
                submitButton.textContent = 'Signing Up...';

                if (!name) {
                    console.log("setupSignupForm: Validation failed - Display Name is required.");
                    signupErrorDiv.textContent = 'Display Name is required.';
                    signupErrorDiv.style.display = 'block';
                    submitButton.disabled = false;
                    submitButton.textContent = 'Sign Up';
                    return;
                }
                if (password.length < 6) {
                    console.log("setupSignupForm: Validation failed - Password too short.");
                    signupErrorDiv.textContent = 'Password must be at least 6 characters.';
                    signupErrorDiv.style.display = 'block';
                    submitButton.disabled = false;
                    submitButton.textContent = 'Sign Up';
                    return;
                }
                
                console.log("setupSignupForm: Attempting createUserWithEmailAndPassword...");
                auth.createUserWithEmailAndPassword(email, password)
                    .then((userCredential) => {
                        const user = userCredential.user;
                        console.log("setupSignupForm: User created:", user.uid);
                        return user.updateProfile({ displayName: name })
                            .then(() => {
                                console.log("setupSignupForm: Creating Firestore record for new user...");
                                return db.collection('users').doc(user.uid).set({
                                    email: user.email,
                                    displayName: name,
                                    photoURL: user.photoURL,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                    isAdmin: false
                                });
                            });
                    })
                    .then(() => {
                        console.log("setupSignupForm: Firestore record created. Redirecting to '/'...");
                        window.location.href = '/';
                    })
                    .catch((error) => {
                        console.error("setupSignupForm: Signup Error:", error);
                        signupErrorDiv.textContent = error.message;
                        signupErrorDiv.style.display = 'block';
                    })
                    .finally(() => {
                        console.log("setupSignupForm: Signup form submission - finally block reached.");
                        submitButton.disabled = false;
                        submitButton.textContent = 'Sign Up';
                    });
            });
        } else {
            console.warn("setupSignupForm: Signup form or error div not found.");
        }

        const googleSignupBtn = document.getElementById('google-signup-btn');
        if (googleSignupBtn) {
            console.log("setupSignupForm: Google signup button found. Attaching click listener.");
            googleSignupBtn.addEventListener('click', () => {
                console.log("GOOGLE SIGNUP BUTTON CLICKED - EVENT FIRED"); // Added log
                console.log("setupSignupForm: Google signup button clicked (after event log).");
                const provider = new firebase.auth.GoogleAuthProvider();
                if (signupErrorDiv) {
                    signupErrorDiv.textContent = '';
                    signupErrorDiv.style.display = 'none';
                }
                googleSignupBtn.disabled = true;
                googleSignupBtn.innerHTML = '<i class="bi bi-google"></i> Signing In...';

                console.log("setupSignupForm: Attempting signInWithPopup for Google...");
                auth.signInWithPopup(provider)
                    .then((result) => {
                        const user = result.user;
                        console.log("setupSignupForm: Google Sign-In successful for user:", user.uid);
                        const isNewUser = result.additionalUserInfo?.isNewUser;
                        if (isNewUser) {
                            console.log("setupSignupForm: New user via Google, creating Firestore record...");
                            return db.collection('users').doc(user.uid).set({
                                email: user.email,
                                displayName: user.displayName,
                                photoURL: user.photoURL,
                                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                isAdmin: false
                            }, { merge: true });
                        }
                        return Promise.resolve(); 
                    })
                    .then(() => {
                        console.log("setupSignupForm: Google sign-in process complete. Redirecting to '/'...");
                        window.location.href = '/';
                    })
                    .catch((error) => {
                        console.error("setupSignupForm: Google Signup Error:", error);
                        if (signupErrorDiv) {
                            signupErrorDiv.textContent = `Google Sign-Up Failed: ${error.message}`;
                            signupErrorDiv.style.display = 'block';
                        }
                    })
                    .finally(() => {
                        console.log("setupSignupForm: Google signup - finally block reached.");
                        googleSignupBtn.disabled = false;
                        googleSignupBtn.innerHTML = '<i class="bi bi-google"></i> Sign Up with Google';
                    });
            });
        } else {
            console.warn("setupSignupForm: Google signup button not found.");
        }
    }

    // Initialize Firebase (this should ideally happen once, globally)
    let firebaseInitializationAttempted = false;
    const interval = setInterval(() => {
        if (typeof firebase !== 'undefined') { 
            if (!firebase.apps.length && !firebaseInitializationAttempted) { 
                try {
                    console.log("signup-scripts.js: Initializing Firebase app...");
                    firebase.initializeApp(firebaseConfig);
                    firebaseInitializationAttempted = true; 
                    console.log("signup-scripts.js: Firebase app initialized by signup-scripts.js.");
                } catch (e) {
                    console.error("signup-scripts.js: Error initializing Firebase in signup-scripts.js:", e);
                    firebaseInitializationAttempted = true; 
                }
            }
            
            if (firebase.auth && typeof firebase.auth === 'function') { // Check if firebase.auth is a function (service exists)
                 clearInterval(interval);
                 console.log("signup-scripts.js: Firebase and Auth service ready, calling setupSignupForm.");
                 setupSignupForm(); 
            } else if (firebaseInitializationAttempted && !(firebase.auth && typeof firebase.auth === 'function')) {
                console.warn("signup-scripts.js: Firebase app initialized, but auth service not yet available or not a function. Check SDK imports and initialization order.");
            }
        } else {
            console.log("signup-scripts.js: Waiting for global Firebase object to be available...");
        }
    }, 100);

    setTimeout(() => {
        if(interval) { // Check if interval is still active
            clearInterval(interval);
            console.log("signup-scripts.js: Firebase init check interval timed out after 10 seconds.");
        }
    }, 10000); 

});
console.log("signup-scripts.js: Script end.");
