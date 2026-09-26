require('dotenv').config();
const { postWeeklyDigest } = require('./weeklyDigestPipeline.js');

async function run() {
  console.log('Generating Hebrew weekly digest without auto-publish...');
  try {
    const result = await postWeeklyDigest({ language: 'he', autoPublish: false });
    console.log('Success:', result);
  } catch (error) {
    console.error('Error generating digest:', error);
  }
}

run();
