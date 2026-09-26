/* AI Tools Pulse — Glossary client.
 * Loads terms via firebase.functions().httpsCallable('getAiGlossary'),
 * renders into category sections, and supports a debounced search +
 * sticky category chips. RTL-aware. */
(function () {
  'use strict';

  const LANG = (window.AIG_LANG === 'he' || document.documentElement.lang === 'he') ? 'he' : 'en';
  const IS_HE = LANG === 'he';
  const TYPE_LABELS_EN = {
    'claude-skill': 'Claude Skill', 'mcp-connector': 'MCP', 'github-repo': 'GitHub',
    'llm-product': 'LLM', 'agent-framework': 'Agent',
  };
  const TYPE_LABELS_HE = {
    'claude-skill': 'Claude Skill', 'mcp-connector': 'MCP', 'github-repo': 'GitHub',
    'llm-product': 'LLM', 'agent-framework': 'סוכן',
  };
  const TYPE_LABELS = IS_HE ? TYPE_LABELS_HE : TYPE_LABELS_EN;
  const T = {
    aliases: IS_HE ? 'גם ידוע כ' : 'aka',
    empty: IS_HE ? 'לא נמצאו מונחים שתואמים לסינון.' : 'No terms match that filter.',
  };

  function ensureFirebase() {
    if (window.firebase && firebase.apps && firebase.apps.length) return Promise.resolve();
    if (window.firebase && typeof firebase.initializeApp === 'function' && window.firebaseConfig) {
      firebase.initializeApp(window.firebaseConfig);
      return Promise.resolve();
    }
    // Try to wait briefly for app-base.js to init.
    return new Promise((resolve) => {
      let tries = 0;
      const iv = setInterval(() => {
        tries++;
        if (window.firebase && firebase.apps && firebase.apps.length) {
          clearInterval(iv); resolve();
        } else if (tries > 30) {
          clearInterval(iv); resolve();
        }
      }, 100);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function cardHtml(item) {
    const term = IS_HE ? (item.term_he || item.term_en) : item.term_en;
    const def = IS_HE ? (item.definition_he || item.definition_en) : item.definition_en;
    const aliases = Array.isArray(item.aliases) && item.aliases.length
      ? `<span class="aig-aliases">${esc(T.aliases)}: ${item.aliases.map(esc).join(', ')}</span>`
      : '';
    const related = Array.isArray(item.relatedTools) && item.relatedTools.length
      ? `<div class="aig-related">${item.relatedTools.slice(0, 4).map((slug) =>
          `<a class="aig-related-chip" href="${IS_HE ? '/he' : ''}/ai-tools/${esc(slug)}">${esc(slug)}</a>`
        ).join('')}</div>`
      : '';
    return `<article class="aig-card" id="${esc(item.slug)}" data-cat="${esc(item.category)}" data-search="${esc((term + ' ' + (item.aliases || []).join(' ') + ' ' + item.slug).toLowerCase())}">
      <h3 class="aig-term">${esc(term)}</h3>
      <p class="aig-def">${esc(def)}</p>
      ${aliases}
      ${related}
    </article>`;
  }

  function render(items) {
    const byCat = { core: [], models: [], agents: [], developer: [] };
    items.forEach((it) => {
      const c = it.category || 'core';
      (byCat[c] = byCat[c] || []).push(it);
    });
    Object.keys(byCat).forEach((cat) => {
      const grid = document.querySelector(`.aig-grid[data-grid-cat="${cat}"]`);
      const count = document.querySelector(`.aig-count[data-count-cat="${cat}"]`);
      if (!grid) return;
      grid.innerHTML = byCat[cat].map(cardHtml).join('');
      if (count) count.textContent = `(${byCat[cat].length})`;
    });
  }

  function applyFilter(query, cat) {
    const q = String(query || '').trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll('.aig-card').forEach((el) => {
      const matchesQ = !q || (el.dataset.search || '').includes(q);
      const matchesCat = !cat || cat === 'all' || el.dataset.cat === cat;
      const show = matchesQ && matchesCat;
      el.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    document.querySelectorAll('.aig-section').forEach((s) => {
      const grid = s.querySelector('.aig-grid');
      const hasVisible = grid && Array.prototype.some.call(grid.children, (c) => c.style.display !== 'none');
      s.style.display = hasVisible ? '' : 'none';
    });
    const empty = document.getElementById('aig-empty');
    if (empty) empty.style.display = visible === 0 ? '' : 'none';
  }

  function debounce(fn, ms) {
    let t; return function () {
      const args = arguments; clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  async function loadGlossary() {
    await ensureFirebase();
    try {
      const callable = firebase.functions().httpsCallable('getAiGlossary');
      const res = await callable({ language: LANG });
      return (res && res.data && Array.isArray(res.data.items)) ? res.data.items : [];
    } catch (err) {
      console.warn('[aig] getAiGlossary failed', err);
      return [];
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('aig-search');
    const chips = document.querySelectorAll('.aig-chips .aip-chip');
    let activeCat = 'all';

    const items = await loadGlossary();
    if (!items.length) {
      const empty = document.getElementById('aig-empty');
      if (empty) { empty.style.display = ''; empty.textContent = T.empty; }
      return;
    }
    render(items);

    if (input) {
      input.addEventListener('input', debounce(() => applyFilter(input.value, activeCat), 200));
    }
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        chips.forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        activeCat = chip.getAttribute('data-cat') || 'all';
        applyFilter(input ? input.value : '', activeCat);
      });
    });
  });
})();
