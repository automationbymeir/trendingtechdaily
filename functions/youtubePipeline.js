const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { renderMediaOnLambda, getRenderProgress, renderStillOnLambda } = require("@remotion/lambda/client");
const { logger } = require("./config");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const os = require("os");
const { classifyArticleConcept } = require("./services/videoConcept");
const { fetchClipsForConcept, buildAttribution } = require("./services/pexelsService");

// Human-friendly category label for the cover thumbnail.
function prettyCat(c) {
  const map = {
    'ai-assistant': 'AI & Agents', 'autonomous-vehicle': 'Autonomy',
    'robot-humanoid': 'Robotics', 'smartphone': 'Mobile', 'gaming': 'Gaming',
    'crypto-finance': 'Crypto', 'cybersecurity': 'Security',
    'social-media': 'Social', 'space': 'Space', 'gadget': 'Hardware',
    'cloud-datacenter': 'Cloud', 'biotech-health': 'Biotech',
    'electric-vehicle': 'EV', 'ar-vr': 'AR / VR', 'generic-tech': 'Tech',
  };
  return map[c] || 'Tech';
}
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
  let secrets;
  let tokens;

  const secretPath = path.join(__dirname, "youtube_client_secret.json");
  const tokenPath = path.join(__dirname, "youtube_tokens.json");

  if (fs.existsSync(secretPath) && fs.existsSync(tokenPath)) {
    secrets = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  } else if (process.env.YOUTUBE_CLIENT_SECRET_JSON && process.env.YOUTUBE_TOKENS_JSON) {
    secrets = JSON.parse(process.env.YOUTUBE_CLIENT_SECRET_JSON);
    tokens = JSON.parse(process.env.YOUTUBE_TOKENS_JSON);
  } else {
    throw new Error("YouTube API credentials not found. Ensure youtube_client_secret.json and youtube_tokens.json exist or Secret Manager secrets are configured.");
  }

  const oauth2Client = new google.auth.OAuth2(
    secrets.web.client_id,
    secrets.web.client_secret,
    secrets.web.redirect_uris[0]
  );

  oauth2Client.setCredentials(tokens);
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

/**
 * Editorial Category Archetypes for Dynamic 4-Scene Matching
 */
const CATEGORY_ARCHETYPES = {
  'cyber-warfare': {
    domainName: 'CYBER DEFENSE & INTEL',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'CYBERSECURITY TELEMETRY // SOC OPERATIONS',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'CRITICAL INFRASTRUCTURE DEFENSE'
  },
  'cybersecurity': {
    domainName: 'CYBERSECURITY',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'SECURITY PROTOCOLS // THREAT INTEL',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'GLOBAL THREAT RADAR'
  },
  'ai': {
    domainName: 'ARTIFICIAL INTELLIGENCE',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'NEURAL WEIGHT MATRIX // DEEP LEARNING',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'GLOBAL FRONTIER MODEL DEPLOYMENT'
  },
  'autonomous-agents': {
    domainName: 'AUTONOMOUS AGENTS',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'MULTI-AGENT EXECUTION LOOP',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'AUTONOMOUS SWARM INFRASTRUCTURE'
  },
  'dev': {
    domainName: 'DEVELOPMENT & CLOUD',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'CODE COMPILATION & ARCHITECTURE',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'PRODUCTION CLOUD CLUSTER'
  },
  'chips': {
    domainName: 'SEMICONDUCTORS & HARDWARE',
    scene2Video: 'clip_semiconductor.mp4',
    scene2Badge: '3nm SILICON DIE & INTERCONNECT',
    scene4Media: 'en_media.jpg',
    scene4Badge: 'HIGH PERFORMANCE COMPUTE FABRIC'
  },
  'computing': {
    domainName: 'SUPERCOMPUTING & SYSTEMS',
    scene2Video: 'clip_semiconductor.mp4',
    scene2Badge: 'SUPERCOMPUTING ACCELERATOR CLUSTER',
    scene4Media: 'he_media.jpg',
    scene4Badge: 'AI HYPERSCALER DATACENTER'
  },
  'markets': {
    domainName: 'TECH MARKETS & FINTECH',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'GLOBAL LIQUIDITY & MARKET TELEMETRY',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'FINANCIAL DATA INTELLIGENCE'
  },
  'mobile': {
    domainName: 'MOBILE & DEVICES',
    scene2Video: 'clip_semiconductor.mp4',
    scene2Badge: 'HARDWARE CHASSIS & SOC INTEGRATION',
    scene4Media: 'en_media.jpg',
    scene4Badge: 'DEVICE HARDWARE ECOSYSTEM'
  },
  'robotics': {
    domainName: 'ROBOTICS & AUTONOMOUS SYSTEMS',
    scene2Video: 'clip_ai_network.mp4',
    scene2Badge: 'SENSOR FUSION & SPATIAL PERCEPTION',
    scene4Media: 'datacenter_servers_visual_1788630934213.jpg',
    scene4Badge: 'EMBODIED AI DEPLOYMENT'
  }
};

function resolveCategoryArchetype(article) {
  const cat = (article.category || '').toLowerCase();
  if (CATEGORY_ARCHETYPES[cat]) return CATEGORY_ARCHETYPES[cat];

  const fullText = `${article.title || ''} ${article.summary || ''} ${article.excerpt || ''} ${cat}`.toLowerCase();
  if (fullText.includes('cyber') || fullText.includes('סייבר') || fullText.includes('malware') || fullText.includes('התקפ') || fullText.includes('אבטח')) {
    return CATEGORY_ARCHETYPES['cyber-warfare'];
  }
  if (fullText.includes('chip') || fullText.includes('שבב') || fullText.includes('nvidia') || fullText.includes('tpu') || fullText.includes('semiconductor')) {
    return CATEGORY_ARCHETYPES['chips'];
  }
  if (fullText.includes('stock') || fullText.includes('מניה') || fullText.includes('שווי') || fullText.includes('valuation') || fullText.includes('revenue')) {
    return CATEGORY_ARCHETYPES['markets'];
  }
  if (fullText.includes('robot') || fullText.includes('tesla') || fullText.includes('autonomous') || fullText.includes('fsd') || fullText.includes('רכב')) {
    return CATEGORY_ARCHETYPES['robotics'];
  }
  if (fullText.includes('iphone') || fullText.includes('android') || fullText.includes('pixel') || fullText.includes('samsung') || fullText.includes('smartphone')) {
    return CATEGORY_ARCHETYPES['mobile'];
  }
  return CATEGORY_ARCHETYPES['ai'];
}

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

  const beforeData = before.exists ? before.data() : {};
  // Trigger ONLY if it just became published OR if generateVideo was just changed to true
  const isNewlyPublished = !before.exists || (beforeData.published !== true && article.published === true);
  const isExplicitRequest = beforeData.generateVideo !== true && article.generateVideo === true;

  if (!isNewlyPublished && !isExplicitRequest) {
    logger.info("Neither newly published nor a new explicit generateVideo request, skipping video generation");
    return;
  }

  // Skip if we already have a video rendered or published (unless explicitly requested)
  if ((article.youtubeVideoId || article.videoUrl || article.instagramPostId) && !isExplicitRequest) {
    logger.info("Article already has a video/post, skipping duplicate video generation");
    return;
  }

  // Immediately reset generateVideo to false to prevent downstream update() calls from re-triggering
  if (article.generateVideo === true) {
    try {
      await after.ref.update({ generateVideo: false });
    } catch (resetErr) {
      logger.warn("Could not reset generateVideo flag:", resetErr.message);
    }
  }

  const title = article.title || "Latest Tech News";
  const summary = article.excerpt || article.summary || "Catch up on the latest trends in technology.";
  const imageUrl = article.featuredImage || article.imageUrl || "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1080&h=1920&fit=crop";
  const articleId = event.params ? event.params.articleId : after.id;

  const db = after.ref.firestore;

  // ── RATE LIMITING / THROTTLE: 3.5 Hours Between Automated Renders ─────
  const throttleDocRef = db.doc(`system_state/video_throttle_${language}`);
  if (!isExplicitRequest) {
    try {
      const throttleSnap = await throttleDocRef.get();
      if (throttleSnap.exists) {
        const lastRun = throttleSnap.data().lastRenderTimestamp || 0;
        const elapsedHours = (Date.now() - lastRun) / (1000 * 60 * 60);
        if (elapsedHours < 3.5) {
          logger.info(`Video generation throttled for ${language}. Last render was ${elapsedHours.toFixed(2)}h ago (min 3.5h required). Skipping.`);
          return;
        }
      }
    } catch (thErr) {
      logger.warn("Could not check video throttle status:", thErr.message);
    }
  }

  logger.info(`Triggered video generation for ${language} article: ${title}`);
  
  const logRef = after.ref.firestore.collection("video_logs").doc(articleId);

  try {
    const shouldProceed = await after.ref.firestore.runTransaction(async (transaction) => {
      const logDoc = await transaction.get(logRef);
      if (logDoc.exists) {
        const data = logDoc.data();
        const updatedAt = new Date(data.updatedAt || data.createdAt).getTime();
        const now = Date.now();
        // If an instance is actively generating, rendering, or uploading, NEVER start another concurrent job
        const activeStatuses = ["generating", "rendering", "uploading"];
        if (activeStatuses.includes(data.status) && (now - updatedAt) < 25 * 60 * 1000) {
          logger.info(`Video generation already actively in progress (${data.status}) for ${articleId}. Skipping.`);
          return false;
        }

        // If it already succeeded in the last 25 minutes, skip duplicates
        if (data.status === "success" && (now - updatedAt) < 25 * 60 * 1000) {
          logger.info(`Video generation already succeeded recently for ${articleId}. Skipping.`);
          return false;
        }
      }
      
      transaction.set(logRef, {
        articleId,
        title,
        language,
        designSystem: "ViralTechReel",
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

    // Update throttle timer
    await throttleDocRef.set({
      lastRenderTimestamp: Date.now(),
      lastArticleId: articleId,
      lastArticleTitle: title,
      updatedAt: new Date().toISOString()
    }, { merge: true });

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

    // --- GENERATE MULTI-SCENE AUDIO & ASSETS FOR VIRAL TECH REEL ---
    const isHe = language === 'he' || /[\u0590-\u05FF]/.test(title);
    const archetype = resolveCategoryArchetype(article);

    const sentences = (summary || title).replace(/\n+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);

    const scene1Script = title;
    const scene2Script = sentences[0] || summary.slice(0, 140);
    const scene3Script = sentences[1] || (isHe ? "ארכיטקטורה הנדסית מתקדמת שנחשפת עכשיו." : "Cutting-edge architectural specifications revealed.");
    const scene4Script = isHe
      ? "הדיווח המלא, הנתונים והמקורות מחכים לכם עכשיו באתר טרנדינג טק דיילי."
      : "Read the full intelligence report and benchmark metrics on TrendingTechDaily.com.";

    const ttsCall = isHe ? generateAndUploadHebrewAudio : generateAndUploadEnglishAudio;
    logger.info(`Synthesizing Google Cloud Neural TTS voiceovers for 4 scenes...`);

    let audioScene1 = null, audioScene2 = null, audioScene3 = null, audioScene4 = null;
    try {
      [audioScene1, audioScene2, audioScene3, audioScene4] = await Promise.all([
        ttsCall(scene1Script).catch(e => { logger.warn("TTS Scene 1 error:", e.message); return null; }),
        ttsCall(scene2Script).catch(e => { logger.warn("TTS Scene 2 error:", e.message); return null; }),
        ttsCall(scene3Script).catch(e => { logger.warn("TTS Scene 3 error:", e.message); return null; }),
        ttsCall(scene4Script).catch(e => { logger.warn("TTS Scene 4 error:", e.message); return null; }),
      ]);
    } catch (ttsErr) {
      logger.warn(`Audio synthesis warning: ${ttsErr.message}`);
    }

    // Dynamic scene 2 B-roll clip if available from Pexels
    const scene2Media = (bRollClips && bRollClips.length > 0 && bRollClips[0].url)
      ? bRollClips[0].url
      : archetype.scene2Video;

    // ── BUILD 4-SCENE VIRAL REEL PROPS ──────────────────────────────
    const scenes = [
      // Scene 1: The Breaking Hook (Authentic Publisher Image)
      {
        videoSrc: imageUrl,
        audioSrc: audioScene1 || (isHe ? "he_scene1.mp3" : "en_scene1.mp3"),
        durationFrames: 190, // ~6.3s
        headline: title,
        subtext: scene1Script,
        statBadge: isHe ? 'BREAKING // מבזק ראשוני' : 'BREAKING // TECH DISPATCH',
        mediaBadge: isHe ? `מבזק רשמי // ${archetype.domainName}` : `OFFICIAL DISPATCH // ${archetype.domainName}`,
        highlightWords: isHe ? ['חשיפה', 'חדש', 'בינה מלאכותית', 'סייבר', 'הודעה'] : ['Breaking', 'Revealed', 'Next-Gen', 'Official']
      },
      // Scene 2: Deep Technical Analysis (Domain-Matched B-Roll)
      {
        videoSrc: scene2Media,
        audioSrc: audioScene2 || (isHe ? "he_scene2.mp3" : "en_scene2.mp3"),
        durationFrames: 280, // ~9.3s
        headline: isHe ? 'ניתוח טכנולוגי מעמיק' : 'Deep Technical Analysis',
        subtext: scene2Script,
        statBadge: isHe ? 'ANALYSIS // ממצאי הדוח' : 'ANALYSIS // CORE METRICS',
        mediaBadge: archetype.scene2Badge,
        highlightWords: isHe ? ['ביצועים', 'מערכת', 'פיתוח', 'נתונים'] : ['Architecture', 'System', 'Data', 'Security']
      },
      // Scene 3: The 3D Technical Schematic
      {
        videoSrc: 'real_google_tpu_v6e.png',
        audioSrc: audioScene3 || (isHe ? "he_scene3.mp3" : "en_scene3.mp3"),
        durationFrames: 280, // ~9.3s
        headline: isHe ? 'ארכיטקטורה ופירוט הנדסי' : 'Architecture & Blueprint',
        subtext: scene3Script,
        statBadge: isHe ? 'BLUEPRINT // שרטוט טכנולוגי' : 'BLUEPRINT // 3D SCHEMATIC',
        mediaBadge: isHe ? 'סכמה הנדסית // GEMINI OMNI 1.1' : 'SCHEMATIC BLUEPRINT // GEMINI OMNI 1.1',
        highlightWords: isHe ? ['ארכיטקטורה', 'מבנה', 'טכנולוגיה'] : ['Blueprint', 'Logic', 'Network']
      },
      // Scene 4: Global Deployment & Call-to-Action
      {
        videoSrc: archetype.scene4Media,
        audioSrc: audioScene4 || (isHe ? "he_scene4.mp3" : "en_scene4.mp3"),
        durationFrames: 280, // ~9.3s
        headline: isHe ? 'הדיווח המלא מחכה לכם באתר' : 'Read Full Intel On TrendingTech',
        subtext: scene4Script,
        statBadge: isHe ? 'TRENDING // כנסו לאתר' : 'TRENDING // READ FULL REPORT',
        mediaBadge: archetype.scene4Badge,
        highlightWords: isHe ? ['טרנדינג טק', 'באתר'] : ['TrendingTech', 'Report']
      }
    ];

    const targetComposition = isHe ? "ViralReelHebrew" : "ViralReelEnglish";
    const videoProps = {
      title,
      category: archetype.domainName,
      language: isHe ? 'he' : 'en',
      ambientAudioSrc: 'ambient_bed.mp3',
      articleUrl,
      scenes
    };

    logger.info(`Rendering Viral Reel on Remotion Lambda (${targetComposition})...`);

    const renderInit = await renderMediaOnLambda({
      region: REGION,
      functionName: FUNCTION_NAME,
      serveUrl: SERVE_URL,
      composition: targetComposition,
      inputProps: videoProps,
      codec: "h264",
      imageFormat: "jpeg",
      maxRetries: 2,
      privacy: "public",
      framesPerLambda: 300,
    });

    await logRef.update({
      renderId: renderInit.renderId,
      status: "rendering",
      updatedAt: new Date().toISOString()
    });

    // Poll until complete
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
        throw new Error(`Remotion Lambda render failed: ${JSON.stringify(progress.errors)}`);
      }
      logger.info(`Rendering Viral Reel... ${Math.round(progress.overallProgress * 100)}% (Attempt ${attempts}/180)`);
    }

    if (!renderResult || !renderResult.outputFile) {
      throw new Error(`Viral Reel render polling timed out or failed.`);
    }

    const videoUrl = renderResult.outputFile || renderResult.outUrl;
    const highlightVideoUrl = videoUrl; // Used for stories and reels
    const coverUrl = imageUrl;

    logger.info(`Viral Reel Rendered Successfully! Video URL: ${videoUrl}`);

    await logRef.update({
      status: "uploading",
      videoDownloadUrl: videoUrl,
      highlightDownloadUrl: highlightVideoUrl,
      updatedAt: new Date().toISOString()
    });

    // Download the video locally to /tmp
    const localVideoPath = path.join(os.tmpdir(), `${renderInit.renderId}.mp4`);
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

      // Custom thumbnail (same Geist cover image as the IG cover).
      // YouTube Shorts shows it in search results, channel page, and feeds.
      if (coverUrl) {
        try {
          const coverRes = await fetch(coverUrl, { timeout: 30000 });
          if (!coverRes.ok) throw new Error(`fetch ${coverRes.status}`);
          const coverBuf = Buffer.from(await coverRes.arrayBuffer());
          await youtube.thumbnails.set({
            videoId,
            media: { mimeType: 'image/png', body: require('stream').Readable.from(coverBuf) },
          });
          logger.info(`YouTube thumbnail set successfully for ${videoId}`);
        } catch (thumbErr) {
          logger.warn(`YouTube thumbnail set failed (video already public): ${thumbErr.message}`);
        }
      }

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
      
      const uploadToInstagram = async (mediaType, videoUrlToUpload, captionText, coverUrlArg) => {
        logger.info(`Starting Instagram ${mediaType} Upload...`);
        const payload = {
          media_type: mediaType,
          video_url: videoUrlToUpload,
          access_token: IG_ACCESS_TOKEN
        };
        if (captionText) payload.caption = captionText;
        // IG Reels accept a custom `cover_url` (1080×1920 PNG). Stories
        // ignore this field — covers are pulled from the video itself.
        if (coverUrlArg && mediaType === 'REELS') {
          payload.cover_url = coverUrlArg;
        }
        
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

      // Upload Reel (with custom cover_url if available)
      instagramPostId = await uploadToInstagram("REELS", videoUrl, caption, coverUrl);
      instagramUrl = `https://www.instagram.com/reel/${instagramPostId}/`;
      logger.info(`Successfully published Reel to Instagram! Post ID: ${instagramPostId}`);

      // Upload Story (cover_url not supported for Stories)
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
  { document: "articles/{articleId}", region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: ["REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "PEXELS_API_KEY", "YOUTUBE_CLIENT_SECRET_JSON", "YOUTUBE_TOKENS_JSON", "DEEPDUB_API_KEY"] },
  (event) => handleArticleVideoGeneration(event, 'en')
);

exports.onHebrewArticlePublished = onDocumentWritten(
  { document: "he_articles/{articleId}", region: "us-central1", timeoutSeconds: 540, memory: "1GiB", secrets: ["REMOTION_AWS_ACCESS_KEY_ID", "REMOTION_AWS_SECRET_ACCESS_KEY", "GEMINI_API_KEY", "PEXELS_API_KEY", "YOUTUBE_CLIENT_SECRET_JSON", "YOUTUBE_TOKENS_JSON", "DEEPDUB_API_KEY"] },
  (event) => handleArticleVideoGeneration(event, 'he')
);
