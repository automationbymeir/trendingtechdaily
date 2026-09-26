/**
 * pexelsService.js
 * ---------------------------------------------------------------------------
 * Thin client around the Pexels Video API.
 *
 * Usage from the video pipeline:
 *   const clips = await fetchClipsForConcept(concept, { count: 4, orientation: 'portrait' });
 *
 * Returned shape (matches what Remotion <OffthreadVideo> needs):
 *   [{ url, durationSec, width, height, photographer, photographerUrl, sourceUrl, id }]
 *
 * Attribution: Pexels Terms require crediting "Pexels" + the videographer.
 * We surface those fields so the calling pipeline can add them to the YouTube
 * description / video metadata.
 */

const fetch = require('node-fetch');
const { logger } = require('../config');

const VIDEO_SEARCH = 'https://api.pexels.com/videos/search';

/**
 * Search Pexels for one query. Returns up to `perPage` raw video objects.
 */
async function searchPexelsVideos(query, apiKey, options = {}) {
  if (!apiKey) {
    logger.warn('pexelsService: missing API key');
    return [];
  }
  const perPage = Math.min(options.perPage || 15, 80);
  const orientation = options.orientation || 'portrait'; // portrait for shorts, landscape for long
  const size = options.size || 'medium'; // small/medium/large
  const url = `${VIDEO_SEARCH}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=${orientation}&size=${size}`;

  try {
    const res = await fetch(url, { headers: { Authorization: apiKey } });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      logger.warn(`Pexels search failed (${res.status}) for "${query}": ${text.slice(0, 200)}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data.videos) ? data.videos : [];
  } catch (err) {
    logger.warn(`Pexels fetch error for "${query}":`, err.message);
    return [];
  }
}

/**
 * Pick the best HD/SD MP4 file from a Pexels video object.
 * Prefer 1080p+ if available, else fall back to the highest-bitrate option
 * that's still under ~8 MB (Lambda fetch budget).
 */
function pickBestFile(video, { orientation = 'portrait' } = {}) {
  const files = Array.isArray(video.video_files) ? video.video_files : [];
  if (!files.length) return null;

  const wantPortrait = orientation === 'portrait';

  // Score: prefer .mp4, prefer the right orientation, prefer ~720-1080p.
  // HARD CAP: drop any file whose longer side > 1920 — UHD/4K files (1440×2560,
  // 2160×3840) overrun Lambda disk and crash the render with "Failed to fetch
  // proxy / disk space low".
  const scored = files
    .filter(f => f.file_type === 'video/mp4' && f.link)
    .filter(f => {
      const longer = Math.max(f.width || 0, f.height || 0);
      return longer > 0 && longer <= 1920;
    })
    .map(f => {
      const w = f.width || 0;
      const h = f.height || 0;
      const isPortrait = h >= w;
      const orientationScore = isPortrait === wantPortrait ? 100 : 0;
      // Sweet spot: shorter side 720–1080 (matches our 1080p output exactly).
      const shorter = Math.min(w, h) || 0;
      let resolutionScore;
      if (shorter >= 720 && shorter <= 1080) resolutionScore = 100;
      else if (shorter >= 540 && shorter < 720) resolutionScore = 70;
      else if (shorter > 1080) resolutionScore = 40;          // bigger than needed
      else resolutionScore = 10;                              // < 540 = too small
      return { file: f, score: orientationScore + resolutionScore };
    })
    .sort((a, b) => b.score - a.score);

  return scored.length ? scored[0].file : null;
}

/**
 * Search ONE query and return up to `count` normalized clips.
 */
async function fetchClipsForQuery(query, apiKey, { count = 3, orientation = 'portrait', minDur = 5, maxDur = 20 } = {}) {
  const videos = await searchPexelsVideos(query, apiKey, { perPage: 15, orientation });
  const clips = [];
  // Shuffle so we don't always grab the same top-result every time
  const shuffled = videos.sort(() => Math.random() - 0.5);
  for (const v of shuffled) {
    const dur = v.duration || 0;
    if (dur < minDur || dur > maxDur) continue;
    const file = pickBestFile(v, { orientation });
    if (!file) continue;
    clips.push({
      id: v.id,
      url: file.link,
      durationSec: dur,
      width: file.width,
      height: file.height,
      photographer: v.user && v.user.name ? v.user.name : 'Unknown',
      photographerUrl: v.user && v.user.url ? v.user.url : '',
      sourceUrl: v.url,
      query,
    });
    if (clips.length >= count) break;
  }
  return clips;
}

/**
 * Top-level: given a videoConcept (from videoConcept.classifyArticleConcept),
 * fetch `count` distinct clips. Tries the article-specific keywords first,
 * then falls back to the category default queries.
 */
async function fetchClipsForConcept(concept, { count = 4, orientation = 'portrait' } = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    logger.warn('pexelsService: PEXELS_API_KEY not set; skipping b-roll');
    return [];
  }

  const queries = [
    ...(concept && concept.pexelsQueries ? concept.pexelsQueries : []),
    ...(concept && concept.defaultQueries ? concept.defaultQueries : []),
  ].filter(Boolean);

  // De-dup queries while preserving order
  const seen = new Set();
  const orderedQueries = queries.filter(q => {
    const k = q.toLowerCase().trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const seenIds = new Set();
  const collected = [];

  for (const q of orderedQueries) {
    if (collected.length >= count) break;
    const need = count - collected.length;
    const clips = await fetchClipsForQuery(q, apiKey, { count: need + 2, orientation });
    for (const c of clips) {
      if (seenIds.has(c.id)) continue;
      seenIds.add(c.id);
      collected.push(c);
      if (collected.length >= count) break;
    }
  }

  if (collected.length < count) {
    logger.warn(`pexelsService: only ${collected.length}/${count} clips found for concept ${concept && concept.category}`);
  }

  return collected;
}

/**
 * Build the attribution string we add to YouTube descriptions to comply
 * with the Pexels license.
 */
function buildAttribution(clips) {
  if (!Array.isArray(clips) || !clips.length) return '';
  const lines = ['Stock footage courtesy of Pexels:'];
  const seen = new Set();
  for (const c of clips) {
    const key = (c.photographer || '') + '|' + (c.sourceUrl || '');
    if (seen.has(key)) continue;
    seen.add(key);
    if (c.sourceUrl) {
      lines.push(`- ${c.photographer || 'Pexels contributor'}: ${c.sourceUrl}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  fetchClipsForConcept,
  fetchClipsForQuery,
  searchPexelsVideos,
  pickBestFile,
  buildAttribution,
};
