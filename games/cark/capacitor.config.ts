import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.cark',
  appName: 'Çark',
  webDir: 'dist',
  backgroundColor: '#132c33',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#132c33' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#132c33', showSpinner: false },
  },
};

export default config;
