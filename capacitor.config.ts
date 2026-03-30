import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.7212b4ec51dc4a32bebe800acbffbd23',
  appName: 'CLRK',
  webDir: 'dist',
  server: {
    url: 'https://7212b4ec-51dc-4a32-bebe-800acbffbd23.lovableproject.com?forceHideBadge=true',
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
