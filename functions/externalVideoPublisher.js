/**
 * externalVideoPublisher.js - ADDITIVE integration for externally-produced videos.
 * Watches the `external_videos` Firestore collection (written by the Folded Eras
 * evolution engine after it drops an MP4 in Cloud Storage) and publishes the video
 * to YouTube, Instagram (Reels) and Facebook, logging to `video_logs` like the
 * news pipeline does. Does not modify any existing pipeline code.
 *
 * Expected document fields:
 *   storagePath  (string, required)  "gs://bucket/path/video.mp4" or "bucket/path/video.mp4"
 *   title        (string, required)  YouTube title
 *   description  (string)            YouTube description / caption base
 *   caption      (string)            IG/FB caption (falls back to description/title)
 *   tags         (array<string>)     YouTube tags
 *   privacy      (string)            "public" publishes publicly; anything else uploads as private
 *   dryRun       (bool)              true = validate everything but call no publish APIs
 *   status       (string)            must be "pending" to be picked up
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");
const os = require("os");
const fetch = require("node-fetch");
const { google } = require("googleapis");

if (!admin.apps.length) admin.initializeApp();

const IG_USER_ID = "17841427939019963";   // same IG business account as youtubePipeline.js
const FB_PAGE_ID = "1015383948335262";    // same FB page as youtubePipeline.js
const GRAPH = "https://graph.facebook.com/v20.0";

const getYouTubeClient = () => {
  const tokens = JSON.parse(process.env.YOUTUBE_TOKENS_JSON);
  const secrets = JSON.parse(process.env.YOUTUBE_CLIENT_SECRET_JSON);
  const oauth2Client = new google.auth.OAuth2(
    secrets.web.client_id, secrets.web.client_secret, secrets.web.redirect_uris[0]);
  oauth2Client.setCredentials(tokens);
  return google.youtube({ version: "v3", auth: oauth2Client });
};

const parseGsPath = (p) => {
  const s = String(p || "").replace(/^gs:\/\//, "");
  const i = s.indexOf("/");
  if (i < 1) throw new Error(`Invalid storagePath: ${p}`);
  return { bucket: s.slice(0, i), object: s.slice(i + 1) };
};

exports.publishExternalVideo = onDocumentWritten(
  {
    document: "external_videos/{videoId}",
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: ["YOUTUBE_TOKENS_JSON", "YOUTUBE_CLIENT_SECRET_JSON", "IG_ACCESS_TOKEN", "FB_ACCESS_TOKEN"],
  },
  async (event) => {
    const after = event.data && event.data.after;
    if (!after || !after.exists) return;
    const data = after.data();
    if (!data || data.status !== "pending") return;
    const videoId = event.params.videoId;
    const logRef = admin.firestore().collection("video_logs").doc(videoId);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const result = { youtubeVideoId: null, youtubeUrl: null, instagramPostId: null,
      instagramUrl: null, facebookPostId: null, errors: [] };
    await after.ref.update({ status: "processing", startedAt: now });
    await logRef.set({ source: "external_videos", status: "processing", createdAt: now }, { merge: true });

    const dryRun = data.dryRun === true;
    let localVideoPath = null;
    let signedUrl = null;
    try {
      if (!data.storagePath || !data.title) throw new Error("storagePath and title are required");
      const { bucket, object } = parseGsPath(data.storagePath);
      const file = admin.storage().bucket(bucket).file(object);
      localVideoPath = path.join(os.tmpdir(), `external_${videoId}.mp4`);
      await file.download({ destination: localVideoPath });
      logger.info(`Downloaded ${bucket}/${object} to ${localVideoPath}`);
      [signedUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 6 * 3600 * 1000 });

      const caption = data.caption || data.description || data.title;
      const tags = Array.isArray(data.tags) && data.tags.length ? data.tags :
        ["TechEvolution", "TrendingTechDaily"];
      const privacy = data.privacy === "public" ? "public" : "private";

      // --- YouTube ---
      try {
        const youtube = getYouTubeClient();
        if (dryRun) {
          logger.info("[dryRun] YouTube auth OK; skipping videos.insert");
        } else {
          const uploadRes = await youtube.videos.insert({
            part: ["snippet", "status"],
            requestBody: {
              snippet: { title: String(data.title).substring(0, 100),
                description: `${data.description || caption}\n\n#TechEvolution #TrendingTechDaily`,
                tags, categoryId: "28" },
              status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
            },
            media: { body: fs.createReadStream(localVideoPath) },
          });
          result.youtubeVideoId = uploadRes.data.id;
          result.youtubeUrl = `https://www.youtube.com/shorts/${uploadRes.data.id}`;
          logger.info(`YouTube upload OK: ${result.youtubeUrl}`);
        }
      } catch (e) { logger.error("YouTube publish failed:", e); result.errors.push(`youtube: ${e.message}`); }

      const igToken = process.env.IG_ACCESS_TOKEN;
      const fbToken = process.env.FB_ACCESS_TOKEN;

      // --- Instagram Reel ---
      try {
        if (dryRun) {
          logger.info("[dryRun] Skipping IG container/publish");
        } else {
          const cRes = await fetch(`${GRAPH}/${IG_USER_ID}/media`, { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ media_type: "REELS", video_url: signedUrl, caption,
              access_token: igToken }) });
          const cData = await cRes.json();
          if (cData.error) throw new Error(`IG Container Error: ${JSON.stringify(cData.error)}`);
          let status = "IN_PROGRESS", attempts = 0;
          while (status === "IN_PROGRESS" && attempts < 30) {
            attempts++;
            await new Promise((r) => setTimeout(r, 5000));
            const sRes = await fetch(`${GRAPH}/${cData.id}?fields=status_code&access_token=${igToken}`);
            const sData = await sRes.json();
            if (sData.error) throw new Error(`IG Status Error: ${JSON.stringify(sData.error)}`);
            status = sData.status_code;
          }
          if (status !== "FINISHED") throw new Error(`IG processing timed out: ${status}`);
          const pRes = await fetch(`${GRAPH}/${IG_USER_ID}/media_publish`, { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ creation_id: cData.id, access_token: igToken }) });
          const pData = await pRes.json();
          if (pData.error) throw new Error(`IG Publish Error: ${JSON.stringify(pData.error)}`);
          result.instagramPostId = pData.id;
          result.instagramUrl = `https://www.instagram.com/reel/${pData.id}/`;
          logger.info(`IG reel OK: ${result.instagramUrl}`);
        }
      } catch (e) { logger.error("Instagram publish failed:", e); result.errors.push(`instagram: ${e.message}`); }

      // --- Facebook video post ---
      try {
        if (dryRun) {
          logger.info("[dryRun] Skipping FB video post");
        } else {
          const fRes = await fetch(`${GRAPH}/${FB_PAGE_ID}/videos`, { method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: signedUrl, description: caption, access_token: fbToken }) });
          const fData = await fRes.json();
          if (fData.error) throw new Error(`Facebook API Error: ${JSON.stringify(fData.error)}`);
          result.facebookPostId = fData.id;
          logger.info(`FB video post OK: ${result.facebookPostId}`);
        }
      } catch (e) { logger.error("Facebook publish failed:", e); result.errors.push(`facebook: ${e.message}`); }

      const anyPublished = result.youtubeVideoId || result.instagramPostId || result.facebookPostId;
      const status = dryRun ? "dry_run_ok" : (result.errors.length === 0 ? "success" : (anyPublished ? "partial" : "failed"));
      await after.ref.update({ status, ...result, publishedAt: now });
      await logRef.set({ status, ...result, updatedAt: now }, { merge: true });
      logger.info(`publishExternalVideo ${videoId}: ${status}`);
    } catch (e) {
      logger.error("publishExternalVideo failed:", e);
      await after.ref.update({ status: "failed", error: e.message }).catch(() => {});
      await logRef.set({ status: "failed", error: e.message, updatedAt: now }, { merge: true }).catch(() => {});
    } finally {
      if (localVideoPath && fs.existsSync(localVideoPath)) { try { fs.unlinkSync(localVideoPath); } catch (_) {} }
    }
  });
