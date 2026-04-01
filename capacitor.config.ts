import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.clrk',
  appName: 'CLRK',
  webDir: 'dist',
  server: {
    url: 'https://locus-life-aid.lovable.app?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon',
      iconColor: '#00F0FF',
    },
    BackgroundRunner: {
      label: 'app.lovable.clrk.background',
      src: 'background.js',
      event: 'clrkSync',
      repeat: true,
      interval: 15,
      autoStart: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0A0E1A',
    },
  },
};

export default config;
