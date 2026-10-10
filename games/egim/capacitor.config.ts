import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.egim',
  appName: 'Eğim',
  webDir: 'dist',
  backgroundColor: '#0f1828',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0f1828' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0f1828', showSpinner: false },
  },
};

export default config;
