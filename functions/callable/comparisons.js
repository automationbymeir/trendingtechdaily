// functions/callable/comparisons.js
// Admin callables for generating and bulk-creating "X vs Y" comparison pages.
// Stores generated comparisons in Firestore collections `comparisons` (EN) and
// `he_comparisons` (HE). Pairs EN↔HE docs via sourceComparisonId/sourceSlug.

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { logger, db } = require('../config');
const { loadGeminiSDK, getGeminiSDK, getSafetySettings } = require('../utils');
const { generateContentWithRetry, generateArticleImage } = require('./ai');

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function makeComparisonSlug(itemA, itemB) {
  const a = slugify(itemA);
  const b = slugify(itemB);
  if (!a || !b) return '';
  return `${a}-vs-${b}`;
}

function buildPrompt(itemA, itemB, category, isHebrew) {
  if (isHebrew) {
    return `כתוב השוואה מעמיקה ומועילה בין שני מוצרי טכנולוגיה לאתר חדשות טכנולוגיה בעברית. ההשוואה צריכה להיות עניינית, עובדתית ובעלת ערך SEO.

מוצר א': ${itemA}
מוצר ב': ${itemB}
קטגוריה: ${category || 'general'}

החזר JSON בלבד (ללא markdown, ללא הסברים) במבנה הבא:
{
  "title": "כותרת SEO אטרקטיבית (עד 70 תווים, כוללת את שני המוצרים והמילה \\"השוואה\\" או \\"לעומת\\")",
  "metaDescription": "תיאור מטא של 150-160 תווים",
  "introduction": "פסקת פתיחה של 2-3 משפטים המציגה את ההשוואה",
  "itemASummary": "סיכום של 3-4 משפטים על מוצר א'",
  "itemBSummary": "סיכום של 3-4 משפטים על מוצר ב'",
  "specRows": [
    {"label": "תכונה", "a": "ערך עבור מוצר א'", "b": "ערך עבור מוצר ב'"}
  ],
  "prosA": ["יתרון 1", "יתרון 2", "יתרון 3"],
  "consA": ["חיסרון 1", "חיסרון 2"],
  "prosB": ["יתרון 1", "יתרון 2", "יתרון 3"],
  "consB": ["חיסרון 1", "חיסרון 2"],
  "verdict": "פסקת סיכום של 3-4 משפטים המסבירה לאיזה קהל כל מוצר מתאים יותר",
  "faqs": [
    {"question": "שאלה נפוצה?", "answer": "תשובה קצרה."}
  ],
  "tags": ["תגית1", "תגית2"]
}

חשוב: לפחות 8 שורות מפרט (specRows), 3-4 יתרונות וחסרונות לכל מוצר, ו-5-7 שאלות נפוצות אמיתיות שקוראים יחפשו בגוגל.`;
  }

  return `Write a thorough, genuinely useful comparison of two tech products for a tech news site. The comparison should be factual, non-promotional, and SEO-optimised.

Item A: ${itemA}
Item B: ${itemB}
Category: ${category || 'general'}

Return JSON only (no markdown, no explanation) in exactly this shape:
{
  "title": "SEO-friendly title under 70 chars with both product names and 'vs'",
  "metaDescription": "150-160 char meta description",
  "introduction": "2-3 sentence opening paragraph",
  "itemASummary": "3-4 sentence summary of Item A",
  "itemBSummary": "3-4 sentence summary of Item B",
  "specRows": [
    {"label": "Spec name", "a": "Value for A", "b": "Value for B"}
  ],
  "prosA": ["Pro 1", "Pro 2", "Pro 3"],
  "consA": ["Con 1", "Con 2"],
  "prosB": ["Pro 1", "Pro 2", "Pro 3"],
  "consB": ["Con 1", "Con 2"],
  "verdict": "3-4 sentence closing paragraph — explain which product suits which audience",
  "faqs": [
    {"question": "Real question users Google?", "answer": "Short factual answer."}
  ],
  "tags": ["tag1", "tag2"]
}

Requirements: minimum 8 spec rows, 3-4 pros + 2-3 cons per item, 5-7 realistic FAQs that real readers would search for. Do not fabricate specific benchmark numbers — if uncertain, use qualitative terms.`;
}

function validateAndNormalize(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  const required = ['title', 'metaDescription', 'introduction', 'verdict'];
  for (const f of required) {
    if (typeof parsed[f] !== 'string' || !parsed[f].trim()) return null;
  }
  const specRows = Array.isArray(parsed.specRows)
    ? parsed.specRows
      .filter(r => r && typeof r.label === 'string' && (r.a !== undefined) && (r.b !== undefined))
      .map(r => ({ label: String(r.label).trim(), a: String(r.a ?? '').trim(), b: String(r.b ?? '').trim() }))
      .slice(0, 30)
    : [];
  if (specRows.length === 0) return null;

  const strArr = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()).slice(0, 8) : [];
  const faqs = Array.isArray(parsed.faqs)
    ? parsed.faqs
      .filter(f => f && typeof f.question === 'string' && typeof f.answer === 'string')
      .map(f => ({ question: f.question.trim(), answer: f.answer.trim() }))
      .filter(f => f.question && f.answer)
      .slice(0, 10)
    : [];

  return {
    title: parsed.title.trim().slice(0, 200),
    metaDescription: parsed.metaDescription.trim().slice(0, 300),
    introduction: parsed.introduction.trim(),
    itemASummary: (parsed.itemASummary || '').trim(),
    itemBSummary: (parsed.itemBSummary || '').trim(),
    specRows,
    prosA: strArr(parsed.prosA),
    consA: strArr(parsed.consA),
    prosB: strArr(parsed.prosB),
    consB: strArr(parsed.consB),
    verdict: parsed.verdict.trim(),
    faqs,
    tags: strArr(parsed.tags),
  };
}

async function generateComparisonDoc(itemA, itemB, category, language) {
  const isHebrew = language === 'he' || language === 'hebrew';
  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) throw new Error('Gemini SDK unavailable');

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const prompt = buildPrompt(itemA, itemB, category, isHebrew);

  const result = await generateContentWithRetry(genAI, prompt, getSafetySettings());
  const text = (typeof result.text === 'function' ? result.text() : result.text) || '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('Gemini returned no JSON');
  let parsed;
  try { parsed = JSON.parse(m[0]); } catch (e) { throw new Error('Gemini JSON parse failed: ' + e.message); }
  const norm = validateAndNormalize(parsed);
  if (!norm) throw new Error('Gemini response failed validation');
  return norm;
}

/**
 * generateComparison — Admin callable. Creates one comparison doc in Firestore.
 *
 * Inputs:
 *   { itemA: string, itemB: string, category?: string, language?: 'en'|'he',
 *     slug?: string (override), alsoGenerateHebrew?: boolean,
 *     generateImage?: boolean (default true), publish?: boolean (default true) }
 *
 * Returns: { success, slug, id, heSlug?, heId? }
 */
exports.generateComparison = onCall({
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 240,
  memory: '512MiB',
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }

  const {
    itemA, itemB, category = 'general', language = 'en',
    slug: slugOverride, alsoGenerateHebrew = false,
    generateImage = true, publish = true,
  } = request.data || {};
  if (!itemA || !itemB) throw new HttpsError('invalid-argument', 'itemA and itemB are required');

  const slug = slugOverride ? slugify(slugOverride) : makeComparisonSlug(itemA, itemB);
  if (!slug) throw new HttpsError('invalid-argument', 'Could not build a valid slug');

  const primaryColl = language === 'he' ? 'he_comparisons' : 'comparisons';

  // Prevent accidental overwrite
  const existing = await db.collection(primaryColl).where('slug', '==', slug).limit(1).get();
  if (!existing.empty) {
    throw new HttpsError('already-exists', `A ${language} comparison with slug "${slug}" already exists (id: ${existing.docs[0].id}).`);
  }

  const primary = await generateComparisonDoc(itemA, itemB, category, language);

  let imageUrl = '';
  let imageAltText = '';
  if (generateImage) {
    try {
      const img = await generateArticleImage({
        auth: { uid: request.auth.uid },
        data: { prompt: `${itemA} vs ${itemB} ${category}`, articleTitle: primary.title, articleSlug: slug },
      });
      imageUrl = (img && img.imageUrl) || '';
      imageAltText = (img && img.imageAltText) || `${itemA} vs ${itemB}`;
    } catch (e) {
      logger.warn('generateComparison: image fetch failed', e.message);
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const primaryDoc = {
    slug,
    itemA: String(itemA).trim(),
    itemB: String(itemB).trim(),
    category: String(category || 'general').trim(),
    language: language === 'he' ? 'he' : 'en',
    ...primary,
    featuredImage: imageUrl,
    imageAltText,
    published: !!publish,
    createdAt: now,
    updatedAt: now,
  };
  const primaryRef = await db.collection(primaryColl).add(primaryDoc);
  logger.info('generateComparison: created', primaryColl, primaryRef.id, slug);

  const out = { success: true, slug, id: primaryRef.id };

  // Optionally also generate Hebrew mirror when primary was EN
  if (alsoGenerateHebrew && language !== 'he') {
    try {
      const he = await generateComparisonDoc(itemA, itemB, category, 'he');
      const heDoc = {
        slug, // keep the same slug for URL parity
        itemA: String(itemA).trim(),
        itemB: String(itemB).trim(),
        category: String(category || 'general').trim(),
        language: 'he',
        ...he,
        featuredImage: imageUrl,
        imageAltText,
        published: !!publish,
        sourceComparisonId: primaryRef.id,
        sourceSlug: slug,
        createdAt: now,
        updatedAt: now,
      };
      const heRef = await db.collection('he_comparisons').add(heDoc);
      // Back-link
      await primaryRef.update({ heComparisonId: heRef.id, heSlug: slug, updatedAt: now });
      out.heId = heRef.id;
      out.heSlug = slug;
      logger.info('generateComparison: created he_comparisons', heRef.id, slug);
    } catch (e) {
      logger.warn('generateComparison: Hebrew mirror failed', e.message);
      out.hebrewError = e.message;
    }
  }

  return out;
});

/**
 * bulkGenerateComparisons — Admin callable. Processes an array of pairs.
 * Input: { pairs: [{itemA, itemB, category?}], language?, alsoGenerateHebrew?, generateImage? }
 * Returns per-pair outcome array.
 */
exports.bulkGenerateComparisons = onCall({
  secrets: ['GEMINI_API_KEY', 'UNSPLASH_ACCESS_KEY'],
  region: 'us-central1',
  timeoutSeconds: 540,
  memory: '512MiB',
}, async (request) => {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError('permission-denied', 'Admin required');
  }
  const { pairs, language = 'en', alsoGenerateHebrew = false, generateImage = true } = request.data || {};
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new HttpsError('invalid-argument', 'pairs[] is required');
  }
  const results = [];
  for (const p of pairs.slice(0, 20)) {
    if (!p || !p.itemA || !p.itemB) { results.push({ ok: false, error: 'missing itemA/itemB' }); continue; }
    try {
      const r = await exports.generateComparison.run
        ? await exports.generateComparison.run({ auth: request.auth, data: { ...p, language, alsoGenerateHebrew, generateImage } })
        : null;
      // The callable wrapper isn't directly callable; reuse inner logic via a helper:
      // Fallback: call the same flow inline.
      if (!r) {
        const slug = makeComparisonSlug(p.itemA, p.itemB);
        const existing = await db.collection(language === 'he' ? 'he_comparisons' : 'comparisons').where('slug', '==', slug).limit(1).get();
        if (!existing.empty) { results.push({ ok: false, slug, error: 'already exists' }); continue; }
        const primary = await generateComparisonDoc(p.itemA, p.itemB, p.category || 'general', language);
        let imageUrl = ''; let imageAltText = '';
        if (generateImage) {
          try {
            const img = await generateArticleImage({ auth: { uid: request.auth.uid }, data: { prompt: `${p.itemA} vs ${p.itemB}`, articleTitle: primary.title, articleSlug: slug } });
            imageUrl = (img && img.imageUrl) || '';
            imageAltText = (img && img.imageAltText) || `${p.itemA} vs ${p.itemB}`;
          } catch (_e) { /* ignore */ }
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const primaryColl = language === 'he' ? 'he_comparisons' : 'comparisons';
        const primaryRef = await db.collection(primaryColl).add({
          slug, itemA: p.itemA, itemB: p.itemB, category: p.category || 'general',
          language: language === 'he' ? 'he' : 'en',
          ...primary, featuredImage: imageUrl, imageAltText, published: true,
          createdAt: now, updatedAt: now,
        });
        let heId, heSlug;
        if (alsoGenerateHebrew && language !== 'he') {
          try {
            const he = await generateComparisonDoc(p.itemA, p.itemB, p.category || 'general', 'he');
            const heRef = await db.collection('he_comparisons').add({
              slug, itemA: p.itemA, itemB: p.itemB, category: p.category || 'general',
              language: 'he', ...he, featuredImage: imageUrl, imageAltText, published: true,
              sourceComparisonId: primaryRef.id, sourceSlug: slug,
              createdAt: now, updatedAt: now,
            });
            await primaryRef.update({ heComparisonId: heRef.id, heSlug: slug, updatedAt: now });
            heId = heRef.id; heSlug = slug;
          } catch (e) { /* record but continue */ }
        }
        results.push({ ok: true, slug, id: primaryRef.id, heId, heSlug });
      } else {
        results.push({ ok: true, ...r });
      }
    } catch (e) {
      results.push({ ok: false, itemA: p.itemA, itemB: p.itemB, error: e.message });
      logger.warn('bulkGenerateComparisons failure', p.itemA, p.itemB, e.message);
    }
  }
  return { success: true, results };
});
