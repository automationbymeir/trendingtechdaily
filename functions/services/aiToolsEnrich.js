/**
 * aiToolsEnrich.js
 * ---------------------------------------------------------------------------
 * Calls Gemini 2.5 Flash to fill the descriptive fields on a sparse AI-tool
 * catalog entry:
 *   - description_en, description_he (60-120 words each)
 *   - shortDesc_en, shortDesc_he     (one-liner, <120 chars)
 *   - claudeTake                     (2-3 sentences, witty,
 *                                     MUST end with "— Claude's verdict")
 *
 * One JSON-mode call per tool. Simple exponential backoff on 429/5xx.
 *
 * Usage:
 *   const { enrichTool } = require('./services/aiToolsEnrich');
 *   const enriched = await enrichTool(tool, genAI);
 */

const { logger } = require('../config');

const MODEL = 'gemini-2.5-flash';
const VERDICT_SUFFIX_EN = "— Claude's verdict";

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function buildPrompt(tool) {
  return `You are writing catalog copy for a curated AI Tools Directory on a tech-news site.

The tool:
- name: ${tool.name}
- type: ${tool.type}            // claude-skill | mcp-connector | github-repo | llm-product | agent-framework
- category: ${tool.category}
- pricing: ${tool.pricing}
- homepage: ${tool.homepage}
- repoUrl: ${tool.repoUrl || 'none'}
- bestFor: ${(tool.bestFor || []).join(', ') || 'general'}
- tags: ${(tool.tags || []).join(', ')}

Write a JSON object with EXACTLY these keys (no others):
  - description_en (string, 60-120 words, plain English, no markdown, no emoji, factual + useful, mentions what it is and who it's for)
  - description_he (string, 60-120 words, Hebrew, same content as description_en but natural Hebrew — not literal translation)
  - shortDesc_en   (string, ONE LINE, under 120 characters, no period at end)
  - shortDesc_he   (string, ONE LINE in Hebrew, under 120 characters)
  - claudeTake     (string, 2-3 sentences, witty + opinionated verdict from Claude, MUST end with the literal phrase: "${VERDICT_SUFFIX_EN}")

Hard rules:
- Output ONLY the JSON object. No markdown fences, no commentary.
- Do not invent features. Stick to what's reasonable for this tool.
- claudeTake must end with the exact phrase: ${VERDICT_SUFFIX_EN}
- shortDesc fields are pithy hooks, not full sentences.`;
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  // Strip code fences if present.
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  // Find first { and last } as a fallback.
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }
  try {
    return JSON.parse(s);
  } catch (_) {
    return null;
  }
}

function ensureVerdict(take) {
  if (!take || typeof take !== 'string') return null;
  const trimmed = take.trim();
  if (trimmed.endsWith(VERDICT_SUFFIX_EN)) return trimmed;
  // Strip any trailing punctuation then append.
  return `${trimmed.replace(/[.!?\s—-]+$/, '')} ${VERDICT_SUFFIX_EN}`;
}

function isRetryable(err) {
  const msg = String(err && err.message || '');
  if (/429|rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(msg)) return true;
  if (/5\d\d|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT/i.test(msg)) return true;
  return false;
}

/**
 * Enrich a single tool. Returns a *new* tool object with merged fields.
 * @param {object} tool   - sparse catalog entry
 * @param {GoogleGenAI} genAI - initialized SDK client
 * @param {object} [opts]
 *   - maxRetries (default 4)
 */
async function enrichTool(tool, genAI, opts = {}) {
  const maxRetries = Number.isFinite(opts.maxRetries) ? opts.maxRetries : 4;
  if (!tool || !tool.slug) throw new Error('enrichTool: tool.slug is required');
  if (!genAI) throw new Error('enrichTool: genAI client is required');

  const prompt = buildPrompt(tool);

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await genAI.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      });

      // SDK exposes .text on response (or .response.text()).
      const text = (res && (res.text || (res.response && res.response.text && res.response.text()))) || '';
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error('aiToolsEnrich: failed to parse JSON response');

      const description_en = String(parsed.description_en || '').trim();
      const description_he = String(parsed.description_he || '').trim();
      const shortDesc_en   = String(parsed.shortDesc_en || '').trim();
      const shortDesc_he   = String(parsed.shortDesc_he || '').trim();
      const claudeTake     = ensureVerdict(parsed.claudeTake);

      if (!description_en || !description_he || !shortDesc_en || !shortDesc_he || !claudeTake) {
        throw new Error('aiToolsEnrich: missing required fields in model response');
      }

      return {
        ...tool,
        description_en,
        description_he,
        shortDesc_en,
        shortDesc_he,
        claudeTake,
        claudeTakeBy: MODEL,
      };
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isRetryable(err)) {
        logger.warn(`[aiToolsEnrich] failed for ${tool.slug}: ${err.message}`);
        throw err;
      }
      const backoffMs = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      logger.info(`[aiToolsEnrich] retry ${attempt + 1}/${maxRetries} for ${tool.slug} in ${backoffMs}ms (${err.message})`);
      await sleep(backoffMs);
    }
  }
  throw lastErr || new Error('aiToolsEnrich: unknown failure');
}

module.exports = { enrichTool };
