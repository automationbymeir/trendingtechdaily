/**
 * cartoonScriptGen.js
 * ---------------------------------------------------------------------------
 * Gemini-driven dialog generator for trendingtechdaily's mascot videos.
 *
 * Supports two formats:
 *   - 'promo'  — pure brand promo (what BIT and GLITCH say to introduce TTD)
 *   - 'news'   — BIT reports a real news story, GLITCH reacts (used later)
 *
 * Each script is a sequence of "lines": { character, text, role } so the
 * pipeline can render each one in its own scene with the right TTS voice.
 *
 * Public API:
 *   buildCartoonScript({ genAI, format, language, newsItem? }) → {
 *     title: string,
 *     lines: [{ character: 'bit'|'glitch', text: string, pose?: string }],
 *     cta: string,
 *     language: 'he'|'en',
 *   }
 */

const { logger } = require('../config');

// ─── Hardcoded promo fallback (used when Gemini fails OR for the very first
//     test run so the user can see the system end-to-end with predictable text)
function promoFallback(language) {
  if (language === 'en') {
    return {
      title: 'TrendingTechDaily — what is it?',
      lines: [
        { character: 'bit',    text: "Hey! I'm BIT, and I read a hundred tech sites every single day!",                                     pose: 'excited' },
        { character: 'glitch', text: "A hundred? Why on earth would you do that?",                                                            pose: 'neutral' },
        { character: 'bit',    text: "Because you're busy! At TrendingTechDaily we filter the noise and hand you only what actually matters.", pose: 'neutral' },
        { character: 'glitch', text: "Sounds too good. Give me one example.",                                                                  pose: 'neutral' },
        { character: 'bit',    text: "Apple's M5 chip, OpenAI's GPT-6, Tesla's robotaxi rollout — three-sentence briefs, no fluff.",          pose: 'excited' },
        { character: 'glitch', text: "...okay, that actually saves me an hour. I'm in.",                                                       pose: 'neutral' },
        { character: 'bit',    text: "TrendingTechDaily.com — your tech news, decoded.",                                                       pose: 'excited' },
      ],
      cta: 'TrendingTechDaily.com',
      language: 'en',
    };
  }
  return {
    title: 'TrendingTechDaily — מה זה בכלל?',
    lines: [
      { character: 'bit',    text: 'היי! אני BIT, ואני קורא מאה אתרי טכנולוגיה כל יום!',                                         pose: 'excited' },
      { character: 'glitch', text: 'מאה? למה לעזאזל?',                                                                              pose: 'neutral' },
      { character: 'bit',    text: 'כי אתם עסוקים! ב-TrendingTechDaily אנחנו מסננים את הרעש ונותנים לכם רק את החשוב.',           pose: 'neutral' },
      { character: 'glitch', text: 'נשמע יותר מדי טוב. תן לי דוגמה.',                                                              pose: 'neutral' },
      { character: 'bit',    text: 'שבב M5 של אפל, GPT-6 של OpenAI, רובוטקסי של טסלה — סיכומים של 3 משפטים, בלי שטויות.',       pose: 'excited' },
      { character: 'glitch', text: '...אוקיי זה באמת חוסך לי שעה. אני בפנים.',                                                     pose: 'neutral' },
      { character: 'bit',    text: 'TrendingTechDaily.com — חדשות הטק שלכם, מסוננות.',                                              pose: 'excited' },
    ],
    cta: 'TrendingTechDaily.com',
    language: 'he',
  };
}

/**
 * @param {Object} opts
 * @param {object}  opts.genAI               GoogleGenAI client (optional — uses fallback if missing)
 * @param {'promo'|'news'} [opts.format='promo']
 * @param {'he'|'en'}      [opts.language='he']
 * @param {object}  [opts.newsItem]          required for format='news': { title, summary }
 */
async function buildCartoonScript({ genAI, format = 'promo', language = 'he', newsItem } = {}) {
  const lang = language === 'en' ? 'en' : 'he';

  // For the very first test, force the deterministic promo so we can review
  // the visuals first. Later runs can opt-in to Gemini-written scripts.
  if (format === 'promo') {
    return promoFallback(lang);
  }

  if (!genAI) {
    logger.warn('cartoonScriptGen: Gemini unavailable, using fallback');
    return promoFallback(lang);
  }

  // ── Future: news-format scripts via Gemini ──────────────────────────────
  const inLang = lang === 'en' ? 'English' : 'Hebrew (כתיב מלא)';
  const newsBlock = newsItem
    ? `News story to cover:\nTitle: ${newsItem.title}\nSummary: ${newsItem.summary || ''}`
    : 'Pick the single most interesting tech story from this week and cover it.';

  const prompt = `You are writing a 35-second cartoon news segment for trendingtechdaily.com.

CHARACTERS:
- BIT — energetic robot mascot, news anchor. Excited, slightly nerdy, loves tech.
- GLITCH — sarcastic human sidekick. Skeptical, witty, throws one-liners.

FORMAT: a fast cartoon news report. BIT delivers the news like an anchor; GLITCH chimes in 2-3 times with reactions / jokes / dumb questions that BIT corrects.

LANGUAGE: ${inLang}. Write all dialog in that language only. Hebrew → natural spoken voice.

${newsBlock}

Return JSON only:
{
  "title": "Short headline in ${inLang} — 4–7 words",
  "lines": [
    { "character": "bit"|"glitch", "text": "1 sentence, 8–18 words, natural spoken delivery", "pose": "neutral"|"excited" }
    // 6–8 lines total, alternating with occasional double BIT line
  ],
  "cta": "1 short closing line BIT says — ${inLang}, mentions TrendingTechDaily.com"
}`;

  try {
    const result = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });
    const raw = (typeof result.text === 'function' ? result.text() : result.text) || '';
    const m = String(raw).match(/\{[\s\S]*\}/);
    if (!m) return promoFallback(lang);
    const parsed = JSON.parse(m[0]);
    if (!Array.isArray(parsed.lines) || parsed.lines.length < 4) return promoFallback(lang);
    return {
      title: String(parsed.title || '').trim(),
      lines: parsed.lines.slice(0, 10).map((l) => ({
        character: l.character === 'glitch' ? 'glitch' : 'bit',
        text: String(l.text || '').trim().slice(0, 280),
        pose: l.pose === 'excited' ? 'excited' : 'neutral',
      })).filter((l) => l.text),
      cta: String(parsed.cta || 'TrendingTechDaily.com').trim(),
      language: lang,
    };
  } catch (err) {
    logger.warn('cartoonScriptGen failed:', err.message);
    return promoFallback(lang);
  }
}

module.exports = { buildCartoonScript };
