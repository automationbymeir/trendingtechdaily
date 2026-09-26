/**
 * aiToolsQuickStart.js
 * ---------------------------------------------------------------------------
 * Backfills `quickStartIntro_en/he` and `quickStart_en/he[]` on `ai_tools`
 * docs that don't have them yet. Uses Gemini 2.5 Flash in JSON mode.
 *
 * Each step must be plain language, <=140 chars, no markdown. 3-5 steps.
 */

const admin = require('firebase-admin');
const { db, logger } = require('./config');
const { loadGeminiSDK, getGeminiSDK } = require('./utils');

const TOOLS_COLL = 'ai_tools';
const MODEL = 'gemini-2.5-flash';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function getGenAI() {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!GoogleGenAI) throw new Error('Gemini SDK failed to load');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
}

function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

function isRetryable(err) {
  const msg = String(err && err.message || '');
  if (/429|rate.?limit|RESOURCE_EXHAUSTED|quota/i.test(msg)) return true;
  if (/5\d\d|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|ECONNRESET|ETIMEDOUT/i.test(msg)) return true;
  return false;
}

async function pMap(items, mapper, concurrency = 4) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = idx++;
      if (i >= items.length) return;
      try { results[i] = { ok: true, value: await mapper(items[i], i) }; }
      catch (err) { results[i] = { ok: false, error: err }; }
    }
  });
  await Promise.all(workers);
  return results;
}

function buildPrompt(tool) {
  return `You write practical "get started in 5 minutes" guides for AI tools.

Tool:
- name: ${tool.name}
- type: ${tool.type}    // claude-skill | mcp-connector | github-repo | llm-product | agent-framework
- category: ${tool.category || 'general'}
- pricing: ${tool.pricing || 'unknown'}
- homepage: ${tool.homepage || 'n/a'}
- repoUrl: ${tool.repoUrl || 'n/a'}
- installCommand: ${tool.installCommand || 'n/a'}
- shortDesc_en: ${tool.shortDesc_en || ''}

Write a JSON object with EXACTLY these keys (no others):
- quickStartIntro_en: ONE sentence (<=180 chars) framing the goal, plain English. No emoji, no markdown.
- quickStart_en: an array of 3 to 5 strings. Each string is ONE concrete step a beginner can copy. Each <=140 chars, no markdown, no numbering, no emoji. Order matters.
- quickStartIntro_he: same intro in natural Hebrew, <=180 chars.
- quickStart_he: same 3-5 steps in natural Hebrew. Each <=140 chars.

Hard rules:
- Output ONLY the JSON object. No code fences, no commentary.
- Do NOT invent install commands or URLs. If the field is "n/a" or unknown, point the user to the homepage instead.
- Each step is one action: install, configure, run, test. Skip marketing fluff.`;
}

async function generateQuickStart(genAI, tool, maxRetries = 4) {
  const prompt = buildPrompt(tool);
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await genAI.models.generateContent({
        model: MODEL,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { temperature: 0.6, responseMimeType: 'application/json' },
      });
      const text = (res && (res.text || (res.response && res.response.text && res.response.text()))) || '';
      const parsed = parseJsonLoose(text);
      if (!parsed) throw new Error('quickStart: failed to parse JSON');

      const intro_en = String(parsed.quickStartIntro_en || '').trim();
      const intro_he = String(parsed.quickStartIntro_he || '').trim();
      const steps_en = Array.isArray(parsed.quickStart_en) ? parsed.quickStart_en.map((s) => String(s).trim()).filter(Boolean) : [];
      const steps_he = Array.isArray(parsed.quickStart_he) ? parsed.quickStart_he.map((s) => String(s).trim()).filter(Boolean) : [];

      if (!intro_en || !intro_he) throw new Error('quickStart: missing intro');
      if (steps_en.length < 3 || steps_en.length > 5) throw new Error(`quickStart: bad EN step count ${steps_en.length}`);
      if (steps_he.length < 3 || steps_he.length > 5) throw new Error(`quickStart: bad HE step count ${steps_he.length}`);

      // Clamp lengths defensively.
      const clamp = (s, n) => s.length > n ? s.slice(0, n).trim() : s;
      return {
        quickStartIntro_en: clamp(intro_en, 200),
        quickStartIntro_he: clamp(intro_he, 200),
        quickStart_en: steps_en.map((s) => clamp(s, 160)),
        quickStart_he: steps_he.map((s) => clamp(s, 160)),
      };
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isRetryable(err)) {
        logger.warn(`[quickStart] failed for ${tool.slug}: ${err.message}`);
        throw err;
      }
      const backoff = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
  }
  throw lastErr || new Error('quickStart: unknown failure');
}

async function backfillQuickStarts({ limit = 200, force = false } = {}) {
  const genAI = await getGenAI();
  const snap = await db.collection(TOOLS_COLL).get();
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const target = all.filter((t) => {
    if (force) return true;
    return !Array.isArray(t.quickStart_en) || t.quickStart_en.length < 3;
  }).slice(0, Math.max(0, Number(limit) || 200));

  logger.info(`[quickStart] target=${target.length}/${all.length} (force=${force})`);

  const results = await pMap(target, async (tool) => {
    const out = await generateQuickStart(genAI, tool);
    await db.collection(TOOLS_COLL).doc(tool.id).set({
      ...out,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return tool.slug || tool.id;
  }, 4);

  const ok = results.filter((r) => r && r.ok).length;
  const failures = results
    .map((r, i) => r && !r.ok ? { slug: target[i].slug || target[i].id, error: String(r.error && r.error.message) } : null)
    .filter(Boolean);

  return { processed: target.length, ok, failed: failures.length, failures };
}

module.exports = { backfillQuickStarts };
