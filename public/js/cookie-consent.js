// cookie-consent.js — English version
(function () {
  'use strict';

  var STORAGE_KEY = 'cookie_consent';
  var EXPIRY_DAYS = 365;

  function getConsent() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function setConsent(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
      // Also store expiry
      localStorage.setItem(STORAGE_KEY + '_ts', Date.now().toString());
    } catch (e) {}
  }

  function isExpired() {
    try {
      var ts = parseInt(localStorage.getItem(STORAGE_KEY + '_ts') || '0', 10);
      if (!ts) return false;
      return (Date.now() - ts) > EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    } catch (e) { return false; }
  }

  function removeBanner(banner) {
    banner.style.animation = 'cookie-slide-down 0.3s ease-in forwards';
    setTimeout(function () {
      if (banner.parentNode) banner.parentNode.removeChild(banner);
    }, 300);
  }

  function createBanner() {
    var banner = document.createElement('div');
    banner.id = 'cookie-consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-live', 'polite');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.innerHTML =
      '<p class="cookie-text">' +
        'We use cookies to improve your experience and analyze site traffic. ' +
        'By clicking "Accept All", you consent to our use of cookies. ' +
        '<a href="/privacy.html">Privacy Policy</a>' +
      '</p>' +
      '<div class="cookie-actions">' +
        '<button id="cookie-btn-accept" type="button">Accept All</button>' +
        '<button id="cookie-btn-necessary" type="button">Necessary Only</button>' +
      '</div>';

    document.body.appendChild(banner);

    document.getElementById('cookie-btn-accept').addEventListener('click', function () {
      setConsent('all');
      removeBanner(banner);
      // Push consent event to dataLayer for GTM
      if (window.dataLayer) {
        window.dataLayer.push({ event: 'cookie_consent', consent_type: 'all' });
      }
    });

    document.getElementById('cookie-btn-necessary').addEventListener('click', function () {
      setConsent('necessary');
      removeBanner(banner);
      if (window.dataLayer) {
        window.dataLayer.push({ event: 'cookie_consent', consent_type: 'necessary' });
      }
    });
  }

  function init() {
    var consent = getConsent();
    if (consent && !isExpired()) return; // already decided
    if (isExpired()) {
      try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(STORAGE_KEY + '_ts'); } catch (e) {}
    }
    createBanner();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
