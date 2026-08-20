// js/stories.js — Interactive Video Stories & Reels Engine with Real-Time Updates for TrendingTech Daily

let storiesData = [];
let currentStoryIndex = 0;
let progressInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  const wrapper = document.getElementById('stories-wrapper');
  if (!wrapper) return;

  const isHebrew = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';

  // Default Master Stories Dataset (Dynamic Reels)
  const defaultStories = isHebrew ? [
    {
      id: 'he-promo',
      title: 'מהדורת מגזין',
      subtitle: 'TrendingTech Daily',
      videoSrc: '/videos/trendingtechdaily_promo_reel.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80',
      badge: 'LIVE'
    },
    {
      id: 'he-deepseek',
      title: 'DeepSeek V3',
      subtitle: 'מודל היסק פתוח',
      videoSrc: '/videos/stories/hebrewPromo.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=160&auto=format&fit=crop&q=80',
      badge: 'NEW'
    },
    {
      id: 'he-figma',
      title: 'Figma UI3',
      subtitle: 'מערכות עיצוב וטוקנים',
      videoSrc: '/videos/brandPromoHebrew.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=160&auto=format&fit=crop&q=80',
      badge: 'UI/UX'
    },
    {
      id: 'he-chips',
      title: 'מפעלי 2nm',
      subtitle: 'NVIDIA ו-TSMC',
      videoSrc: '/videos/trendingtechdaily_promo_reel.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=160&auto=format&fit=crop&q=80'
    },
    {
      id: 'he-agents',
      title: 'סוכני AI',
      subtitle: 'פיתוח תוכנה אוטונומי',
      videoSrc: '/videos/stories/hebrewPromo.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=160&auto=format&fit=crop&q=80'
    }
  ] : [
    {
      id: 'en-promo',
      title: 'Tech Daily Reel',
      subtitle: 'TrendingTech Daily',
      videoSrc: '/videos/trendingtechdaily_promo_reel.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80',
      badge: 'LIVE'
    },
    {
      id: 'en-deepseek',
      title: 'DeepSeek V3',
      subtitle: 'Open Reasoning Architecture',
      videoSrc: '/videos/stories/englishPromo.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=160&auto=format&fit=crop&q=80',
      badge: 'NEW'
    },
    {
      id: 'en-figma',
      title: 'Figma UI3',
      subtitle: 'Design Systems Decoded',
      videoSrc: '/videos/trendingtechdaily_promo_reel.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=160&auto=format&fit=crop&q=80',
      badge: 'DESIGN'
    },
    {
      id: 'en-chips',
      title: '2nm Foundries',
      subtitle: 'Blackwell & Silicon Giants',
      videoSrc: '/videos/stories/englishPromo.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=160&auto=format&fit=crop&q=80'
    },
    {
      id: 'en-agents',
      title: 'AI Copilots',
      subtitle: 'Autonomous Agent Workflows',
      videoSrc: '/videos/trendingtechdaily_promo_reel.mp4',
      thumbnail: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=160&auto=format&fit=crop&q=80'
    }
  ];

  storiesData = defaultStories;

  // Render Story Cards in Track
  function renderStoryCards() {
    wrapper.innerHTML = '';
    storiesData.forEach((story, idx) => {
      const card = document.createElement('div');
      card.className = 'story-card';
      card.setAttribute('data-story-index', idx);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Watch story: ${story.title}`);

      card.innerHTML = `
        <div class="story-avatar">
          <img src="${story.thumbnail || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80'}" alt="${story.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80'" />
          ${story.badge ? `<span class="story-badge">${story.badge}</span>` : ''}
        </div>
        <span class="story-title">${story.title}</span>
      `;

      card.addEventListener('click', (e) => {
        e.preventDefault();
        openStory(idx);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openStory(idx);
        }
      });

      wrapper.appendChild(card);
    });
  }

  // Ensure Story Viewer Modal exists in DOM
  ensureModalExists();
  renderStoryCards();

  // ── Real-Time Snapshot Listener for Stories & Breaking Dispatches ──────────
  function setupRealtimeStories() {
    if (typeof firebase === 'undefined' || !firebase.firestore) {
      setTimeout(setupRealtimeStories, 300);
      return;
    }

    const db = firebase.firestore();
    const lang = isHebrew ? 'he' : 'en';

    try {
      // 1. Listen in real-time to stories collection
      db.collection('stories')
        .where('language', '==', lang)
        .limit(10)
        .onSnapshot(snap => {
          const dynamicStories = [];
          if (snap && !snap.empty) {
            snap.forEach(doc => {
              dynamicStories.push({ id: doc.id, ...doc.data() });
            });
          }
          storiesData = [...dynamicStories, ...defaultStories];
          renderStoryCards();
        }, err => {
          console.warn('Real-time stories snapshot note:', err);
        });

      // 2. Also listen in real-time to published articles with story tags / reels
      const articlesColl = isHebrew ? 'he_articles' : 'articles';
      db.collection(articlesColl)
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(6)
        .onSnapshot(snap => {
          if (snap && !snap.empty) {
            const articleStories = [];
            snap.forEach(doc => {
              const d = doc.data();
              if (d.featuredVideo || d.videoUrl || d.isStory) {
                articleStories.push({
                  id: `art-story-${doc.id}`,
                  title: d.title ? (d.title.length > 20 ? d.title.slice(0, 18) + '...' : d.title) : 'Dispatch',
                  subtitle: d.author || 'TrendingTech Daily',
                  videoSrc: d.featuredVideo || d.videoUrl || '/videos/trendingtechdaily_promo_reel.mp4',
                  thumbnail: d.featuredImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&auto=format&fit=crop&q=80',
                  badge: isHebrew ? 'מבזק' : 'BREAKING'
                });
              }
            });

            if (articleStories.length > 0) {
              const existingIds = new Set(storiesData.map(s => s.id));
              const newStories = articleStories.filter(s => !existingIds.has(s.id));
              if (newStories.length > 0) {
                storiesData = [...newStories, ...storiesData];
                renderStoryCards();
              }
            }
          }
        }, () => {});

    } catch (e) {
      console.warn('Real-time stories setup note:', e);
    }
  }

  setupRealtimeStories();
});

function ensureModalExists() {
  let modal = document.getElementById('story-viewer-modal');
  if (!modal) {
    const isHebrew = window.location.pathname.startsWith('/he') || document.documentElement.getAttribute('dir') === 'rtl';
    const modalHtml = `
      <div class="story-viewer-modal" id="story-viewer-modal" role="dialog" aria-modal="true" aria-label="Story Viewer" dir="${isHebrew ? 'rtl' : 'ltr'}">
        <!-- Top Screen Close Button -->
        <button class="story-viewer-close" id="story-viewer-close" data-action="close-story" aria-label="Close Story">
          <i class="bi bi-x-lg" data-action="close-story" style="pointer-events:none;"></i>
        </button>
        
        <div class="story-viewer-content">
          <!-- Progress Bars -->
          <div id="story-progress-container" style="position:absolute; top:12px; left:12px; right:12px; display:flex; gap:5px; z-index:40;"></div>
          
          <!-- Story Header with in-card Close Button -->
          <div id="story-viewer-header" style="position:absolute; top:24px; left:14px; right:14px; display:flex; align-items:center; justify-content:space-between; z-index:40; color:#ffffff; text-shadow:0 2px 6px rgba(0,0,0,0.9);">
            <div style="display:flex; align-items:center; gap:10px; overflow:hidden;">
              <img id="story-header-avatar" src="/favicon.svg" alt="Avatar" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid #E63946; background:#000; flex-shrink:0;" onerror="this.src='/favicon.svg'">
              <div style="overflow:hidden;">
                <div id="story-header-title" style="font-family:var(--font-heading, sans-serif); font-weight:800; font-size:0.95rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">TrendingTech Daily</div>
                <div id="story-header-sub" style="font-size:0.75rem; opacity:0.85;">Featured Reel</div>
              </div>
            </div>
            
            <!-- In-Header Close Button (Always visible on mobile/desktop) -->
            <button type="button" class="btn btn-icon btn-sm text-white" id="story-header-close-btn" data-action="close-story" style="background:rgba(0,0,0,0.6); border-radius:50%; width:36px; height:36px; display:flex; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,0.3); cursor:pointer; flex-shrink:0;" title="Close Story" aria-label="Close Story">
              <i class="bi bi-x-lg" data-action="close-story" style="font-size:1rem; pointer-events:none;"></i>
            </button>
          </div>

          <!-- Video Player -->
          <video id="story-video-player" playsinline preload="auto" style="width:100%; height:100%; object-fit:cover; background:#000;"></video>
          
          <!-- Tap Navigation Zones -->
          <div style="position:absolute; top:75px; bottom:0; left:0; right:0; display:flex; z-index:20;">
            <div id="story-tap-prev" style="width:40%; height:100%; cursor:pointer;" title="Previous"></div>
            <div id="story-tap-next" style="width:60%; height:100%; cursor:pointer;" title="Next"></div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  setupStoryEventListeners();
}

let listenersBound = false;
function setupStoryEventListeners() {
  if (listenersBound) return;
  listenersBound = true;

  const tapPrev = document.getElementById('story-tap-prev');
  const tapNext = document.getElementById('story-tap-next');
  const videoPlayer = document.getElementById('story-video-player');

  if (tapPrev) tapPrev.onclick = playPrevStory;
  if (tapNext) tapNext.onclick = playNextStory;

  if (videoPlayer) {
    videoPlayer.onended = playNextStory;
  }

  // Global delegated click listener for ALL close actions
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (
      target.closest('[data-action="close-story"]') ||
      target.closest('#story-viewer-close') ||
      target.closest('#story-header-close-btn') ||
      target.id === 'story-viewer-modal'
    ) {
      e.preventDefault();
      e.stopPropagation();
      closeStory();
    }
  });

  // Global keydown listener for keyboard navigation
  document.addEventListener('keydown', (e) => {
    const modal = document.getElementById('story-viewer-modal');
    if (modal && (modal.classList.contains('active') || modal.classList.contains('open'))) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeStory();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        playNextStory();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        playPrevStory();
      }
    }
  });
}

function openStory(index) {
  ensureModalExists();
  if (index < 0 || index >= storiesData.length) return;
  currentStoryIndex = index;

  const modal = document.getElementById('story-viewer-modal');
  const videoPlayer = document.getElementById('story-video-player');
  const progressContainer = document.getElementById('story-progress-container');
  const headerTitle = document.getElementById('story-header-title');
  const headerSub = document.getElementById('story-header-sub');
  const headerAvatar = document.getElementById('story-header-avatar');

  if (!modal || !videoPlayer) return;

  modal.classList.add('active', 'open');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  const currentStory = storiesData[currentStoryIndex];

  // Update Header Metadata
  if (headerTitle) headerTitle.textContent = currentStory.title;
  if (headerSub) headerSub.textContent = currentStory.subtitle || 'Featured Reel';
  if (headerAvatar) headerAvatar.src = currentStory.thumbnail || '/favicon.svg';

  // Setup Progress Indicators
  if (progressContainer) {
    progressContainer.innerHTML = '';
    storiesData.forEach((_, i) => {
      const bar = document.createElement('div');
      bar.className = 'story-progress-bar';
      
      const fill = document.createElement('div');
      fill.className = 'story-progress-fill';
      fill.id = `story-progress-fill-${i}`;
      
      if (i < currentStoryIndex) {
        fill.style.width = '100%';
      } else {
        fill.style.width = '0%';
      }
      
      bar.appendChild(fill);
      progressContainer.appendChild(bar);
    });
  }

  // Set Video Source and Play
  const src = currentStory.videoSrc || currentStory.videoUrl || '/videos/trendingtechdaily_promo_reel.mp4';
  videoPlayer.src = src;
  videoPlayer.currentTime = 0;

  videoPlayer.play().catch(err => {
    console.warn('Auto-play blocked or video failed, trying muted:', err);
    videoPlayer.muted = true;
    videoPlayer.play().catch(() => {});
  });

  // Track progress with smooth RAF / interval
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(() => {
    if (videoPlayer.duration && videoPlayer.duration > 0) {
      const pct = (videoPlayer.currentTime / videoPlayer.duration) * 100;
      const fill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
      if (fill) fill.style.width = `${pct}%`;
    }
  }, 50);
}

function closeStory() {
  const modal = document.getElementById('story-viewer-modal');
  const videoPlayer = document.getElementById('story-video-player');

  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }

  if (modal) {
    modal.classList.remove('active', 'open');
    modal.style.display = 'none';
  }
  document.body.style.overflow = '';

  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = '';
  }
}

function playNextStory() {
  if (currentStoryIndex + 1 < storiesData.length) {
    const currentFill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
    if (currentFill) currentFill.style.width = '100%';
    openStory(currentStoryIndex + 1);
  } else {
    closeStory();
  }
}

function playPrevStory() {
  if (currentStoryIndex - 1 >= 0) {
    const currentFill = document.getElementById(`story-progress-fill-${currentStoryIndex}`);
    if (currentFill) currentFill.style.width = '0%';
    openStory(currentStoryIndex - 1);
  } else {
    const videoPlayer = document.getElementById('story-video-player');
    if (videoPlayer) {
      videoPlayer.currentTime = 0;
      videoPlayer.play();
    }
  }
}

window.openStory = openStory;
window.closeStory = closeStory;
