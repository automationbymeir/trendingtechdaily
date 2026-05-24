import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.trendingtechdaily.app',
  appName: 'trendingtechdaily',
  webDir: 'native-build',
  // Override user agent so Google OAuth does not block the webview
  overrideUserAgent: "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
  server: {
    errorPath: "router.html",
    hostname: "trendingtechdaily.com",
    androidScheme: "https"
  }
};

export default config;
