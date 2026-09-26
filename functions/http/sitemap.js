// functions/http/sitemap.js

const { db, logger } = require('../config');
const { getSafe } = require('../utils');

function xmlEscape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generates and serves a sitemap.xml for SEO purposes.
 * Covers both the English site and the Hebrew (/he) site.
 * Uses the canonical www host to avoid Search Console
 * "Page with redirect" errors from the apex→www 301.
 * Emits xhtml:link hreflang alternates for EN↔HE pairs where possible.
 */
async function serveSitemap(req, res) {
  try {
    const baseUrl = "https://www.trendingtechdaily.com";
    let xml = '<?xml version="1.0" encoding="UTF-8"?>';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">';

    const addUrl = (loc, extra = '', alternates = null) => {
      xml += `<url><loc>${xmlEscape(loc)}</loc>`;
      if (alternates) {
        for (const alt of alternates) {
          xml += `<xhtml:link rel="alternate" hreflang="${alt.lang}" href="${xmlEscape(alt.href)}"/>`;
        }
      }
      xml += extra;
      xml += '</url>';
    };

    // ── Homepage pair with hreflang ─────────────────────────────────────────
    const homeAlternates = [
      { lang: 'en', href: `${baseUrl}/` },
      { lang: 'he', href: `${baseUrl}/he` },
      { lang: 'x-default', href: `${baseUrl}/` },
    ];
    addUrl(`${baseUrl}/`, '<changefreq>daily</changefreq><priority>1.0</priority>', homeAlternates);
    addUrl(`${baseUrl}/he`, '<changefreq>daily</changefreq><priority>1.0</priority>', homeAlternates);

    // ── English static pages ────────────────────────────────────────────────
    addUrl(`${baseUrl}/about`,     '<changefreq>monthly</changefreq><priority>0.7</priority>');
    addUrl(`${baseUrl}/privacy`,   '<changefreq>yearly</changefreq><priority>0.5</priority>');
    addUrl(`${baseUrl}/terms`,     '<changefreq>yearly</changefreq><priority>0.5</priority>');
    addUrl(`${baseUrl}/stock-data`,'<changefreq>daily</changefreq><priority>0.8</priority>');
    addUrl(`${baseUrl}/podcasts`,  '<changefreq>weekly</changefreq><priority>0.7</priority>');

    // ── Hebrew static pages ─────────────────────────────────────────────────
    addUrl(`${baseUrl}/he/about`,   '<changefreq>monthly</changefreq><priority>0.7</priority>');
    addUrl(`${baseUrl}/he/privacy`, '<changefreq>yearly</changefreq><priority>0.5</priority>');
    addUrl(`${baseUrl}/he/terms`,   '<changefreq>yearly</changefreq><priority>0.5</priority>');
    addUrl(`${baseUrl}/he/shuk-hon`,'<changefreq>daily</changefreq><priority>0.9</priority>');
    addUrl(`${baseUrl}/he/podcasts`,'<changefreq>weekly</changefreq><priority>0.7</priority>');

    // ── Load all data in parallel for speed ─────────────────────────────────
    const [
      sectionsSnapshot,
      heSectionsSnapshot,
      articlesSnap,
      heArticlesSnap,
    ] = await Promise.all([
      db.collection('sections').where('active', '==', true).get(),
      db.collection('he_sections').where('active', '==', true).get(),
      db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get(),
      db.collection('he_articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get(),
    ]);

    // Fetch comparison pages in parallel (non-blocking — if they don't exist yet, skip)
    const [comparisonsSnap, heComparisonsSnap, aiToolsSnap] = await Promise.all([
      db.collection('comparisons').where('published', '==', true).orderBy('createdAt', 'desc').limit(1000).get().catch(() => ({ forEach: () => {} })),
      db.collection('he_comparisons').where('published', '==', true).orderBy('createdAt', 'desc').limit(1000).get().catch(() => ({ forEach: () => {} })),
      db.collection('ai_tools').where('published', '==', true).orderBy('updatedAt', 'desc').limit(2000).get().catch(() => ({ forEach: () => {} })),
    ]);

    // ── Build section maps: docId → slug ───────────────────────────────────
    const sectionMap = {};   // English docId → slug
    sectionsSnapshot.forEach(doc => {
      const section = doc.data();
      const slug = getSafe(() => section.slug, doc.id.toLowerCase());
      if (/^[a-z0-9-]+$/i.test(slug)) {
        sectionMap[doc.id] = slug;
        addUrl(`${baseUrl}/${slug}`, '<changefreq>daily</changefreq><priority>0.9</priority>');
      }
    });

    const heSectionMap = {}; // Hebrew docId → slug
    heSectionsSnapshot.forEach(doc => {
      const section = doc.data();
      const slug = getSafe(() => section.slug, doc.id.toLowerCase());
      if (/^[a-z0-9-]+$/i.test(slug)) {
        heSectionMap[doc.id] = slug;
        if (slug !== 'shuk-hon') {
          addUrl(`${baseUrl}/he/${slug}`, '<changefreq>daily</changefreq><priority>0.9</priority>');
        }
      }
    });

    // ── Index Hebrew articles by English source for hreflang pairing ───────
    // he_articles often stores a reference to the source English article via
    // fields like `sourceArticleId`, `enArticleId`, or `sourceSlug`.
    const heBySourceId   = {}; // enArticleId → { slug, categorySlug }
    const heBySourceSlug = {}; // enSlug      → { slug, categorySlug }
    heArticlesSnap.forEach(doc => {
      const a = doc.data();
      const slug = getSafe(() => a.slug);
      const catId = getSafe(() => a.category);
      if (!slug || !catId) return;
      if (!/^[a-z0-9-]+$/i.test(slug)) return;
      const catSlug = heSectionMap[catId] || catId.toLowerCase();
      const entry = { slug, categorySlug: catSlug };
      const srcId = getSafe(() => a.sourceArticleId) || getSafe(() => a.enArticleId);
      const srcSlug = getSafe(() => a.sourceSlug) || getSafe(() => a.enSlug);
      if (srcId) heBySourceId[srcId] = entry;
      if (srcSlug) heBySourceSlug[srcSlug] = entry;
    });

    // ── English article pages (with hreflang alternates when matched) ──────
    articlesSnap.forEach(doc => {
      const article = doc.data();
      const slug = getSafe(() => article.slug);
      const categoryId = getSafe(() => article.category);
      const updatedAt = getSafe(() => article.updatedAt?.toDate().toISOString());

      if (!slug || !categoryId) return;
      if (!/^[a-z0-9-]+$/i.test(slug)) return;
      const categorySlug = sectionMap[categoryId] || categoryId.toLowerCase();
      if (!/^[a-z0-9-]+$/i.test(categorySlug)) return;

      const enUrl = `${baseUrl}/${categorySlug}/${slug}`;
      const he = heBySourceId[doc.id] || heBySourceSlug[slug];
      let alternates = null;
      if (he) {
        const heUrl = `${baseUrl}/he/${he.categorySlug}/${he.slug}`;
        alternates = [
          { lang: 'en', href: enUrl },
          { lang: 'he', href: heUrl },
          { lang: 'x-default', href: enUrl },
        ];
      }
      const extra =
        (updatedAt ? `<lastmod>${updatedAt}</lastmod>` : '') +
        '<changefreq>monthly</changefreq><priority>0.8</priority>';
      addUrl(enUrl, extra, alternates);
    });

    // ── Hebrew article pages ────────────────────────────────────────────────
    heArticlesSnap.forEach(doc => {
      const article = doc.data();
      const slug = getSafe(() => article.slug);
      const categoryId = getSafe(() => article.category);
      const updatedAt = getSafe(() => article.updatedAt?.toDate().toISOString());

      if (!slug || !categoryId) return;
      if (!/^[a-z0-9-]+$/i.test(slug)) return;
      const categorySlug = heSectionMap[categoryId] || categoryId.toLowerCase();
      if (!/^[a-z0-9-]+$/i.test(categorySlug)) return;
      const extra =
        (updatedAt ? `<lastmod>${updatedAt}</lastmod>` : '') +
        '<changefreq>monthly</changefreq><priority>0.8</priority>';
      addUrl(`${baseUrl}/he/${categorySlug}/${slug}`, extra);
    });

    // ── Comparison pages ────────────────────────────────────────────────────
    addUrl(`${baseUrl}/compare`, '<changefreq>weekly</changefreq><priority>0.8</priority>', [
      { lang: 'en', href: `${baseUrl}/compare` },
      { lang: 'he', href: `${baseUrl}/he/compare` },
      { lang: 'x-default', href: `${baseUrl}/compare` },
    ]);
    addUrl(`${baseUrl}/he/compare`, '<changefreq>weekly</changefreq><priority>0.8</priority>', [
      { lang: 'en', href: `${baseUrl}/compare` },
      { lang: 'he', href: `${baseUrl}/he/compare` },
      { lang: 'x-default', href: `${baseUrl}/compare` },
    ]);

    // Index HE comparisons by slug for hreflang pairing (slugs match between EN & HE)
    const heCmpSlugs = new Set();
    heComparisonsSnap.forEach(doc => {
      const c = doc.data();
      const slug = getSafe(() => c.slug);
      if (slug && /^[a-z0-9-]+$/i.test(slug)) heCmpSlugs.add(slug);
    });

    comparisonsSnap.forEach(doc => {
      const c = doc.data();
      const slug = getSafe(() => c.slug);
      const updatedAt = getSafe(() => c.updatedAt?.toDate().toISOString());
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return;
      const enUrl = `${baseUrl}/compare/${slug}`;
      let alts = null;
      if (heCmpSlugs.has(slug)) {
        const heUrl = `${baseUrl}/he/compare/${slug}`;
        alts = [
          { lang: 'en', href: enUrl },
          { lang: 'he', href: heUrl },
          { lang: 'x-default', href: enUrl },
        ];
      }
      const extra = (updatedAt ? `<lastmod>${updatedAt}</lastmod>` : '') +
        '<changefreq>monthly</changefreq><priority>0.7</priority>';
      addUrl(enUrl, extra, alts);
    });

    heComparisonsSnap.forEach(doc => {
      const c = doc.data();
      const slug = getSafe(() => c.slug);
      const updatedAt = getSafe(() => c.updatedAt?.toDate().toISOString());
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return;
      const extra = (updatedAt ? `<lastmod>${updatedAt}</lastmod>` : '') +
        '<changefreq>monthly</changefreq><priority>0.7</priority>';
      addUrl(`${baseUrl}/he/compare/${slug}`, extra);
    });

    // ── AI Tools Pulse pages ────────────────────────────────────────────────
    addUrl(`${baseUrl}/ai-tools`, '<changefreq>daily</changefreq><priority>0.9</priority>', [
      { lang: 'en', href: `${baseUrl}/ai-tools` },
      { lang: 'he', href: `${baseUrl}/he/ai-tools` },
      { lang: 'x-default', href: `${baseUrl}/ai-tools` },
    ]);
    addUrl(`${baseUrl}/he/ai-tools`, '<changefreq>daily</changefreq><priority>0.9</priority>', [
      { lang: 'en', href: `${baseUrl}/ai-tools` },
      { lang: 'he', href: `${baseUrl}/he/ai-tools` },
      { lang: 'x-default', href: `${baseUrl}/ai-tools` },
    ]);
    aiToolsSnap.forEach(doc => {
      const t = doc.data();
      const slug = getSafe(() => t.slug) || doc.id;
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) return;
      const updatedAt = getSafe(() => t.updatedAt?.toDate().toISOString());
      const extra = (updatedAt ? `<lastmod>${updatedAt}</lastmod>` : '') +
        '<changefreq>weekly</changefreq><priority>0.75</priority>';
      const enUrl = `${baseUrl}/ai-tools/${slug}`;
      const heUrl = `${baseUrl}/he/ai-tools/${slug}`;
      const alts = [
        { lang: 'en', href: enUrl },
        { lang: 'he', href: heUrl },
        { lang: 'x-default', href: enUrl },
      ];
      addUrl(enUrl, extra, alts);
      addUrl(heUrl, extra, alts);
    });

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).send(xml);

  } catch (error) {
    logger.error("Error generating sitemap:", error);
    res.status(500).send("Error generating sitemap.");
  }
}

module.exports = { serveSitemap };
