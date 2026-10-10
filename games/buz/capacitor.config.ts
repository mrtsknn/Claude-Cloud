import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.buz',
  appName: 'Buz',
  webDir: 'dist',
  backgroundColor: '#dff1fb',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#dff1fb' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#dff1fb', showSpinner: false },
  },
};

export default config;
