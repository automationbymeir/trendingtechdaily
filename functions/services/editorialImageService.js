// functions/services/editorialImageService.js
//
// Resolves authentic, high-relevance editorial imagery for news articles
// Prioritizes original publisher source images (urlToImage / og:image), 
// with targeted keyword extraction for high-precision photography matching.

const fetch = require('node-fetch');
const { logger } = require('../config');

// Curated verified high-resolution editorial tech imagery mapped by topic taxonomy
const CURATED_TECH_EDITORIAL_IMAGES = {
  'ai': 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=1400&auto=format&fit=crop&q=85',
  'ai-models': 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1400&auto=format&fit=crop&q=85',
  'autonomous-agents': 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1400&auto=format&fit=crop&q=85',
  'chips': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=85',
  'semiconductor': 'https://images.unsplash.com/photo-1555680202-c86f0e12f086?w=1400&auto=format&fit=crop&q=85',
  'cybersecurity': 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=1400&auto=format&fit=crop&q=85',
  'dev': 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=1400&auto=format&fit=crop&q=85',
  'computing': 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1400&auto=format&fit=crop&q=85',
  'markets': 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1400&auto=format&fit=crop&q=85',
  'stocks': 'https://images.unsplash.com/photo-1642543492481-44e81e3914a7?w=1400&auto=format&fit=crop&q=85',
  'startups': 'https://images.unsplash.com/photo-1559136555-9303baea8ebd?w=1400&auto=format&fit=crop&q=85',
  'quantum': 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1400&auto=format&fit=crop&q=85',
  'robotics': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1400&auto=format&fit=crop&q=85',
  'cloud': 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1400&auto=format&fit=crop&q=85',
  'crypto': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=1400&auto=format&fit=crop&q=85'
};

/**
 * Extract clean, high-precision search keywords from a topic or headline
 */
function extractPrecisionKeywords(topic = '', imagePrompt = '', category = '') {
  const combined = `${topic} ${imagePrompt} ${category}`.toLowerCase();

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
      const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(precisionQuery)}&orientation=landscape&per_page=1&order_by=relevant&client_id=${unsplashKey}`;
      const res = await fetch(unsplashUrl);
      if (res.ok) {
        const data = await res.json();
        const photo = data.results && data.results[0];
        if (photo && photo.urls && photo.urls.regular) {
          logger.info(`resolveEditorialArticleImage: Unsplash matched "${precisionQuery}" for topic "${topic.substring(0, 40)}"`);
          return {
            imageUrl: photo.urls.regular,
            altText: photo.alt_description || photo.description || topic,
            source: 'unsplash'
          };
        }
      }
    } catch (err) {
      logger.warn('resolveEditorialArticleImage: Unsplash search failed:', err.message);
    }
  }

  const catKey = (category || '').toLowerCase().trim();
  let matchedFallback = CURATED_TECH_EDITORIAL_IMAGES[catKey];
  
  if (!matchedFallback) {
    for (const [key, imgUrl] of Object.entries(CURATED_TECH_EDITORIAL_IMAGES)) {
      if (topic.toLowerCase().includes(key) || (Array.isArray(tags) && tags.some(t => String(t).toLowerCase().includes(key)))) {
        matchedFallback = imgUrl;
        break;
      }
    }
  }

  return {
    imageUrl: matchedFallback || CURATED_TECH_EDITORIAL_IMAGES['ai'],
    altText: topic || 'TrendingTech Daily Tech Intelligence',
    source: 'curated'
  };
}

module.exports = {
  resolveEditorialArticleImage,
  extractPrecisionKeywords,
  isValidImageUrl,
  CURATED_TECH_EDITORIAL_IMAGES
};
