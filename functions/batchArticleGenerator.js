// functions/batchArticleGenerator.js
//
// Collects article topics once per day, submits them as a single Gemini Batch
// job (50% cheaper, async), then processes results when the job completes.
//
// Firestore schema:
//   batchJobs/{jobId}  — one doc per submitted batch
//     { jobName, status, topics[], submittedAt, completedAt, articleCount }

const { logger, db } = require('./config');
const { loadGeminiSDK, getSafetySettings, getSafe, getGeminiSDK } = require('./utils');
const articlesAdmin = require('./admin/articles');
const { resolveEditorialArticleImage } = require('./services/editorialImageService');

const GEMINI_PRIMARY_MODEL = 'gemini-1.5-flash';
const BATCH_JOBS_COLLECTION = 'batchJobs';
const BATCH_SIZE = 24; // one article per hour of the day

// ---------------------------------------------------------------------------
// Prompt builder — same structure as generateArticleContent
// ---------------------------------------------------------------------------
function buildArticlePrompt(topic) {
  return `Write an authoritative, high-impact tech/finance news article about "${topic}" in the style of Bloomberg, Reuters, or The Information.

Requirements:
- Write in a professional journalistic style with engaging, analytical paragraphs.
- Include factual data, technical nuances, market trends, and industry implications.
- Seamlessly integrate inline hyperlinks to authoritative sources (e.g. arXiv research papers, official corporate press releases, SEC filings, GitHub repositories, or Reuters/Bloomberg reports) using clean HTML anchor tags: <a href="URL" target="_blank" rel="noopener noreferrer">anchor text</a>.
- Include 1-2 insightful quotes or social discussion mentions from industry leaders, engineers, or founders on X (Twitter), LinkedIn, or GitHub.
- For all sources and social mentions, provide DIRECT DEEP LINKS (e.g. specific arXiv paper "https://arxiv.org/abs/...", specific blog post "https://.../blog/...", specific tweet/status "https://x.com/username/status/...", or specific GitHub release/PR "https://github.com/.../releases"). NEVER provide homepage or root domain links.
- Length: 450-700 words.

Output MUST be ONLY a raw JSON object with these exact keys:
{
"title": "string, max 70 chars, professional headline",
"slug": "string, lowercase, hyphenated, based on title",
"content": "string, rich HTML with <p> tags and inline <a href='...'> source links, 450-700 words",
"excerpt": "string, informative summary, max 160 chars",
"tags": ["array", "of", "relevant", "tags"],
"sources": [
  { "title": "string, title of primary source or paper", "url": "string, specific canonical deep URL", "publisher": "string, e.g. arXiv, Reuters, OpenAI Blog, Bloomberg" }
],
"socialMentions": [
  { "platform": "X", "author": "string, full name", "handle": "@handle", "quote": "string, key quote or insight", "link": "string, specific direct post URL https://x.com/.../status/...", "context": "string, e.g. Lead AI Researcher" }
],
"imagePrompt": "string, professional image description for article illustration",
"mentionedCompanies": ["array", "of", "publicly traded company names mentioned (e.g., Apple, Microsoft, NVIDIA)"],
"imageAltText": "string, descriptive alt text for the image"
}

Generate the article about: "${topic}". Output ONLY the JSON object.`;
}

// ---------------------------------------------------------------------------
// Parse the JSON payload from a Gemini batch response part
// ---------------------------------------------------------------------------
function parseArticleJson(rawText) {
  let text = (rawText || '').trim();
  text = text.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  const parsed = JSON.parse(match[0]);
  if (!parsed.title || !parsed.content || !parsed.slug) {
    throw new Error('Missing required fields in parsed JSON');
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Collect topics for the batch
// ---------------------------------------------------------------------------
async function collectTopics(newsApiKey, count) {
  const topics = [];

  // Half from Grok (if available), half from NewsAPI headlines
  const { suggestArticleTopic } = require('./callable/ai');
  for (let i = 0; i < count; i++) {
    try {
      if (i % 2 === 0) {
        const suggestion = await suggestArticleTopic({
          auth: { uid: 'batch-scheduler' },
          data: { prompt: 'technology news, tech guides, company overviews, or stock market updates' },
        });
        if (suggestion && suggestion.topic) {
          topics.push(suggestion.topic);
          continue;
        }
      }
    } catch (err) {
      logger.warn('collectTopics: Grok suggestion failed, falling back to NewsAPI', err.message);
    }

    // Fallback: NewsAPI headline
    try {
      const fetch = require('node-fetch');
      const res = await fetch(
        `https://newsapi.org/v2/top-headlines?category=technology&language=en&pageSize=1&apiKey=${newsApiKey}`
      );
      const data = await res.json();
      const headline = data?.articles?.[0]?.title || `latest technology news ${i}`;
      topics.push(headline);
    } catch (err) {
      logger.error('collectTopics: NewsAPI fallback failed', err.message);
      topics.push(`trending technology topic ${i + 1}`);
    }
  }

  return topics;
}

// ---------------------------------------------------------------------------
// Submit a batch job to Gemini
// ---------------------------------------------------------------------------
async function submitDailyArticleBatch(newsApiKey) {
  logger.info('submitDailyArticleBatch: starting');

  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) {
    throw new Error('Gemini SDK failed to load');
  }

  const genAI = new GoogleGenAI({
    project: process.env.GCLOUD_PROJECT || 'automationbymeir',
    location: process.env.GCLOUD_LOCATION || 'us-central1',
  });

  const topics = await collectTopics(newsApiKey, BATCH_SIZE);
  logger.info(`submitDailyArticleBatch: collected ${topics.length} topics`);

  // Build inline batch requests — one per topic
  const inlineRequests = topics.map((topic, idx) => ({
    key: `article-${idx}`,
    request: {
      model: `models/${GEMINI_PRIMARY_MODEL}`,
      contents: [{ role: 'user', parts: [{ text: buildArticlePrompt(topic) }] }],
      safetySettings: getSafetySettings(),
    },
  }));

  const batchJob = await genAI.batches.create({
    model: `models/${GEMINI_PRIMARY_MODEL}`,
    src: inlineRequests,
    config: { displayName: `trendingtechdaily-daily-${new Date().toISOString().slice(0, 10)}` },
  });

  logger.info(`submitDailyArticleBatch: job submitted — ${batchJob.name}`);

  // Persist the job to Firestore so the processor can pick it up later
  await db.collection(BATCH_JOBS_COLLECTION).add({
    jobName: batchJob.name,
    status: 'pending',
    topics,
    submittedAt: new Date(),
    articleCount: topics.length,
  });

  return { jobName: batchJob.name, topicCount: topics.length };
}

// ---------------------------------------------------------------------------
// Process all pending batch jobs — called on a schedule
// ---------------------------------------------------------------------------
async function processPendingBatches(unsplashKey) {
  const snap = await db.collection(BATCH_JOBS_COLLECTION)
    .where('status', '==', 'pending')
    .get();

  if (snap.empty) {
    logger.info('processPendingBatches: no pending jobs');
    return { processed: 0 };
  }

  const sdkLoaded = await loadGeminiSDK();
  const { GoogleGenAI } = getGeminiSDK();
  if (!sdkLoaded || !GoogleGenAI) {
    throw new Error('Gemini SDK failed to load');
  }

  const genAI = new GoogleGenAI({
    project: process.env.GCLOUD_PROJECT || 'automationbymeir',
    location: process.env.GCLOUD_LOCATION || 'us-central1',
  });

  let totalArticlesCreated = 0;

  for (const doc of snap.docs) {
    const jobData = doc.data();
    logger.info(`processPendingBatches: checking job ${jobData.jobName}`);

    let batchJob;
    try {
      batchJob = await genAI.batches.get({ name: jobData.jobName });
    } catch (err) {
      logger.error(`processPendingBatches: failed to fetch job ${jobData.jobName}`, err.message);
      continue;
    }

    const state = batchJob.state;

    if (state === 'JOB_STATE_SUCCEEDED') {
      logger.info(`processPendingBatches: job ${jobData.jobName} succeeded, processing results`);
      const created = await _createArticlesFromBatchResults(batchJob, jobData.topics, unsplashKey);
      await doc.ref.update({ status: 'completed', completedAt: new Date(), articlesCreated: created });
      totalArticlesCreated += created;

    } else if (state === 'JOB_STATE_FAILED' || state === 'JOB_STATE_CANCELLED' || state === 'JOB_STATE_EXPIRED') {
      logger.error(`processPendingBatches: job ${jobData.jobName} ended with state ${state}`);
      await doc.ref.update({ status: 'failed', failedAt: new Date(), finalState: state });

    } else {
      // Still running — leave as pending
      logger.info(`processPendingBatches: job ${jobData.jobName} is ${state}, skipping`);
    }
  }

  logger.info(`processPendingBatches: created ${totalArticlesCreated} articles total`);
  return { processed: totalArticlesCreated };
}

// ---------------------------------------------------------------------------
// Turn batch results into Firestore articles
// ---------------------------------------------------------------------------
async function _createArticlesFromBatchResults(batchJob, topics, unsplashKey) {
  const responses = batchJob.dest?.inlinedResponses || [];
  let created = 0;

  for (const item of responses) {
    const idx = parseInt((item.key || '').replace('article-', ''), 10);
    const topic = topics[idx] || `topic-${idx}`;

    try {
      const rawText =
        item.response?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      const parsed = parseArticleJson(rawText);

      // Resolve authentic, high-relevance editorial image
      let featuredImage = '';
      let imageAltText = parsed.imageAltText || parsed.title;
      try {
        const img = await resolveEditorialArticleImage({
          topic: parsed.title,
          imagePrompt: parsed.imagePrompt,
          category: 'news',
          tags: parsed.tags || []
        }, unsplashKey);
        if (img?.imageUrl) {
          featuredImage = img.imageUrl;
          imageAltText = img.altText || imageAltText;
        }
      } catch (e) {
        logger.warn(`Image resolution note for "${parsed.title}"`, e.message);
      }

      const wordCount = (parsed.content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 225));

      await articlesAdmin.createArticle({
        title: parsed.title,
        slug: parsed.slug,
        excerpt: getSafe(() => parsed.excerpt),
        category: 'news',
        tags: getSafe(() => parsed.tags, []),
        sources: getSafe(() => parsed.sources, []),
        socialMentions: getSafe(() => parsed.socialMentions, []),
        featuredImage,
        imageAltText,
        content: parsed.content,
        published: true,
        readingTimeMinutes,
        source: 'batch',
      });

      logger.info(`Created article with citations: "${parsed.title}"`);
      created++;
    } catch (err) {
      logger.error(`Failed to create article for topic "${topic}"`, err.message);
    }
  }

  return created;
}

module.exports = { submitDailyArticleBatch, processPendingBatches };
