import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.kervan',
  appName: 'Kervan',
  webDir: 'dist',
  backgroundColor: '#f3dfb4',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#f3dfb4' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#f3dfb4', showSpinner: false },
  },
};

export default config;
