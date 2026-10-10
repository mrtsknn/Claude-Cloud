import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.poursort',
  appName: 'Pour Sort',
  webDir: 'dist',
  backgroundColor: '#e9edf6',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#e9edf6' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#e9edf6', showSpinner: false },
  },
};

export default config;
