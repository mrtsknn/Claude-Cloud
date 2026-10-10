import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.comlek',
  appName: 'Çömlek',
  webDir: 'dist',
  backgroundColor: '#f3e7d8',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#f3e7d8' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#f3e7d8', showSpinner: false },
  },
};

export default config;
