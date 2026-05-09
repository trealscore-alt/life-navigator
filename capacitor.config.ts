import type { CapacitorConfig } from '@capacitor/cli';

// PRODUCTION CAPACITOR CONFIG
//
// We intentionally do NOT set `server.url` here. With it set, native iOS /
// Android builds load the web app from a remote URL — fine for live-reload
// during development but a release blocker (the bundled `dist/` is bypassed,
// users see whatever is at that URL right now, and store reviewers reject
// apps that load primary content from external servers).
//
// For local dev with live-reload, run `bun run dev` and either point
// Capacitor at your dev server with the CLI flag (`npx cap run ios --livereload
// --external`) or temporarily uncomment a `server` block in a private
// `capacitor.config.local.ts` you don't commit.
//
// TODO(charles): change `appId` to a Trealscore-owned bundle id before App
// Store / Play Store submission (e.g. `com.trealscore.clrk`). The current
// `app.lovable.clrk` is a Lovable scaffold default and shouldn't ship.

const config: CapacitorConfig = {
  appId: 'app.lovable.clrk',
  appName: 'CLRK',
  webDir: 'dist',
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
