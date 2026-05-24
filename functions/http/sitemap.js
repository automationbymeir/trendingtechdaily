// functions/http/sitemap.js

const { db, logger } = require('../config');
const { getSafe } = require('../utils');

/**
 * Generates and serves a sitemap.xml for SEO purposes.
 */
async function serveSitemap(req, res) {
  try {
    const baseUrl = "https://trendingtechdaily.com";
    let xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
    
    // Static pages
    xml += `<url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`;
    xml += `<url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>`;
    xml += `<url><loc>${baseUrl}/privacy</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>`;
    xml += `<url><loc>${baseUrl}/terms</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>`;
    
    // Load sections from database and create a map of section IDs to slugs
    const sectionsSnapshot = await db.collection('sections')
      .where('active', '==', true)
      .get();
    
    const sectionMap = {};
    
    // Add category pages to sitemap
    sectionsSnapshot.forEach(doc => {
      const section = doc.data();
      const slug = getSafe(() => section.slug, doc.id.toLowerCase());
      sectionMap[doc.id] = slug; // Store for article URL generation
      
      xml += `<url><loc>${baseUrl}/${slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>`;
    });
    
    // Dynamic article pages
    const articlesSnap = await db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
        
    articlesSnap.forEach(doc => {
      const article = doc.data();
      const slug = getSafe(() => article.slug);
      const categoryId = getSafe(() => article.category);
      const updatedAt = getSafe(() => article.updatedAt?.toDate().toISOString());
      
      if (slug && categoryId) {
        // Use the section slug from our map, fallback to category ID lowercase if not found
        const categorySlug = sectionMap[categoryId] || categoryId.toLowerCase();
        
        xml += `<url><loc>${baseUrl}/${categorySlug}/${slug}</loc>`;
        if (updatedAt) {
          xml += `<lastmod>${updatedAt}</lastmod>`;
        }
        xml += `<changefreq>monthly</changefreq><priority>0.8</priority></url>`;
      }
    });

    xml += '</urlset>';
    
    res.set('Content-Type', 'application/xml');
    res.status(200).send(xml);
    
  } catch (error) {
    logger.error("Error generating sitemap:", error);
    res.status(500).send("Error generating sitemap.");
  }
}

module.exports = { serveSitemap };