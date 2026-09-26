// public/admin/js/firebase-config.js
// TrendingTechDaily – Web SDK configuration
const firebaseConfig = {
    apiKey:            "AIzaSyAMMvOPS6fczzI_2CTOcc_NlGGFO4qDydg",
    authDomain:        "trendingtech-daily.firebaseapp.com",
    projectId:         "trendingtech-daily",
    storageBucket:     "trendingtech-daily.appspot.com",
    messagingSenderId: "343812872871",
    appId:             "1:343812872871:web:5bd68bd7d6140d83551982",
    measurementId:     "G-5VF5QF9ZCJ"
  };
  
  // Initialise Firebase once, then export handles the rest of your
  // front‑end scripts can reuse.
  firebase.initializeApp(firebaseConfig);
  const db        = firebase.firestore();
  const functions = firebase.functions();
  