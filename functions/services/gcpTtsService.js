const axios = require('axios');
const textToSpeech = require('@google-cloud/text-to-speech');
const { logger, admin } = require("../config");
const { v4: uuidv4 } = require("uuid");

const client = new textToSpeech.TextToSpeechClient();

/**
 * Synthesizes Hebrew speech using Deepdub API (dd-etts-3.4)
 * @param {string} text - Text to synthesize
 * @returns {Promise<Buffer>} Audio buffer
 */
const synthesizeDeepdubHebrew = async (text) => {
  const apiKey = process.env.DEEPDUB_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPDUB_API_KEY environment variable is not configured');
  }

  const response = await axios.post(
    'https://restapi.deepdub.ai/api/v1/tts',
    {
      targetText: text,
      model: 'dd-etts-3.4',
      locale: 'he-IL',
      voicePromptId: '5d3dc622-69bd-4c00-9513-05df47dbdea6_authoritative',
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      responseType: 'arraybuffer',
      timeout: 15000,
    }
  );

  if (response.status !== 200) {
    throw new Error(`Deepdub API responded with status ${response.status}`);
  }

  const buffer = Buffer.from(response.data);
  if (!buffer || buffer.length === 0) {
    throw new Error('Deepdub API returned an empty audio response');
  }

  return buffer;
};

/**
 * Synthesizes Hebrew speech using Google Cloud TTS (he-IL-Chirp3-HD-Puck) as fallback
 * @param {string} text - Text to synthesize
 * @returns {Promise<Buffer>} Audio buffer
 */
const synthesizeGcpHebrew = async (text) => {
  const request = {
    input: { text: text },
    voice: { languageCode: 'he-IL', name: 'he-IL-Chirp3-HD-Puck' },
    audioConfig: { audioEncoding: 'MP3' },
  };

  const [response] = await client.synthesizeSpeech(request);
  return response.audioContent;
};

/**
 * Generates Hebrew audio: Tries Deepdub (dd-etts-3.4) first,
 * with automatic fallback to Google Cloud TTS (he-IL-Chirp3-HD-Puck)
 * if Deepdub fails, quota is exhausted, or credentials are missing.
 * Uploads resulting audio to Firebase Storage and returns its public URL.
 * 
 * @param {string} text - The Hebrew text to speak
 * @returns {Promise<string>} The public URL of the uploaded audio file
 */
const generateAndUploadHebrewAudio = async (text) => {
  let audioBuffer = null;
  let provider = 'deepdub';

  // 1. Try Deepdub first
  try {
    logger.info(`Generating Hebrew audio via Deepdub (dd-etts-3.4) for: "${text.substring(0, 50)}..."`);
    audioBuffer = await synthesizeDeepdubHebrew(text);
    logger.info(`Successfully generated Deepdub Hebrew audio (${audioBuffer.length} bytes).`);
  } catch (deepdubErr) {
    logger.warn(
      `[FALLBACK TRIGGERED] Deepdub TTS failed (${deepdubErr.response ? deepdubErr.response.status + ' ' + deepdubErr.response.statusText : deepdubErr.message}). Falling back to Google Cloud TTS Chirp3-HD...`
    );
    provider = 'gcp-chirp3-hd';

    // 2. Fallback to Google Cloud TTS
    try {
      audioBuffer = await synthesizeGcpHebrew(text);
      logger.info(`Successfully generated fallback GCP TTS audio (${audioBuffer.length} bytes).`);
    } catch (gcpErr) {
      logger.error('Both Deepdub and Google Cloud TTS failed for Hebrew audio:', gcpErr);
      throw gcpErr;
    }
  }

  try {
    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `audio/${uuidv4()}.mp3`;
    const file = bucket.file(fileName);

    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
        metadata: { provider },
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    logger.info(`Hebrew Audio (${provider}) uploaded to Firebase Storage: ${publicUrl}`);

    return publicUrl;
  } catch (storageError) {
    logger.error('Failed to upload Hebrew audio to Firebase Storage:', storageError);
    throw storageError;
  }
};

/**
 * English TTS via Google Cloud Chirp 3 HD. Used as a permanent replacement
 * for ElevenLabs after the ElevenLabs quota was exhausted — Chirp 3 HD
 * English voices sound great and Google's free TTS tier is generous enough
 * for our article-video workload.
 *
 * @param {string} text - The text to speak (English)
 * @returns {Promise<string>} The public URL of the uploaded audio file
 */
const generateAndUploadEnglishAudio = async (text) => {
  try {
    logger.info(`Generating GCP TTS (en) audio for text: "${text.substring(0, 50)}..."`);

    const request = {
      input: { text: text },
      voice: { languageCode: 'en-US', name: 'en-US-Chirp3-HD-Charon' },
      audioConfig: { audioEncoding: 'MP3' },
    };

    const [response] = await client.synthesizeSpeech(request);
    logger.info('GCP TTS (en) audio generated successfully.');

    const bucket = admin.storage().bucket();
    const fileName = `audio/${uuidv4()}.mp3`;
    const file = bucket.file(fileName);

    await file.save(response.audioContent, {
      metadata: { contentType: 'audio/mpeg' },
    });
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    logger.info(`English audio uploaded to Firebase Storage: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error('Failed to generate/upload GCP TTS (en) audio:', error);
    throw error;
  }
};

module.exports = {
  generateAndUploadHebrewAudio,
  generateAndUploadEnglishAudio,
};
