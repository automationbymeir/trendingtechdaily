/**
 * cartoonTts.js
 * ---------------------------------------------------------------------------
 * TTS routed per language:
 *   - Hebrew  → Google Cloud TTS (ElevenLabs Hebrew quality is poor)
 *   - English → ElevenLabs Multilingual v2 (best cartoon-character delivery)
 *
 * Two characters per language, distinct voices:
 *   BIT    — energetic male hype mascot
 *   GLITCH — sarcastic dry sidekick
 *
 * Voice picks:
 *   HE  BIT     → he-IL-Chirp3-HD-Puck   (upbeat male)
 *   HE  GLITCH  → he-IL-Chirp3-HD-Kore   (firm female)
 *   EN  BIT     → ElevenLabs "Charlie" (IKne3meq5aSn9XLyUdCD)
 *   EN  GLITCH  → ElevenLabs "Alice"  (Xb7hH8MSUJpSbSDYk0k2)
 *
 * Public API:
 *   synthesizeCartoonLine({ text, character, language, runId, sceneKey }) → URL
 */

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const textToSpeech = require('@google-cloud/text-to-speech');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../config');

const gcpClient = new textToSpeech.TextToSpeechClient();

// ─── Voice mappings ────────────────────────────────────────────────────────
// NOTE: Chirp 3 HD voices DO NOT support the `pitch` parameter and the API
// will reject the request if we send it. We keep them at their natural pitch
// and only modulate `speakingRate` to differentiate the characters.
const HEBREW_VOICES = {
  bit:    { name: 'he-IL-Chirp3-HD-Puck', languageCode: 'he-IL', speakingRate: 1.10 },  // upbeat male
  glitch: { name: 'he-IL-Chirp3-HD-Kore', languageCode: 'he-IL', speakingRate: 0.92 },  // firmer female
};

// English fallback for when ElevenLabs is out of quota — Google Chirp 3 HD
// English voices are very natural and the free/paid tier is generous.
const ENGLISH_VOICES = {
  bit:    { name: 'en-US-Chirp3-HD-Charon', languageCode: 'en-US', speakingRate: 1.10 },  // confident male, BIT
  glitch: { name: 'en-US-Chirp3-HD-Aoede',  languageCode: 'en-US', speakingRate: 0.95 },  // dry female, GLITCH
};

const ELEVENLABS_VOICES = {
  bit:    { id: process.env.ELEVENLABS_VOICE_BIT    || 'IKne3meq5aSn9XLyUdCD',
            settings: { stability: 0.30, similarity_boost: 0.78, style: 0.70, use_speaker_boost: true } },
  glitch: { id: process.env.ELEVENLABS_VOICE_GLITCH || 'Xb7hH8MSUJpSbSDYk0k2',
            settings: { stability: 0.40, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true } },
};

// ─── Shared upload ─────────────────────────────────────────────────────────
async function uploadMp3(buf, runId, character, sceneKey) {
  const bucket = admin.storage().bucket();
  const dest = `cartoon-tts/${runId || 'misc'}/${character}_${sceneKey || 'line'}_${uuidv4().slice(0, 6)}.mp3`;
  const file = bucket.file(dest);
  await file.save(buf, {
    contentType: 'audio/mpeg',
    resumable: false,
    public: true,
    metadata: { cacheControl: 'public, max-age=86400' },
  });
  try { await file.makePublic(); } catch (_) { /* ignore */ }
  return `https://storage.googleapis.com/${bucket.name}/${dest}`;
}

// ─── Google Cloud TTS (Hebrew + English fallback) ──────────────────────────
async function ttsGoogle({ text, character, runId, sceneKey, language = 'he' }) {
  const table = language === 'en' ? ENGLISH_VOICES : HEBREW_VOICES;
  const voice = table[character] || table.bit;
  try {
    const [res] = await gcpClient.synthesizeSpeech({
      input: { text: String(text).slice(0, 1500) },
      voice: { languageCode: voice.languageCode, name: voice.name },
      audioConfig: {
        audioEncoding: 'MP3',
        speakingRate: voice.speakingRate,
        sampleRateHertz: 24000,
        // pitch is NOT supported by Chirp 3 HD voices — omit it
      },
    });
    if (!res || !res.audioContent) {
      logger.warn(`cartoonTts.google: empty audio for ${character}`);
      return '';
    }
    return uploadMp3(Buffer.from(res.audioContent), runId, character, sceneKey);
  } catch (err) {
    logger.warn(`cartoonTts.google failed (${character}):`, err.message);
    return '';
  }
}

// ─── English → ElevenLabs ──────────────────────────────────────────────────
async function ttsElevenLabs({ text, character, runId, sceneKey }) {
  const xiKey = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!xiKey) {
    logger.warn('cartoonTts.eleven: ELEVENLABS_API_KEY not set');
    return '';
  }
  const v = ELEVENLABS_VOICES[character] || ELEVENLABS_VOICES.bit;
  try {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${v.id}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': xiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: String(text).slice(0, 1500),
          model_id: 'eleven_multilingual_v2',
          voice_settings: v.settings,
        }),
      }
    );
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      logger.warn(`cartoonTts.eleven ${r.status} (${character}): ${t.slice(0, 300)}`);
      return '';
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return uploadMp3(buf, runId, character, sceneKey);
  } catch (err) {
    logger.warn(`cartoonTts.eleven failed (${character}):`, err.message);
    return '';
  }
}

// ─── Public ────────────────────────────────────────────────────────────────
async function synthesizeCartoonLine({ text, character, language, runId, sceneKey }) {
  if (!text || !text.trim()) return '';
  const lang = language === 'en' ? 'en' : 'he';
  if (lang === 'he') {
    return ttsGoogle({ text, character, runId, sceneKey, language: 'he' });
  }
  // English: Google Chirp 3 HD by default — ElevenLabs is out of quota and
  // failing silently meant whole weekly-digest scenes lost their narration.
  // ElevenLabs stays as a best-effort fallback if Google itself fails.
  const url = await ttsGoogle({ text, character, runId, sceneKey, language: 'en' });
  if (url) return url;
  logger.warn('cartoonTts: Google English failed, falling back to ElevenLabs');
  return ttsElevenLabs({ text, character, runId, sceneKey });
}

module.exports = { synthesizeCartoonLine, HEBREW_VOICES, ELEVENLABS_VOICES };
