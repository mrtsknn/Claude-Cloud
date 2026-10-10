import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.devril',
  appName: 'Devril',
  webDir: 'dist',
  backgroundColor: '#e6ede1',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#e6ede1' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#e6ede1', showSpinner: false },
  },
};

export default config;
