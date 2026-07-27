/* ===================================================================
   AI Tools Pulse — landing page client logic.
   Uses Firebase compat SDK (already loaded by parent page) and the
   `getAiToolsList` / `getAiToolDetail` / `submitAiToolReview` callables.
   =================================================================== */
(function () {
  'use strict';

  const T = window.AIP_I18N || {
    addToStack: 'Add to Stack', added: 'Added', view: 'View',
    noResults: 'No tools match these filters yet.',
    loading: 'Loading...',
    yourStack: 'Your Stack',
    exportMd: 'Export Markdown', exportJson: 'Export JSON',
    pricingMix: 'Pricing mix',
    emptyStack: 'Your stack is empty. Click "Add to Stack" on any tool card.',
    remove: 'Remove',
  };
  const isHebrew = document.documentElement.lang === 'he';
  const langKey = isHebrew ? 'he' : 'en';

  const state = {
    filters: { type: '', category: [], bestFor: [], pricing: '', search: '', language: langKey },
    cursor: null,
    loading: false,
    done: false,
    stack: JSON.parse(localStorage.getItem('aiToolsPulse_stack') || '[]'),
  };

  // ── Helpers ───────────────────────────────────────────────────
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }
  function debounce(fn, ms) {
    let t; return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
  function getDescription(tool) {
    return tool[`shortDesc_${langKey}`] || tool.shortDesc_en || tool[`description_${langKey}`] || tool.description_en || '';
  }
  function getIconHtml(t) {
    const fallback = escapeHtml(getInitials(t.name));
    if (t.iconUrl) return `<img src="${escapeHtml(t.iconUrl)}" alt="" loading="lazy">`;
    if (t.repoUrl) {
      try {
        const url = new URL(t.repoUrl);
        if (url.hostname === "github.com") {
          const parts = url.pathname.split("/").filter(Boolean);
          if (parts.length > 0) {
            return `<img src="https://github.com/${parts[0]}.png" alt="" loading="lazy" onerror="this.onerror=null; this.outerHTML='${fallback}'">`;
          }
        }
      } catch(e) {}
    }
    if (t.homepage) {
      try {
        const url = new URL(t.homepage);
        return `<img src="https://logo.clearbit.com/${url.hostname}" alt="" loading="lazy" onerror="this.onerror=null; this.outerHTML='${fallback}'">`;
      } catch (e) {}
    }
    return fallback;
  }
  function getInitials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }
  function trendArrow(growth) {
    if (growth == null) return '';
    const v = Number(growth);
    if (!isFinite(v) || v === 0) return '';
    const sign = v > 0 ? '↑' : '↓';
    const cls = v > 0 ? 'aip-trend-up' : '';
    return `<span class="${cls}">${sign} ${Math.abs(v).toFixed(0)}%</span>`;
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
  function renderTrending(tools) {
    const wrap = $('#aip-trending-track');
    if (!wrap) return;
    if (!tools || !tools.length) { wrap.innerHTML = ''; return; }
    wrap.innerHTML = tools.slice(0, 5).map(t => `
      <a class="aip-trending-card" href="${isHebrew ? '/he/ai-tools/' : '/ai-tools/'}${encodeURIComponent(t.slug)}">
        <div class="aip-icon">${getIconHtml(t)}</div>
        <div>
          <div style="font-weight:700;">${escapeHtml(t.name)}</div>
          <div class="aip-trending-meta">
            <span class="aip-pill type-${escapeHtml(t.type || '')}">${escapeHtml((t.type || '').replace(/-/g, ' '))}</span>
            ${trendArrow(t.metrics && t.metrics.weeklyStarsGrowth)}
          </div>
        </div>
      </a>`).join('');
  }

  function renderBuckets(counts) {
    const labels = isHebrew
      ? { 'claude-skill':'Claude Skills', 'mcp-connector':'מחברי MCP', 'github-repo':'מאגרי GitHub', 'llm-product':'מוצרי LLM' }
      : { 'claude-skill':'Claude Skills', 'mcp-connector':'MCP Connectors', 'github-repo':'GitHub Repos', 'llm-product':'LLM Products' };
    const explore = isHebrew ? 'לעיון ←' : 'Explore →';
    const types = ['claude-skill','mcp-connector','github-repo','llm-product'];
    const html = types.map(t => `
      <a class="aip-bucket" data-type="${t}" href="#" onclick="window.aip.filterByType('${t}'); return false;">
        <span class="aip-bucket-count">${(counts && counts[t]) || 0}</span>
        <h3>${labels[t]}</h3>
        <span class="aip-bucket-cta">${explore}</span>
      </a>`).join('');
    const el = $('#aip-buckets'); if (el) el.innerHTML = html;
  }

  function renderCard(t) {
    const inStack = state.stack.some(s => s.slug === t.slug);
    const href = `${isHebrew ? '/he/ai-tools/' : '/ai-tools/'}${encodeURIComponent(t.slug)}`;
    return `
      <div class="aip-card">
        <a href="${href}" style="text-decoration:none;color:inherit;">
          <div class="aip-card-head">
            <div class="aip-icon">${getIconHtml(t)}</div>
            <div>
              <h3>${escapeHtml(t.name)}</h3>
              <span class="aip-pill type-${escapeHtml(t.type || '')}">${escapeHtml((t.type || '').replace(/-/g, ' '))}</span>
            </div>
          </div>
          <div class="aip-card-desc">
            ${escapeHtml(getDescription(t))}
            ${t.tags && t.tags.length ? `<div class="mt-2 opacity-75">${t.tags.slice(0,3).map(tag => `<span class="badge border text-secondary fw-normal me-1 mb-1" style="font-size:0.7rem; border-color: rgba(255,255,255,0.1) !important;">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
          </div>
        </a>
        <div class="aip-card-foot">
          ${trendArrow(t.metrics && t.metrics.weeklyStarsGrowth)}
          ${t.trendingScore != null ? `<span class="aip-rating">★ ${(t.trendingScore/20).toFixed(1)}</span>` : ''}
          <button class="aip-add-stack ${inStack ? 'added' : ''}" data-slug="${escapeHtml(t.slug)}" data-name="${escapeHtml(t.name)}" data-type="${escapeHtml(t.type || '')}" data-pricing="${escapeHtml(t.pricing || '')}">
            ${inStack ? T.added : T.addToStack}
          </button>
        </div>
      </div>`;
  }

  function showSkeletons() {
    const grid = $('#aip-grid');
    if (!grid) return;
    grid.insertAdjacentHTML('beforeend',
      Array(6).fill(0).map(() => '<div class="aip-skeleton"></div>').join(''));
  }

  function clearSkeletons() { $$('#aip-grid .aip-skeleton').forEach(n => n.remove()); }

  async function loadMore(reset = false) {
    if (state.loading) return;
    if (reset) {
      state.cursor = null; state.done = false;
      const grid = $('#aip-grid'); if (grid) grid.innerHTML = '';
    }
    if (state.done) return;
    state.loading = true;
    showSkeletons();

    const payload = Object.assign({}, state.filters, { limit: 24, cursor: state.cursor });
    Object.keys(payload).forEach(k => {
      if (payload[k] === '' || (Array.isArray(payload[k]) && !payload[k].length)) delete payload[k];
    });

    const data = await callFn('getAiToolsList', payload);
    clearSkeletons();
    state.loading = false;
    const grid = $('#aip-grid'); if (!grid) return;

    if (!data || !data.tools) {
      if (!grid.children.length) grid.innerHTML = `<p class="text-muted">${escapeHtml(T.noResults)}</p>`;
      state.done = true; return;
    }
    if (!data.tools.length && !grid.children.length) {
      grid.innerHTML = `<p class="text-muted">${escapeHtml(T.noResults)}</p>`;
      state.done = true; return;
    }
    grid.insertAdjacentHTML('beforeend', data.tools.map(renderCard).join(''));
    state.cursor = data.nextCursor || null;
    if (!state.cursor) state.done = true;
  }

  // ── Stack management ──────────────────────────────────────────
  function persistStack() { localStorage.setItem('aiToolsPulse_stack', JSON.stringify(state.stack)); }
  function refreshStackPill() {
    const c = $('#aip-stack-count'); if (c) c.textContent = state.stack.length;
  }
  function toggleStack(slug, info) {
    const idx = state.stack.findIndex(s => s.slug === slug);
    if (idx >= 0) state.stack.splice(idx, 1);
    else state.stack.push(info);
    persistStack(); refreshStackPill();
    // update card buttons
    $$(`.aip-add-stack[data-slug="${slug}"]`).forEach(btn => {
      const inStack = state.stack.some(s => s.slug === slug);
      btn.classList.toggle('added', inStack);
      btn.textContent = inStack ? T.added : T.addToStack;
    });
  }
  function openStackModal() {
    const modal = $('#aip-stack-modal');
    const body = $('#aip-stack-body');
    if (!state.stack.length) {
      body.innerHTML = `<p class="text-muted">${escapeHtml(T.emptyStack)}</p>`;
    } else {
      const mix = state.stack.reduce((m, t) => { m[t.pricing || 'unknown'] = (m[t.pricing || 'unknown'] || 0) + 1; return m; }, {});
      const mixLine = Object.entries(mix).map(([k, v]) => `${escapeHtml(k)}: ${v}`).join(' · ');
      body.innerHTML = `
        <p class="text-muted small mb-3"><strong>${escapeHtml(T.pricingMix)}:</strong> ${mixLine}</p>
        ${state.stack.map(t => `
          <div class="aip-stack-item">
            <strong>${escapeHtml(t.name)}</strong>
            <span class="aip-pill type-${escapeHtml(t.type)}">${escapeHtml(t.type.replace(/-/g,' '))}</span>
            <button class="aip-remove" title="${escapeHtml(T.remove)}" data-slug="${escapeHtml(t.slug)}">×</button>
          </div>`).join('')}`;
      body.querySelectorAll('.aip-remove').forEach(btn => btn.addEventListener('click', () => {
        toggleStack(btn.dataset.slug); openStackModal();
      }));
    }
    modal.classList.add('open');
  }
  async function fetchToolDetail(slug) {
    try {
      const fn = firebase.functions().httpsCallable('getAiToolDetail');
      const res = await fn({ slug, language: isHebrew ? 'he' : 'en' });
      return (res && res.data && res.data.tool) ? res.data.tool : null;
    } catch (_) { return null; }
  }

  async function exportStack(format) {
    if (!state.stack.length) return;
    // Show busy state on the clicked button
    const btnSel = format === 'json' ? '#aip-export-json' : '#aip-export-md';
    const btn = $(btnSel);
    const origLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Preparing…'; }

    // Enrich each stack item with full tool details (description, Claude's Take, bestFor, install)
    const enriched = await Promise.all(state.stack.map(async (s) => {
      const full = await fetchToolDetail(s.slug);
      return Object.assign({}, s, full || {});
    }));

    const basePath = isHebrew ? '/he/ai-tools' : '/ai-tools';
    const siteRoot = 'https://trendingtech-daily.web.app';
    const date = new Date().toISOString().slice(0, 10);

    let data, type, ext;
    if (format === 'json') {
      // Compact, well-shaped JSON for programmatic consumers
      const payload = {
        generated_at: new Date().toISOString(),
        generator: 'AI Tools Pulse · TrendingTech Daily',
        source: siteRoot + basePath,
        stack: enriched.map(t => ({
          slug: t.slug,
          name: t.name,
          type: t.type,
          category: t.category || null,
          pricing: t.pricing || null,
          bestFor: t.bestFor || [],
          tags: t.tags || [],
          shortDesc: t.shortDesc || null,
          description: t.description || null,
          claudeTake: t.claudeTake || null,
          claudeTakeBy: t.claudeTakeBy || null,
          trendingScore: t.trendingScore || 0,
          homepage: t.homepage || null,
          repoUrl: t.repoUrl || null,
          installCommand: t.installCommand || null,
          url: siteRoot + basePath + '/' + t.slug,
        })),
      };
      data = JSON.stringify(payload, null, 2);
      type = 'application/json';
      ext = 'json';
    } else {
      // Pretty Markdown — proper artifact, not a bare list.
      const mix = enriched.reduce((m, t) => { m[t.pricing || 'unknown'] = (m[t.pricing || 'unknown'] || 0) + 1; return m; }, {});
      const mixLine = Object.entries(mix).map(([k, v]) => `\`${k}\` × ${v}`).join(' · ');

      const sections = enriched.map((t, i) => {
        const url = siteRoot + basePath + '/' + t.slug;
        const lines = [];
        lines.push(`## ${i + 1}. ${t.name}`);
        lines.push('');
        const badges = [];
        if (t.type) badges.push(`\`${t.type}\``);
        if (t.category) badges.push(`\`${t.category}\``);
        if (t.pricing) badges.push(`\`${t.pricing}\``);
        if (t.trendingScore != null) badges.push(`🔥 ${t.trendingScore}/100`);
        if (badges.length) { lines.push(badges.join(' · ')); lines.push(''); }
        if (t.shortDesc) { lines.push(`> ${t.shortDesc}`); lines.push(''); }
        if (t.description) { lines.push(t.description); lines.push(''); }
        if (t.claudeTake) {
          lines.push(`**🌟 Claude's Take**`);
          lines.push('');
          lines.push(`> _${t.claudeTake}_`);
          lines.push('');
        }
        if (t.bestFor && t.bestFor.length) {
          lines.push(`**Best for:** ${t.bestFor.map(b => '`' + b + '`').join(' · ')}`);
          lines.push('');
        }
        if (t.installCommand) {
          lines.push('**Install / get started:**');
          lines.push('```bash');
          lines.push(t.installCommand);
          lines.push('```');
          lines.push('');
        }
        const links = [];
        if (t.homepage) links.push(`[Homepage](${t.homepage})`);
        if (t.repoUrl) links.push(`[Repo](${t.repoUrl})`);
        links.push(`[View on AI Tools Pulse →](${url})`);
        lines.push(links.join(' · '));
        return lines.join('\n');
      });

      data = [
        `# 🌟 My AI Stack`,
        ``,
        `_Generated ${date} by **AI Tools Pulse** — TrendingTech Daily · Powered by Claude_`,
        ``,
        `**${enriched.length} tools** · Pricing mix: ${mixLine || 'n/a'}`,
        ``,
        `---`,
        ``,
        sections.join('\n\n---\n\n'),
        ``,
        `---`,
        ``,
        `### 🔗 Discover more`,
        `Visit [AI Tools Pulse](${siteRoot + basePath}) — the only directory that unifies Claude Skills, MCP connectors, trending GitHub repos & LLM products.`,
        ``,
        `_Powered by Claude · Curated by TrendingTech Daily_`,
        ``,
      ].join('\n');
      type = 'text/markdown';
      ext = 'md';
    }

    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ai-stack-${date}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);

    if (btn) { btn.disabled = false; btn.innerHTML = origLabel; }
  }

  // ── Event wiring ─────────────────────────────────────────────
  function wire() {
    const search = $('#aip-search');
    if (search) {
      search.addEventListener('input', debounce(e => {
        state.filters.search = e.target.value.trim();
        loadMore(true);
      }, 300));
    }

    $$('input[name="aip-type"]').forEach(r => r.addEventListener('change', e => {
      state.filters.type = e.target.value; loadMore(true);
    }));
    $$('input[name="aip-pricing"]').forEach(r => r.addEventListener('change', e => {
      state.filters.pricing = e.target.value; loadMore(true);
    }));
    $$('input[name="aip-category"]').forEach(cb => cb.addEventListener('change', () => {
      state.filters.category = $$('input[name="aip-category"]:checked').map(c => c.value);
      loadMore(true);
    }));
    $$('.aip-chip[data-bestfor]').forEach(chip => chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      state.filters.bestFor = $$('.aip-chip[data-bestfor].active').map(c => c.dataset.bestfor);
      loadMore(true);
    }));

    // delegated stack-button clicks
    document.addEventListener('click', e => {
      const btn = e.target.closest('.aip-add-stack');
      if (btn) {
        e.preventDefault();
        toggleStack(btn.dataset.slug, {
          slug: btn.dataset.slug, name: btn.dataset.name,
          type: btn.dataset.type, pricing: btn.dataset.pricing,
        });
      }
    });

    const pill = $('#aip-stack-pill'); if (pill) pill.addEventListener('click', openStackModal);
    const close = $('#aip-stack-close'); if (close) close.addEventListener('click', () => $('#aip-stack-modal').classList.remove('open'));
    const backdrop = $('#aip-stack-modal'); if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.classList.remove('open'); });
    const expMd = $('#aip-export-md'); if (expMd) expMd.addEventListener('click', () => exportStack('md'));
    const expJson = $('#aip-export-json'); if (expJson) expJson.addEventListener('click', () => exportStack('json'));

    // infinite scroll
    window.addEventListener('scroll', () => {
      if (state.loading || state.done) return;
      const nearBottom = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 600;
      if (nearBottom) loadMore();
    });
  }

  window.aip = {
    filterByType(type) {
      state.filters.type = type;
      const radio = document.querySelector(`input[name="aip-type"][value="${type}"]`);
      if (radio) radio.checked = true;
      window.scrollTo({ top: $('#aip-grid')?.offsetTop - 120 || 0, behavior: 'smooth' });
      loadMore(true);
    },
  };

  // ── Init ─────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    refreshStackPill();

    // Initial parallel loads: trending (top 5) + buckets counts + first page
    const [trending, allForCount] = await Promise.all([
      callFn('getAiToolsList', { limit: 5, language: langKey }),
      callFn('getAiToolsList', { limit: 200, language: langKey }),
    ]);
    if (trending && trending.tools) {
      const sorted = [...trending.tools].sort((a,b) => (b.trendingScore||0) - (a.trendingScore||0));
      renderTrending(sorted);
    }
    const counts = {};
    if (allForCount && allForCount.tools) {
      allForCount.tools.forEach(t => { counts[t.type] = (counts[t.type] || 0) + 1; });
    }
    renderBuckets(counts);

    loadMore(true);
  });
})();
