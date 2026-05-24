// functions/scheduledArticles.js

const fetch = require('node-fetch');
const nodemailer = require('nodemailer');
const { logger, db } = require('./config');
const aiCallables = require('./callable/ai');
const articlesAdmin = require('./admin/articles');

const CONFIG_DOC = 'settings/autoArticleSchedule';

function estimateReadingTime(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean);
  return Math.max(1, Math.ceil(words.length / 225));
}

async function fetchTechHeadline(newsApiKey) {
  try {
    const res = await fetch(`https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=1&apiKey=${newsApiKey}`);
    const data = await res.json();
    if (data && data.articles && data.articles.length > 0) {
      return data.articles[0].title;
    }
  } catch (err) {
    logger.error('Failed to fetch tech headline:', err);
  }
  return 'latest technology news';
}

async function fetchTechQuote() {
  try {
    const res = await fetch('https://api.quotable.io/random?tags=technology');
    const data = await res.json();
    if (data && data.content) {
      return `${data.content} — ${data.author}`;
    }
  } catch (err) {
    logger.error('Failed to fetch tech quote:', err);
  }
  return '';
}

async function determineArticleTopic(newsApiKey) {
  if (Math.random() < 0.5) {
    try {
      const suggestion = await aiCallables.suggestArticleTopic({
        auth: { uid: 'scheduler' },
        data: { prompt: 'technology news, tech guides, company overviews, or stock market updates' }
      });
      if (suggestion && suggestion.topic) {
        return suggestion.topic;
      }
    } catch (err) {
      logger.error('Failed to get topic from Grok:', err);
    }
  }
  return await fetchTechHeadline(newsApiKey);
}

async function shouldGenerateArticle(defaultFrequency, defaultArticlesPerRun = 1) {
  const docRef = db.doc(CONFIG_DOC);
  const snap = await docRef.get();
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  let data = snap.exists ? snap.data() : {};
  const frequency = data.frequency || defaultFrequency || 1;
  const articlesPerRun = data.articlesPerRun || defaultArticlesPerRun;
  const last = data.lastGeneratedAt
    ? (data.lastGeneratedAt.toMillis ? data.lastGeneratedAt.toMillis() : new Date(data.lastGeneratedAt).getTime())
    : 0;
  const shouldGenerate = now - last >= oneDay / frequency;
  if (shouldGenerate) {
    await docRef.set({ lastGeneratedAt: new Date(now), frequency, articlesPerRun }, { merge: true });
  }
  return { shouldGenerate, articlesPerRun };
}

async function sendNotificationEmail(articleId, article) {
  const to = process.env.ARTICLE_NOTIFY_EMAIL || 'info@trendingtechdaily.com';
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    logger.error('SMTP credentials not configured; skipping notification email');
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const approvalUrl = `https://trendingtechdaily.com/admin/articles/${articleId}`;
  const mailOptions = {
    from: user,
    to,
    subject: `New Auto-Generated Article: ${article.title}`,
    html: `<p>A new article has been generated and is awaiting approval.</p><p><strong>${article.title}</strong></p><p><a href="${approvalUrl}">Review Article</a></p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info(`Notification email sent for article ${articleId}`);
  } catch (err) {
    logger.error('Failed to send notification email:', err);
  }
}

async function generateArticle(newsApiKey) {
  const headline = await determineArticleTopic(newsApiKey);
  const aiContent = await aiCallables.generateArticleContent({ auth: { uid: 'scheduler' }, data: { prompt: headline } });
  if (aiContent.error) {
    logger.error('AI content generation failed:', aiContent.message);
    return;
  }
  const imageData = await aiCallables.generateArticleImage({ auth: { uid: 'scheduler' }, data: { prompt: aiContent.imagePrompt, articleTitle: aiContent.title } });
  const quote = await fetchTechQuote();
  let content = aiContent.content;
  if (quote) content += `<blockquote>${quote}</blockquote>`;
  const readingTime = estimateReadingTime(content);
  const article = await articlesAdmin.createArticle({
    title: aiContent.title,
    slug: aiContent.slug,
    excerpt: aiContent.excerpt,
    category: aiContent.category || 'news',
    tags: aiContent.tags || [],
    featuredImage: imageData.imageUrl,
    imageAltText: imageData.imageAltText,
    content,
    published: false,
    readingTimeMinutes: readingTime,
  });

  await sendNotificationEmail(article.id, article);
}

module.exports = { shouldGenerateArticle, generateArticle };
