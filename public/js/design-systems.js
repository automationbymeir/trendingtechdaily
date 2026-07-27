/* ===================================================================
   Design Systems Decoded — landing page client logic.
   Mirrors the AI Tools Pulse landing JS: debounced search, filter
   handlers, infinite scroll, Stack Builder (localStorage). Uses the
   `getDesignSystemsList` callable.
   =================================================================== */
(function () {
  'use strict';

  const T = window.DS_I18N || {
    addToStack: 'Add to compare', added: 'Added', view: 'View',
    noResults: 'No design systems match these filters yet.',
    loading: 'Loading...',
    yourStack: 'Your Comparison',
    exportMd: 'Export Markdown', exportJson: 'Export JSON',
    emptyStack: 'Your comparison is empty. Click "Add to compare" on any card.',
    remove: 'Remove',
    trending: 'Trending',
  };
  const isHebrew = document.documentElement.lang === 'he';
  const langKey = isHebrew ? 'he' : 'en';

  const state = {
    filters: { type: '', capability: [], bestFor: [], search: '', language: langKey },
    cursor: null,
    loading: false,
    done: false,
    stack: JSON.parse(localStorage.getItem('designSystemsDecoded_stack') || '[]'),
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function debounce(fn, ms) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  function getInitials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function getDescription(s) {
    return s[`shortDesc_${langKey}`] || s.shortDesc_en || '';
  }
  function trendArrow(growth) {
    if (growth == null) return '';
    const v = Number(growth);
    if (!isFinite(v) || v === 0) return '';
    const sign = v > 0 ? '↑' : '↓';
    const cls = v > 0 ? 'ds-trend-up' : '';
    return `<span class="${cls}">${sign} ${Math.abs(v).toFixed(0)}%</span>`;
  }
  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function mix(c1, c2, ratio) {
    return {
      r: Math.round(c1.r + (c2.r - c1.r) * ratio),
      g: Math.round(c1.g + (c2.g - c1.g) * ratio),
      b: Math.round(c1.b + (c2.b - c1.b) * ratio),
    };
  }
  function rgbToHex(c) {
    const h = n => n.toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }
  // Build a 4-swatch mini-palette: primary, secondary, plus 2 derived
  // neutrals (light-tint and dark-shade of the primary).
  function buildMiniPalette(primary, secondary) {
    const p = hexToRgb(primary) || { r: 33, g: 150, b: 243 };
    const s = hexToRgb(secondary || '') || { r: 255, g: 193, b: 7 };
    const white = { r: 255, g: 255, b: 255 };
    const black = { r: 0, g: 0, b: 0 };
    return [
      rgbToHex(p),
      rgbToHex(s),
      rgbToHex(mix(p, white, 0.7)),
      rgbToHex(mix(p, black, 0.4)),
    ];
  }

  async function callFn(name, payload) {
    try {
      const fn = firebase.functions().httpsCallable(name);
      const res = await fn(payload || {});
      return res.data;
    } catch (e) {
      console.warn('callFn failed', name, e);
      return null;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────
  function renderTrending(systems) {
    const wrap = $('#ds-trending-track');
    if (!wrap) return;
    if (!systems || !systems.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = systems.slice(0, 5).map(s => `
      <a class="ds-trending-card" href="${isHebrew ? '/he/design-systems/' : '/design-systems/'}${encodeURIComponent(s.slug)}">
        <div class="ds-swatch" style="background: ${esc(s.primaryColor || '#2196F3')};"></div>
        <div>
          <div style="font-weight:700;">${esc(s.name)}</div>
          <div class="ds-trending-meta">
            <span class="ds-type-pill type-${esc(s.type || '')}">${esc((s.type || '').replace(/-/g, ' '))}</span>
            ${trendArrow(s.metrics && s.metrics.weeklyGrowth)}
          </div>
        </div>
      </a>`).join('');
  }

  function renderBuckets(counts) {
    const labels = isHebrew
      ? { 'big-tech':'חברות גדולות', 'open-source':'קוד פתוח', 'modern':'מודרני', 'government':'ממשלתי' }
      : { 'big-tech':'Big Tech', 'open-source':'Open Source', 'modern':'Modern', 'government':'Government' };
    const explore = isHebrew ? 'לעיון ←' : 'Explore →';
    const types = ['big-tech','open-source','modern','government'];
    const html = types.map(t => `
      <a class="ds-bucket" data-type="${t}" href="#" onclick="window.ds.filterByType('${t}'); return false;">
        <span class="ds-bucket-count">${(counts && counts[t]) || 0}</span>
        <h3>${labels[t]}</h3>
        <span class="ds-bucket-cta">${explore}</span>
      </a>`).join('');
    const el = $('#ds-buckets'); if (el) el.innerHTML = html;
  }

  function renderCard(s) {
    const inStack = state.stack.some(x => x.slug === s.slug);
    const href = `${isHebrew ? '/he/design-systems/' : '/design-systems/'}${encodeURIComponent(s.slug)}`;
    const primary = s.primaryColor || '#2196F3';
    const palette = buildMiniPalette(primary, s.secondaryColor);
    const initials = getInitials(s.name);
    const logoInner = s.iconUrl
      ? `<img src="${esc(s.iconUrl)}" alt="" loading="lazy">`
      : esc(initials);
    return `
      <div class="ds-card">
        <a href="${href}" style="text-decoration:none;color:inherit;">
          <div class="ds-card-head">
            <div class="ds-logo-plate" style="background: ${esc(primary)};">${logoInner}</div>
            <div>
              <h3>${esc(s.name)}</h3>
              <div class="ds-card-company">${esc(s.company || '')}</div>
              <span class="ds-type-pill type-${esc(s.type || '')}">${esc((s.type || '').replace(/-/g, ' '))}</span>
            </div>
          </div>
          <div class="ds-card-desc">${esc(getDescription(s))}</div>
          <div class="ds-palette-strip" aria-hidden="true">
            ${palette.map(c => `<div class="ds-sw" style="background: ${esc(c)};"></div>`).join('')}
          </div>
        </a>
        <div class="ds-card-foot">
          ${trendArrow(s.metrics && s.metrics.weeklyGrowth)}
          ${s.trendingScore != null ? `<span style="color:#f1a200;font-weight:600;">★ ${(s.trendingScore/20).toFixed(1)}</span>` : ''}
          <button class="ds-add-stack ${inStack ? 'added' : ''}"
                  data-slug="${esc(s.slug)}"
                  data-name="${esc(s.name)}"
                  data-type="${esc(s.type || '')}"
                  data-company="${esc(s.company || '')}"
                  data-primary="${esc(primary)}">
            ${inStack ? T.added : T.addToStack}
          </button>
        </div>
      </div>`;
  }

  function showSkeletons() {
    const grid = $('#ds-grid');
    if (!grid) return;
    grid.insertAdjacentHTML('beforeend',
      Array(6).fill(0).map(() => '<div class="ds-skeleton"></div>').join(''));
  }
  function clearSkeletons() { $$('#ds-grid .ds-skeleton').forEach(n => n.remove()); }

  async function loadMore(reset = false) {
    if (state.loading) return;
    if (reset) {
      state.cursor = null; state.done = false;
      const grid = $('#ds-grid'); if (grid) grid.innerHTML = '';
    }
    if (state.done) return;
    state.loading = true;
    showSkeletons();

    const payload = Object.assign({}, state.filters, { limit: 24, cursor: state.cursor });
    Object.keys(payload).forEach(k => {
      if (payload[k] === '' || (Array.isArray(payload[k]) && !payload[k].length)) delete payload[k];
    });

    const data = await callFn('getDesignSystemsList', payload);
    clearSkeletons();
    state.loading = false;
    const grid = $('#ds-grid'); if (!grid) return;

    if (!data || !data.systems) {
      if (!grid.children.length) grid.innerHTML = `<p class="text-muted">${esc(T.noResults)}</p>`;
      state.done = true; return;
    }
    if (!data.systems.length && !grid.children.length) {
      grid.innerHTML = `<p class="text-muted">${esc(T.noResults)}</p>`;
      state.done = true; return;
    }
    grid.insertAdjacentHTML('beforeend', data.systems.map(renderCard).join(''));
    state.cursor = data.nextCursor || null;
    if (!state.cursor) state.done = true;
  }

  // ── Stack management ──────────────────────────────────────────
  function persistStack() { localStorage.setItem('designSystemsDecoded_stack', JSON.stringify(state.stack)); }
  function refreshStackPill() {
    const c = $('#ds-stack-count'); if (c) c.textContent = state.stack.length;
  }
  function toggleStack(slug, info) {
    const idx = state.stack.findIndex(s => s.slug === slug);
    if (idx >= 0) state.stack.splice(idx, 1);
    else state.stack.push(info);
    persistStack(); refreshStackPill();
    $$(`.ds-add-stack[data-slug="${slug}"]`).forEach(btn => {
      const inStack = state.stack.some(s => s.slug === slug);
      btn.classList.toggle('added', inStack);
      btn.textContent = inStack ? T.added : T.addToStack;
    });
  }
  function openStackModal() {
    const modal = $('#ds-stack-modal');
    const body = $('#ds-stack-body');
    if (!state.stack.length) {
      body.innerHTML = `<p class="text-muted">${esc(T.emptyStack)}</p>`;
    } else {
      body.innerHTML = state.stack.map(t => `
        <div class="ds-stack-item">
          <div class="ds-sw" style="width:18px;height:18px;border-radius:4px;background:${esc(t.primary || '#2196F3')};"></div>
          <strong>${esc(t.name)}</strong>
          <span class="ds-type-pill type-${esc(t.type)}">${esc((t.type || '').replace(/-/g,' '))}</span>
          <button class="ds-remove" title="${esc(T.remove)}" data-slug="${esc(t.slug)}">×</button>
        </div>`).join('');
      body.querySelectorAll('.ds-remove').forEach(btn => btn.addEventListener('click', () => {
        toggleStack(btn.dataset.slug); openStackModal();
      }));
    }
    modal.classList.add('open');
  }

  function exportStack(format) {
    if (!state.stack.length) return;
    const basePath = isHebrew ? '/he/design-systems' : '/design-systems';
    const siteRoot = 'https://www.trendingtechdaily.com';
    const date = new Date().toISOString().slice(0, 10);
    let data, type, ext;
    if (format === 'json') {
      data = JSON.stringify({
        generated_at: new Date().toISOString(),
        generator: 'Design Systems Decoded · TrendingTech Daily',
        source: siteRoot + basePath,
        comparison: state.stack.map(s => ({
          slug: s.slug,
          name: s.name,
          company: s.company,
          type: s.type,
          primaryColor: s.primary,
          url: siteRoot + basePath + '/' + s.slug,
        })),
      }, null, 2);
      type = 'application/json';
      ext = 'json';
    } else {
      const sections = state.stack.map((s, i) => {
        const url = siteRoot + basePath + '/' + s.slug;
        const lines = [];
        lines.push(`## ${i + 1}. ${s.name}`);
        lines.push('');
        const badges = [];
        if (s.company) badges.push(`**${s.company}**`);
        if (s.type) badges.push(`\`${s.type}\``);
        if (s.primary) badges.push(`Primary: \`${s.primary}\``);
        if (badges.length) { lines.push(badges.join(' · ')); lines.push(''); }
        lines.push(`[View on Design Systems Decoded →](${url})`);
        return lines.join('\n');
      });
      data = [
        `# 🎨 My Design Systems Comparison`,
        ``,
        `_Generated ${date} by **Design Systems Decoded** — TrendingTech Daily · TrendingTech Daily_`,
        ``,
        `**${state.stack.length} systems**`,
        ``,
        `---`,
        ``,
        sections.join('\n\n---\n\n'),
        ``,
        `---`,
        ``,
        `### 🔗 Discover more`,
        `Visit [Design Systems Decoded](${siteRoot + basePath}) — palettes, philosophies & Claude's verdict on every component library.`,
        ``,
      ].join('\n');
      type = 'text/markdown';
      ext = 'md';
    }
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `design-systems-${date}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Wire events ──────────────────────────────────────────────
  function wire() {
    const search = $('#ds-search');
    if (search) {
      search.addEventListener('input', debounce(e => {
        state.filters.search = e.target.value.trim();
        loadMore(true);
      }, 300));
    }
    $$('input[name="ds-type"]').forEach(r => r.addEventListener('change', e => {
      state.filters.type = e.target.value; loadMore(true);
    }));
    $$('input[name="ds-capability"]').forEach(cb => cb.addEventListener('change', () => {
      state.filters.capability = $$('input[name="ds-capability"]:checked').map(c => c.value);
      loadMore(true);
    }));
    $$('.ds-chip[data-bestfor]').forEach(chip => chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      state.filters.bestFor = $$('.ds-chip[data-bestfor].active').map(c => c.dataset.bestfor);
      loadMore(true);
    }));

    document.addEventListener('click', e => {
      const btn = e.target.closest('.ds-add-stack');
      if (btn) {
        e.preventDefault();
        toggleStack(btn.dataset.slug, {
          slug: btn.dataset.slug, name: btn.dataset.name,
          type: btn.dataset.type, company: btn.dataset.company,
          primary: btn.dataset.primary,
        });
      }
    });

    const pill = $('#ds-stack-pill'); if (pill) pill.addEventListener('click', openStackModal);
    const close = $('#ds-stack-close'); if (close) close.addEventListener('click', () => $('#ds-stack-modal').classList.remove('open'));
    const backdrop = $('#ds-stack-modal'); if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.remove('open'); });
    const expMd = $('#ds-export-md'); if (expMd) expMd.addEventListener('click', () => exportStack('md'));
    const expJson = $('#ds-export-json'); if (expJson) expJson.addEventListener('click', () => exportStack('json'));

    window.addEventListener('scroll', () => {
      if (state.loading || state.done) return;
      const nearBottom = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 600;
      if (nearBottom) loadMore();
    });
  }

  window.ds = {
    filterByType(type) {
      state.filters.type = type;
      const radio = document.querySelector(`input[name="ds-type"][value="${type}"]`);
      if (radio) radio.checked = true;
      window.scrollTo({ top: $('#ds-grid')?.offsetTop - 120 || 0, behavior: 'smooth' });
      loadMore(true);
    },
  };

  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    refreshStackPill();

    const [trending, allForCount] = await Promise.all([
      callFn('getDesignSystemsList', { limit: 5, language: langKey }),
      callFn('getDesignSystemsList', { limit: 200, language: langKey }),
    ]);
    if (trending && trending.systems) {
      const sorted = [...trending.systems].sort((a,b) => (b.trendingScore||0) - (a.trendingScore||0));
      renderTrending(sorted);
    }
    const counts = {};
    if (allForCount && allForCount.systems) {
      allForCount.systems.forEach(s => { counts[s.type] = (counts[s.type] || 0) + 1; });
    }
    renderBuckets(counts);

    loadMore(true);
  });
})();
