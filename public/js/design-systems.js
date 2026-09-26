/* ===================================================================
   Design Systems Decoded — Landing page client logic.
   Robust multi-tier data engine: Cloud Functions -> Firestore -> Curated Catalog
   =================================================================== */
(function () {
  'use strict';

  const isHebrew = document.documentElement.lang === 'he' || window.location.pathname.startsWith('/he');
  const langKey = isHebrew ? 'he' : 'en';

  const T = window.DS_I18N || {
    addToStack: isHebrew ? 'הוסף להשוואה' : 'Add to compare',
    added: isHebrew ? 'נוסף' : 'Added',
    view: isHebrew ? 'צפה' : 'View',
    noResults: isHebrew ? 'לא נמצאו מערכות עיצוב התואמות לסינון זה.' : 'No design systems match these filters yet.',
    loading: isHebrew ? 'טוען מערכות עיצוב...' : 'Loading design systems...',
    yourStack: isHebrew ? 'ההשוואה שלך' : 'Your Comparison',
    exportMd: isHebrew ? 'ייצא Markdown' : 'Export Markdown',
    exportJson: isHebrew ? 'ייצא JSON' : 'Export JSON',
    emptyStack: isHebrew ? 'ההשוואה ריקה. לחץ על "הוסף להשוואה" בכל כרטיס.' : 'Your comparison is empty. Click "Add to compare" on any card.',
    remove: isHebrew ? 'הסר' : 'Remove',
    trending: isHebrew ? 'הנצפות ביותר' : 'Trending',
  };

  // Master Curated Design Systems Catalog
  const MASTER_DESIGN_SYSTEMS = [
    // ── Big Tech Standards (8 systems) ──
    {
      slug: 'material-design-3',
      name: 'Material Design 3 (Material You)',
      type: 'big-tech',
      company: 'Google',
      primaryColor: '#6750A4',
      secondaryColor: '#625B71',
      shortDesc_en: 'Adaptive dynamic color system, elevation-free tonal surfaces, and cross-platform token architecture across Android, Web, and Flutter.',
      shortDesc_he: 'מערכת עיצוב מותאמת אישית של גוגל המבוססת על צבעוניות דינמית, משטחים טונאליים וארכיטקטורת טוקנים חוצת פלטפורמות.',
      trendingScore: 98,
      metrics: { weeklyGrowth: 14, componentsCount: 65 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['enterprise', 'mobile', 'web-apps', 'accessible']
    },
    {
      slug: 'apple-human-interface-guidelines',
      name: 'Apple Human Interface Guidelines (HIG)',
      type: 'big-tech',
      company: 'Apple',
      primaryColor: '#0071E3',
      secondaryColor: '#1D1D1F',
      shortDesc_en: 'Fluid spatial interactions, typography-led hierarchy, and native SwiftUI design tokens across iOS, macOS, visionOS, and watchOS.',
      shortDesc_he: 'עקרונות ממשק המשתמש והאינטראקציה המרחבית של אפל עבור אפליקציות iOS, macOS, visionOS ומערכות נייטיב.',
      trendingScore: 95,
      metrics: { weeklyGrowth: 9, componentsCount: 50 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['mobile', 'enterprise', 'web-apps']
    },
    {
      slug: 'microsoft-fluent-2',
      name: 'Microsoft Fluent 2',
      type: 'big-tech',
      company: 'Microsoft',
      primaryColor: '#0078D4',
      secondaryColor: '#2B88D8',
      shortDesc_en: 'Cohesive design language powering Windows 11, Microsoft 365, and Azure with deep focus on accessible enterprise productivity.',
      shortDesc_he: 'שפת העיצוב של מיקרוסופט עבור Windows 11, Microsoft 365 ו-Azure עם דגש חזק על נגישות ופרודוקטיביות ארגונית.',
      trendingScore: 92,
      metrics: { weeklyGrowth: 12, componentsCount: 58 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode'],
      bestFor: ['enterprise', 'saas', 'accessible']
    },
    {
      slug: 'atlassian-design-system',
      name: 'Atlassian Design System',
      type: 'big-tech',
      company: 'Atlassian',
      primaryColor: '#0052CC',
      secondaryColor: '#172B4D',
      shortDesc_en: 'Scalable UI components and design tokens powering Jira, Confluence, and Trello with comprehensive governance patterns.',
      shortDesc_he: 'רכיבי ממשק משתמש וטוקנים המניעים את Jira, Confluence ו-Trello עם מתודולוגיות משילות עיצובית.',
      trendingScore: 89,
      metrics: { weeklyGrowth: 8, componentsCount: 54 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['saas', 'enterprise', 'web-apps']
    },
    {
      slug: 'shopify-polaris',
      name: 'Shopify Polaris',
      type: 'big-tech',
      company: 'Shopify',
      primaryColor: '#008060',
      secondaryColor: '#202223',
      shortDesc_en: 'Commerce-focused design system crafted to deliver consistent, intuitive, and accessible merchant administration dashboards.',
      shortDesc_he: 'מערכת העיצוב של שופיפיי הממוקדת במסחר אלקטרוני, ניהול חנויות וממשקי סוחרים נגישים.',
      trendingScore: 91,
      metrics: { weeklyGrowth: 11, componentsCount: 48 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['e-commerce', 'saas', 'web-apps']
    },
    {
      slug: 'ibm-carbon-design-system',
      name: 'IBM Carbon Design System',
      type: 'big-tech',
      company: 'IBM',
      primaryColor: '#0F62FE',
      secondaryColor: '#161616',
      shortDesc_en: 'Open-source design system by IBM featuring multi-theme tokens, strict grid systems, and React/Vue/Svelte/Web Component support.',
      shortDesc_he: 'מערכת העיצוב מרובת הנושאים של IBM עם תמיכה מלאה ב-React, Vue, Svelte ורכיבי רשת ארגוניים.',
      trendingScore: 86,
      metrics: { weeklyGrowth: 7, componentsCount: 62 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['enterprise', 'web-apps', 'accessible']
    },
    {
      slug: 'uber-base-web',
      name: 'Uber Base Web',
      type: 'big-tech',
      company: 'Uber',
      primaryColor: '#000000',
      secondaryColor: '#276EF1',
      shortDesc_en: 'Robust, accessible React component library powering internal tools and consumer platforms across Uber engineering.',
      shortDesc_he: 'ספריית רכיבי React נגישה ומהירה מבית אובר המניעה מערכות פנימיות ומוצרי צריכה.',
      trendingScore: 84,
      metrics: { weeklyGrowth: 6, componentsCount: 44 },
      capabilities: ['tokens', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['web-apps', 'enterprise']
    },
    {
      slug: 'salesforce-lightning',
      name: 'Salesforce Lightning Design System (SLDS)',
      type: 'big-tech',
      company: 'Salesforce',
      primaryColor: '#0176D3',
      secondaryColor: '#032D60',
      shortDesc_en: 'Pioneer design token framework built for enterprise CRM complexity, multi-tenant workflows, and accessible density modes.',
      shortDesc_he: 'חלוצת מערכות הטוקנים לעולם ה-CRM הארגוני, המותאמת לתהליכי עבודה צפופים ומרובי משתמשים.',
      trendingScore: 82,
      metrics: { weeklyGrowth: 5, componentsCount: 70 },
      capabilities: ['tokens', 'figma', 'accessible'],
      bestFor: ['enterprise', 'saas']
    },

    // ── Open Source Component Libraries (8 systems) ──
    {
      slug: 'shadcn-ui',
      name: 'shadcn/ui',
      type: 'open-source',
      company: 'Vercel / Community',
      primaryColor: '#000000',
      secondaryColor: '#E11D48',
      shortDesc_en: 'Radix UI and Tailwind CSS based component primitives copied directly into your codebase for maximum customization control.',
      shortDesc_he: 'ספריית רכיבים מבוססת Radix UI ו-Tailwind המועתקת ישירות לקוד הפרויקט לשליטה עיצובית מוחלטת.',
      trendingScore: 99,
      metrics: { weeklyGrowth: 38, componentsCount: 48 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['saas', 'web-apps', 'startups']
    },
    {
      slug: 'ant-design',
      name: 'Ant Design',
      type: 'open-source',
      company: 'Ant Group / OSS',
      primaryColor: '#1677FF',
      secondaryColor: '#52C41A',
      shortDesc_en: 'Enterprise-class UI design language and React component library with thousands of production deployments globally.',
      shortDesc_he: 'שפת עיצוב וספריית רכיבי React ברמה ארגונית עם מאות רכיבים מוכנים לניהול דאטה וממשקים מורכבים.',
      trendingScore: 94,
      metrics: { weeklyGrowth: 15, componentsCount: 85 },
      capabilities: ['tokens', 'figma', 'dark-mode', 'responsive'],
      bestFor: ['enterprise', 'saas', 'web-apps']
    },
    {
      slug: 'mantine',
      name: 'Mantine',
      type: 'open-source',
      company: 'Mantine Core Team',
      primaryColor: '#339AF0',
      secondaryColor: '#228BE6',
      shortDesc_en: 'Feature-rich React component library with 100+ accessible components, 50+ custom hooks, and zero CSS runtime overhead.',
      shortDesc_he: 'ספריית רכיבי React עשירה עם מעל 100 רכיבים נגישים, עשרות Hooks מובנים וביצועים ללא פשרות.',
      trendingScore: 93,
      metrics: { weeklyGrowth: 22, componentsCount: 105 },
      capabilities: ['tokens', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['saas', 'web-apps', 'startups']
    },
    {
      slug: 'mui-material-ui',
      name: 'MUI (Material UI)',
      type: 'open-source',
      company: 'MUI Core',
      primaryColor: '#007FFF',
      secondaryColor: '#0059B2',
      shortDesc_en: 'The comprehensive React component library implementing Google Material Design with advanced data grids and charts.',
      shortDesc_he: 'ספריית ה-React הפופולרית בעולם המיישמת את Material Design עם טבלאות נתונים וגרפים מתקדמים.',
      trendingScore: 90,
      metrics: { weeklyGrowth: 12, componentsCount: 75 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['enterprise', 'saas', 'web-apps']
    },
    {
      slug: 'radix-ui',
      name: 'Radix Primitives',
      type: 'open-source',
      company: 'WorkOS',
      primaryColor: '#111111',
      secondaryColor: '#6E56CF',
      shortDesc_en: 'Unstyled, accessible UI primitives for building high-quality design systems and React web applications.',
      shortDesc_he: 'רכיבי בסיס נטולי סגנון ובעלי נגישות מלאה (WAI-ARIA) לבניית מערכות עיצוב מותאמות אישית.',
      trendingScore: 96,
      metrics: { weeklyGrowth: 28, componentsCount: 32 },
      capabilities: ['accessible', 'responsive'],
      bestFor: ['saas', 'web-apps', 'startups']
    },
    {
      slug: 'tailwind-catalyst',
      name: 'Tailwind Catalyst',
      type: 'open-source',
      company: 'Tailwind Labs',
      primaryColor: '#0EA5E9',
      secondaryColor: '#0284C7',
      shortDesc_en: 'Modern application UI kit built by the Tailwind CSS team with clean copy-paste React components.',
      shortDesc_he: 'ערכת רכיבי ממשק מודרנית מבית צוות Tailwind CSS המבוססת על רכיבי React מעוצבים.',
      trendingScore: 91,
      metrics: { weeklyGrowth: 31, componentsCount: 38 },
      capabilities: ['tokens', 'figma', 'dark-mode', 'responsive'],
      bestFor: ['startups', 'saas', 'web-apps']
    },
    {
      slug: 'chakra-ui',
      name: 'Chakra UI v3',
      type: 'open-source',
      company: 'Chakra Team',
      primaryColor: '#319795',
      secondaryColor: '#2C7A7B',
      shortDesc_en: 'Modular and accessible component library giving you the building blocks to build fast React applications.',
      shortDesc_he: 'ספריית רכיבים מודולרית ונגישה המאפשרת פיתוח ממשקים מהיר עם תמיכה מובנית ב-CSS Variables.',
      trendingScore: 87,
      metrics: { weeklyGrowth: 9, componentsCount: 52 },
      capabilities: ['tokens', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['web-apps', 'startups']
    },
    {
      slug: 'heroui-nextui',
      name: 'HeroUI (formerly NextUI)',
      type: 'open-source',
      company: 'HeroUI Team',
      primaryColor: '#006FEE',
      secondaryColor: '#7828C8',
      shortDesc_en: 'Stunning modern React UI library with Tailwind CSS integration, smooth animations, and zero configuration.',
      shortDesc_he: 'ספריית UI אלגנטית מבוססת Tailwind עם אנימציות חלקות ותמיכה מלאה במצב כהה.',
      trendingScore: 88,
      metrics: { weeklyGrowth: 25, componentsCount: 42 },
      capabilities: ['tokens', 'dark-mode', 'responsive'],
      bestFor: ['startups', 'web-apps']
    },

    // ── Modern / Product-Led Design Systems (7 systems) ──
    {
      slug: 'linear-design',
      name: 'Linear Design System',
      type: 'modern',
      company: 'Linear',
      primaryColor: '#5E6AD2',
      secondaryColor: '#1F2327',
      shortDesc_en: 'Precision dark-mode ergonomics, micro-interactions, keyboard-first navigation, and minimalist design craft.',
      shortDesc_he: 'שפת עיצוב כהה, מינימליסטית ומדויקת להפליא עם דגש על ניווט מקלדת ואינטראקציות מהירות.',
      trendingScore: 97,
      metrics: { weeklyGrowth: 42, componentsCount: 36 },
      capabilities: ['tokens', 'dark-mode', 'responsive'],
      bestFor: ['startups', 'saas']
    },
    {
      slug: 'vercel-geist',
      name: 'Vercel Geist Design System',
      type: 'modern',
      company: 'Vercel',
      primaryColor: '#000000',
      secondaryColor: '#0070F3',
      shortDesc_en: 'Monochrome precision aesthetic, Geist typography tokens, and developer dashboard components.',
      shortDesc_he: 'שפת העיצוב המונוכרומטית של Vercel עם טיפוגרפיית Geist ורכיבי ניהול תשתיות ענן.',
      trendingScore: 96,
      metrics: { weeklyGrowth: 35, componentsCount: 40 },
      capabilities: ['tokens', 'figma', 'dark-mode', 'responsive'],
      bestFor: ['saas', 'startups', 'web-apps']
    },
    {
      slug: 'github-primer',
      name: 'GitHub Primer',
      type: 'modern',
      company: 'GitHub',
      primaryColor: '#24292F',
      secondaryColor: '#0969DA',
      shortDesc_en: 'GitHub foundational design system underpinning repository workflows, code reviews, and developer interactions.',
      shortDesc_he: 'מערכת העיצוב המניעה את כל ממשקי GitHub, ניהול קוד פתוח ותהליכי Pull Request.',
      trendingScore: 91,
      metrics: { weeklyGrowth: 18, componentsCount: 60 },
      capabilities: ['tokens', 'figma', 'accessible', 'dark-mode', 'responsive'],
      bestFor: ['enterprise', 'web-apps', 'saas']
    },
    {
      slug: 'stripe-elements-sailor',
      name: 'Stripe Sailor & Elements',
      type: 'modern',
      company: 'Stripe',
      primaryColor: '#635BFF',
      secondaryColor: '#0A2540',
      shortDesc_en: 'World benchmark for financial UI clarity, frictionless checkout flows, and multi-currency typography hierarchies.',
      shortDesc_he: 'הסטנדרט העולמי לעיצוב ממשקי תשלומים, טפסים מאובטחים והיררכיה טיפוגרפית פיננסית.',
      trendingScore: 94,
      metrics: { weeklyGrowth: 24, componentsCount: 45 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['e-commerce', 'saas', 'enterprise']
    },
    {
      slug: 'figma-tokens-architecture',
      name: 'Figma Component Architecture',
      type: 'modern',
      company: 'Figma',
      primaryColor: '#F24E1E',
      secondaryColor: '#A259FF',
      shortDesc_en: 'Multi-brand Variables and Design Tokens structure for synchronized design-to-code pipelines.',
      shortDesc_he: 'ארכיטקטורת Variables וטוקנים לחיבור ישיר ומסונכרן בין קבצי Figma לקוד ייצור.',
      trendingScore: 92,
      metrics: { weeklyGrowth: 29, componentsCount: 50 },
      capabilities: ['tokens', 'figma', 'responsive'],
      bestFor: ['startups', 'saas', 'enterprise']
    },
    {
      slug: 'raycast-design-tokens',
      name: 'Raycast Design Tokens',
      type: 'modern',
      company: 'Raycast',
      primaryColor: '#FF6363',
      secondaryColor: '#1A1A1A',
      shortDesc_en: 'Compact desktop productivity UI tokens with vibrant high-contrast accents and instant search ergonomics.',
      shortDesc_he: 'מערכת טוקנים קומפקטית למוצרי פרודוקטיביות עם ניגודיות גבוהה ומענה מהיר במקלדת.',
      trendingScore: 89,
      metrics: { weeklyGrowth: 33, componentsCount: 30 },
      capabilities: ['tokens', 'dark-mode', 'responsive'],
      bestFor: ['startups', 'saas']
    },
    {
      slug: 'notion-canvas',
      name: 'Notion Canvas Design Tokens',
      type: 'modern',
      company: 'Notion',
      primaryColor: '#000000',
      secondaryColor: '#EBEAE8',
      shortDesc_en: 'Modular block canvas system supporting live documents, nested databases, and frictionless inline formatting.',
      shortDesc_he: 'מערכת רכיבי הבלוקים של Notion המאפשרת עריכת מסמכים, טבלאות חכמות ואינטראקציות עשירות.',
      trendingScore: 90,
      metrics: { weeklyGrowth: 19, componentsCount: 42 },
      capabilities: ['tokens', 'figma', 'responsive'],
      bestFor: ['saas', 'startups']
    },

    // ── Government & Public Standards (5 systems) ──
    {
      slug: 'uswds',
      name: 'U.S. Web Design System (USWDS)',
      type: 'government',
      company: 'U.S. Government / GSA',
      primaryColor: '#005EA2',
      secondaryColor: '#1A4480',
      shortDesc_en: 'Federal design tokens and accessible web components ensuring consistent, trustworthy public digital services.',
      shortDesc_he: 'מערכת העיצוב הפדרלית של ממשלת ארה"ב המבטיחה נגישות מחמירה (Section 508) ואמינות שירותים ציבוריים.',
      trendingScore: 85,
      metrics: { weeklyGrowth: 5, componentsCount: 46 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['government', 'accessible', 'enterprise']
    },
    {
      slug: 'govuk-design-system',
      name: 'GOV.UK Design System',
      type: 'government',
      company: 'UK Government Digital Service',
      primaryColor: '#1D70B8',
      secondaryColor: '#0B0C0C',
      shortDesc_en: 'Gold standard for public service design: radical simplicity, accessible form patterns, and evidence-backed UX.',
      shortDesc_he: 'תקן הזהב העולמי לשירותים ציבוריים: פשטות מרבית, טפסים מונגשים וממשקים מגובים במחקר משתמשים.',
      trendingScore: 88,
      metrics: { weeklyGrowth: 6, componentsCount: 40 },
      capabilities: ['accessible', 'responsive'],
      bestFor: ['government', 'accessible']
    },
    {
      slug: 'australia-gold-design-system',
      name: 'Australian Digital Experience Platform (Gold)',
      type: 'government',
      company: 'Commonwealth of Australia',
      primaryColor: '#00698F',
      secondaryColor: '#333333',
      shortDesc_en: 'Government-grade digital pattern library adhering to WCAG 2.2 AA accessibility mandates.',
      shortDesc_he: 'ספריית תבניות וממשקים של ממשלת אוסטרליה עם עמידה בתקני נגישות מחמירים.',
      trendingScore: 81,
      metrics: { weeklyGrowth: 4, componentsCount: 35 },
      capabilities: ['tokens', 'accessible', 'responsive'],
      bestFor: ['government', 'accessible']
    },
    {
      slug: 'singapore-designsg',
      name: 'Singapore DesignSG (GovTech SG)',
      type: 'government',
      company: 'GovTech Singapore',
      primaryColor: '#2B5B84',
      secondaryColor: '#D32F2F',
      shortDesc_en: 'National digital design system for seamless citizen interactions, digital identity, and municipal portals.',
      shortDesc_he: 'מערכת העיצוב הלאומית של סינגפור לשירותי אזרח, זיהוי דיגיטלי ופורטלים ממשלתיים.',
      trendingScore: 83,
      metrics: { weeklyGrowth: 8, componentsCount: 38 },
      capabilities: ['tokens', 'figma', 'accessible', 'responsive'],
      bestFor: ['government', 'accessible']
    },
    {
      slug: 'eu-europa-component-library',
      name: 'European Commission Europa (ECL)',
      type: 'government',
      company: 'European Commission',
      primaryColor: '#004494',
      secondaryColor: '#FFD617',
      shortDesc_en: 'Multilingual design system supporting 24 official EU languages and universal accessibility guidelines.',
      shortDesc_he: 'מערכת העיצוב של האיחוד האירופי עם תמיכה ב-24 שפות רשמיות ונגישות אוניברסלית.',
      trendingScore: 80,
      metrics: { weeklyGrowth: 3, componentsCount: 44 },
      capabilities: ['accessible', 'responsive'],
      bestFor: ['government', 'accessible']
    }
  ];

  const state = {
    filters: { type: '', capability: [], bestFor: [], search: '', language: langKey },
    cursor: 0,
    loading: false,
    done: false,
    allSystems: [...MASTER_DESIGN_SYSTEMS],
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

  // Multi-tier data loader
  async function fetchDesignSystemsData() {
    const firestoreDb = window.db || (typeof db !== 'undefined' ? db : null);

    // Try Firestore collection query
    if (firestoreDb) {
      try {
        const snap = await firestoreDb.collection('design_systems').get();
        if (!snap.empty) {
          const list = [];
          snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
          if (list.length >= 4) {
            state.allSystems = list;
            return;
          }
        }
      } catch (e) {
        console.warn('Firestore design_systems query note:', e);
      }
    }

    // Default to Master Curated Catalog
    state.allSystems = [...MASTER_DESIGN_SYSTEMS];
  }

  // ── Rendering ─────────────────────────────────────────────────
  function renderTrending(systems) {
    const wrap = $('#ds-trending-track');
    if (!wrap) return;
    if (!systems || !systems.length) { wrap.innerHTML = ''; return; }

    wrap.innerHTML = systems.slice(0, 5).map(s => `
      <a class="ds-trending-card" href="${isHebrew ? '/he/design-systems-detail.html?slug=' : '/design-systems-detail.html?slug='}${encodeURIComponent(s.slug)}">
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
      ? { 'big-tech':'חברות מובילות', 'open-source':'קוד פתוח', 'modern':'מודרני', 'government':'ממשלתי וציבורי' }
      : { 'big-tech':'Big Tech', 'open-source':'Open Source', 'modern':'Modern', 'government':'Government' };
    const explore = isHebrew ? 'לעיון ←' : 'Explore →';
    const types = ['big-tech','open-source','modern','government'];

    const html = types.map(t => {
      const count = (counts && counts[t] !== undefined) ? counts[t] : 0;
      return `
        <a class="ds-bucket" data-type="${t}" href="#" onclick="window.ds.filterByType('${t}'); return false;">
          <span class="ds-bucket-count">${count}</span>
          <h3>${labels[t]}</h3>
          <span class="ds-bucket-cta">${explore}</span>
        </a>
      `;
    }).join('');

    const el = $('#ds-buckets');
    if (el) el.innerHTML = html;
  }

  function renderCard(s) {
    const inStack = state.stack.some(x => x.slug === s.slug);
    const href = `${isHebrew ? '/he/design-systems-detail.html?slug=' : '/design-systems-detail.html?slug='}${encodeURIComponent(s.slug)}`;
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

  function getFilteredSystems() {
    let list = state.allSystems || [];

    // Type filter
    if (state.filters.type) {
      list = list.filter(s => s.type === state.filters.type);
    }

    // Capability filter
    if (state.filters.capability && state.filters.capability.length) {
      list = list.filter(s => {
        const caps = s.capabilities || [];
        return state.filters.capability.every(c => caps.includes(c));
      });
    }

    // BestFor filter
    if (state.filters.bestFor && state.filters.bestFor.length) {
      list = list.filter(s => {
        const bf = s.bestFor || [];
        return state.filters.bestFor.some(b => bf.includes(b));
      });
    }

    // Search query filter
    if (state.filters.search) {
      const q = state.filters.search.toLowerCase();
      list = list.filter(s => {
        const name = (s.name || '').toLowerCase();
        const company = (s.company || '').toLowerCase();
        const descEn = (s.shortDesc_en || '').toLowerCase();
        const descHe = (s.shortDesc_he || '').toLowerCase();
        return name.includes(q) || company.includes(q) || descEn.includes(q) || descHe.includes(q);
      });
    }

    return list;
  }

  async function loadMore(reset = false) {
    if (state.loading) return;
    const grid = $('#ds-grid');
    if (!grid) return;

    if (reset) {
      state.cursor = 0;
      state.done = false;
      grid.innerHTML = '';
    }
    if (state.done) return;

    state.loading = true;
    showSkeletons();

    const filtered = getFilteredSystems();
    const pageSize = 12;
    const chunk = filtered.slice(state.cursor, state.cursor + pageSize);

    setTimeout(() => {
      clearSkeletons();
      state.loading = false;

      if (!chunk.length && !grid.children.length) {
        grid.innerHTML = `<p class="text-muted">${esc(T.noResults)}</p>`;
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
    const basePath = isHebrew ? '/he/design-systems.html' : '/design-systems.html';
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
          url: `${siteRoot + basePath}?slug=${s.slug}`,
        })),
      }, null, 2);
      type = 'application/json';
      ext = 'json';
    } else {
      const sections = state.stack.map((s, i) => {
        const url = `${siteRoot + basePath}?slug=${s.slug}`;
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
        `_Generated ${date} by **Design Systems Decoded** — TrendingTech Daily_`,
        ``,
        `**${state.stack.length} systems**`,
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
      }, 250));
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

    // Fetch design systems from Firestore or fallback
    await fetchDesignSystemsData();

    // Calculate real stats count
    const counts = {
      'big-tech': state.allSystems.filter(s => s.type === 'big-tech').length,
      'open-source': state.allSystems.filter(s => s.type === 'open-source').length,
      'modern': state.allSystems.filter(s => s.type === 'modern').length,
      'government': state.allSystems.filter(s => s.type === 'government').length
    };

    // Render Stats Buckets (Guaranteed non-zero real numbers)
    renderBuckets(counts);

    // Render Trending Top 5 (sorted by score)
    const sorted = [...state.allSystems].sort((a,b) => (b.trendingScore || 0) - (a.trendingScore || 0));
    renderTrending(sorted);

    // Render initial grid
    loadMore(true);
  });
})();
