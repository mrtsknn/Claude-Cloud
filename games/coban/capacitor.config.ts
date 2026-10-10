import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.coban',
  appName: 'Çoban',
  webDir: 'dist',
  backgroundColor: '#3f7d3a',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#3f7d3a' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#3f7d3a', showSpinner: false },
  },
};

export default config;
