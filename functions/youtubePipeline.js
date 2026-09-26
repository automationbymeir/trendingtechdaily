const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { renderMediaOnLambda, getRenderProgress } = require("@remotion/lambda/client");
const { logger } = require("./config");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const os = require("os");
const { classifyArticleConcept } = require("./services/videoConcept");
const { fetchClipsForConcept, buildAttribution } = require("./services/pexelsService");
const { generateAndUploadAudio } = require("./services/elevenLabsService");
const { generateAndUploadHebrewAudio, generateAndUploadEnglishAudio } = require("./services/gcpTtsService");

const SERVE_URL = "https://remotionlambda-useast1-di0xuqpokc.s3.us-east-1.amazonaws.com/sites/trending-tech-daily/index.html";
const FUNCTION_NAME = "remotion-render-4-0-452-mem3008mb-disk2048mb-900sec";
const REGION = "us-east-1";

// Instagram Graph API Constants
const IG_USER_ID = "17841427939019963";
// This is the never-expiring Page Token generated via the Meta API
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN || "EAAXSLPA21hsBRRWf4ghtkTz0abnZB6udl8oYMt5NO2bai1ZC5w2YEBHMZCeaI2ZCn1FEuzsPEVfetoTuhxglj7lH546HgMaSvryvilWR3zu1nMCCGdFNX65PZBVg2yZCDEsA9pB9WoQzMtt3MaAUqJseJMT0lkvyAtflgjTjRC1AyWZBfeEao3rhGwJLzqdgAZDZD";
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN || "EAAXSLPA21hsBRUr8IQQ4nZAf6UB8ZAKLZBvjcquADMp7CTWxSNvdwwxsPrtNpfVMI9Wxhr3j9DKJVh0dtmigHiiMLh4UBNOuSabzzp9080MyrNZCJcQF2vh8QhTr04PXvTITMcypn8HTIMxDmDvgMr3oZAk63Yk6b41Rusvr2ZB40KBaxjOnVzhV8EqahZBT0az2gZDZD";


// AWS credentials for Remotion Client
const setupAwsEnv = () => {
  if (process.env.REMOTION_AWS_ACCESS_KEY_ID) {
    process.env.REMOTION_AWS_ACCESS_KEY_ID = process.env.REMOTION_AWS_ACCESS_KEY_ID.trim();
  }
  if (process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    process.env.REMOTION_AWS_SECRET_ACCESS_KEY = process.env.REMOTION_AWS_SECRET_ACCESS_KEY.trim();
  }
  if (!process.env.REMOTION_AWS_ACCESS_KEY_ID || !process.env.REMOTION_AWS_SECRET_ACCESS_KEY) {
    logger.warn("AWS credentials missing from environment variables. Video rendering may fail.");
  }
};

// YouTube OAuth Setup
const getYouTubeClient = async () => {
  const secretPath = path.join(__dirname, "youtube_client_secret.json");
  const tokenPath = path.join(__dirname, "youtube_tokens.json");

  if (!fs.existsSync(secretPath) || !fs.existsSync(tokenPath)) {
    throw new Error("YouTube API credentials not found. Ensure youtube_client_secret.json and youtube_tokens.json exist.");
  }

  const secrets = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  const oauth2Client = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );

  oauth2Client.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const handleArticleVideoGeneration = async (event, language = 'en') => {
  const before = event.data.before;
  const after = event.data.after;

  if (!after.exists) {
    logger.info("Document deleted, skipping video generation");
    return;
  }

  const article = after.data();
  // Only process published articles
  if (article.published === false) return;

  // Only trigger if it just became published (or if it's newly created and published)
  if (before.exists) {
    const beforeArticle = before.data();
    if (beforeArticle.published === true) {
      logger.info("Article already published, skipping duplicate video generation");
      return;
    }
  }

  // Skip if we already have a youtube video ID to prevent infinite loops
  if (article.youtubeVideoId) {
    logger.info("Article already has a youtubeVideoId, skipping");
    return;
  }

  const title = article.title || "Latest Tech News";
  const summary = article.excerpt || article.summary || "Catch up on the latest trends in technology.";
  const imageUrl = article.featuredImage || "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop";
  const articleId = event.params ? event.params.articleId : after.id;

  logger.info(`Triggered video generation for ${language} article: ${title}`);
  
  const logRef = after.ref.firestore.collection("video_logs").doc(articleId);

  try {
    const shouldProceed = await after.ref.firestore.runTransaction(async (transaction) => {
      const logDoc = await transaction.get(logRef);
      if (logDoc.exists) {
        const data = logDoc.data();
        const updatedAt = new Date(data.updatedAt || data.createdAt).getTime();
        const now = Date.now();
        // If it's currently processing or already successful, and updated within the last 25 minutes, skip.
        // We use 25 minutes because the max Cloud Function timeout is 20 minutes.
        if (data.status !== "error" && (now - updatedAt) < 25 * 60 * 1000) {
          return false;
        }
      }
      
      transaction.set(logRef, {
        articleId,
        title,
        language,
        status: "generating",
        createdAt: logDoc.exists ? logDoc.data().createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      
      return true;
    });

    if (!shouldProceed) {
      logger.info(`Video generation already in progress or completed recently for ${articleId}, skipping duplicate.`);
      return;
    }

    setupAwsEnv();

    // ── Step 1: classify the article into a visual concept (Gemini) ──────
    let concept = { category: 'generic-tech', keywords: [], pexelsQueries: [], useChatGptMockup: false };
    try {
      const { GoogleGenAI } = require('@google/genai');
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      concept = await classifyArticleConcept(genAI, {
        title: article.title,
        excerpt: article.excerpt,
        content: article.content,
      });
      logger.info(`Video concept: ${concept.category} (mockup=${concept.useChatGptMockup})`);
    } catch (cErr) {
      logger.warn(`Video-concept classification failed, using generic-tech: ${cErr.message}`);
    }

    // ── Step 2: fetch 3 Pexels b-roll clips ──────────────────────────────
    let bRollClips = [];
    try {
      bRollClips = await fetchClipsForConcept(concept, { count: 3, orientation: 'portrait' });
      logger.info(`Fetched ${bRollClips.length} Pexels clips for concept ${concept.category}`);
    } catch (pErr) {
      logger.warn(`Pexels fetch failed (continuing without b-roll): ${pErr.message}`);
    }

    // Persist concept + clip metadata
    try {
      await after.ref.update({
        videoConcept: {
          category: concept.category,
          keywords: concept.keywords || [],
          useChatGptMockup: !!concept.useChatGptMockup,
          clipCount: bRollClips.length,
        },
      });
    } catch (uErr) {
      logger.warn('Failed to persist videoConcept on article:', uErr.message);
    }

    logger.info("Starting Remotion Lambda Render...");

    let categorySlug = article.category || "tech";
    try {
      const sectionCollection = language === "he" ? "he_sections" : "sections";
      const catDoc = await after.ref.firestore.collection(sectionCollection).doc(article.category).get();
      if (catDoc.exists && catDoc.data().slug) {
        categorySlug = catDoc.data().slug;
      }
    } catch (err) {
      logger.warn("Failed to lookup category slug:", err);
    }
    
    const slug = article.slug || articleId;
    const articleUrl = language === "he" 
      ? `https://www.trendingtechdaily.com/he/${categorySlug}/${slug}`
      : `https://www.trendingtechdaily.com/${categorySlug}/${slug}`;

    // --- GENERATE AUDIO ---
    // Both languages now use Google Cloud Chirp 3 HD by default (the
    // ElevenLabs quota was exhausted and Chirp sounds great). ElevenLabs is
    // kept as a best-effort fallback in case Google TTS itself fails for
    // some reason.
    let audioUrl = undefined;
    try {
      const ttsText = `${title}... ${summary}`;
      if (language === 'he') {
        audioUrl = await generateAndUploadHebrewAudio(ttsText);
      } else {
        try {
          audioUrl = await generateAndUploadEnglishAudio(ttsText);
        } catch (gcpErr) {
          logger.warn(`Google TTS (en) failed, trying ElevenLabs fallback: ${gcpErr.message}`);
          audioUrl = await generateAndUploadAudio(ttsText);
        }
      }
    } catch (audioErr) {
      logger.warn(`Audio generation failed (continuing without audio): ${audioErr.message}`);
    }

    // --- INITIALIZE RENDERS IN PARALLEL ---
    const summaryRenderInitPromise = renderMediaOnLambda({
      region: REGION,
      functionName: FUNCTION_NAME,
      serveUrl: SERVE_URL,
      composition: "ArticleVideoV2",
      inputProps: {
        title: title.length > 120 ? title.substring(0, 117) + "..." : title,
        summary: summary.length > 400 ? summary.substring(0, 397) + "..." : summary,
        imageUrl,
        articleUrl,
        audioUrl,
        clips: bRollClips.map(c => ({
          url: c.url, durationSec: c.durationSec, width: c.width, height: c.height, photographer: c.photographer,
        })),
        category: concept.category,
        useChatGptMockup: false,
      },
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 2,
      privacy: "public",
      framesPerLambda: 900,
    });

    const highlightRenderInitPromise = renderMediaOnLambda({
      region: REGION,
      functionName: FUNCTION_NAME,
      serveUrl: SERVE_URL,
      composition: "ArticleHighlightVideo",
      inputProps: {
        title: title.length > 120 ? title.substring(0, 117) + "..." : title,
        summary: summary.length > 400 ? summary.substring(0, 397) + "..." : summary,
        imageUrl,
        articleUrl,
        audioUrl
      },
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 2,
      privacy: "public",
      framesPerLambda: 900,
    });

    const [summaryRenderInit, highlightRenderInit] = await Promise.all([
      summaryRenderInitPromise,
      highlightRenderInitPromise
    ]);

    await logRef.update({
      renderId: summaryRenderInit.renderId,
      highlightRenderId: highlightRenderInit.renderId,
      status: "rendering videos",
      updatedAt: new Date().toISOString()
    });

    const pollRender = async (renderInit, type) => {
      let renderResult = null;
      let attempts = 0;
      while (!renderResult && attempts < 180) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const progress = await getRenderProgress({
          renderId: renderInit.renderId,
          bucketName: renderInit.bucketName,
          functionName: FUNCTION_NAME,
          region: REGION,
        });

        if (progress.done) {
          renderResult = progress;
          break;
        }
        if (progress.fatalErrorEncountered) {
          throw new Error(`${type} render failed: ${JSON.stringify(progress.errors)}`);
        }
        logger.info(`Rendering ${type}... ${Math.round(progress.overallProgress * 100)}% (Attempt ${attempts}/180)`);
      }
      if (!renderResult) {
        throw new Error(`${type} render polling timed out after 15 minutes without completion.`);
      }
      return renderResult;
    };

    const [summaryResult, highlightResult] = await Promise.all([
      pollRender(summaryRenderInit, "Summary"),
      pollRender(highlightRenderInit, "Highlight")
    ]);

    const videoUrl = summaryResult.outputFile || summaryResult.outUrl || summaryResult?.outfits?.[0]?.url;
    const highlightVideoUrl = highlightResult.outputFile || highlightResult.outUrl || highlightResult?.outfits?.[0]?.url;

    if (!videoUrl || !highlightVideoUrl) {
      throw new Error(`Render finished but a video URL was missing in response.`);
    }
    logger.info(`Renders finished! Summary URL: ${videoUrl}, Highlight URL: ${highlightVideoUrl}`);

    await logRef.update({
      status: "uploading",
      videoDownloadUrl: videoUrl,
      highlightDownloadUrl: highlightVideoUrl,
      updatedAt: new Date().toISOString()
    });

    // Download the video locally to /tmp
    const localVideoPath = path.join(os.tmpdir(), `${summaryRenderInit.renderId}.mp4`);
    logger.info(`Downloading video to ${localVideoPath}...`);
    
    const response = await fetch(videoUrl);
    const buffer = await response.buffer();
    fs.writeFileSync(localVideoPath, buffer);
    logger.info("Video downloaded successfully.");

    // Upload to YouTube
    let videoId = null;
    let youtubeUrl = null;
    try {
      logger.info("Authenticating with YouTube API...");
      const youtube = await getYouTubeClient();

      logger.info("Uploading to YouTube Shorts...");
      const pexelsCredits = buildAttribution(bRollClips);
      const ytDescription = `${summary}\n\nFull Article: ${articleUrl}\n\n📩 Subscribe to our Weekly Newsletter: https://www.trendingtechdaily.com/profile.html\n\nRead more at TrendingTechDaily.com!\n#TechNews #Shorts #TrendingTechDaily${pexelsCredits ? `\n\n${pexelsCredits}` : ''}`;
      const uploadRes = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: title.length > 100 ? title.substring(0, 97) + "..." : title,
            description: ytDescription,
            tags: ['TechNews', 'Trending', 'Shorts', 'Technology'],
            categoryId: '28', // Science & Technology
          },
          status: {
            privacyStatus: 'public',
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: fs.createReadStream(localVideoPath),
        },
      });

      videoId = uploadRes.data.id;
      youtubeUrl = `https://www.youtube.com/shorts/${videoId}`;
      logger.info(`Video successfully uploaded to YouTube! Video ID: ${videoId}`);
      logger.info(`YouTube URL: ${youtubeUrl}`);

      // Update the Firestore document with the YouTube video ID
      await after.ref.update({
        youtubeVideoId: videoId,
        youtubeUrl: youtubeUrl
      });
    } catch (ytError) {
      logger.error("Failed to upload to YouTube:", ytError);
    } finally {
      // Clean up temporary file
      if (fs.existsSync(localVideoPath)) {
        fs.unlinkSync(localVideoPath);
      }
    }
    
    // --- Instagram Upload Step ---
    let instagramPostId = null;
    let instagramUrl = null;
    let instagramHighlightId = null;
    let instagramHighlightUrl = null;
    
    try {
      const caption = `${title}\n\n${summary}\n\nRead more at: ${articleUrl}\n\n📩 Weekly Newsletter: https://www.trendingtechdaily.com/profile.html\n\n#TechNews #TrendingTechDaily`;
      
      const uploadToInstagram = async (mediaType, videoUrlToUpload, captionText) => {
        logger.info(`Starting Instagram ${mediaType} Upload...`);
        const payload = {
          media_type: mediaType,
          video_url: videoUrlToUpload,
          access_token: IG_ACCESS_TOKEN
        };
        if (captionText) payload.caption = captionText;
        
        const createContainerRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const containerData = await createContainerRes.json();
        if (containerData.error) throw new Error(`IG Container Error: ${JSON.stringify(containerData.error)}`);
        
        const creationId = containerData.id;
        let igStatus = "IN_PROGRESS";
        let igAttempts = 0;
        while (igStatus === "IN_PROGRESS" && igAttempts < 30) {
          igAttempts++;
          await new Promise(resolve => setTimeout(resolve, 5000));
          const statusRes = await fetch(`https://graph.facebook.com/v20.0/${creationId}?fields=status_code&access_token=${IG_ACCESS_TOKEN}`);
          const statusData = await statusRes.json();
          if (statusData.error) throw new Error(`IG Status Error: ${JSON.stringify(statusData.error)}`);
          igStatus = statusData.status_code;
        }

        if (igStatus !== "FINISHED") throw new Error(`IG Processing failed or timed out. Last status: ${igStatus}`);

        const publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_USER_ID}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: creationId, access_token: IG_ACCESS_TOKEN })
        });
        const publishData = await publishRes.json();
        if (publishData.error) throw new Error(`IG Publish Error: ${JSON.stringify(publishData.error)}`);
        
        return publishData.id;
      };

      // Upload Reel
      instagramPostId = await uploadToInstagram("REELS", videoUrl, caption);
      instagramUrl = `https://www.instagram.com/reel/${instagramPostId}/`;
      logger.info(`Successfully published Reel to Instagram! Post ID: ${instagramPostId}`);

      // Upload Story
      instagramHighlightId = await uploadToInstagram("STORIES", highlightVideoUrl, null);
      instagramHighlightUrl = `https://www.instagram.com/stories/${IG_USER_ID}/${instagramHighlightId}/`;
      logger.info(`Successfully published Story to Instagram! Post ID: ${instagramHighlightId}`);

      // Update Firestore with Instagram info
      await after.ref.update({
        instagramPostId,
        instagramUrl,
        instagramHighlightId,
        instagramHighlightUrl
      });

    } catch (igError) {
      logger.error("Failed to upload to Instagram (but YouTube succeeded):", igError);
    }
    
    // --- Facebook Upload Step ---
    let facebookPostId = null;
    let facebookUrl = null;

    try {
      logger.info(`Starting Facebook Page Upload...`);
      // The caption for Facebook
      const fbCaption = `${title}\n\n${summary}\n\nRead more at: ${articleUrl}\n\n📩 Subscribe to our Weekly Newsletter: https://www.trendingtechdaily.com/profile.html\n\n#TechNews #TrendingTechDaily`;
      
      const fbRes = await fetch(`https://graph.facebook.com/v20.0/1015383948335262/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: article.featuredImage, // Use the article's featured image
          message: fbCaption,
          // Using FB_ACCESS_TOKEN
          access_token: FB_ACCESS_TOKEN
        })
      });
      const fbData = await fbRes.json();
      
      if (fbData.error) {
        throw new Error(`Facebook API Error: ${JSON.stringify(fbData.error)}`);
      }
      
      facebookPostId = fbData.post_id || fbData.id;
      // Extract the actual post ID if it's formatted as PAGEID_POSTID
      const actualPostId = facebookPostId.includes('_') ? facebookPostId.split('_')[1] : facebookPostId;
      facebookUrl = `https://www.facebook.com/1015383948335262/posts/${actualPostId}`;
      logger.info(`Successfully published to Facebook Page! Post ID: ${facebookPostId}`);

      await after.ref.update({
        facebookPostId,
        facebookUrl
      });

    } catch (fbError) {
      logger.error("Failed to upload to Facebook:", fbError);
    }

    // --- Twitter/X Upload Step ---
    let twitterPostId = null;
    let twitterUrl = null;

    try {
      logger.info(`Starting Twitter/X Upload...`);
      const { TwitterApi } = require('twitter-api-v2');
      const twitterClient = new TwitterApi({
        appKey: "3qpmck4wIjnMnoqLhOp9hkUNs",
        appSecret: "CyfP96Ceqm93maueEIwyw2NPy5i1p4FwYZj3EaPJG8MNxlCM5I",
        accessToken: "2050160798597517312-HbAYRFFAgqgJXN2rJfeBVRN8k3lOsQ",
        accessSecret: "rJ4b8pDX1xt0KArDGvnGUJhIjsSuTLveZkYS45IYps3r8"
      });

      // Twitter character limit is 280.
      // We will create a short caption with the title and the link.
      let twitterCaption = `${title}\n\nRead more at: ${articleUrl}\n\n📩 Newsletter: https://www.trendingtechdaily.com/profile.html\n\n#TechNews`;
      
      // Download image into a buffer
      const imageRes = await fetch(article.featuredImage);
      const imageBuffer = await imageRes.buffer();

      // Upload media to Twitter via v1.1
      const mediaId = await twitterClient.v1.uploadMedia(imageBuffer, { mimeType: 'image/jpeg' });

      // Post to Twitter with media
      const { data: createdTweet } = await twitterClient.v2.tweet({
        text: twitterCaption,
        media: { media_ids: [mediaId] }
      });
      
      twitterPostId = createdTweet.id;
      twitterUrl = `https://twitter.com/TrendingTechD/status/${twitterPostId}`;
      logger.info(`Successfully published to Twitter/X! Post ID: ${twitterPostId}`);

      await after.ref.update({
        twitterPostId,
        twitterUrl
      });
    } catch (twitterError) {
      logger.error("Failed to upload to Twitter/X:", twitterError);
    }

    // --- Website Stories Upload Step ---
    try {
      logger.info(`Adding to Website Stories collection...`);
      const storiesRef = after.ref.firestore.collection('stories');
      await storiesRef.add({
        articleId,
        title: title.length > 120 ? title.substring(0, 117) + "..." : title,
        language,
        videoUrl: highlightVideoUrl,
        thumbnail: article.featuredImage || "/img/logo.png",
        articleUrl,
        createdAt: new Date().toISOString()
      });
      logger.info(`Successfully added to Website Stories collection`);
    } catch (storiesError) {
      logger.error("Failed to add to Website Stories collection:", storiesError);
    }

    // Mark log as success
    await logRef.update({
      status: "success",
      youtubeVideoId: videoId,
      youtubeUrl: youtubeUrl,
      instagramPostId: instagramPostId || null,
      instagramUrl: instagramUrl || null,
      instagramHighlightId: instagramHighlightId || null,
      instagramHighlightUrl: instagramHighlightUrl || null,
      facebookPostId: facebookPostId || null,
      facebookUrl: facebookUrl || null,
      twitterPostId: twitterPostId || null,
      twitterUrl: twitterUrl || null,
      updatedAt: new Date().toISOString()
    });

    logger.info("Firestore document updated with YouTube Video ID.");

  } catch (error) {
    logger.error("Error in handleArticleVideoGeneration:", error);
    await logRef.update({
      status: "error",
      error: error.message || String(error),
      updatedAt: new Date().toISOString()
    });
  }
};

exports.onEnglishArticlePublished = onDocumentWritten(
  { document: "articles/{articleId}", region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: ["REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "PEXELS_API_KEY"] },
  (event) => handleArticleVideoGeneration(event, 'en')
);

exports.onHebrewArticlePublished = onDocumentWritten(
  { document: "he_articles/{articleId}", region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: ["REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "PEXELS_API_KEY"] },
  (event) => handleArticleVideoGeneration(event, 'he')
);
