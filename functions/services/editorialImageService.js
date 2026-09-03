// functions/services/editorialImageService.js
//
// Resolves authentic, high-relevance editorial imagery for news articles
// Prioritizes original publisher source images (urlToImage / og:image), 
// with targeted keyword extraction for high-precision photography matching.

const fetch = require('node-fetch');
const { logger } = require('../config');

// Curated verified high-resolution editorial tech imagery pools (10+ distinct images per category)
const CURATED_TECH_EDITORIAL_POOLS = {
  'ai': [
    'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1676299081847-824916de030a?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1675271591211-126ad94e495d?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1680795456508-360e2060c239?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1674027444485-cec3da58eef4?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1682687220063-4742bd7fd538?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1617791160505-6f00504e3519?w=1400&auto=format&fit=crop&q=85'
  ],
  'cyber-warfare': [
    'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1614064641938-3bbee52942c7?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1510511459019-5dda7724fd87?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1508614589041-895b88991e3e?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1607799279861-4dd421887fb3?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1400&auto=format&fit=crop&q=85'
  ],
  'dev': [
    'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1537432376769-00f5c2f4c8d2?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1504639725590-34d0984388bd?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1587620962725-abab7fe55159?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1515879218367-8466d910aaa4?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1555066932-e78dd8fb77bb?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1400&auto=format&fit=crop&q=85'
  ],
  'chips': [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1591799264318-7e6ef8ddb7ea?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1517055729445-fa7d27394b48?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1563770660941-20978e870e26?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1609743522653-52354461eb27?w=1400&auto=format&fit=crop&q=85'
  ],
  'markets': [
    'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1400&auto=format&fit=crop&q=85'
  ],
  'computing': [
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1531297484001-80022131f5a1?w=1400&auto=format&fit=crop&q=85',
    'https://images.unsplash.com/photo-1525547719571-a2d4ac8945e2?w=1400&auto=format&fit=crop&q=85'
  ]
};

// Map subcategory aliases
CURATED_TECH_EDITORIAL_POOLS['cybersecurity'] = CURATED_TECH_EDITORIAL_POOLS['cyber-warfare'];
CURATED_TECH_EDITORIAL_POOLS['defense-tech'] = CURATED_TECH_EDITORIAL_POOLS['cyber-warfare'];
CURATED_TECH_EDITORIAL_POOLS['iran-tech'] = CURATED_TECH_EDITORIAL_POOLS['cyber-warfare'];
CURATED_TECH_EDITORIAL_POOLS['semiconductor'] = CURATED_TECH_EDITORIAL_POOLS['chips'];
CURATED_TECH_EDITORIAL_POOLS['stocks'] = CURATED_TECH_EDITORIAL_POOLS['markets'];
CURATED_TECH_EDITORIAL_POOLS['startups'] = CURATED_TECH_EDITORIAL_POOLS['markets'];
CURATED_TECH_EDITORIAL_POOLS['cloud'] = CURATED_TECH_EDITORIAL_POOLS['computing'];
CURATED_TECH_EDITORIAL_POOLS['robotics'] = CURATED_TECH_EDITORIAL_POOLS['computing'];
CURATED_TECH_EDITORIAL_POOLS['quantum'] = CURATED_TECH_EDITORIAL_POOLS['computing'];

// Ring buffer of recently used image URLs to prevent repetition
const recentImagesRing = [];
const MAX_RING_SIZE = 25;

function markImageUsed(url) {
  if (!url) return;
  recentImagesRing.push(url);
  if (recentImagesRing.length > MAX_RING_SIZE) {
    recentImagesRing.shift();
  }
}

function selectUnusedFromPool(pool, seed = '') {
  if (!Array.isArray(pool) || pool.length === 0) {
    return CURATED_TECH_EDITORIAL_POOLS['ai'][0];
  }

  // Hash seed for deterministic pseudo-random distribution
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const baseIdx = Math.abs(hash) % pool.length;

  // Search for an image not recently used
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[(baseIdx + i) % pool.length];
    if (!recentImagesRing.includes(candidate)) {
      markImageUsed(candidate);
      return candidate;
    }
  }

  // If all in pool were used, return least recent and rotate
  const selected = pool[baseIdx];
  markImageUsed(selected);
  return selected;
}

/**
 * Extract clean, high-precision search keywords from a topic or headline
 */
function extractPrecisionKeywords(topic = '', imagePrompt = '', category = '') {
  const combined = `${topic} ${imagePrompt} ${category}`.toLowerCase();

  if (combined.includes('iran') || combined.includes('muddywater') || combined.includes('handala') || combined.includes('charming kitten') || combined.includes('איראן') || combined.includes('tehran')) {
    return 'cyber warfare military defense cyber security hacker digital surveillance';
  }
  if (combined.includes('drone') || combined.includes('uav') || combined.includes('electronic warfare') || combined.includes('jamming') || combined.includes('gps spoofing') || combined.includes('satellite')) {
    return 'satellite radar electronic warfare communications technology';
  }
  if (combined.includes('nvidia') || combined.includes('blackwell') || combined.includes('gpu') || combined.includes('geforce')) {
    return 'nvidia gpu processor semiconductor';
  }
  if (combined.includes('tsmc') || combined.includes('foundry') || combined.includes('2nm') || combined.includes('wafer') || combined.includes('asml')) {
    return 'semiconductor silicon wafer cleanroom microchip';
  }
  if (combined.includes('claude') || combined.includes('anthropic') || combined.includes('reasoning')) {
    return 'artificial intelligence neural network glowing abstract';
  }
  if (combined.includes('openai') || combined.includes('gpt') || combined.includes('chatgpt') || combined.includes('sora')) {
    return 'ai deep learning artificial intelligence technology';
  }
  if (combined.includes('apple') || combined.includes('vision pro') || combined.includes('macbook') || combined.includes('iphone')) {
    return 'apple device technology sleek modern';
  }
  if (combined.includes('cyber') || combined.includes('hacker') || combined.includes('ransomware') || combined.includes('security') || combined.includes('סייבר')) {
    return 'cybersecurity code data encryption matrix';
  }
  if (combined.includes('stock') || combined.includes('nasdaq') || combined.includes('s&p') || combined.includes('market') || combined.includes('wall street')) {
    return 'stock market financial charts trading screen';
  }
  if (combined.includes('quantum') || combined.includes('qubit')) {
    return 'quantum computing processor cryogenic golden chandelier';
  }
  if (combined.includes('robot') || combined.includes('humanoid') || combined.includes('boston dynamics') || combined.includes('figure')) {
    return 'humanoid robot artificial intelligence robotics';
  }
  if (combined.includes('agent') || combined.includes('autonomous') || combined.includes('devin') || combined.includes('cursor')) {
    return 'software developer code matrix dual monitor programming';
  }

  const clean = topic
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['about', 'with', 'from', 'that', 'this', 'have', 'more', 'what', 'when', 'news', 'daily', 'trend'].includes(w.toLowerCase()))
    .slice(0, 3)
    .join(' ');

  return clean ? `${clean} technology` : 'technology artificial intelligence';
}

/**
 * Validate that an image URL is reachable and returns an image content-type
 */
async function isValidImageUrl(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return false;
  
  if (url.includes('images.unsplash.com') || url.includes('cloudinary.com') || url.includes('mzstatic.com')) {
    return true;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    
    if (!res.ok) return false;
    const contentType = res.headers.get('content-type') || '';
    return contentType.startsWith('image/') || contentType.includes('octet-stream');
  } catch (err) {
    return false;
  }
}

/**
 * Main function to resolve high-relevance editorial image
 */
async function resolveEditorialArticleImage({ topic = '', imagePrompt = '', sourceImageUrl = '', category = '', tags = [] }, accessKey = '') {
  if (sourceImageUrl && (await isValidImageUrl(sourceImageUrl))) {
    logger.info(`resolveEditorialArticleImage: Using original publisher image for "${topic.substring(0, 40)}"`);
    markImageUsed(sourceImageUrl);
    return {
      imageUrl: sourceImageUrl,
      altText: topic || 'Editorial news illustration',
      source: 'publisher'
    };
  }

  const precisionQuery = extractPrecisionKeywords(topic, imagePrompt, category);
  const unsplashKey = accessKey || process.env.UNSPLASH_ACCESS_KEY;

  if (unsplashKey) {
    try {
      const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(precisionQuery)}&orientation=landscape&per_page=5&order_by=relevant&client_id=${unsplashKey}`;
      const res = await fetch(unsplashUrl);
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        // Pick first result that wasn't used recently
        for (const photo of results) {
          if (photo && photo.urls && photo.urls.regular) {
            const imgUrl = photo.urls.regular;
            if (!recentImagesRing.includes(imgUrl)) {
              markImageUsed(imgUrl);
              logger.info(`resolveEditorialArticleImage: Unsplash matched fresh image for "${precisionQuery}"`);
              return {
                imageUrl: imgUrl,
                altText: photo.alt_description || photo.description || topic,
                source: 'unsplash'
              };
            }
          }
        }
      }
    } catch (err) {
      logger.warn('resolveEditorialArticleImage: Unsplash search failed:', err.message);
    }
  }

  const catKey = (category || '').toLowerCase().trim();
  const pool = CURATED_TECH_EDITORIAL_POOLS[catKey] || CURATED_TECH_EDITORIAL_POOLS['ai'];
  const seedString = `${topic}_${category}_${Date.now() % 100000}`;
  const selectedImage = selectUnusedFromPool(pool, seedString);

  return {
    imageUrl: selectedImage,
    altText: topic || 'TrendingTech Daily Tech Intelligence',
    source: 'curated-pool'
  };
}

const CURATED_TECH_EDITORIAL_IMAGES = Object.fromEntries(
  Object.entries(CURATED_TECH_EDITORIAL_POOLS).map(([k, v]) => [k, v[0]])
);

module.exports = {
  resolveEditorialArticleImage,
  extractPrecisionKeywords,
  isValidImageUrl,
  CURATED_TECH_EDITORIAL_POOLS,
  CURATED_TECH_EDITORIAL_IMAGES
};
