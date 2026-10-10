import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.ikiz',
  appName: 'İkiz',
  webDir: 'dist',
  backgroundColor: '#eceff7',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#eceff7' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#3d4590', showSpinner: false },
  },
};

export default config;
