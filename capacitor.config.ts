import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.modaliadz.rocky',
  appName: 'ROCKY AI',
  webDir: 'dist',
  backgroundColor: '#050914',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#050914', showSpinner: false },
  },
  server: { androidScheme: 'https' },
};

export default config;
