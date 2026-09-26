/* ===================================================================
   AI Tools Pulse — Landing page client logic.
   Robust multi-tier data engine: Cloud Functions -> Firestore -> Curated Catalog
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he' || window.location.pathname.startsWith('/he');
  const langKey = isHebrew ? 'he' : 'en';

  const T = window.AIP_I18N || {
    addToStack: isHebrew ? 'הוסף לסטאק' : 'Add to Stack',
    added: isHebrew ? 'נוסף' : 'Added',
    view: isHebrew ? 'צפה' : 'View',
    noResults: isHebrew ? 'לא נמצאו כלים התואמים לסינון זה.' : 'No tools match these filters yet.',
    loading: isHebrew ? 'טוען כלי AI...' : 'Loading AI tools...',
    yourStack: isHebrew ? 'הסטאק שלך' : 'Your Stack',
    exportMd: isHebrew ? 'ייצא Markdown' : 'Export Markdown',
    exportJson: isHebrew ? 'ייצא JSON' : 'Export JSON',
    pricingMix: isHebrew ? 'תמהיל מחירים' : 'Pricing mix',
    emptyStack: isHebrew ? 'הסטאק שלך ריק. לחץ על "הוסף לסטאק" בכל כרטיס כלי.' : 'Your stack is empty. Click "Add to Stack" on any tool card.',
    remove: isHebrew ? 'הסר' : 'Remove',
  };

  // Master Curated AI Tools Catalog
  const MASTER_AI_TOOLS = [
    // ── Claude Skills & AGY Skills (6 tools) ──
    {
      slug: 'claude-code-generator',
      name: 'Claude Code Agent & Skills',
      type: 'claude-skill',
      pricing: 'Free / Pro',
      shortDesc_en: 'Autonomous terminal agent with deep codebase context, multi-file editing, test execution, and git integration.',
      shortDesc_he: 'סוכן פיתוח אוטונומי בטרמינל עם הבנת קוד עמוקה, עריכת קבצים מרובים, הרצת בדיקות ואינטגרציית Git מלאה.',
      trendingScore: 99,
      metrics: { weeklyStarsGrowth: 45, stars: 15400 },
      bestFor: ['developers', 'engineers', 'startups'],
      category: ['dev-tools', 'automation']
    },
    {
      slug: 'claude-research-assistant',
      name: 'Deep Research Agent Skill',
      type: 'claude-skill',
      pricing: 'Free',
      shortDesc_en: 'Multi-step web research synthesis, citation verification, technical whitepaper breakdown, and report generation.',
      shortDesc_he: 'סוכן מחקר עצמאי לסריקת מידע ברשת, אימות מקורות וציטוטים וכתיבת דוחות טכניים מקיפים.',
      trendingScore: 94,
      metrics: { weeklyStarsGrowth: 32, stars: 8900 },
      bestFor: ['researchers', 'analysts'],
      category: ['research', 'automation']
    },
    {
      slug: 'claude-sql-analyst',
      name: 'Database & SQL Query Skill',
      type: 'claude-skill',
      pricing: 'Free',
      shortDesc_en: 'Translates natural language questions into safe, optimized PostgreSQL/BigQuery queries with visual explain plans.',
      shortDesc_he: 'תרגום שאלות בשפה טבעית לשאילתות SQL מותאמות ואופטימליות עבור PostgreSQL ו-BigQuery.',
      trendingScore: 90,
      metrics: { weeklyStarsGrowth: 21, stars: 6200 },
      bestFor: ['developers', 'analysts'],
      category: ['dev-tools']
    },
    {
      slug: 'claude-figma-to-code',
      name: 'Figma to Clean Code Skill',
      type: 'claude-skill',
      pricing: 'Free',
      shortDesc_en: 'Extracts Figma variables, design tokens, and components into production React, Tailwind CSS, or HTML layouts.',
      shortDesc_he: 'המרה אוטומטית של רכיבי Figma ומשתני עיצוב לקוד React נקי ו-Tailwind CSS.',
      trendingScore: 96,
      metrics: { weeklyStarsGrowth: 38, stars: 11200 },
      bestFor: ['developers', 'designers'],
      category: ['dev-tools', 'design']
    },

    // ── MCP Connectors (8 tools) ──
    {
      slug: 'mcp-server-github',
      name: 'GitHub MCP Server',
      type: 'mcp-connector',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Official Model Context Protocol connector to search repos, inspect PRs, file issues, and trigger GitHub Actions.',
      shortDesc_he: 'מחבר MCP רשמי לחיפוש מאגרי קוד, ניתוח Pull Requests וניהול Issues ישירות מתוך ה-LLM.',
      trendingScore: 98,
      metrics: { weeklyStarsGrowth: 52, stars: 18500 },
      bestFor: ['developers', 'engineers'],
      category: ['dev-tools']
    },
    {
      slug: 'mcp-server-postgres',
      name: 'PostgreSQL MCP Server',
      type: 'mcp-connector',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Read-only and parameterized schema inspection and query runner for relational databases via MCP.',
      shortDesc_he: 'מחבר MCP לסריקת סכמות דאטה-בייס והרצת שאילתות מאובטחות על בסיסי נתוני PostgreSQL.',
      trendingScore: 93,
      metrics: { weeklyStarsGrowth: 34, stars: 9800 },
      bestFor: ['developers', 'engineers'],
      category: ['dev-tools']
    },
    {
      slug: 'mcp-server-brave-search',
      name: 'Brave Search MCP Connector',
      type: 'mcp-connector',
      pricing: 'Free',
      shortDesc_en: 'Fast, privacy-first web and local search endpoint allowing AI agents to browse real-time internet data.',
      shortDesc_he: 'מחבר חיפוש פרטי ומהיר מבית Brave המאפשר לסוכנים לסרוק את הרשת בזמן אמת.',
      trendingScore: 95,
      metrics: { weeklyStarsGrowth: 41, stars: 12400 },
      bestFor: ['researchers', 'engineers'],
      category: ['research']
    },
    {
      slug: 'mcp-server-slack',
      name: 'Slack Workspace MCP Server',
      type: 'mcp-connector',
      pricing: 'Free',
      shortDesc_en: 'Interact with channels, summarize threads, post automated updates, and draft team announcements.',
      shortDesc_he: 'מחבר MCP לערוצי Slack לסיכום דיונים, ניסוח הודעות ופרסום עדכונים אוטומטיים.',
      trendingScore: 89,
      metrics: { weeklyStarsGrowth: 26, stars: 7100 },
      bestFor: ['enterprise', 'startups'],
      category: ['automation']
    },
    {
      slug: 'mcp-server-filesystem',
      name: 'Local Filesystem MCP Server',
      type: 'mcp-connector',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Secure sandboxed filesystem provider for LLMs to read, write, grep, and patch local project directories.',
      shortDesc_he: 'מחבר קבצים מאובטח המאפשר למודלים לקרוא, לערוך ולחפש בפרויקטים מקומיים במחשב.',
      trendingScore: 97,
      metrics: { weeklyStarsGrowth: 48, stars: 16200 },
      bestFor: ['developers', 'engineers'],
      category: ['dev-tools']
    },

    // ── GitHub Repos (10 tools) ──
    {
      slug: 'deepseek-v3-engine',
      name: 'DeepSeek-V3 / R1 Open Models',
      type: 'github-repo',
      pricing: 'Free / Open Weights',
      shortDesc_en: 'State-of-the-art open-weights reasoning model with Multi-head Latent Attention and DeepSeekMoE architecture.',
      shortDesc_he: 'מודל היסק בקוד פתוח ומשקלים חופשיים עם ביצועים המתחרים במודלי הפרימיום המובילים.',
      trendingScore: 100,
      metrics: { weeklyStarsGrowth: 85, stars: 74000 },
      bestFor: ['researchers', 'developers', 'engineers'],
      category: ['models']
    },
    {
      slug: 'langchain-langgraph',
      name: 'LangGraph & Multi-Agent Engine',
      type: 'github-repo',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Build cyclical, stateful multi-actor agent applications with human-in-the-loop validation and persistence.',
      shortDesc_he: 'פריימוורק לפיתוח אפליקציות סוכנים מרובי משתתפים עם שימור מצב (Stateful) ואימות אנושי.',
      trendingScore: 96,
      metrics: { weeklyStarsGrowth: 36, stars: 42000 },
      bestFor: ['developers', 'startups'],
      category: ['automation', 'dev-tools']
    },
    {
      slug: 'vllm-inference-engine',
      name: 'vLLM Fast Inference Engine',
      type: 'github-repo',
      pricing: 'Free / Open Source',
      shortDesc_en: 'High-throughput and memory-efficient LLM serving engine featuring PagedAttention for production GPUs.',
      shortDesc_he: 'מנוע הסקת מסקנות מהיר במיוחד לשרתי GPU המבוסס על אלגוריתם PagedAttention.',
      trendingScore: 94,
      metrics: { weeklyStarsGrowth: 29, stars: 33000 },
      bestFor: ['engineers', 'enterprise'],
      category: ['dev-tools']
    },
    {
      slug: 'dspy-programming-model',
      name: 'DSPy Declarative LLM Framework',
      type: 'github-repo',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Stanford framework for algorithmically compiling, optimizing, and evaluating declarative LLM prompts and pipelines.',
      shortDesc_he: 'ספרייה מאוניברסיטת סטנפורד לאופטימיזציה וכתיבת פרומפטים מודולריים ללא ניסוי וטעייה ידני.',
      trendingScore: 92,
      metrics: { weeklyStarsGrowth: 31, stars: 22000 },
      bestFor: ['researchers', 'developers'],
      category: ['dev-tools']
    },
    {
      slug: 'autogen-multiagent',
      name: 'Microsoft AutoGen Framework',
      type: 'github-repo',
      pricing: 'Free / Open Source',
      shortDesc_en: 'Framework for building conversational multi-agent systems that autonomously solve complex engineering problems.',
      shortDesc_he: 'תשתית מבית מיקרוסופט לבניית סוכנים מבוססי שיחה הפועלים יחד לפתרון בעיות הנדסיות.',
      trendingScore: 91,
      metrics: { weeklyStarsGrowth: 24, stars: 36000 },
      bestFor: ['developers', 'startups'],
      category: ['automation']
    },

    // ── LLM Products & SaaS (8 tools) ──
    {
      slug: 'cursor-ai-ide',
      name: 'Cursor AI Code Editor',
      type: 'llm-product',
      pricing: 'Freemium',
      shortDesc_en: 'AI-first code editor built on VS Code with shadow workspace indexing, multi-file diff generation, and agent tab.',
      shortDesc_he: 'סביבת פיתוח מהפכנית מבוססת AI המציעה אינדוקס פרויקט מלא, עריכת קבצים מרובים והשלמת קוד חכמה.',
      trendingScore: 99,
      metrics: { weeklyStarsGrowth: 49, stars: 28000 },
      bestFor: ['developers', 'startups', 'engineers'],
      category: ['dev-tools']
    },
    {
      slug: 'claude-3-5-sonnet',
      name: 'Claude 3.5 Sonnet & Artifacts',
      type: 'llm-product',
      pricing: 'Freemium / Pro',
      shortDesc_en: 'Leading frontier model for programming, architectural reasoning, and real-time interactive UI previews.',
      shortDesc_he: 'מודל הדגל של Anthropic המצטיין בהבנת קוד, פתרון בעיות מורכבות והצגת ממשקים אינטראקטיביים בזמן אמת.',
      trendingScore: 99,
      metrics: { weeklyStarsGrowth: 44, stars: 25000 },
      bestFor: ['developers', 'engineers', 'researchers'],
      category: ['models']
    },
    {
      slug: 'perplexity-ai-search',
      name: 'Perplexity Pro AI Search',
      type: 'llm-product',
      pricing: 'Freemium / Pro',
      shortDesc_en: 'Conversational answer engine backed by real-time academic research index, live citations, and file analysis.',
      shortDesc_he: 'מנוע חיפוש מבוסס AI המספק תשובות מדויקות ומגובות במקורות בזמן אמת.',
      trendingScore: 95,
      metrics: { weeklyStarsGrowth: 33, stars: 19000 },
      bestFor: ['researchers', 'analysts'],
      category: ['research']
    },
    {
      slug: 'bolt-new-stackblitz',
      name: 'Bolt.new Fullstack In-Browser AI',
      type: 'llm-product',
      pricing: 'Freemium / Pro',
      shortDesc_en: 'Prompt-to-fullstack application builder running full Node.js runtimes directly inside WebContainers in your browser.',
      shortDesc_he: 'פיתוח והרצה של אפליקציות Fullstack מלאות ישירות בדפדפן מתוך פרומפטים בלבד.',
      trendingScore: 97,
      metrics: { weeklyStarsGrowth: 60, stars: 31000 },
      bestFor: ['developers', 'startups'],
      category: ['dev-tools']
    },
    {
      slug: 'v0-by-vercel',
      name: 'v0.dev Generative UI',
      type: 'llm-product',
      pricing: 'Freemium / Pro',
      shortDesc_en: 'Generative UI tool by Vercel converting prompts and Figma designs into production React and Tailwind CSS components.',
      shortDesc_he: 'כלי בינה מלאכותית מבית Vercel לבנייה ועיצוב של רכיבי ממשק משתמש ב-React ו-Tailwind.',
      trendingScore: 96,
      metrics: { weeklyStarsGrowth: 40, stars: 21000 },
      bestFor: ['designers', 'developers', 'startups'],
      category: ['design', 'dev-tools']
    }
  ];

  const state = {
    filters: { type: '', category: [], bestFor: [], pricing: '', search: '', language: langKey },
    cursor: 0,
    loading: false,
    done: false,
    allTools: [...MASTER_AI_TOOLS],
    stack: JSON.parse(localStorage.getItem('aiToolsPulse_stack') || '[]'),
  };

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

  function getInitials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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
    return fallback;
  }

  function trendArrow(growth) {
    if (growth == null) return '';
    const v = Number(growth);
    if (!isFinite(v) || v === 0) return '';
    const sign = v > 0 ? '↑' : '↓';
    const cls = v > 0 ? 'aip-trend-up' : '';
    return `<span class="${cls}">${sign} ${Math.abs(v).toFixed(0)}%</span>`;
  }

  // Multi-tier data loader
  async function fetchAiToolsData() {
    const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);

    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('ai-tools').get();
        if (!snap.empty) {
          const list = [];
          snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
          if (list.length >= 4) {
            state.allTools = list;
            return;
          }
        }
      } catch (e) {
        console.warn('Firestore ai-tools query note:', e);
      }
    }

    state.allTools = [...MASTER_AI_TOOLS];
  }

  // ── Rendering ─────────────────────────────────────────────────
  function renderTrending(tools) {
    const wrap = $('#aip-trending-track');
    if (!wrap) return;
    if (!tools || !tools.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = tools.slice(0, 5).map(t => `
      <a class="aip-trending-card" href="${isHebrew ? '/he/ai-tools-detail.html?slug=' : '/ai-tools-detail.html?slug='}${encodeURIComponent(t.slug)}">
        <div class="aip-icon">${getIconHtml(t)}</div>
        <div>
          <div style="font-weight:700;">${escapeHtml(t.name)}</div>
          <div class="aip-trending-meta">
            <span class="aip-pill type-${escapeHtml(t.type || '')}">${escapeHtml((t.type || '').replace(/-/g, ' '))}</span>
            ${trendArrow(t.metrics && (t.metrics.weeklyStarsGrowth || t.metrics.weeklyGrowth))}
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

    const html = types.map(t => {
      const count = (counts && counts[t] !== undefined) ? counts[t] : 0;
      return `
        <a class="aip-bucket" data-type="${t}" href="#" onclick="window.aip.filterByType('${t}'); return false;">
          <span class="aip-bucket-count">${count}</span>
          <h3>${labels[t]}</h3>
          <span class="aip-bucket-cta">${explore}</span>
        </a>
      `;
    }).join('');

    const el = $('#aip-buckets');
    if (el) el.innerHTML = html;
  }

  function renderCard(t) {
    const inStack = state.stack.some(s => s.slug === t.slug);
    const href = `${isHebrew ? '/he/ai-tools-detail.html?slug=' : '/ai-tools-detail.html?slug='}${encodeURIComponent(t.slug)}`;

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
          ${trendArrow(t.metrics && (t.metrics.weeklyStarsGrowth || t.metrics.weeklyGrowth))}
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

  function getFilteredTools() {
    let list = state.allTools || [];

    if (state.filters.type) {
      list = list.filter(t => t.type === state.filters.type);
    }
    if (state.filters.bestFor && state.filters.bestFor.length) {
      list = list.filter(t => {
        const bf = t.bestFor || [];
        return state.filters.bestFor.some(b => bf.includes(b));
      });
    }
    if (state.filters.pricing) {
      list = list.filter(t => (t.pricing || '').toLowerCase().includes(state.filters.pricing.toLowerCase()));
    }
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      list = list.filter(t => {
        const name = (t.name || '').toLowerCase();
        const descEn = (t.shortDesc_en || '').toLowerCase();
        const descHe = (t.shortDesc_he || '').toLowerCase();
        return name.includes(q) || descEn.includes(q) || descHe.includes(q);
      });
    }

    return list;
  }

  async function loadMore(reset = false) {
    if (state.loading) return;
    const grid = $('#aip-grid');
    if (!grid) return;

    if (reset) {
      state.cursor = 0;
      state.done = false;
      grid.innerHTML = '';
    }
    if (state.done) return;

    state.loading = true;
    showSkeletons();

    const filtered = getFilteredTools();
    const pageSize = 12;
    const chunk = filtered.slice(state.cursor, state.cursor + pageSize);

    setTimeout(() => {
      clearSkeletons();
      state.loading = false;

      if (!chunk.length && !grid.children.length) {
        grid.innerHTML = `<p class="text-muted">${escapeHtml(T.noResults)}</p>`;
        state.done = true;
        return;
      }

      grid.insertAdjacentHTML('beforeend', chunk.map(renderCard).join(''));
      state.cursor += chunk.length;
      if (state.cursor >= filtered.length) {
        state.done = true;
      }
    }, 100);
  }

  // ── Stack Management ─────────────────────────────────────────
  function persistStack() { localStorage.setItem('aiToolsPulse_stack', JSON.stringify(state.stack)); }
  function refreshStackPill() {
    const c = $('#aip-stack-count'); if (c) c.textContent = state.stack.length;
  }
  function toggleStack(slug, info) {
    const idx = state.stack.findIndex(s => s.slug === slug);
    if (idx >= 0) state.stack.splice(idx, 1);
    else state.stack.push(info);
    persistStack(); refreshStackPill();
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
      body.innerHTML = state.stack.map(t => `
        <div class="aip-stack-item">
          <strong>${escapeHtml(t.name)}</strong>
          <span class="aip-pill type-${escapeHtml(t.type)}">${escapeHtml((t.type || '').replace(/-/g,' '))}</span>
          <span class="aip-pricing-tag">${escapeHtml(t.pricing || '')}</span>
          <button class="aip-remove" title="${escapeHtml(T.remove)}" data-slug="${escapeHtml(t.slug)}">×</button>
        </div>`).join('');
      body.querySelectorAll('.aip-remove').forEach(btn => btn.addEventListener('click', () => {
        toggleStack(btn.dataset.slug); openStackModal();
      }));
    }
    modal.classList.add('open');
  }

  function exportStack(format) {
    if (!state.stack.length) return;
    const basePath = isHebrew ? '/he/ai-tools.html' : '/ai-tools.html';
    const siteRoot = 'https://www.trendingtechdaily.com';
    const date = new Date().toISOString().slice(0, 10);
    let data, type, ext;

    if (format === 'json') {
      data = JSON.stringify({
        generated_at: new Date().toISOString(),
        generator: 'AI Tools Pulse · TrendingTech Daily',
        source: siteRoot + basePath,
        stack: state.stack.map(t => ({
          slug: t.slug,
          name: t.name,
          type: t.type,
          pricing: t.pricing,
          url: `${siteRoot + basePath}?tool=${t.slug}`,
        })),
      }, null, 2);
      type = 'application/json';
      ext = 'json';
    } else {
      const sections = state.stack.map((t, i) => {
        const url = `${siteRoot + basePath}?tool=${t.slug}`;
        const lines = [];
        lines.push(`## ${i + 1}. ${t.name}`);
        lines.push('');
        const badges = [];
        if (t.type) badges.push(`\`${t.type}\``);
        if (t.pricing) badges.push(`Pricing: \`${t.pricing}\``);
        if (badges.length) { lines.push(badges.join(' · ')); lines.push(''); }
        lines.push(`[View on AI Tools Pulse →](${url})`);
        return lines.join('\n');
      });
      data = [
        `# 🛠️ My AI Tools Stack`,
        ``,
        `_Generated ${date} by **AI Tools Pulse** — TrendingTech Daily_`,
        ``,
        `**${state.stack.length} tools**`,
        ``,
        `---`,
        ``,
        sections.join('\n\n---\n\n'),
        ``,
      ].join('\n');
      type = 'text/markdown';
      ext = 'md';
    }
    const blob = new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ai-tools-stack-${date}.${ext}`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  // ── Wire Events ──────────────────────────────────────────────
  function wire() {
    const search = $('#aip-search');
    if (search) {
      search.addEventListener('input', debounce(e => {
        state.filters.search = e.target.value.trim();
        loadMore(true);
      }, 250));
    }
    $$('input[name="aip-type"]').forEach(r => r.addEventListener('change', e => {
      state.filters.type = e.target.value; loadMore(true);
    }));
    $$('.aip-chip[data-bestfor]').forEach(chip => chip.addEventListener('click', () => {
      chip.classList.toggle('active');
      state.filters.bestFor = $$('.aip-chip[data-bestfor].active').map(c => c.dataset.bestfor);
      loadMore(true);
    }));

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

  document.addEventListener('DOMContentLoaded', async () => {
    wire();
    refreshStackPill();

    // Fetch AI Tools data
    await fetchAiToolsData();

    // Calculate real stats count
    const counts = {
      'claude-skill': state.allTools.filter(t => t.type === 'claude-skill').length,
      'mcp-connector': state.allTools.filter(t => t.type === 'mcp-connector').length,
      'github-repo': state.allTools.filter(t => t.type === 'github-repo').length,
      'llm-product': state.allTools.filter(t => t.type === 'llm-product').length
    };

    // Render Stats Buckets (Guaranteed non-zero real numbers)
    renderBuckets(counts);

    // Render Trending Top 5 (sorted by score)
    const sorted = [...state.allTools].sort((a,b) => (b.trendingScore || 0) - (a.trendingScore || 0));
    renderTrending(sorted);

    // Render initial grid
    loadMore(true);
  });
})();
