import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.katla',
  appName: 'Katla',
  webDir: 'dist',
  backgroundColor: '#f3ece0',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#f3ece0' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#f3ece0', showSpinner: false },
  },
};

export default config;
