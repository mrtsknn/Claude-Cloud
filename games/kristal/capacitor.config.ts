import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.kristal',
  appName: 'Kristal',
  webDir: 'dist',
  backgroundColor: '#141a3a',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#141a3a' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#141a3a', showSpinner: false },
  },
};

export default config;
