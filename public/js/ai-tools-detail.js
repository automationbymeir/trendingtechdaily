/* ===================================================================
   AI Tools Pulse — detail page client logic.
   The SSR handler injects the tool's slug into <body data-slug="...">.
   We re-fetch the latest data via getAiToolDetail to render reviews,
   the metrics chart, and the related-tools strip. We also enable the
   review submission form when a Firebase Auth user is present.
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he';
  const langKey = isHebrew ? 'he' : 'en';
  const T = window.AIP_I18N || {
    review_submit: 'Submit review',
    review_login: 'Log in to leave a review',
    review_thanks: 'Thanks — your review is pending approval.',
    review_failed: 'Could not submit. Please try again.',
    copied: 'Copied!',
    no_reviews: 'No reviews yet — be the first.',
    related: 'Related tools',
  };

  function $(s, el = document) { return el.querySelector(s); }
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
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

  // ── Sparkline chart: pure SVG, plotting trendingScore history. ─
  function renderChart(history) {
    const svg = $('#aip-chart');
    if (!svg || !history || !history.length) return;
    const W = 600, H = 160, pad = 24;
    const ys = history.map(h => Number(h.trendingScore) || 0);
    const xs = history.map((_, i) => i);
    const minY = 0, maxY = Math.max(100, ...ys);
    const pts = history.map((h, i) => {
      const x = pad + (i / Math.max(1, history.length - 1)) * (W - 2 * pad);
      const y = H - pad - ((ys[i] - minY) / (maxY - minY || 1)) * (H - 2 * pad);
      return [x, y];
    });
    const path = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area = `${path} L ${pts[pts.length - 1][0]} ${H - pad} L ${pts[0][0]} ${H - pad} Z`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      <defs>
        <linearGradient id="aipChartFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#2196F3" stop-opacity="0.4"/>
          <stop offset="100%" stop-color="#2196F3" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#aipChartFill)"/>
      <path d="${path}" fill="none" stroke="#2196F3" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="#FFC107" stroke="#2196F3" stroke-width="1.5"/>`).join('')}`;
  }

  function renderReviews(reviews) {
    const list = $('#aip-reviews-list');
    if (!list) return;
    if (!reviews || !reviews.length) {
      list.innerHTML = `<p class="text-muted">${esc(T.no_reviews)}</p>`;
      return;
    }
    list.innerHTML = reviews.map(r => `
      <div class="aip-review">
        <div class="aip-rating-stars">${'★'.repeat(Number(r.rating)||0)}${'☆'.repeat(5 - (Number(r.rating)||0))}</div>
        <p class="mb-0">${esc(r.comment || '')}</p>
      </div>`).join('');
  }

  function renderRelated(tools) {
    const wrap = $('#aip-related');
    if (!wrap || !tools || !tools.length) return;
    wrap.innerHTML = `<h3>${esc(T.related)}</h3><div class="aip-grid">` + tools.slice(0, 3).map(t => {
      const desc = t[`shortDesc_${langKey}`] || t.shortDesc_en || '';
      const initials = (t.name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
      return `<a class="aip-card" href="${isHebrew ? '/he/ai-tools/' : '/ai-tools/'}${encodeURIComponent(t.slug)}" style="text-decoration:none;color:inherit;">
        <div class="aip-card-head">
          <div class="aip-icon">${t.iconUrl ? `<img src="${esc(t.iconUrl)}" alt="">` : esc(initials)}</div>
          <div><h3>${esc(t.name)}</h3><span class="aip-pill type-${esc(t.type||'')}">${esc((t.type||'').replace(/-/g,' '))}</span></div>
        </div>
        <div class="aip-card-desc">${esc(desc)}</div>
      </a>`;
    }).join('') + '</div>';
  }

  function wireReviewForm(toolId) {
    const form = $('#aip-review-form');
    if (!form) return;
    firebase.auth().onAuthStateChanged(user => {
      const loginNote = $('#aip-review-login-note');
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
      const rating = Number($('#aip-review-rating').value);
      const comment = $('#aip-review-comment').value.trim();
      if (!rating || !comment) return;
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const r = await callFn('submitAiToolReview', { toolId, rating, comment });
      btn.disabled = false;
      const msg = $('#aip-review-msg');
      if (r) {
        msg.textContent = T.review_thanks; msg.className = 'text-success small';
        form.reset();
      } else {
        msg.textContent = T.review_failed; msg.className = 'text-danger small';
      }
    });
  }

  function wireCopyInstall() {
    const btn = $('#aip-copy-install');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const code = $('#aip-install-code')?.textContent || '';
      navigator.clipboard.writeText(code).then(() => {
        const orig = btn.textContent;
        btn.textContent = T.copied;
        setTimeout(() => btn.textContent = orig, 1400);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    wireCopyInstall();
    const slug = document.body.dataset.slug;
    if (!slug) return;

    const data = await callFn('getAiToolDetail', slug);
    if (!data) return;
    const tool = data.tool || {};
    const reviews = (data.reviews || []).filter(r => r.approved !== false);
    const history = data.history || [];

    renderChart(history);
    renderReviews(reviews);
    wireReviewForm(tool.id || tool.slug || slug);

    // related: pull by type, exclude self
    const related = await callFn('getAiToolsList', { type: tool.type, limit: 6, language: langKey });
    if (related && related.tools) {
      renderRelated(related.tools.filter(t => t.slug !== slug));
    }
  });
})();
