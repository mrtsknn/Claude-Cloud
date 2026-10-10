import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.wordlink',
  appName: 'Wordlink',
  webDir: 'dist',
  backgroundColor: '#0f3a40',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0f3a40' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0f3a40', showSpinner: false },
  },
};

export default config;
