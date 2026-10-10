import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.karisim',
  appName: 'Karışım',
  webDir: 'dist',
  backgroundColor: '#e4e7ec',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#e4e7ec' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#e4e7ec', showSpinner: false },
  },
};

export default config;
