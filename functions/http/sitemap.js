// functions/http/sitemap.js

const { db, logger } = require('../config');
const { getSafe } = require('../utils');

/**
 * Generates and serves a complete sitemap.xml for SEO purposes.
 */
async function serveSitemap(req, res) {
  try {
    const baseUrl = "https://trendingtechdaily.com";
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    // Core English Static Pages
    xml += `  <url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/podcasts</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/stock-data</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/ai-tools</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/design-systems</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/privacy</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/terms</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>\n`;
    
    // Core Hebrew Static Pages
    xml += `  <url><loc>${baseUrl}/he</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/podcasts</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/shuk-hon</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/ai-tools</loc><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/design-systems</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/privacy</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>\n`;
    xml += `  <url><loc>${baseUrl}/he/terms</loc><changefreq>yearly</changefreq><priority>0.5</priority></url>\n`;
    
    // Load categories
    const KNOWN_CATS = ['ai', 'ai-models', 'autonomous-agents', 'dev', 'computing', 'chips', 'markets', 'startups', 'cybersecurity', 'top-stories', 'gadgets'];
    KNOWN_CATS.forEach(slug => {
      xml += `  <url><loc>${baseUrl}/${slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
      xml += `  <url><loc>${baseUrl}/he/${slug}</loc><changefreq>daily</changefreq><priority>0.9</priority></url>\n`;
    });
    
    // Dynamic Published Articles (Clean canonical URLs)
    const articlesSnap = await db.collection('articles')
        .where('published', '==', true)
        .orderBy('createdAt', 'desc')
        .limit(1000)
        .get();
        
    articlesSnap.forEach(doc => {
      const article = doc.data();
      const slug = article.slug || doc.id;
      const category = article.category || article.section || 'ai';
      const catSlug = (typeof category === 'string' && !/^[A-Za-z0-9_-]{16,}$/.test(category)) ? category.toLowerCase() : 'ai';
      
      let updatedAt = null;
      if (article.updatedAt) {
        updatedAt = article.updatedAt.toDate ? article.updatedAt.toDate().toISOString() : new Date(article.updatedAt).toISOString();
      } else if (article.createdAt) {
        updatedAt = article.createdAt.toDate ? article.createdAt.toDate().toISOString() : new Date(article.createdAt).toISOString();
      }
      
      const isHe = article.language === 'he' || article.language === 'iw' || article.isHebrew === true;
      const pathPrefix = isHe ? `${baseUrl}/he/${catSlug}/${slug}` : `${baseUrl}/${catSlug}/${slug}`;
      
      xml += `  <url><loc>${pathPrefix}</loc>`;
      if (updatedAt) {
        xml += `<lastmod>${updatedAt}</lastmod>`;
      }
      xml += `<changefreq>weekly</changefreq><priority>0.85</priority></url>\n`;
    });

    xml += '</urlset>';
    
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600, s-maxage=86400');
    return res.status(200).send(xml);
    
  } catch (error) {
    logger.error("Error generating sitemap:", error);
    res.status(500).send("Error generating sitemap.");
  }
}

module.exports = { serveSitemap };