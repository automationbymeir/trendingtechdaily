/**
 * podcasts-app.js
 * ---------------------------------------------------------------------------
 * Interactive Podcasts Directory Engine for TrendingTech Daily
 * Renders 100+ top tech podcasts with live search, category filtering,
 * real cover art, and direct playback links.
 */

(function () {
  'use strict';

  let currentCategory = 'all';
  let searchQuery = '';

  document.addEventListener('DOMContentLoaded', () => {
    initPodcastsDirectory();
  });

  function initPodcastsDirectory() {
    const podcasts = window.TECH_PODCASTS_EN || [];

    // 1. Setup Search Input
    const searchInput = document.getElementById('podcast-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderPodcasts();
      });
    }

    // 2. Setup Category Filter Buttons
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
        renderPodcasts();
      });
    });

    // 3. Initial Render
    renderPodcasts();
  }

  function renderPodcasts() {
    const container = document.getElementById('podcasts-container');
    const countBadge = document.getElementById('podcast-count-badge');
    if (!container) return;

    const allPodcasts = (typeof window !== 'undefined' && window.TECH_PODCASTS_EN) || (typeof TECH_PODCASTS_EN !== 'undefined' ? TECH_PODCASTS_EN : []);

    // Filter by Category and Search Query
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
      countBadge.textContent = `Showing ${filtered.length} of ${allPodcasts.length} Podcasts`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-12 text-center py-5">
          <div class="mb-3" style="font-size: 2.5rem; color: var(--text-muted);"><i class="bi bi-mic-mute"></i></div>
          <h3 class="fw-bold mb-2">No podcasts found</h3>
          <p class="text-muted">Try adjusting your search query or selecting "All Channels".</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(p => {
      const badgeClass = p.badgeClass || 'badge-ai';
      const initialLetter = p.title.charAt(0).toUpperCase();

      return `
        <div class="podcast-card-item" data-category="${p.category}">
          <div class="podcast-card-cover-wrap">
            ${p.coverUrl ? `
              <img src="${p.coverUrl}" alt="${p.title}" class="podcast-cover-img" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            ` : ''}
            <div class="podcast-card-header-fallback" style="${p.coverUrl ? 'display:none;' : 'display:flex;'}">
              <span>${initialLetter}</span>
            </div>
            <span class="podcast-category-floating-badge badge ${badgeClass}">${p.categoryLabel || 'Tech Podcast'}</span>
          </div>

          <div class="podcast-card-body">
            <div>
              <h3 class="podcast-card-title">${p.title}</h3>
              <div class="podcast-card-host"><i class="bi bi-person-fill me-1 text-danger"></i>${p.host}</div>
              <p class="podcast-card-desc">${p.desc}</p>
            </div>

            <div class="podcast-card-cta">
              ${p.spotifyUrl ? `
                <a href="${p.spotifyUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-spotify btn-sm" title="Listen on Spotify">
                  <i class="bi bi-spotify me-1 text-success"></i> Spotify
                </a>
              ` : ''}
              ${p.youtubeUrl ? `
                <a href="${p.youtubeUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" title="Watch on YouTube">
                  <i class="bi bi-youtube me-1 text-danger"></i> YouTube
                </a>
              ` : ''}
              ${p.appleUrl ? `
                <a href="${p.appleUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-ghost btn-sm" title="Apple Podcasts">
                  <i class="bi bi-apple me-1"></i> Apple
                </a>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

})();
