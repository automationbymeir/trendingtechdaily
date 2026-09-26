const textToSpeech = require('@google-cloud/text-to-speech');
const { logger, admin } = require("../config");
const { v4: uuidv4 } = require("uuid");

const client = new textToSpeech.TextToSpeechClient();

/**
 * Generates TTS audio using Google Cloud TTS and uploads it to Firebase Storage
 * @param {string} text - The text to speak
 * @returns {Promise<string>} The public URL of the uploaded audio file
 */
const generateAndUploadHebrewAudio = async (text) => {
  try {
    logger.info(`Generating GCP TTS audio for text: "${text.substring(0, 50)}..."`);
    
    const request = {
      input: { text: text },
      // Select the language and SSML voice gender (optional)
      voice: { languageCode: 'he-IL', name: 'he-IL-Chirp3-HD-Puck' },
      // select the type of audio encoding
      audioConfig: { audioEncoding: 'MP3' },
    };

    // Performs the text-to-speech request
    const [response] = await client.synthesizeSpeech(request);
    
    logger.info("GCP TTS audio generated successfully.");

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `audio/${uuidv4()}.mp3`;
    const file = bucket.file(fileName);

    await file.save(response.audioContent, {
      metadata: {
        contentType: 'audio/mpeg',
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    logger.info(`Hebrew Audio uploaded to Firebase Storage: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    logger.error("Failed to generate/upload GCP TTS audio:", error);
    throw error;
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
