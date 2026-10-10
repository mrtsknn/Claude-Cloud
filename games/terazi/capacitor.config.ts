import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // TODO(mağaza): yayın öncesi kendi ters-alan adınla değiştir; yayından sonra değiştirilemez.
  appId: 'com.indiestudio.terazi',
  appName: 'Terazi',
  webDir: 'dist',
  backgroundColor: '#dce4ea',
  ios: { contentInset: 'never' },
  android: { backgroundColor: '#dce4ea' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#dce4ea', showSpinner: false },
  },
};

export default config;
