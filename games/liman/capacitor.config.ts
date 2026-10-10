import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.liman',
  appName: 'Liman',
  webDir: 'dist',
  backgroundColor: '#dff1f5',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#dff1f5' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#dff1f5', showSpinner: false },
  },
};

export default config;
