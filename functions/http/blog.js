// functions/blog.js - Opinly-powered blog (SSR) for automationbymeir.com
// Fetches published posts from the Opinly headless CMS REST API
// (https://sdk.opinly.ai/v1, see https://opinly.ai/docs/reference/rest-api)
// and renders SEO-friendly blog pages server-side.
//
// Config (functions/.env, never committed):
//   OPINLY_API_KEY       - company-scoped sk- key from Opinly dashboard > Settings > Developers
//   OPINLY_CDN_NAMESPACE - company CDN namespace (image host prefix)

// CJS adaptation for trendingtechdaily.com. Deployed as a v2 onRequest function
// (see exports.serveBlog in ../index.js). The OPINLY_API_KEY secret comes from
// Google Cloud Secret Manager via the v2 `secrets` option, exposed here as
// process.env.OPINLY_API_KEY.

const OPINLY_API = "https://sdk.opinly.ai/v1";
const SITE = "https://trendingtechdaily.com";
const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
function cached(key, ttl, produce) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return Promise.resolve(hit.value);
  return produce().then((value) => {
    cache.set(key, { at: Date.now(), value });
    return value;
  });
}

async function opinlyFetch(path) {
  const key = process.env.OPINLY_API_KEY;
  if (!key) return { __nokey: true };
  const res = await fetch(`${OPINLY_API}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Opinly API ${res.status} for ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

function imageUrl(file) {
  if (!file || !file.fileKey) return null;
  if (/^https:\/\//i.test(file.fileKey)) return file.fileKey;
  const ns = process.env.OPINLY_CDN_NAMESPACE || "UPZtmIIpQ04ubSiTOKTJp";
  return ns ? `https://cdn.opinly.ai/${ns}/${file.fileKey}` : null;
}

// ---- XSS hygiene: escape every CMS-sourced string; allowlist-render Tiptap JSON ----
function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeUrl(u) {
  const s = String(u ?? "");
  return /^https:\/\//i.test(s) || s.startsWith("/") ? s : "";
}

function renderMarks(text, marks) {
  let out = esc(text);
  for (const m of marks || []) {
    if (m.type === "bold") out = `<strong>${out}</strong>`;
    else if (m.type === "italic") out = `<em>${out}</em>`;
    else if (m.type === "strike") out = `<s>${out}</s>`;
    else if (m.type === "code") out = `<code>${out}</code>`;
    else if (m.type === "link") {
      const href = safeUrl(m.attrs && m.attrs.href);
      out = href ? `<a href="${esc(href)}" rel="noopener">${out}</a>` : out;
    }
  }
  return out;
}

function renderNode(node) {
  if (!node || typeof node !== "object") return "";
  const kids = (node.content || []).map(renderNode).join("");
  switch (node.type) {
    case "doc": return kids;
    case "paragraph": return kids.trim() ? `<p>${kids}</p>` : "";
    case "heading": {
      const lvl = Math.min(4, Math.max(2, (node.attrs && node.attrs.level) || 2));
      return `<h${lvl}>${kids}</h${lvl}>`;
    }
    case "text": return renderMarks(node.text || "", node.marks);
    case "hardBreak": return "<br>";
    case "bulletList": return `<ul>${kids}</ul>`;
    case "orderedList": return `<ol>${kids}</ol>`;
    case "listItem": return `<li>${kids}</li>`;
    case "blockquote": return `<blockquote>${kids}</blockquote>`;
    case "codeBlock": return `<pre><code>${kids}</code></pre>`;
    case "horizontalRule": return "<hr>";
    case "image": {
      const src = safeUrl((node.attrs && node.attrs.src) || imageUrl(node.attrs) || "");
      if (!src) return "";
      const alt = esc((node.attrs && node.attrs.alt) || "");
      return `<figure><img src="${esc(src)}" alt="${alt}" loading="lazy"></figure>`;
    }
    default: return kids; // unknown containers: render children, never raw HTML
  }
}

function renderContent(tiptap) {
  try { return renderNode(tiptap); } catch { return ""; }
}

// ---- Page template (matches trendingtechdaily.com design: real site chrome + design tokens) ----
const FALLBACK_NAV = `<header class="site-header" id="site-header"><div class="container nav-main-bar"><a class="brand-logo" href="/">TrendingTech<span>Daily</span></a><ul class="nav-links"><li><a class="nav-link" href="/">Home</a></li><li><a class="nav-link" href="/blog">Blog</a></li></ul></div></header>`;

async function chrome() {
  return cached("chrome", 60 * 60 * 1000, async () => {
    try {
      const [nav, footer] = await Promise.all([
        fetch(`${SITE}/nav.html?v=20260820_he5`).then((r) => (r.ok ? r.text() : "")),
        fetch(`${SITE}/footer.html?v=20260820_he5`).then((r) => (r.ok ? r.text() : "")),
      ]);
      return { nav: nav || FALLBACK_NAV, footer };
    } catch {
      return { nav: FALLBACK_NAV, footer: "" };
    }
  });
}

const BLOG_CSS = `
    main.blog-wrap { max-width: 860px; margin: 0 auto; padding: 48px 16px 80px; min-height: 60vh; }
    .blog-index h1 { font-family: var(--font-display); font-size: 3rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.02em; color: var(--text-primary); margin-bottom: 8px; }
    .sub { color: var(--text-muted); font-family: var(--font-mono); font-size: 0.8rem; margin-bottom: 40px; }
    .cards { display: grid; gap: 24px; }
    .card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-lg); overflow: hidden; transition: border-color var(--transition-fast); }
    .card:hover { border-color: var(--accent-red); }
    .card img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
    .card .pad { padding: 20px 22px 24px; }
    .card h2 { margin: 0 0 8px; font-family: var(--font-heading); font-size: 1.6rem; font-weight: 700; }
    .card h2 a { color: var(--text-primary); text-decoration: none; }
    .card h2 a:hover { color: var(--accent-red); }
    .meta { color: var(--text-faint); font-family: var(--font-mono); font-size: 0.75rem; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .card p { color: var(--text-secondary); margin: 0; line-height: 1.55; font-size: 0.95rem; }
    article h1 { font-family: var(--font-display); font-size: 2.6rem; font-weight: 800; line-height: 1.1; color: var(--text-primary); margin-bottom: 8px; }
    article img.hero { width: 100%; border-radius: var(--radius-lg); margin: 24px 0; }
    article .content { font-family: var(--font-serif); line-height: 1.85; color: var(--text-secondary); font-size: 1.05rem; }
    article .content p { margin: 0 0 1.3rem; }
    article .content h2 { font-family: var(--font-heading); color: var(--text-primary); font-size: 1.9rem; margin: 2.5rem 0 1rem; text-transform: uppercase; }
    article .content h3 { font-family: var(--font-heading); color: var(--text-primary); font-size: 1.5rem; margin: 2rem 0 0.75rem; }
    article .content a { color: var(--accent-red); }
    article .content ul, article .content ol { margin: 0 0 1.3rem; padding-inline-start: 1.5rem; }
    article .content li { margin-bottom: 0.5rem; }
    article .content blockquote { border-inline-start: 3px solid var(--accent-red); margin: 1.6rem 0; padding: 0.4rem 1.2rem; color: var(--text-muted); font-style: italic; }
    article .content pre { background: var(--bg-surface); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md); overflow-x: auto; }
    article .content code { font-family: var(--font-mono); background: var(--bg-surface-hover); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
    article .content pre code { padding: 0; background: none; }
    article .content figure { margin: 2rem 0; }
    article .content figure img { width: 100%; border-radius: var(--radius-md); }
    .faq { margin-top: 48px; }
    .faq h2 { font-family: var(--font-heading); color: var(--text-primary); text-transform: uppercase; }
    .faq details { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px 18px; margin-bottom: 12px; }
    .faq summary { cursor: pointer; font-weight: 600; color: var(--text-primary); }
    .faq details p { color: var(--text-secondary); margin: 10px 0 0; }
    .empty { color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: var(--radius-lg); padding: 48px 24px; text-align: center; }
`;

async function page({ title, description, canonical, ogImage, jsonLd, body }) {
  const { nav, footer } = await chrome();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="TrendingTechDaily">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  ${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ""}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600;700;800&family=Lora:ital,wght@0,500;0,600;1,400&family=Rubik:wght@400;500;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
  <link rel="stylesheet" href="/styles.css?v=20260820_2">
  ${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
  <style>${BLOG_CSS}</style>
</head>
<body>
${nav}
<main class="container blog-wrap">${body}</main>
${footer}
</body>
</html>`;
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}

const EMPTY_BODY = `<div class="blog-index"><h1>Blog</h1><p class="sub">AI and tech analysis from TrendingTechDaily.</p><div class="empty"><p>First posts are on the way. Check back soon.</p></div></div>`;

async function renderIndex() {
  const data = await cached("posts", CACHE_TTL_MS, () =>
    opinlyFetch("/content/posts?limit=24&sort=newest").catch((e) => ({ __error: e.message }))
  );
  if (!data || data.__nokey || data.__error || !Array.isArray(data.data) || data.data.length === 0) {
    return page({
      title: "Blog | TrendingTechDaily",
      description: "AI, chips, startups and the tech behind the headlines - deep dives from TrendingTechDaily.",
      canonical: `${SITE}/blog`,
      body: EMPTY_BODY,
    });
  }
  const cards = data.data.map((p) => {
    const img = imageUrl(p.titleFile);
    return `<div class="card">${img ? `<a href="/blog/${esc(p.slug)}"><img src="${esc(img)}" alt="${esc(p.titleFile.altText || p.title)}" loading="lazy"></a>` : ""}<div class="pad"><div class="meta">${esc(fmtDate(p.firstPublishedAt))}${p.category ? " · " + esc(p.category.name) : ""}</div><h2><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h2><p>${esc(p.description || "")}</p></div></div>`;
  }).join("");
  return page({
    title: "Blog | TrendingTechDaily",
    description: "AI, chips, startups and the tech behind the headlines - deep dives from TrendingTechDaily.",
    canonical: `${SITE}/blog`,
    body: `<div class="blog-index"><h1>Blog</h1><p class="sub">AI, chips, startups and the tech behind the headlines - deep dives from TrendingTechDaily.</p><div class="cards">${cards}</div></div>`,
  });
}

async function renderPost(slug) {
  const post = await cached(`post:${slug}`, CACHE_TTL_MS, () =>
    opinlyFetch(`/content/post?slug=${encodeURIComponent(slug)}`).catch((e) => ({ __error: e.message }))
  );
  if (!post || post.__nokey || post.__error || !post.slug) return null;
  const hero = imageUrl(post.titleFile);
  const contentHtml = renderContent(post.content);
  const faq = Array.isArray(post.faqs) && post.faqs.length
    ? `<section class="faq"><h2>FAQ</h2>${post.faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("")}</section>`
    : "";
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.metaDescription || post.description || "",
    datePublished: post.firstPublishedAt,
    dateModified: post.modifiedAt || post.firstPublishedAt,
    author: post.author ? { "@type": "Person", name: post.author.name } : { "@type": "Organization", name: "TrendingTechDaily" },
    image: hero || undefined,
    mainEntityOfPage: `${SITE}/blog/${post.slug}`,
  }).replace(/</g, "\\u003c");
  return page({
    title: post.metaTitle || `${post.title} | TrendingTechDaily`,
    description: post.metaDescription || post.description || "",
    canonical: `${SITE}/blog/${post.slug}`,
    ogImage: hero,
    jsonLd,
    body: `<article><h1>${esc(post.title)}</h1><div class="meta">${esc(fmtDate(post.firstPublishedAt))}${post.author ? " · " + esc(post.author.name) : ""}${post.category ? " · " + esc(post.category.name) : ""}</div>${hero ? `<img class="hero" src="${esc(hero)}" alt="${esc((post.titleFile && post.titleFile.altText) || post.title)}">` : ""}<div class="content">${contentHtml}</div>${faq}</article>`,
  });
}

async function serveBlog(req, res) {
  res.set("Cache-Control", "public, max-age=300");
  try {
    const parts = req.path.split("/").filter(Boolean); // ["blog"] or ["blog","my-post"]
    if (parts.length === 1) {
      res.status(200).send(await renderIndex());
      return;
    }
    if (parts.length === 2) {
      const html = await renderPost(parts[1]);
      if (html) {
        res.status(200).send(html);
      } else {
        res.redirect(302, "/blog");
      }
      return;
    }
    res.redirect(302, "/blog");
  } catch (e) {
    console.error("blog render failed", e);
    res.status(200).send(await page({
      title: "Blog | TrendingTechDaily",
      description: "AI and tech analysis from TrendingTechDaily.",
      canonical: `${SITE}/blog`,
      body: EMPTY_BODY,
    }));
  }
}

module.exports = { serveBlog };
