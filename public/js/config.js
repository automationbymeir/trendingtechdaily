// public/js/config.js
// Shared Firebase initialization for front-end scripts

window.firebaseConfig = window.firebaseConfig || {
  apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
  authDomain: "trendingtech-daily.firebaseapp.com",
  projectId: "trendingtech-daily",
  storageBucket: "trendingtech-daily.firebasestorage.app",
  messagingSenderId: "343812872871",
  appId: "1:343812872871:web:5bd68bd7d6140d83551982"
};

// Initialize Firebase once and expose helpers globally
window.ensureFirebaseInitialized = function() {
  if (typeof firebase !== 'undefined') {
    if (!firebase.apps || !firebase.apps.length) {
      try {
        firebase.initializeApp(window.firebaseConfig);
      } catch (e) {
        console.warn("Firebase initializeApp note:", e);
      }
    }
    window.db = window.db || (firebase.firestore ? firebase.firestore() : null);
    window.functions = window.functions || (firebase.functions ? firebase.functions() : null);
    window.auth = window.auth || (firebase.auth ? firebase.auth() : null);
    return true;
  }
  return false;
};

// Initialize immediately
window.ensureFirebaseInitialized();

// Also attempt initialization on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', window.ensureFirebaseInitialized);
} else {
  window.ensureFirebaseInitialized();
}