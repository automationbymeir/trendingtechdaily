/**
 * videoConcept.js
 * ---------------------------------------------------------------------------
 * Classifies an article into ONE of 15 visual concept categories used by the
 * Remotion video pipeline. Each category maps to:
 *   - A set of Pexels stock-video search queries (in pexelsService.js).
 *   - A Lottie animation file (in video-generator/public/lottie/).
 *   - A flag indicating whether the special ChatGPT-mockup scene is allowed.
 *
 * The classifier returns the category SLUG plus 3 specific search keywords
 * derived from the article so we can pull more on-topic clips than the generic
 * category defaults.
 */

const { logger } = require('../config');

const CATEGORIES = [
  'ai-assistant',       // ChatGPT, Claude, Gemini, Copilot, LLMs, prompts
  'autonomous-vehicle', // Self-driving cars, robotaxis, Tesla FSD, Waymo
  'robot-humanoid',     // Robots, Boston Dynamics, Figure, Optimus, automation
  'smartphone',         // Phone launches, iPhone, Pixel, Galaxy, mobile
  'gaming',             // Games, consoles, esports, VR gaming
  'crypto-finance',     // Bitcoin, Ethereum, Web3, fintech, stocks
  'cybersecurity',      // Hacks, breaches, malware, encryption, privacy
  'social-media',       // Meta, X, Instagram, TikTok, platforms
  'space',              // SpaceX, NASA, satellites, Mars, rockets
  'gadget',             // Wearables, headphones, smart-home, accessories
  'cloud-datacenter',   // AWS, Azure, servers, networking, infra
  'biotech-health',     // Medical AI, healthtech, biotech, wearables
  'electric-vehicle',   // EVs (non-autonomous), charging, batteries
  'ar-vr',              // VR headsets, AR, metaverse, Apple Vision Pro
  'generic-tech',       // Default — code on screens, abstract circuit board
];

const CATEGORY_DESCRIPTIONS = {
  'ai-assistant':       'ChatGPT, Claude, Gemini, Copilot, large language models, AI chatbots, prompts',
  'autonomous-vehicle': 'self-driving cars, robotaxis, Tesla FSD, Waymo, autonomous trucks',
  'robot-humanoid':     'humanoid robots, Boston Dynamics, Figure, Tesla Optimus, factory automation',
  'smartphone':         'phone launches, iPhone, Pixel, Galaxy, mobile features',
  'gaming':             'video games, consoles, PlayStation, Xbox, Nintendo, esports, game studios',
  'crypto-finance':     'cryptocurrency, Bitcoin, Ethereum, Web3, fintech, stock market, investing',
  'cybersecurity':      'hacks, data breaches, malware, ransomware, encryption, privacy, vulnerabilities',
  'social-media':       'Meta, Facebook, Instagram, X/Twitter, TikTok, YouTube, social platforms',
  'space':              'SpaceX, NASA, satellites, rocket launches, Mars, space exploration',
  'gadget':             'wearables, headphones, smart-home, accessories, consumer hardware reviews',
  'cloud-datacenter':   'AWS, Azure, Google Cloud, servers, data centers, networking, enterprise infra',
  'biotech-health':     'medical AI, healthtech, biotech, FDA approvals, health wearables, drug discovery',
  'electric-vehicle':   'electric cars (non-autonomous focus), charging, batteries, EV market',
  'ar-vr':              'VR headsets, AR glasses, Apple Vision Pro, Meta Quest, metaverse',
  'generic-tech':       'general technology news that doesn\'t fit a more specific category',
};

/**
 * Default Pexels search queries per category. These run if the article-specific
 * keywords return too few clips.
 */
const CATEGORY_DEFAULT_QUERIES = {
  'ai-assistant':       ['typing on laptop', 'computer screen code', 'artificial intelligence'],
  'autonomous-vehicle': ['self driving car', 'autonomous car interior', 'highway driving'],
  'robot-humanoid':     ['humanoid robot', 'robot arm factory', 'robotics'],
  'smartphone':         ['smartphone close up', 'mobile phone hands', 'phone screen'],
  'gaming':             ['video game console', 'gaming setup', 'esports'],
  'crypto-finance':     ['cryptocurrency', 'stock market chart', 'bitcoin'],
  'cybersecurity':      ['cybersecurity hacker', 'computer code security', 'data center'],
  'social-media':       ['social media phone', 'instagram scrolling', 'phone notifications'],
  'space':              ['rocket launch', 'satellite earth', 'astronaut space'],
  'gadget':             ['headphones close up', 'smartwatch', 'gadget unboxing'],
  'cloud-datacenter':   ['data center server', 'cloud computing', 'network cables'],
  'biotech-health':     ['medical technology', 'doctor laptop', 'biotech laboratory'],
  'electric-vehicle':   ['electric car charging', 'tesla charging', 'EV battery'],
  'ar-vr':              ['vr headset', 'virtual reality user', 'augmented reality'],
  'generic-tech':       ['technology abstract', 'computer circuit board', 'developer typing'],
};

/**
 * Lottie file names (must exist in video-generator/public/lottie/).
 */
const CATEGORY_LOTTIE = {
  'ai-assistant':       'ai-brain.json',
  'autonomous-vehicle': 'car-driving.json',
  'robot-humanoid':     'robot.json',
  'smartphone':         'phone.json',
  'gaming':             'gamepad.json',
  'crypto-finance':     'chart-up.json',
  'cybersecurity':      'shield.json',
  'social-media':       'social-likes.json',
  'space':              'rocket.json',
  'gadget':             'devices.json',
  'cloud-datacenter':   'cloud-server.json',
  'biotech-health':     'heartbeat.json',
  'electric-vehicle':   'battery.json',
  'ar-vr':              'vr-headset.json',
  'generic-tech':       'circuit.json',
};

/**
 * Classify an article. Returns { category, keywords[], pexelsQueries[], lottie, useChatGptMockup }.
 * If Gemini fails, returns a 'generic-tech' default — never throws.
 */
async function classifyArticleConcept(genAI, { title, excerpt, content }) {
  const safeTitle = (title || '').slice(0, 200);
  const safeExcerpt = (excerpt || '').slice(0, 400);
  const plainContent = (content || '').replace(/<[^>]+>/g, ' ').slice(0, 800);

  const categoryList = CATEGORIES.map(c => `  - ${c}: ${CATEGORY_DESCRIPTIONS[c]}`).join('\n');

  const prompt = `You are a video producer choosing B-roll for a tech-news short.
Pick the SINGLE best visual category for this article and propose 3 SPECIFIC stock-footage search queries (English, 2-4 words each) that would yield illustrative B-roll.

Article title: ${safeTitle}
Article excerpt: ${safeExcerpt}
Article body excerpt: ${plainContent}

Categories (pick exactly one slug):
${categoryList}

Return ONLY a JSON object of this shape:
{
  "category": "ai-assistant",
  "keywords": ["chatgpt typing animation", "person using laptop ai", "ai chat interface"],
  "useChatGptMockup": true
}

Rules:
- "category" MUST be one of the slugs listed above (lowercase, hyphenated).
- "keywords" are PEXELS SEARCH QUERIES — short, concrete, visual ("hands typing on laptop", not "AI revolution").
- "useChatGptMockup" should be true ONLY for the "ai-assistant" category AND only when the article is specifically about a chatbot interface like ChatGPT/Claude/Gemini/Copilot.
- Translate Hebrew titles mentally — choose category based on the SUBJECT, not language.`;

  try {
    const aiCallables = require('../callable/ai');
    const result = await aiCallables.generateContentWithRetry(genAI, prompt, []);
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return defaultConcept('classifier returned no JSON');

    const parsed = JSON.parse(m[0]);
    let category = String(parsed.category || '').toLowerCase().trim();
    if (!CATEGORIES.includes(category)) {
      logger.warn(`videoConcept: unknown category "${category}", defaulting to generic-tech`);
      category = 'generic-tech';
    }
    const rawKws = Array.isArray(parsed.keywords) ? parsed.keywords : [];
    const keywords = rawKws
      .map(k => String(k || '').trim())
      .filter(k => k && k.length <= 60)
      .slice(0, 3);

    const useChatGptMockup = !!parsed.useChatGptMockup && category === 'ai-assistant';

    const concept = {
      category,
      keywords,
      pexelsQueries: keywords.length ? keywords : CATEGORY_DEFAULT_QUERIES[category],
      defaultQueries: CATEGORY_DEFAULT_QUERIES[category],
      lottie: CATEGORY_LOTTIE[category],
      useChatGptMockup,
    };
    logger.info(`videoConcept: ${category} (kw=${keywords.join('|')}) mockup=${useChatGptMockup}`);
    return concept;
  } catch (err) {
    logger.warn('classifyArticleConcept failed, using default:', err.message);
    return defaultConcept(err.message);
  }
}

function defaultConcept(reason) {
  return {
    category: 'generic-tech',
    keywords: [],
    pexelsQueries: CATEGORY_DEFAULT_QUERIES['generic-tech'],
    defaultQueries: CATEGORY_DEFAULT_QUERIES['generic-tech'],
    lottie: CATEGORY_LOTTIE['generic-tech'],
    useChatGptMockup: false,
    fallbackReason: reason,
  };
}

module.exports = {
  CATEGORIES,
  CATEGORY_DEFAULT_QUERIES,
  CATEGORY_LOTTIE,
  classifyArticleConcept,
};
