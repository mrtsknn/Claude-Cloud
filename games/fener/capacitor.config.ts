import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.fener',
  appName: 'Fener',
  webDir: 'dist',
  backgroundColor: '#0d1230',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#0d1230' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0d1230', showSpinner: false },
  },
};

export default config;
