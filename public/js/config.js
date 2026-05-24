// public/js/config.js
// Shared Firebase initialization for front-end scripts
// Replace these with your Firebase project settings if different

const firebaseConfig = {
    apiKey: "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
    authDomain: "trendingtech-daily.firebaseapp.com",
    projectId: "trendingtech-daily",
    storageBucket: "trendingtech-daily.appspot.com",
    messagingSenderId: "343812872871",
    appId: "1:343812872871:web:5bd68bd7d6140d83551982"
  };
  
  // Initialize Firebase once and expose helpers globally
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  
  window.db = firebase.firestore();
  window.functions = firebase.functions();
  window.auth = firebase.auth ? firebase.auth() : null;