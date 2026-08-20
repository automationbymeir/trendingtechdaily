/**
 * he-podcasts-app.js
 * ---------------------------------------------------------------------------
 * מנוע אינדקס הפודקאסטים הישראלי עבור TrendingTech Daily
 * מציג 30+ פודקאסטים מובילים עם חיפוש חי, סינון קטגוריות,
 * תמונות קאבר וקישורי האזנה ישירים.
 */

(function () {
  'use strict';

  let currentCategory = 'all';
  let searchQuery = '';

  document.addEventListener('DOMContentLoaded', () => {
    initHebrewPodcastsDirectory();
  });

  function initHebrewPodcastsDirectory() {
    // 1. הגדרת שורת חיפוש
    const searchInput = document.getElementById('he-podcast-search-input') || document.getElementById('podcast-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderHebrewPodcasts();
      });
    }

    // 2. כפתורי סינון קטגוריות
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        filterButtons.forEach(b => {
          b.classList.remove('btn-subscribe', 'active');
          b.classList.add('btn-outline');
        });
        const target = e.currentTarget;
        target.classList.remove('btn-outline');
        target.classList.add('btn-subscribe', 'active');

        currentCategory = target.dataset.filter || 'all';
        renderHebrewPodcasts();
      });
    });

    // 3. רינדור ראשוני
    renderHebrewPodcasts();
  }

  function renderHebrewPodcasts() {
    const container = document.getElementById('podcasts-container');
    const countBadge = document.getElementById('he-podcast-count-badge') || document.getElementById('podcast-count-badge');
    if (!container) return;

    const allPodcasts = window.TECH_PODCASTS_HE || [];

    // סינון לפי קטגוריה ושאילתת חיפוש
    const filtered = allPodcasts.filter(p => {
      const matchCategory = (currentCategory === 'all' || p.category === currentCategory);
      const matchSearch = !searchQuery || (
        p.title.toLowerCase().includes(searchQuery) ||
        p.host.toLowerCase().includes(searchQuery) ||
        p.desc.toLowerCase().includes(searchQuery) ||
        (p.categoryLabel && p.categoryLabel.toLowerCase().includes(searchQuery))
      );
      return matchCategory && matchSearch;
    });

    if (countBadge) {
      countBadge.textContent = `מציג ${filtered.length} מתוך ${allPodcasts.length} פודקאסטים מובילים`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="mb-3" style="font-size: 2.5rem; color: var(--text-muted);"><i class="bi bi-mic-mute"></i></div>
          <h3 class="fw-bold mb-2">לא נמצאו פודקאסטים תואמים</h3>
          <p class="text-muted">נסה לשנות את מילות החיפוש או לבחור ב"כל הערוצים".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      const badgeClass = p.badgeClass || 'badge-ai';
      const initialLetter = p.title.charAt(0);

      return `
        <div class="podcast-card-item" data-category="${p.category}">
          <div class="podcast-card-cover-wrap">
            ${p.coverUrl ? `
              <img src="${p.coverUrl}" alt="${p.title}" class="podcast-cover-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            ` : ''}
            <div class="podcast-card-header-fallback" style="${p.coverUrl ? 'display:none;' : 'display:flex;'}">
              <span>${initialLetter}</span>
            </div>
            <span class="podcast-category-floating-badge badge ${badgeClass}">${p.categoryLabel || 'פודקאסט טק'}</span>
          </div>

          <div class="podcast-card-body">
            <div>
              <h3 class="podcast-card-title">${p.title}</h3>
              <div class="podcast-card-host"><i class="bi bi-person-fill ms-1 text-danger"></i>${p.host}</div>
              <p class="podcast-card-desc">${p.desc}</p>
            </div>

            <div class="podcast-card-cta">
              ${p.spotifyUrl ? `
                <a href="${p.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-spotify btn-sm" title="האזנה בספוטיפיי">
                  <i class="bi bi-spotify ms-1 text-success"></i> Spotify
                </a>
              ` : ''}
              ${p.youtubeUrl ? `
                <a href="${p.youtubeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" title="צפייה ביוטיוב">
                  <i class="bi bi-youtube ms-1 text-danger"></i> YouTube
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

})();
