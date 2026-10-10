import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.gelgit',
  appName: 'Gelgit',
  webDir: 'dist',
  backgroundColor: '#f3e2bf',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#f3e2bf' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#f3e2bf', showSpinner: false },
  },
};

export default config;
