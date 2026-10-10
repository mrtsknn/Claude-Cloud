import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.firin',
  appName: 'Fırın',
  webDir: 'dist',
  backgroundColor: '#3a2318',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#3a2318' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#3a2318', showSpinner: false },
  },
};

export default config;
