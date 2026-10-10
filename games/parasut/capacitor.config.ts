import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.parasut',
  appName: 'Paraşüt',
  webDir: 'dist',
  backgroundColor: '#4fb3e8',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#4fb3e8' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#4fb3e8', showSpinner: false },
  },
};

export default config;
