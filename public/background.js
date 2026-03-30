// Capacitor Background Runner script
// Runs periodically (every 15 min) to sync CLRK intelligence

addEventListener('clrkSync', async (resolve, reject) => {
  try {
    console.log('[CLRK Background] Sync started');
    // Background runner has limited API access
    // Main sync happens on app resume via useBackgroundTasks hook
    resolve();
  } catch (e) {
    console.error('[CLRK Background] Error:', e);
    reject(e);
  }
});
