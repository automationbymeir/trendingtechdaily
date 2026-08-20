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

// ── Dynamic Rotating Podcast Audio Dock Manager ─────────────────────────────
const ROTATING_PODCAST_TRACKS_EN = [
  {
    title: "Lex Fridman Podcast #419 — Sam Altman: OpenAI, GPT-5 & AGI",
    sub: "Lex Fridman & Sam Altman · 2 hr 18 min",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/3e/e3/9c/3ee39c89-de08-47a6-7f3d-3849cef6d255/mza_16657851278549137484.png/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/2MAi0BvDc6GTFvKFPXnkCL",
    progress: "45%"
  },
  {
    title: "Dwarkesh Podcast — Dario Amodei: Anthropic & Exponential Scaling",
    sub: "Dwarkesh Patel & Dario Amodei · 1 hr 54 min",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/e8/fe/ce/e8fece6e-c97f-8dd5-19a2-5c3b1f93f8e4/mza_726727706016079768.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/3d0b2fV9cT1tN5wZ1mN9jC",
    progress: "30%"
  },
  {
    title: "Acquired — The NVIDIA Story & GPU Computing Revolution",
    sub: "Ben Gilbert & David Rosenthal · 3 hr 42 min",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts211/v4/a8/e1/de/a8e1deff-9f88-4e55-a541-b0dc793c0cdc/mza_11539673419613154037.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/3nhA0eF92YwQ1wZ4vX5y6U",
    progress: "60%"
  },
  {
    title: "Latent Space — Swyx & Alessio on The AI Engineer Era",
    sub: "Latent Space · 1 hr 15 min",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/2d/c3/b1/2dc3b1c6-2170-e926-04d0-0aaabf848eff/mza_2266632206147105925.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/1KssRzG4Dk8iG2cRjQ1wZ",
    progress: "25%"
  },
  {
    title: "Darknet Diaries — Cyber Warfare, Zero-Days & Shadow Ops",
    sub: "Jack Rhysider · 58 min",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts122/v4/3a/80/a7/3a80a7db-5620-f77b-9935-016e61cc2fbc/mza_9399859904175514567.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/4XPl3uEEL9hvqMkoZrzbx5",
    progress: "75%"
  }
];

const ROTATING_PODCAST_TRACKS_HE = [
  {
    title: "הייטק בפקקים — עתיד הבינה המלאכותית בישראל ובעולם",
    sub: "אורי טוביאס וצוות הייטק בפקקים · 48 דקות",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/b4/ee/5a/b4ee5aeb-4706-1412-dc30-a7057a59c478/mza_12465591482388370554.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/0zQn0c0lO1EwA9qV5Q4y0K",
    progress: "40%"
  },
  {
    title: "מפתחים חסרי תרבות — איך כותבים קוד בעידן ה-LLMs ו-Agentic AI",
    sub: "אלכסיי, דניאל ועמית · 1 שעה 12 דקות",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/45/18/8a/45188a06-cbd9-255c-166a-cb9783c9b937/mza_16417913293339718209.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/1k2j3h4g5f6d7s8a9q0w1e",
    progress: "55%"
  },
  {
    title: "עושים תוכנה (Osim Tochna) — ארכיטקטורת מערכות ענן מבוזרות",
    sub: "רן לוי ורשת פודבריין · 52 דקות",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts221/v4/37/27/57/37275728-3c3f-efae-4358-8686f821c83f/mza_14084071357932658044.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/3u4v5w6x7y8z9a0b1c2d3e",
    progress: "30%"
  },
  {
    title: "עוד פודקאסט לסטארטאפים (Geektime) — ראיונות עם יזמי יוניקורן ישראליים",
    sub: "גיקטיים ישראל · 45 דקות",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts115/v4/91/7a/6a/917a6a42-eb4a-85d1-7c98-1e4e39b939c3/mza_16657851278549137484.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/7BqLzGfXz3r2v1u0p9o8n7",
    progress: "65%"
  },
  {
    title: "עושים טכנולוגיה — מודלי שפה, בינה מלאכותית והתודעה האנושית",
    sub: "ד\"ר יובל דרור · 1 שעה 05 דקות",
    cover: "https://is1-ssl.mzstatic.com/image/thumb/Podcasts125/v4/cf/14/09/cf1409ff-8898-07e3-057d-f421f14371bf/mza_15598160249826315582.jpg/600x600bb.jpg",
    spotifyUrl: "https://open.spotify.com/show/5p6q7r8s9t0u1v2w3x4y5z",
    progress: "48%"
  }
];

function initRotatingPodcastDock() {
  const dock = document.querySelector('.podcast-dock');
  if (!dock) return;

  const isHe = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
  const playlist = isHe ? ROTATING_PODCAST_TRACKS_HE : ROTATING_PODCAST_TRACKS_EN;
  let currentIndex = 0;

  function updateDockUI(index) {
    const track = playlist[index];
    if (!track) return;

    const titleEl = dock.querySelector('.dock-title');
    const subEl = dock.querySelector('.dock-sub');
    const artEl = dock.querySelector('.dock-art');
    const playBtn = dock.querySelector('.dock-play-btn');
    const progressBar = dock.querySelector('.dock-progress-bar');

    if (titleEl) titleEl.textContent = track.title;
    if (subEl) subEl.textContent = track.sub;
    if (artEl) {
      if (track.cover) {
        artEl.innerHTML = `<img src="${track.cover}" alt="Podcast Cover" style="width:100%; height:100%; object-fit:cover; border-radius:6px;" onerror="this.parentElement.innerHTML='<i class=\\'bi bi-mic-fill\\'></i>';" />`;
      } else {
        artEl.innerHTML = `<i class="bi bi-mic-fill"></i>`;
      }
    }
    if (playBtn) {
      playBtn.href = track.spotifyUrl;
      playBtn.target = "_blank";
      playBtn.rel = "noopener noreferrer";
      playBtn.title = isHe ? "האזנה בספוטיפיי" : "Listen on Spotify";
    }
    if (progressBar) {
      progressBar.style.width = track.progress || '40%';
    }
  }

  // Initial render
  updateDockUI(currentIndex);

  // Rotate smoothly every 15 seconds
  setInterval(() => {
    currentIndex = (currentIndex + 1) % playlist.length;
    updateDockUI(currentIndex);
  }, 15000);
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
  setupAuthListener();
  if (typeof db !== 'undefined') {
    loadSections();
  }
  initRotatingPodcastDock();
});