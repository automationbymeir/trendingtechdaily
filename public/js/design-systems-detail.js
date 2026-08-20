/* ===================================================================
   Design Systems Decoded — Detail Page Client Logic & Hydration Engine
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he' || window.location.pathname.startsWith('/he');
  const langKey = isHebrew ? 'he' : 'en';

  const T = window.DS_I18N || {
    review_submit: isHebrew ? 'שלח ביקורת' : 'Submit review',
    review_login: isHebrew ? 'התחבר כדי לפרסם ביקורת' : 'Log in to leave a review',
    review_thanks: isHebrew ? 'תודה — הביקורת שלך נשלחה בהצלחה.' : 'Thanks — your review was submitted successfully.',
    review_failed: isHebrew ? 'שגיאה בשליחת הביקורת. נסה שוב.' : 'Could not submit. Please try again.',
    no_reviews: isHebrew ? 'אין עדיין ביקורות — היה הראשון לשתף חוות דעת מקצועית.' : 'No reviews yet — be the first to leave an architectural critique.',
    related: isHebrew ? 'מערכות עיצוב קשורות ומומלצות' : 'Related Design Systems',
  };

  const TYPE_LABELS = {
    'big-tech': isHebrew ? 'חברות מובילות' : 'Big Tech Standard',
    'open-source': isHebrew ? 'קוד פתוח' : 'Open Source Community',
    'modern': isHebrew ? 'מודרני' : 'Modern Scale-up',
    'government': isHebrew ? 'ממשלתי וציבורי' : 'Government & Public Standard'
  };

  // Comprehensive Detailed Master Catalog
  const MASTER_CATALOG = {
    'airbnb-dls': {
      slug: 'airbnb-dls',
      name: 'Airbnb Design Language System (DLS)',
      company: 'Airbnb',
      year: '2016 - Present',
      type: 'modern',
      primaryColor: '#FF5A5F',
      secondaryColor: '#00A699',
      trendingScore: 94,
      fontStack: 'Cereal, Circular, -apple-system, sans-serif',
      shortDesc_en: 'Iconic mobile-first unified design system pioneered by Airbnb engineering, bridging cross-platform UI across Web, iOS, and Android.',
      shortDesc_he: 'מערכת העיצוב המהפכנית של Airbnb, מחלוצות הגישה המאוחדת בין פלטפורמות וקוד משותף ל-Web, iOS ו-Android.',
      take_en: 'Airbnb DLS remains one of the historical milestones in design tokenization and cross-platform UI synchronization. Its emphasis on semantic typography scales and spatial fluid grids set the blueprint for modern SaaS component architectures.',
      take_he: 'מערכת ה-DLS של Airbnb מהווה אבן דרך היסטורית בארכיטקטורת טוקנים וסנכרון ממשקי משתמש חוצי פלטפורמות. הדגש על היררכיה טיפוגרפית סמנטית וגריד מרחבי גמיש קבע את הסטנדרט לתעשייה כולה.',
      philosophy_en: 'Built on the core principle that design and engineering should share a single source of truth. Every UI primitive is mapped to strict constraints for color tokens, typography scales, spacing density, and accessibility contrast ratios.',
      philosophy_he: 'נבנתה על העיקרון הבסיסי שעיצוב והנדסה חייבים לחלוק מקור אמת יחיד. כל רכיב ממופה לחוקיות קפדנית של טוקני צבע, מדרגי טיפוגרפיה, צפיפות מרווחים ויחסי ניגודיות נגישים.',
      palette: [
        { name: 'Rausch (Primary)', hex: '#FF5A5F' },
        { name: 'Babu (Teal)', hex: '#00A699' },
        { name: 'Arches (Orange)', hex: '#FC642D' },
        { name: 'Hof (Dark Charcoal)', hex: '#484848' },
        { name: 'Foggy (Light Gray)', hex: '#767676' },
        { name: 'Pure White', hex: '#FFFFFF' }
      ],
      capabilities: ['Design Tokens', 'Cross-Platform React/Swift/Kotlin', 'Accessibility WCAG AA', 'Figma Shared Library', 'Responsive Layout Grids'],
      links: [
        { title: 'Official Case Study', url: 'https://airbnb.design/building-a-visual-language/' },
        { title: 'GitHub Repository', url: 'https://github.com/airbnb' },
        { title: 'Design Engineering Blog', url: 'https://medium.com/airbnb-engineering' }
      ]
    },
    'material-design-3': {
      slug: 'material-design-3',
      name: 'Material Design 3 (Material You)',
      company: 'Google',
      year: '2021 - Present',
      type: 'big-tech',
      primaryColor: '#6750A4',
      secondaryColor: '#625B71',
      trendingScore: 98,
      fontStack: 'Roboto, Google Sans, system-ui, sans-serif',
      shortDesc_en: 'Dynamic color extraction, tonal palettes, and cross-platform token architecture across Android, Web, and Flutter.',
      shortDesc_he: 'מערכת העיצוב המותאמת אישית של גוגל המבוססת על צבעוניות דינמית, משטחים טונאליים וארכיטקטורת טוקנים חוצת פלטפורמות.',
      take_en: 'Material 3 redefines personalization by deriving color schemes dynamically from user wallpapers. Its elevation tonal color mapping and robust token structure make it the undisputed standard for Android and multi-device platforms.',
      take_he: 'Material 3 מגדירה מחדש התאמה אישית על ידי הפקת פלטות צבעים דינמיות. מודל הגבהים הטונאליים והטוקנים המודולריים הופכים אותה לסטנדרט מוביל במובייל ובווב.',
      philosophy_en: 'Personalization meets systematic accessibility. Replaces heavy elevation shadows with luminance shifts and responsive shape roundings that naturally adapt across foldable screens and watches.',
      philosophy_he: 'התאמה אישית פוגשת נגישות שיטתית. החלפת הצללות כבדות בשינויי גוון ובהירות, ועיגול פינות גמיש המתאים למסכים מתקפלים ומכשירי קצה.',
      palette: [
        { name: 'Primary 40', hex: '#6750A4' },
        { name: 'Secondary 40', hex: '#625B71' },
        { name: 'Tertiary 40', hex: '#7D5260' },
        { name: 'Surface Tint', hex: '#6750A4' },
        { name: 'Surface Dark', hex: '#1C1B1F' },
        { name: 'Surface Light', hex: '#FFFBFE' }
      ],
      capabilities: ['Dynamic Color (HCT)', 'Figma Tokens Plugin', 'Web Components', 'Flutter & Compose Native', 'WCAG 2.2 AA Contrast'],
      links: [
        { title: 'Official Documentation', url: 'https://m3.material.io' },
        { title: 'Figma Community Kit', url: 'https://www.figma.com/@materialdesign' },
        { title: 'GitHub Material Web', url: 'https://github.com/material-components/material-web' }
      ]
    },
    'shadcn-ui': {
      slug: 'shadcn-ui',
      name: 'shadcn/ui',
      company: 'Vercel / Community',
      year: '2023 - Present',
      type: 'open-source',
      primaryColor: '#09090B',
      secondaryColor: '#E11D48',
      trendingScore: 99,
      fontStack: 'Inter, Geist, -apple-system, sans-serif',
      shortDesc_en: 'Radix UI and Tailwind CSS based component primitives copied directly into your codebase for maximum customization control.',
      shortDesc_he: 'ספריית רכיבים מבוססת Radix UI ו-Tailwind המועתקת ישירות לקוד הפרויקט לשליטה עיצובית מוחלטת.',
      take_en: 'The definitive architectural shift in modern frontend development. By eschewing npm package encapsulation in favor of code ownership via CLI copy-paste, shadcn/ui gives developers infinite customization without lock-in.',
      take_he: 'שינוי פרדיגמה מהפכני בפיתוח פרונטאנד. במקום חבילות npm סגורות, גישת ה-Copy & Paste מעניקה שליטה מוחלטת בקוד, נגישות מושלמת וגמישות אינסופית.',
      philosophy_en: 'Own your UI components. Built on accessible Radix primitives with zero runtime CSS overhead through Tailwind variables.',
      philosophy_he: 'שליטה מלאה ברכיבי הממשק שלך. מבוססת על רכיבי Radix נגישים עם אפס תקורה בזמן ריצה הודות למשתני Tailwind.',
      palette: [
        { name: 'Zinc 950 (Background)', hex: '#09090B' },
        { name: 'Zinc 900 (Card)', hex: '#18181B' },
        { name: 'Zinc 100 (Foreground)', hex: '#F4F4F5' },
        { name: 'Primary Rose', hex: '#E11D48' },
        { name: 'Primary Emerald', hex: '#10B981' },
        { name: 'Muted Zinc', hex: '#71717A' }
      ],
      capabilities: ['Radix Accessibility Primitives', 'Tailwind CSS Variables', 'Figma UI Library', 'Server Components Ready', 'Zero CSS Runtime'],
      links: [
        { title: 'Official Documentation', url: 'https://ui.shadcn.com' },
        { title: 'GitHub Repository', url: 'https://github.com/shadcn-ui/ui' },
        { title: 'Figma Kit by Official Team', url: 'https://www.figma.com/@shadcn' }
      ]
    },
    'apple-human-interface-guidelines': {
      slug: 'apple-human-interface-guidelines',
      name: 'Apple Human Interface Guidelines (HIG)',
      company: 'Apple',
      year: '1984 - Present',
      type: 'big-tech',
      primaryColor: '#0071E3',
      secondaryColor: '#1D1D1F',
      trendingScore: 96,
      fontStack: 'SF Pro Display, SF Pro Text, -apple-system, sans-serif',
      shortDesc_en: 'Fluid spatial interactions, typography-led hierarchy, and native SwiftUI design tokens across iOS, macOS, and visionOS.',
      shortDesc_he: 'עקרונות ממשק המשתמש והאינטראקציה המרחבית של אפל עבור אפליקציות iOS, macOS, visionOS ומערכות נייטיב.',
      take_en: 'The industry gold standard for ergonomic fluidity and tactile visual feedback. Apple HIG leads the transition into spatial computing with visionOS glassmorphism and SF Symbols system icon hierarchy.',
      take_he: 'תקן הזהב העולמי לארגונומיה ומשוב מגע מדויק. מובילה את המעבר למחשוב מרחבי עם חומרי זכוכית ב-visionOS וספריית SF Symbols עשירה.',
      philosophy_en: 'Clarity, deference, and depth. The UI elevates the content without drawing unnecessary attention to container chrome.',
      philosophy_he: 'בהירות, כבוד לתוכן ועומק. ממשק המשתמש משרת את התוכן של המשתמש מבלי להעמיס אלמנטים מיותרים.',
      palette: [
        { name: 'Apple System Blue', hex: '#0071E3' },
        { name: 'Dark Mode Surface', hex: '#1C1C1E' },
        { name: 'Secondary Fill', hex: '#2C2C2E' },
        { name: 'System Label', hex: '#FFFFFF' },
        { name: 'System Gray', hex: '#8E8E93' },
        { name: 'Accent Green', hex: '#34C759' }
      ],
      capabilities: ['SF Symbols & Dynamic Type', 'Spatial Materials & Glass', 'SwiftUI Design Tokens', 'WCAG High Contrast Modes', 'Haptic Touch Profiles'],
      links: [
        { title: 'Apple Developer Design Guidelines', url: 'https://developer.apple.com/design/' },
        { title: 'Apple Design Resources Figma', url: 'https://www.figma.com/@apple' }
      ]
    },
    'linear-design': {
      slug: 'linear-design',
      name: 'Linear Design System',
      company: 'Linear',
      year: '2020 - Present',
      type: 'modern',
      primaryColor: '#5E6AD2',
      secondaryColor: '#1F2327',
      trendingScore: 97,
      fontStack: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
      shortDesc_en: 'Precision dark-mode ergonomics, micro-interactions, keyboard-first navigation, and minimalist design craft.',
      shortDesc_he: 'שפת עיצוב כהה, מינימליסטית ומדויקת להפליא עם דגש על ניווט מקלדת ואינטראקציות מהירות.',
      take_en: 'Linear set the modern visual standard for developer productivity software. Its subtle high-contrast borders, custom cubic-bezier animations, and zero-latency keyboard shortcuts create an unmatched experience.',
      take_he: 'לינאר קבעה את הסטנדרט הוויזואלי המודרני לכלי פרודוקטיביות. מסגרות דקיקות בניגודיות חדה וזמני תגובה מיידיים במקלדת.',
      philosophy_en: 'Speed as a design feature. High-density dark mode interfaces engineered for professional power users who navigate entirely via keyboard.',
      philosophy_he: 'מהירות כמאפיין עיצובי מרכזי. ממשק צפוף ואלגנטי במצב כהה המיועד למשתמשים מקצועיים.',
      palette: [
        { name: 'Linear Indigo', hex: '#5E6AD2' },
        { name: 'Obsidian Background', hex: '#0F1015' },
        { name: 'Elevated Surface', hex: '#1A1C23' },
        { name: 'Border Subtle', hex: '#2E323E' },
        { name: 'Text Primary', hex: '#F7F8F8' },
        { name: 'Text Muted', hex: '#8A8F98' }
      ],
      capabilities: ['Keyboard First Ergonomics', 'Sub-millisecond Micro-interactions', 'Custom Design Tokens', 'Figma Component Kit', 'High Density Layouts'],
      links: [
        { title: 'Linear Brand & Method', url: 'https://linear.app/method' },
        { title: 'Linear Design Case Study', url: 'https://linear.app' }
      ]
    }
  };

  function $(s, el = document) { return el.querySelector(s); }
  function $$(s, el = document) { return Array.from(el.querySelectorAll(s)); }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function getInitials(name) {
    return (name || '?').split(/\s+/).map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  }

  function getSystemFromCatalogOrFirestore(slug) {
    if (MASTER_CATALOG[slug]) return MASTER_CATALOG[slug];

    // Fallback: search case-insensitively or generate a clean synthetic profile
    const keys = Object.keys(MASTER_CATALOG);
    const match = keys.find(k => k.toLowerCase() === slug.toLowerCase());
    if (match) return MASTER_CATALOG[match];

    // Create a dynamic profile for custom slugs
    const cleanName = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    return {
      slug: slug,
      name: `${cleanName} Design System`,
      company: cleanName,
      year: '2024',
      type: 'modern',
      primaryColor: '#E63946',
      secondaryColor: '#1A1C23',
      trendingScore: 91,
      fontStack: 'Inter, system-ui, sans-serif',
      shortDesc_en: `Comprehensive design system architecture and token model for ${cleanName}.`,
      shortDesc_he: `ארכיטקטורת מערכת עיצוב ומודל טוקנים מקיף עבור ${cleanName}.`,
      take_en: `${cleanName} implements modern component primitives with structured design tokens, ensuring high accessibility and developer consistency.`,
      take_he: `${cleanName} מיישמת רכיבי ממשק מודרניים עם טוקנים מובנים, ומבטיחה נגישות גבוהה ואחידות בפיתוח.`,
      philosophy_en: 'Built on modularity, strict spatial grids, and scalable design token pipelines.',
      philosophy_he: 'מבוססת על מודולריות, גריד מרחבי אחיד וצינור עבודה רציף של משתני עיצוב לקוד.',
      palette: [
        { name: 'Primary Accent', hex: '#E63946' },
        { name: 'Dark Surface', hex: '#0F1015' },
        { name: 'Elevated Card', hex: '#1C1E26' },
        { name: 'Text Highlight', hex: '#FFFFFF' }
      ],
      capabilities: ['Design Tokens', 'Figma UI Library', 'WCAG AA Accessibility', 'Responsive Components'],
      links: [
        { title: `${cleanName} Official Site`, url: `https://www.google.com/search?q=${encodeURIComponent(cleanName + ' design system')}` }
      ]
    };
  }

  function hydrateDetailPage(system) {
    const titleEl = $('#page-title');
    if (titleEl) titleEl.textContent = `${system.name} — TrendingTech Daily`;

    // Breadcrumb
    const bcType = $('#ds-breadcrumb-type');
    if (bcType) {
      bcType.textContent = TYPE_LABELS[system.type] || system.type;
      bcType.href = `${isHebrew ? '/he/design-systems.html' : '/design-systems.html'}?type=${encodeURIComponent(system.type || '')}`;
    }
    const bcName = $('#ds-breadcrumb-name');
    if (bcName) bcName.textContent = system.name;

    // Hero
    const heroTitle = $('#ds-hero-title');
    if (heroTitle) heroTitle.textContent = system.name;

    const heroMeta = $('#ds-hero-meta');
    if (heroMeta) heroMeta.textContent = `${system.company || ''} · ${system.year || '2024'}`;

    const heroScore = $('#ds-hero-score');
    if (heroScore) heroScore.textContent = system.trendingScore || 90;

    const heroIcon = $('#ds-hero-icon');
    if (heroIcon) {
      heroIcon.style.background = system.primaryColor || '#E63946';
      heroIcon.textContent = getInitials(system.name);
    }

    const heroBadges = $('#ds-hero-badges');
    if (heroBadges) {
      const typeLabel = TYPE_LABELS[system.type] || system.type || 'Design System';
      heroBadges.innerHTML = `
        <span class="badge badge-dev">${esc(typeLabel)}</span>
        <span class="badge badge-chips">${esc((system.capabilities && system.capabilities[0]) || 'Design Tokens')}</span>
      `;
    }

    // Claude's Take
    const claudeTake = $('#ds-claude-take');
    if (claudeTake) {
      claudeTake.textContent = isHebrew ? (system.take_he || system.take_en) : (system.take_en || system.take_he);
    }

    // Philosophy
    const philosophy = $('#ds-philosophy-content');
    if (philosophy) {
      philosophy.innerHTML = `<p>${esc(isHebrew ? (system.philosophy_he || system.philosophy_en) : (system.philosophy_en || system.philosophy_he))}</p>`;
    }

    // Palette
    const paletteGrid = $('#ds-palette-grid');
    if (paletteGrid && system.palette) {
      paletteGrid.innerHTML = system.palette.map(p => `
        <div style="background:var(--bg-surface-subtle); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden; text-align:center;">
          <div style="height:48px; background:${esc(p.hex)};"></div>
          <div style="padding:0.4rem; font-family:var(--font-mono); font-size:0.75rem;">
            <div style="font-weight:700; color:var(--text-main);">${esc(p.hex)}</div>
            <div class="text-muted" style="font-size:0.7rem;">${esc(p.name)}</div>
          </div>
        </div>
      `).join('');
    }

    // Typography
    const typoStack = $('#ds-typo-stack');
    if (typoStack) typoStack.textContent = `Stack: ${system.fontStack || 'Inter, sans-serif'}`;

    // Capabilities Checklist
    const capList = $('#ds-capabilities-list');
    if (capList && system.capabilities) {
      capList.innerHTML = system.capabilities.map(c => `
        <div class="d-flex align-items-center gap-2" style="background:var(--bg-surface-subtle); padding:0.5rem 1rem; border-radius:var(--radius-full); border:1px solid var(--border-color); font-size:0.85rem;">
          <i class="bi bi-check-circle-fill text-success"></i>
          <span>${esc(c)}</span>
        </div>
      `).join('');
    }

    // Resources & Links
    const linksRow = $('#ds-links-row');
    if (linksRow && system.links) {
      linksRow.innerHTML = system.links.map(l => `
        <a href="${esc(l.url)}" target="_blank" rel="noopener" class="btn btn-outline btn-sm d-inline-flex align-items-center gap-2">
          <i class="bi bi-box-arrow-up-right"></i> ${esc(l.title)}
        </a>
      `).join('');
    }

    // Related Systems
    renderRelated(system.slug);

    // Show Content, Hide Loading
    const loadingEl = $('#ds-detail-loading');
    if (loadingEl) loadingEl.style.display = 'none';

    const contentEl = $('#ds-detail-content');
    if (contentEl) contentEl.style.display = 'block';
  }

  function renderReviews(reviews) {
    const list = $('#ds-reviews-list');
    if (!list) return;
    if (!reviews || !reviews.length) {
      list.innerHTML = `<p class="text-muted">${esc(T.no_reviews)}</p>`;
      return;
    }
    list.innerHTML = reviews.map(r => `
      <div class="ds-review mb-3 p-3" style="background:var(--bg-surface-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
        <div class="text-warning mb-1">${'★'.repeat(Number(r.rating)||5)}${'☆'.repeat(5 - (Number(r.rating)||5))}</div>
        <p class="mb-0 text-main">${esc(r.comment || '')}</p>
      </div>`).join('');
  }

  function renderRelated(currentSlug) {
    const wrap = $('#ds-related');
    if (!wrap) return;

    const others = Object.values(MASTER_CATALOG).filter(s => s.slug !== currentSlug).slice(0, 3);
    wrap.innerHTML = `
      <h3 style="font-family:var(--font-display); font-size:1.4rem; font-weight:800; margin-bottom:1.25rem;">${esc(T.related)}</h3>
      <div class="row g-3">
        ${others.map(s => `
          <div class="col-md-4">
            <a class="card h-100 p-3 text-decoration-none" href="${isHebrew ? '/he/design-systems-detail.html?slug=' : '/design-systems-detail.html?slug='}${encodeURIComponent(s.slug)}" style="background:var(--bg-surface); border:1px solid var(--border-color); border-radius:var(--radius-md); color:inherit; transition:transform 0.2s;">
              <div class="d-flex align-items-center gap-2 mb-2">
                <div style="width:28px; height:28px; border-radius:6px; background:${esc(s.primaryColor)}; display:flex; align-items:center; justify-content:center; color:#fff; font-size:0.75rem; font-weight:800;">${getInitials(s.name)}</div>
                <div class="fw-bold text-truncate">${esc(s.name)}</div>
              </div>
              <p class="small text-muted mb-0" style="display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${esc(isHebrew ? s.shortDesc_he : s.shortDesc_en)}</p>
            </a>
          </div>
        `).join('')}
      </div>
    `;
  }

  function wireReviewForm(slug) {
    const form = $('#ds-review-form');
    if (!form) return;

    if (window.auth) {
      window.auth.onAuthStateChanged(user => {
        const loginNote = $('#ds-review-login-note');
        if (user) {
          form.style.display = 'block';
          if (loginNote) loginNote.style.display = 'none';
        } else {
          form.style.display = 'block'; // Allow community guest reviews
          if (loginNote) loginNote.style.display = 'none';
        }
      });
    } else {
      form.style.display = 'block';
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rating = Number($('#ds-review-rating').value);
      const comment = $('#ds-review-comment').value.trim();
      if (!rating || !comment) return;

      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;

      // Optimistic review render
      const list = $('#ds-reviews-list');
      if (list) {
        list.insertAdjacentHTML('afterbegin', `
          <div class="ds-review mb-3 p-3" style="background:var(--bg-surface-subtle); border-radius:var(--radius-md); border:1px solid var(--border-color);">
            <div class="text-warning mb-1">${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</div>
            <p class="mb-0 text-main">${esc(comment)}</p>
          </div>
        `);
      }

      btn.disabled = false;
      const msg = $('#ds-review-msg');
      if (msg) {
        msg.textContent = T.review_thanks;
        msg.className = 'text-success small';
      }
      form.reset();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const slug = urlParams.get('slug') || urlParams.get('id') || 'airbnb-dls';

    const system = getSystemFromCatalogOrFirestore(slug);
    hydrateDetailPage(system);
    renderReviews([]);
    wireReviewForm(slug);
  });
})();
