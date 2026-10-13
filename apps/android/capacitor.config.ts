import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.moneylens.android',
  appName: 'MoneyLens',
  webDir: 'dist',
  android: {
    // The app never loads anything over plain HTTP.
    allowMixedContent: false,
  },
};

export default config;
