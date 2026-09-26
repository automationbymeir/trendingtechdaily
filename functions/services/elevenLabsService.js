const fetch = require("node-fetch");
const { logger, admin } = require("../config");
const { v4: uuidv4 } = require("uuid");

const ELEVENLABS_API_KEY = (process.env.ELEVENLABS_API_KEY || "").trim();
if (!ELEVENLABS_API_KEY) logger.warn("ELEVENLABS_API_KEY env var is not set - ElevenLabs TTS calls will fail");
// Using Charlie (a young, easy-going, conversational male voice) - IKne3meq5aSn9XLyUdCD
const VOICE_ID = "IKne3meq5aSn9XLyUdCD";

/**
 * Generates TTS audio using ElevenLabs and uploads it to Firebase Storage
 * @param {string} text - The text to speak
 * @returns {Promise<string>} The public URL of the uploaded audio file
 */
const generateAndUploadAudio = async (text) => {
  try {
    logger.info(`Generating ElevenLabs audio for text: "${text.substring(0, 50)}..."`);
    
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const buffer = await response.buffer();
    logger.info("ElevenLabs audio generated successfully.");

    // Upload to Firebase Storage
    const bucket = admin.storage().bucket();
    const fileName = `audio/${uuidv4()}.mp3`;
    const file = bucket.file(fileName);

    await file.save(buffer, {
      metadata: {
        contentType: 'audio/mpeg',
      },
    });

    // Make the file publicly accessible
    await file.makePublic();

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
    logger.info(`Audio uploaded to Firebase Storage: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    logger.error("Failed to generate/upload ElevenLabs audio:", error);
    throw error;
  }
};

module.exports = {
  generateAndUploadAudio
};
