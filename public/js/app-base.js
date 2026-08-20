// public/js/app-base.js - Base Application Infrastructure for TrendingTech Daily

let currentUser = null;
const categoryCache = {};

function getSafe(fn, defaultValue = '') {
  try {
    const value = fn();
    return value !== null && value !== undefined ? value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

// Master Taxonomy for Hebrew & English
const BASE_TAXONOMY = {
  'ai': { name: 'Artificial Intelligence', nameHe: 'בינה מלאכותית', slug: 'ai' },
  'dev': { name: 'Software Development', nameHe: 'פיתוח תוכנה', slug: 'dev' },
  'computing': { name: 'Computing & Hardware', nameHe: 'מחשוב וחומרה', slug: 'computing' },
  'chips': { name: 'Silicon & Foundries', nameHe: 'שבבים ומפעלי ייצור', slug: 'chips' },
  'markets': { name: 'Tech Equities', nameHe: 'שוק ההון ומניות', slug: 'markets' },
  'startups': { name: 'VC & Startups', nameHe: 'סטארטאפים והון סיכון', slug: 'startups' },
  'cybersecurity': { name: 'Cybersecurity', nameHe: 'סייבר ואבטחה', slug: 'cybersecurity' }
};

function getCategoryBadgeClass(category) {
  const cat = String(category || '').toLowerCase();
  if (cat.includes('chip') || cat.includes('שבב') || cat.includes('computing') || cat.includes('מחשוב') || cat.includes('חומרה') || cat.includes('hardware')) {
    return 'badge-chips';
  }
  if (cat.includes('dev') || cat.includes('פיתוח') || cat.includes('code') || cat.includes('קוד') || cat.includes('open-source')) {
    return 'badge-dev';
  }
  if (cat.includes('security') || cat.includes('סייבר') || cat.includes('cyber')) {
    return 'badge-security';
  }
  if (cat.includes('market') || cat.includes('שוק') || cat.includes('הון') || cat.includes('equity') || cat.includes('crypto') || cat.includes('ביטקוין')) {
    return 'badge-purple';
  }
  return 'badge-ai';
}
window.getCategoryBadgeClass = getCategoryBadgeClass;

// Auth State Listener
function setupAuthListener() {
  if (typeof auth === 'undefined') return;

  auth.onAuthStateChanged(user => {
    currentUser = user;
    const loginLink = document.getElementById('auth-login-link');
    const signupLink = document.getElementById('auth-signup-link');
    const profileMenu = document.getElementById('auth-profile-menu');
    const profilePicNav = document.getElementById('user-profile-pic-nav');
    const userNameNav = document.getElementById('user-name-nav');

    if (user) {
      if (loginLink) loginLink.style.display = 'none';
      if (signupLink) signupLink.style.display = 'none';
      if (profileMenu) profileMenu.classList.remove('d-none');
      if (profilePicNav && user.photoURL) profilePicNav.src = user.photoURL;
      if (userNameNav) userNameNav.textContent = user.displayName || user.email || 'User';
    } else {
      if (loginLink) loginLink.style.display = '';
      if (signupLink) signupLink.style.display = '';
      if (profileMenu) profileMenu.classList.add('d-none');
    }
  });
}

// Load Sections into Sidebar & Footer (Bilingual Hebrew / English)
function loadSections() {
  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const sidebarContainer = document.getElementById('categories-list');
  const footerCategoriesList = document.getElementById('footer-categories-list');

  if (typeof db === 'undefined') {
    return Promise.resolve();
  }

  const collectionName = isHe ? 'he_sections' : 'sections';

  return db.collection(collectionName)
    .where('active', '==', true)
    .orderBy('order')
    .limit(10)
    .get()
    .then(snap => {
      let footerHTML = '';
      let sideHTML = '';

      if (!snap.empty) {
        snap.forEach(doc => {
          const section = { id: doc.id, ...doc.data() };
          const slug = section.slug || doc.id;
          const name = section.name || (isHe ? (BASE_TAXONOMY[slug]?.nameHe || slug) : (BASE_TAXONOMY[slug]?.name || slug));
          const url = isHe ? `/he/category.html?slug=${encodeURIComponent(slug)}` : `/category.html?slug=${encodeURIComponent(slug)}`;

          footerHTML += `<li><a href="${url}">${name}</a></li>`;
          sideHTML += `<li><a href="${url}" class="d-flex justify-content-between align-items-center"><span class="text-main fw-bold">${name}</span></a></li>`;

          categoryCache[doc.id] = { name: name, slug: slug, nameHe: section.nameHe || name };
          categoryCache[slug] = { name: name, slug: slug, nameHe: section.nameHe || name };
        });
      } else {
        // Fallback default taxonomy items
        Object.entries(BASE_TAXONOMY).forEach(([k, item]) => {
          const name = isHe ? item.nameHe : item.name;
          const url = isHe ? `/he/category.html?slug=${item.slug}` : `/category.html?slug=${item.slug}`;
          footerHTML += `<li><a href="${url}">${name}</a></li>`;
          sideHTML += `<li><a href="${url}" class="d-flex justify-content-between align-items-center"><span class="text-main fw-bold">${name}</span></a></li>`;
          categoryCache[item.slug] = item;
        });
      }

      // Add Markets Link
      const marketsUrl = isHe ? '/he/shuk-hon.html' : '/stock-data.html';
      const marketsText = isHe ? 'שוק ההון' : 'Stock Data';
      footerHTML += `<li><a href="${marketsUrl}">${marketsText}</a></li>`;

      if (footerCategoriesList && !isHe) footerCategoriesList.innerHTML = footerHTML;
      if (sidebarContainer) sidebarContainer.innerHTML = sideHTML;

      // Clean up any remaining API containers completely
      const apiContainer = document.getElementById('api-articles-container');
      if (apiContainer) apiContainer.innerHTML = '';
      const apiLoading = document.getElementById('api-loading-initial');
      if (apiLoading) apiLoading.remove();
    })
    .catch(error => {
      console.warn('loadSections notice:', error);
      // Populate defaults on network/index errors
      if (sidebarContainer) {
        let sideHTML = '';
        Object.entries(BASE_TAXONOMY).forEach(([k, item]) => {
          const name = isHe ? item.nameHe : item.name;
          const url = isHe ? `/he/category.html?slug=${item.slug}` : `/category.html?slug=${item.slug}`;
          sideHTML += `<li><a href="${url}" class="d-flex justify-content-between align-items-center"><span class="text-main fw-bold">${name}</span></a></li>`;
        });
        sidebarContainer.innerHTML = sideHTML;
      }
    });
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
  setupAuthListener();
  if (typeof db !== 'undefined') {
    loadSections();
  }
});