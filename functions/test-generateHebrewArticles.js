require('dotenv').config();
const { generateHebrewArticles } = require('./hebrewArticles');
const { logger } = require('./config');

async function test() {
  try {
    const result = await generateHebrewArticles(1, 'manual');
    console.log('Result:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

test();
