const { execSync } = require('child_process');

const secretsToRestore = [
  "NEWS_API_KEY", 
  "GROK_API_KEY", 
  "YOUTUBE_API_KEY", 
  "SPOTIFY_CLIENT_ID", 
  "SPOTIFY_CLIENT_SECRET", 
  "UNSPLASH_ACCESS_KEY", 
  "FINNHUB_API_KEY"
];

for (const secret of secretsToRestore) {
  try {
    console.log(`\nChecking ${secret}...`);
    // Try versions from 5 down to 1
    let restored = false;
    for (let v = 5; v >= 1; v--) {
      try {
        const val = execSync(`firebase functions:secrets:access ${secret}@${v}`, { encoding: 'utf-8' }).trim();
        if (val && !val.startsWith("dummy_key_for_")) {
          console.log(`Found real key for ${secret} at version ${v}. Restoring...`);
          execSync(`firebase functions:secrets:set ${secret}`, { input: val });
          console.log(`Successfully restored ${secret} to real key.`);
          restored = true;
          break;
        }
      } catch (err) {
        // version might not exist, ignore and continue
      }
    }
    if (!restored) {
      console.log(`Could not find a valid previous version for ${secret}.`);
    }
  } catch (err) {
    console.error(`Error processing ${secret}:`, err.message);
  }
}
