import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.kovan',
  appName: 'Kovan',
  webDir: 'dist',
  backgroundColor: '#2b1a08',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#2b1a08' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#2b1a08', showSpinner: false },
  },
};

export default config;
