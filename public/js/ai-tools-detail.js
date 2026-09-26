/* ===================================================================
   AI Tools Pulse — Detail Page Client Logic & Hydration Engine
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he' || window.location.pathname.startsWith('/he');
  const langKey = isHebrew ? 'he' : 'en';

  const T = window.AIP_I18N || {
    review_submit: isHebrew ? 'שלח ביקורת' : 'Submit review',
    review_login: isHebrew ? 'התחבר כדי לפרסם ביקורת' : 'Log in to leave a review',
    review_thanks: isHebrew ? 'תודה — הביקורת שלך נשלחה בהצלחה.' : 'Thanks — your review was submitted successfully.',
    review_failed: isHebrew ? 'שגיאה בשליחת הביקורת. נסה שוב.' : 'Could not submit. Please try again.',
    no_reviews: isHebrew ? 'אין עדיין ביקורות — היה הראשון לשתף חוות דעת מקצועית.' : 'No reviews yet — be the first to leave an AI tool review.',
    related: isHebrew ? 'כלי AI קשורים ומומלצים' : 'Related AI Tools & Connectors',
  };

  const TYPE_LABELS = {
    'claude-skill': 'Claude Skill',
    'mcp-connector': isHebrew ? 'מחבר MCP' : 'MCP Connector',
    'github-repo': isHebrew ? 'מאגר GitHub' : 'GitHub Repo',
    'llm-product': isHebrew ? 'מוצר LLM' : 'LLM Product'
  };

  const MASTER_AI_CATALOG = {
    'claude-code-generator': {
      slug: 'claude-code-generator',
      name: 'Claude Code Agent & Skills',
      type: 'claude-skill',
      pricing: 'Free / Pro',
      trendingScore: 99,
      icon: '⚡',
      desc_en: 'Autonomous terminal agent with deep codebase context, multi-file editing, test execution, and git integration.',
      desc_he: 'סוכן פיתוח אוטונומי בטרמינל עם הבנת קוד עמוקה, עריכת קבצים מרובים, הרצת בדיקות ואינטגרציית Git מלאה.',
      capabilities: ['Codebase-wide semantic search', 'Multi-file atomic patching', 'Test runner integration', 'Automated git commits & PRs', 'Terminal shell execution'],
      links: [
        { title: 'Anthropic Claude Code Docs', url: 'https://docs.anthropic.com/en/docs/claude-code/overview' },
        { title: 'GitHub Repository', url: 'https://github.com/anthropics' }
      ]
    },
    'cursor-ai-ide': {
      slug: 'cursor-ai-ide',
      name: 'Cursor AI Code Editor',
      type: 'llm-product',
      pricing: 'Freemium',
      trendingScore: 99,
      icon: '🖱️',
      desc_en: 'AI-first code editor built on VS Code with shadow workspace indexing, multi-file diff generation, and agent tab.',
      desc_he: 'סביבת פיתוח מהפכנית מבוססת AI המציעה אינדוקס פרויקט מלא, עריכת קבצים מרובים והשלמת קוד חכמה.',
      capabilities: ['Shadow workspace indexing', 'Multi-file composer diffs', 'Instant codebase chat', 'Custom .cursorrules support'],
      links: [
        { title: 'Cursor Official Site', url: 'https://cursor.com' }
      ]
    },
    'deepseek-v3-engine': {
      slug: 'deepseek-v3-engine',
      name: 'DeepSeek-V3 / R1 Open Models',
      type: 'github-repo',
      pricing: 'Open Weights',
      trendingScore: 100,
      icon: '🧠',
      desc_en: 'State-of-the-art open-weights reasoning model with Multi-head Latent Attention and DeepSeekMoE architecture.',
      desc_he: 'מודל היסק בקוד פתוח ומשקלים חופשיים עם ביצועים המתחרים במודלי הפרימיום המובילים.',
      capabilities: ['Multi-Head Latent Attention (MLA)', 'DeepSeekMoE Architecture', 'Reinforcement Learning Reasoning', '671B Total / 37B Active Params'],
      links: [
        { title: 'DeepSeek GitHub', url: 'https://github.com/deepseek-ai' },
        { title: 'HuggingFace Model Card', url: 'https://huggingface.co/deepseek-ai' }
      ]
    },
    'mcp-server-github': {
      slug: 'mcp-server-github',
      name: 'GitHub MCP Server',
      type: 'mcp-connector',
      pricing: 'Free / Open Source',
      trendingScore: 98,
      icon: '🐙',
      desc_en: 'Official Model Context Protocol connector to search repos, inspect PRs, file issues, and trigger GitHub Actions.',
      desc_he: 'מחבר MCP רשמי לחיפוש מאגרי קוד, ניתוח Pull Requests וניהול Issues ישירות מתוך ה-LLM.',
      capabilities: ['Repository contents inspection', 'Issue & PR management', 'Branch creation & commits', 'GitHub Actions workflow dispatch'],
      links: [
        { title: 'Model Context Protocol GitHub', url: 'https://github.com/modelcontextprotocol/servers' }
      ]
    }
  };

  const $ = (s, el = document) => el.querySelector(s);
  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function getToolFromCatalogOrDynamic(slug) {
    if (MASTER_AI_CATALOG[slug]) return MASTER_AI_CATALOG[slug];
    const cleanName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      slug: slug,
      name: `${cleanName}`,
      type: 'llm-product',
      pricing: 'Freemium',
      trendingScore: 95,
      icon: '🤖',
      desc_en: `Leading AI tool and productivity platform designed for engineering and automated workflows for ${cleanName}.`,
      desc_he: `כלי בינה מלאכותית מתקדם לפרודוקטיביות, פיתוח ואוטומציה עבור ${cleanName}.`,
      capabilities: ['State-of-the-art AI Models', 'API Integration', 'Cloud Acceleration', 'Enterprise Security'],
      links: [
        { title: `${cleanName} Search`, url: `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' ai tool')}` }
      ]
    };
  }

  function hydrateToolPage(tool) {
    const titleEl = $('#page-title');
    if (titleEl) titleEl.textContent = `${tool.name} — TrendingTech Daily`;

    const bcType = $('#aip-breadcrumb-type');
    if (bcType) {
      bcType.textContent = TYPE_LABELS[tool.type] || tool.type;
      bcType.href = `${isHebrew ? '/he/ai-tools.html' : '/ai-tools.html'}?type=${encodeURIComponent(tool.type || '')}`;
    }
    const bcName = $('#aip-breadcrumb-name');
    if (bcName) bcName.textContent = tool.name;

    const heroTitle = $('#aip-hero-title');
    if (heroTitle) heroTitle.textContent = tool.name;

    const heroScore = $('#aip-hero-score');
    if (heroScore) heroScore.textContent = tool.trendingScore || 95;

    const heroIcon = $('#aip-hero-icon');
    if (heroIcon) heroIcon.textContent = tool.icon || '🤖';

    const heroBadges = $('#aip-hero-badges');
    if (heroBadges) {
      heroBadges.innerHTML = `
        <span class="badge badge-ai">${esc(TYPE_LABELS[tool.type] || tool.type)}</span>
        <span class="badge badge-chips">${esc(tool.pricing || 'Free')}</span>
        <span style="font-family:var(--font-mono); font-weight:700; color:#F59E0B;"><i class="bi bi-star-fill me-1"></i>${((tool.trendingScore||95)/20).toFixed(1)}</span>
      `;
    }

    const descEl = $('#aip-description-content');
    if (descEl) {
      descEl.innerHTML = `<p>${esc(isHebrew ? (tool.desc_he || tool.desc_en) : (tool.desc_en || tool.desc_he))}</p>`;
    }

    const capList = $('#aip-capabilities-list');
    if (capList && tool.capabilities) {
      capList.innerHTML = tool.capabilities.map(c => `
        <div class="d-flex align-items-center gap-2" style="background:var(--bg-surface-subtle); padding:0.5rem 1rem; border-radius:var(--radius-full); border:1px solid var(--border-color); font-size:0.85rem;">
          <i class="bi bi-check2-circle text-danger"></i>
          <span>${esc(c)}</span>
        </div>
      `).join('');
    }

    const linksRow = $('#aip-links-row');
    if (linksRow && tool.links) {
      linksRow.innerHTML = tool.links.map(l => `
        <a href="${esc(l.url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm d-inline-flex align-items-center gap-2">
          <i class="bi bi-box-arrow-up-right"></i> ${esc(l.title)}
        </a>
      `).join('');
    }

    // Related
    const related = $('#aip-related');
    if (related) {
      const others = Object.values(MASTER_AI_CATALOG).filter(t => t.slug !== tool.slug).slice(0, 3);
      related.innerHTML = `
        <h3 style="font-family:var(--font-display); font-size:1.4rem; font-weight:800; margin-bottom:1.25rem;">${esc(T.related)}</h3>
        <div class="row g-3">
          ${others.map(t => `
            <div class="col-md-4">
              <a class="card h-100 p-3 text-decoration-none" href="${isHebrew ? '/he/ai-tools-detail.html?slug=' : '/ai-tools-detail.html?slug='}${encodeURIComponent(t.slug)}" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); color:inherit;">
                <div class="d-flex align-items-center gap-2 mb-2">
                  <span style="font-size:1.25rem;">${t.icon || '🤖'}</span>
                  <div class="fw-bold text-truncate">${esc(t.name)}</div>
                </div>
                <p class="small text-muted mb-0" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${esc(isHebrew ? t.desc_he : t.desc_en)}</p>
              </a>
            </div>
          `).join('')}
        </div>
      `;
    }

    const loadingEl = $('#aip-detail-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    const contentEl = $('#aip-detail-content');
    if (contentEl) contentEl.style.display = 'block';
  }

  function wireReviewForm() {
    const form = $('#aip-review-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const rating = Number($('#aip-review-rating').value);
      const comment = $('#aip-review-comment').value.trim();
      if (!rating || !comment) return;

      const list = $('#aip-reviews-list');
      if (list) {
        list.insertAdjacentHTML('afterbegin', `
          <div class="aip-review mb-3 p-3" style="background:var(--bg-surface-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
            <div class="text-warning mb-1">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
            <p class="mb-0 text-main">${esc(comment)}</p>
          </div>
        `);
      }
      form.reset();
      const msg = $('#aip-review-msg');
      if (msg) {
        msg.textContent = T.review_thanks;
        msg.className = 'text-success small';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug') || urlParams.get('tool') || 'claude-code-generator';

    const tool = getToolFromCatalogOrDynamic(slug);
    hydrateToolPage(tool);
    wireReviewForm();
  });
})();
