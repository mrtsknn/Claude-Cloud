import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.snapgrid',
  appName: 'Snapgrid',
  webDir: 'dist',
  backgroundColor: '#10142a',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#10142a' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#10142a', showSpinner: false },
  },
};

export default config;
