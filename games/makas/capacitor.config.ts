import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.makas',
  appName: 'Makas',
  webDir: 'dist',
  backgroundColor: '#1d3b2a',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#1d3b2a' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#1d3b2a', showSpinner: false },
  },
};

export default config;
