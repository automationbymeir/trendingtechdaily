/* ===================================================================
   Design Systems Decoded — detail page client logic.
   SSR already injected most of the page (hero, DNA, capabilities,
   Claude's Take, philosophy). This script handles:
     • Loading + rendering reviews (with review-form auth wiring)
     • Rendering related systems
   Mirrors the ai-tools-detail.js patterns.
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he';
  const langKey = isHebrew ? 'he' : 'en';
  const T = window.DS_I18N || {
    review_submit: 'Submit review',
    review_login: 'Log in to leave a review',
    review_thanks: 'Thanks — your review is pending approval.',
    review_failed: 'Could not submit. Please try again.',
    no_reviews: 'No reviews yet — be the first.',
    related: 'Related design systems',
  };

  function $(s, el = document) { return el.querySelector(s); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function getInitials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  async function callFn(name, payload) {
    try {
      const fn = firebase.functions().httpsCallable(name);
      const res = await fn(payload);
      return res.data;
    } catch (e) {
      console.warn('callFn failed', name, e);
      return null;
    }
  }

  function renderReviews(reviews) {
    const list = $('#ds-reviews-list');
    if (!list) return;
    if (!reviews || !reviews.length) {
      list.innerHTML = `<p class="text-muted">${esc(T.no_reviews)}</p>`;
      return;
    }
    list.innerHTML = reviews.map(r => `
      <div class="ds-review">
        <div class="ds-rating-stars">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5 - (Number(r.rating)||0))}</div>
        <p class="mb-0">${esc(r.comment || '')}</p>
      </div>`).join('');
  }

  function renderRelated(systems) {
    const wrap = $('#ds-related');
    if (!wrap || !systems || !systems.length) return;
    wrap.innerHTML = `<h3>${esc(T.related)}</h3><div class="ds-grid">` + systems.slice(0, 3).map(s => {
      const desc = s[`shortDesc_${langKey}`] || s.shortDesc_en || '';
      const initials = getInitials(s.name);
      const primary = s.primaryColor || '#2196F3';
      const logo = s.iconUrl ? `<img src="${esc(s.iconUrl)}" alt="">` : esc(initials);
      return `<a class="ds-card" href="${isHebrew ? '/he/design-systems/' : '/design-systems/'}${encodeURIComponent(s.slug)}" style="text-decoration:none;color:inherit;">
        <div class="ds-card-head">
          <div class="ds-logo-plate" style="background: ${esc(primary)};">${logo}</div>
          <div>
            <h3>${esc(s.name)}</h3>
            <div class="ds-card-company">${esc(s.company || '')}</div>
            <span class="ds-type-pill type-${esc(s.type || '')}">${esc((s.type||'').replace(/-/g,' '))}</span>
          </div>
        </div>
        <div class="ds-card-desc">${esc(desc)}</div>
      </a>`;
    }).join('') + '</div>';
  }

  function wireReviewForm(systemId) {
    const form = $('#ds-review-form');
    if (!form) return;
    firebase.auth().onAuthStateChanged(user => {
      const loginNote = $('#ds-review-login-note');
      if (user) {
        form.style.display = 'block';
        if (loginNote) loginNote.style.display = 'none';
      } else {
        form.style.display = 'none';
        if (loginNote) loginNote.style.display = 'block';
      }
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rating = Number($('#ds-review-rating').value);
      const comment = $('#ds-review-comment').value.trim();
      if (!rating || !comment) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const r = await callFn('submitDesignSystemReview', { systemId, rating, comment });
      btn.disabled = false;
      const msg = $('#ds-review-msg');
      if (r) {
        msg.textContent = T.review_thanks; msg.className = 'text-success small';
        form.reset();
      } else {
        msg.textContent = T.review_failed; msg.className = 'text-danger small';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const slug = document.body.dataset.slug;
    if (!slug) return;

    const data = await callFn('getDesignSystemDetail', { slug, language: langKey });
    if (!data) return;
    const system = data.system || {};
    const reviews = (data.reviews || []).filter(r => r.approved !== false);
    const related = data.related || [];

    renderReviews(reviews);
    renderRelated(related);
    wireReviewForm(system.id || system.slug || slug);
  });
})();
