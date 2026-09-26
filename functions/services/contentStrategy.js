/**
 * contentStrategy.js
 * ---------------------------------------------------------------------------
 * Time-boxed content strategy engine for TrendingTechDaily.
 *
 * ACTIVE: May 16, 2026 → August 16, 2026 (3 months)
 *
 * Strategy:
 *   • 60% of crawled articles should focus on "AI coding skills" — building
 *     complex systems with Claude Code / Antigravity, MCP, skills, agents,
 *     multi-file edits, browser automation, video generation, etc.
 *   • At least 1× per week: an original Antigravity feature article is
 *     generated from internal knowledge (no external source required).
 *
 * After the end date, the module returns pass-through defaults so the site
 * reverts to its normal topic distribution without any code changes.
 */

const { logger, db } = require('../config');

// ─── Strategy window ──────────────────────────────────────────────────────────
const STRATEGY_START = new Date('2026-05-16T00:00:00Z');
const STRATEGY_END   = new Date('2026-08-16T23:59:59Z');

/** Returns true while the content strategy is active. */
function isStrategyActive() {
  const now = new Date();
  return now >= STRATEGY_START && now <= STRATEGY_END;
}

// ─── Focus-topic detection ────────────────────────────────────────────────────
// Keywords that signal an article is about AI coding / agentic coding / skills

const FOCUS_KEYWORDS_EN = [
  // Core agentic coding tools
  'claude code', 'claude-code', 'antigravity', 'cursor', 'windsurf', 'cline',
  'aider', 'copilot', 'github copilot', 'devin', 'codex',
  // Concepts
  'ai coding', 'ai agent', 'agentic', 'coding agent', 'code agent',
  'vibe coding', 'vibe-coding', 'vibecoding',
  'ai pair programming', 'ai developer', 'ai engineer',
  'mcp server', 'model context protocol', 'mcp tool',
  'ai skill', 'skills system', 'prompt engineering',
  'multi-file edit', 'autonomous coding', 'self-healing code',
  'ai-generated code', 'ai code generation', 'code generation',
  'llm coding', 'ai ide', 'ai terminal',
  // Specific technologies often built with agentic tools
  'remotion', 'browser automation', 'puppeteer ai', 'playwright ai',
  'firebase functions ai', 'serverless ai',
  // Companies/products
  'anthropic', 'claude 4', 'claude opus', 'claude sonnet',
  'openai codex', 'gemini code', 'google ai studio',
];

const FOCUS_KEYWORDS_HE = [
  'קוד בינה מלאכותית', 'סוכן קידוד', 'קידוד אוטונומי',
  'כלי פיתוח ai', 'עוזר תכנות', 'בינה מלאכותית לפיתוח',
  'claude code', 'antigravity', 'cursor', 'copilot',
  'mcp', 'model context protocol',
  'סקיל', 'skills', 'agentic',
  'vibe coding', 'ויב קודינג',
  'פרומפט אינג\'ניירינג', 'הנדסת פרומפטים',
  'כתיבת קוד עם ai', 'פיתוח עם בינה מלאכותית',
  // Additional shorter fragments for broader matching
  'כלי ai', 'עוזר ai', 'סוכן ai',
  'קידוד עם', 'בינה מלאכותית בפיתוח',
  'עוזר קידוד', 'כלי פיתוח', 'ai לפיתוח',
  'קוד אוטומטי', 'יצירת קוד',
];

/**
 * Returns true if a title+description match the focus-topic keywords.
 */
function isFocusTopic(title, description, language) {
  const text = ((title || '') + ' ' + (description || '')).toLowerCase();
  const keywords = language === 'he' ? [...FOCUS_KEYWORDS_HE, ...FOCUS_KEYWORDS_EN] : FOCUS_KEYWORDS_EN;
  return keywords.some(kw => text.includes(kw));
}

// ─── Article prioritization (60% focus) ───────────────────────────────────────

/**
 * Reorder a shuffled article list so that ~60% of the first `count` items
 * are focus-topic articles (when available). Non-focus articles fill the rest.
 *
 * @param {Array} articles - Shuffled RSS items [{title, description, ...}]
 * @param {number} count   - How many articles we intend to generate
 * @param {string} language - 'en' | 'he'
 * @returns {Array} - Reordered articles with focus-topic boosting
 */
function boostFocusTopics(articles, count, language) {
  if (!isStrategyActive()) return articles; // pass-through after expiry

  const focus = [];
  const other = [];

  for (const art of articles) {
    if (isFocusTopic(art.title, art.description, language)) {
      focus.push(art);
    } else {
      other.push(art);
    }
  }

  const focusTarget = Math.ceil(count * 0.6); // 60% focus
  const otherTarget = count - focusTarget;

  // Interleave: focus items first, then others, then remaining
  const result = [
    ...focus.slice(0, focusTarget),
    ...other.slice(0, otherTarget),
    ...focus.slice(focusTarget),
    ...other.slice(otherTarget),
  ];

  logger.info(`[contentStrategy] Boosted: ${focus.length} focus / ${other.length} other items (target: ${focusTarget}/${count} focus). Strategy active: true`);
  return result;
}

// ─── Additional AI-coding RSS sources ─────────────────────────────────────────
// These are added to the existing RSS_SOURCES during the strategy window.

const FOCUS_RSS_SOURCES_EN = [
  { url: 'https://www.anthropic.com/research/rss.xml',              name: 'Anthropic Research', lang: 'en' },
  { url: 'https://simonwillison.net/atom/everything/',              name: 'Simon Willison',     lang: 'en' },
  { url: 'https://buttondown.com/ainews/rss',                       name: 'AI News',            lang: 'en' },
  { url: 'https://www.latent.space/feed',                           name: 'Latent Space',       lang: 'en' },
  { url: 'https://hnrss.org/newest?q=claude+code+OR+agentic+coding+OR+vibe+coding+OR+cursor+OR+mcp', name: 'HN AI Coding', lang: 'en' },
];

/**
 * Returns additional RSS sources to add during the strategy window.
 */
function getAdditionalRssSources() {
  if (!isStrategyActive()) return [];
  return FOCUS_RSS_SOURCES_EN;
}

// ─── Weekly Antigravity feature article ───────────────────────────────────────

const ANTIGRAVITY_LOG_DOC = 'settings/antigravityArticleLog';

/**
 * Check if we should generate an Antigravity feature article this run.
 * Returns true at most once every 7 days.
 */
async function shouldGenerateAntigravityArticle() {
  if (!isStrategyActive()) return false;

  try {
    const docRef = db.doc(ANTIGRAVITY_LOG_DOC);
    const snap = await docRef.get();
    const data = snap.exists ? snap.data() : {};
    const lastGenerated = data.lastGeneratedAt
      ? (data.lastGeneratedAt.toMillis ? data.lastGeneratedAt.toMillis() : new Date(data.lastGeneratedAt).getTime())
      : 0;

    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return (Date.now() - lastGenerated) >= sevenDaysMs;
  } catch (err) {
    logger.warn('[contentStrategy] Error checking Antigravity schedule:', err.message);
    return false;
  }
}

/**
 * Mark that we generated an Antigravity article today.
 */
async function markAntigravityArticleGenerated() {
  try {
    await db.doc(ANTIGRAVITY_LOG_DOC).set({
      lastGeneratedAt: new Date(),
    }, { merge: true });
  } catch (err) {
    logger.warn('[contentStrategy] Error marking Antigravity article:', err.message);
  }
}

// ─── Antigravity feature topics (rotating pool) ──────────────────────────────
// Each entry is a self-contained article topic that can be generated from
// internal knowledge without needing an external news source.

const ANTIGRAVITY_FEATURE_TOPICS = {
  en: [
    {
      title: 'How Antigravity Uses Skills to Build Reusable AI Workflows',
      prompt: `Write a detailed technology article about "Skills" in Antigravity (Google DeepMind's AI coding assistant). Skills are reusable instruction files (.md) that teach the AI how to perform specific tasks — like writing Hebrew content with proper grammar rules, or following a specific deployment pipeline. Explain how skills work as persistent context that survives across conversations, how users create them from successful interactions, and why this is a breakthrough in making AI coding assistants more consistent and project-aware. Include practical examples of skill types: coding standards, deployment checklists, content writing guidelines, and domain-specific knowledge. Compare to how traditional developers use documentation and runbooks, but skills are machine-readable and automatically applied.`,
    },
    {
      title: 'Antigravity\'s Knowledge Items: How AI Remembers Your Entire Codebase',
      prompt: `Write a technology article about Knowledge Items (KIs) in Antigravity. KIs are curated, distilled knowledge snapshots that persist across conversations — they capture architecture decisions, troubleshooting patterns, API patterns, and implementation details specific to a user's codebase. Explain how KIs are automatically created from successful problem-solving sessions, stored as structured metadata.json + artifacts, and retrieved at the start of each new conversation. Discuss why this solves the "context amnesia" problem in AI coding — where each new chat forgets everything. Include examples: a KI about a Firebase project's deployment patterns, a KI about a React component library's conventions, a KI about known bugs and their fixes.`,
    },
    {
      title: 'Building Automated Video Pipelines with Antigravity and Remotion',
      prompt: `Write a technology article about how Antigravity enables non-developers to build sophisticated automated video generation pipelines. Walk through a real-world example: using Antigravity to create a system that automatically generates weekly news digest videos with AI-generated scripts, text-to-speech narration, animated characters (using Google Veo), chroma-keying, and automatic publishing to YouTube and Instagram. Explain the technology stack: Firebase Cloud Functions for orchestration, ElevenLabs for TTS, Remotion on AWS Lambda for video rendering, and how Antigravity coordinated building all of these components through natural language conversations.`,
    },
    {
      title: 'MCP Servers in Antigravity: Connecting AI to Any External Tool',
      prompt: `Write a technology article about Model Context Protocol (MCP) servers in Antigravity. Explain how MCP extends an AI coding assistant's capabilities by connecting it to external tools and services — like Google's Stitch for UI design, NotebookLM for research, and Remotion for video documentation. Cover how MCP servers work (JSON-RPC over stdio/HTTP), how Antigravity automatically discovers and uses available tools, and why this is the future of AI-assisted development — where the AI doesn't just write code but also designs UIs, queries databases, manages deployments, and creates documentation. Include practical examples of MCP-powered workflows.`,
    },
    {
      title: 'From Idea to Production in One Conversation: Antigravity\'s Agentic Workflow',
      prompt: `Write a technology article about Antigravity's end-to-end agentic coding capability — the ability to take a user's natural language description and autonomously plan, implement, test, and deploy a complete feature or application. Explain the tools involved: file creation/editing, terminal commands, browser automation, web search, image generation, and MCP integrations. Walk through a concrete example of building and deploying a complete web feature (e.g., a newsletter subscription system with email verification, Firestore storage, and admin dashboard) from a single conversation. Discuss guardrails: user approval for destructive commands, safe-to-auto-run logic, and how the AI balances autonomy with user control.`,
    },
    {
      title: 'How Antigravity Manages Multi-Project Ecosystems with Persistent Context',
      prompt: `Write a technology article about managing multiple interconnected projects using Antigravity. Explain how knowledge items, conversation history, and skills allow a developer to maintain context across many repositories — a Firebase backend, a React frontend, a mobile app (Capacitor), video generation pipeline, and marketing sites. Cover the challenge of "project switching" in AI assistants and how Antigravity's persistent brain system solves it. Include how the same AI maintains awareness of shared dependencies, consistent coding patterns, and cross-project deployment sequences.`,
    },
    {
      title: 'Browser Automation Superpowers: How Antigravity Tests and Deploys Your Apps',
      prompt: `Write a technology article about Antigravity's built-in browser automation capabilities. Explain how the AI can open browser windows, navigate to pages, click buttons, fill forms, take screenshots, and record sessions — all as part of a natural coding workflow. Cover use cases: visual testing (checking if a UI renders correctly after code changes), Firebase Console operations (creating indexes, managing settings), deployment verification, and even automating admin workflows. Compare to traditional browser automation (Selenium, Playwright) and explain why having it built into the AI coding assistant is a paradigm shift.`,
    },
    {
      title: 'AI-Powered Content Localization: How Antigravity Handles Hebrew RTL Sites',
      prompt: `Write a technology article about using Antigravity to build and maintain bilingual (English/Hebrew) web applications. Cover the unique challenges of RTL (right-to-left) language support: CSS direction properties, text alignment, mirrored layouts, proper Hebrew typography (ktiv male), and cultural localization. Explain how Antigravity's Hebrew Content Writer skill enforces grammatical standards automatically, and how the AI generates, translates, and maintains parallel content across both language versions of a site. Include specific examples from building a tech news site with full Hebrew support.`,
    },
  ],
  he: [
    {
      title: 'איך Antigravity משתמש ב-Skills ליצירת תהליכי עבודה חוזרים עם בינה מלאכותית',
      prompt: `כתוב כתבה טכנולוגית מפורטת על "Skills" ב-Antigravity — עוזר הקידוד של Google DeepMind. Skills הם קבצי הוראות (.md) שמלמדים את הבינה המלאכותית לבצע משימות ספציפיות. הסבר איך הם עובדים, למה זה פריצת דרך, ותן דוגמאות מעשיות. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
    {
      title: 'פריטי ידע ב-Antigravity: איך בינה מלאכותית זוכרת את כל הקוד שלך',
      prompt: `כתוב כתבה טכנולוגית על Knowledge Items ב-Antigravity. הסבר איך המערכת שומרת ידע בין שיחות, פותרת את בעיית "אובדן הזיכרון" של עוזרי AI, ואיך זה משפיע על פרודוקטיביות מפתחים. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
    {
      title: 'בניית מערכות וידאו אוטומטיות עם Antigravity: מסקריפט ועד יוטיוב',
      prompt: `כתוב כתבה על איך Antigravity מאפשר לבנות מערכות ייצור וידאו אוטומטיות — כולל כתיבת תסריט, המרה לדיבור, יצירת אנימציות, ופרסום ליוטיוב ואינסטגרם — הכל דרך שיחה בשפה טבעית. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
    {
      title: 'שרתי MCP ב-Antigravity: חיבור בינה מלאכותית לכל כלי חיצוני',
      prompt: `כתוב כתבה על Model Context Protocol ואיך Antigravity מתחבר לכלים חיצוניים כמו Stitch לעיצוב, NotebookLM למחקר, ו-Remotion לוידאו. הסבר למה זה עתיד הפיתוח עם AI. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
    {
      title: 'מרעיון לפרודקשן בשיחה אחת: תהליך העבודה האוטונומי של Antigravity',
      prompt: `כתוב כתבה על היכולת של Antigravity לקחת תיאור בשפה טבעית ולבנות, לבדוק ולפרוס פיצ'ר שלם בשיחה אחת. הסבר את הכלים, תן דוגמאות, ודון באיזון בין אוטונומיה לשליטת המשתמש. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
    {
      title: 'אוטומציית דפדפן ב-Antigravity: איך AI בודק ומפרסם את האפליקציות שלך',
      prompt: `כתוב כתבה על יכולות אוטומציית הדפדפן של Antigravity — ניווט בדפים, לחיצה על כפתורים, צילומי מסך, והקלטת סשנים — הכל כחלק מתהליך קידוד טבעי. השווה לכלים מסורתיים כמו Selenium. כתוב בעברית עיתונאית מקצועית עם כתיב מלא.`,
    },
  ],
};

/**
 * Pick the next Antigravity topic that hasn't been published yet.
 * Checks existing articles for title overlap to avoid duplicates.
 *
 * @param {string} language - 'en' | 'he'
 * @returns {{ title: string, prompt: string } | null}
 */
async function pickAntigravityTopic(language) {
  const topics = ANTIGRAVITY_FEATURE_TOPICS[language] || ANTIGRAVITY_FEATURE_TOPICS.en;
  const collection = language === 'he' ? 'he_articles' : 'articles';

  try {
    // Fetch recent titles to check for duplicates
    const recentSnap = await db.collection(collection)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const existingTitles = new Set();
    recentSnap.forEach(doc => {
      const d = doc.data();
      if (d.title) existingTitles.add(d.title.toLowerCase().trim());
    });

    // Pick the first topic whose title hasn't been used
    for (const topic of topics) {
      const titleLower = topic.title.toLowerCase().trim();
      // Check if any existing title contains significant keywords from this topic
      const keywords = titleLower.split(/\s+/).filter(w => w.length > 4);
      const alreadyUsed = [...existingTitles].some(existing => {
        const matches = keywords.filter(kw => existing.includes(kw));
        return matches.length >= 3;
      });

      if (!alreadyUsed) return topic;
    }

    logger.info('[contentStrategy] All Antigravity topics already published — cycling back to first.');
    return topics[Math.floor(Math.random() * topics.length)];
  } catch (err) {
    logger.warn('[contentStrategy] Error picking Antigravity topic:', err.message);
    return topics[0];
  }
}

module.exports = {
  isStrategyActive,
  isFocusTopic,
  boostFocusTopics,
  getAdditionalRssSources,
  shouldGenerateAntigravityArticle,
  markAntigravityArticleGenerated,
  pickAntigravityTopic,
  FOCUS_KEYWORDS_EN,
  FOCUS_KEYWORDS_HE,
};
