import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.yorunge',
  appName: 'Yörünge',
  webDir: 'dist',
  backgroundColor: '#0b0f24',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0b0f24' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0b0f24', showSpinner: false },
  },
};

export default config;
