import { useState, useEffect } from 'react';
import './index.css';

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if the user already selected a language previously
    const savedLang = localStorage.getItem('ttd_lang');
    if (savedLang) {
      // User already picked a language. Send them straight to the live app.
      redirectToLiveApp(savedLang as 'en' | 'he', false);
    } else {
      setLoading(false);
    }
  }, []);

  const redirectToLiveApp = (lang: 'en' | 'he', isFirstTime: boolean) => {
    const baseUrl = 'https://trendingtechdaily.com';
    let targetUrl = baseUrl;
    
    if (lang === 'he') {
      targetUrl += '/he';
    }
    
    // If it's their first time opening the app, send them to the signup page.
    // Otherwise, send them to the home feed.
    if (isFirstTime) {
      targetUrl += lang === 'he' ? '/signup.html' : '/signup.html';
    }
    
    window.location.replace(targetUrl);
  };

  const handleSelectLang = (selected: 'en' | 'he') => {
    localStorage.setItem('ttd_lang', selected);
    // Send to live app signup page
    redirectToLiveApp(selected, true);
  };

  if (loading) {
    return <div className="container center"><div className="loader"></div></div>;
  }

  return (
    <div className="container center">
      <div className="card glass-panel fade-in">
        <div className="logo-container">
          <img src="https://trendingtechdaily.com/img/favicon.png" alt="Logo" className="app-logo" />
        </div>
        <h1 className="title gradient-text">TrendingTechDaily</h1>
        <p className="subtitle">Choose your preferred language<br/>בחר את השפה המועדפת עליך</p>
        <div className="lang-buttons">
          <button className="btn primary" onClick={() => handleSelectLang('en')}>English</button>
          <button className="btn primary" onClick={() => handleSelectLang('he')}>עברית</button>
        </div>
      </div>
    </div>
  );
}
