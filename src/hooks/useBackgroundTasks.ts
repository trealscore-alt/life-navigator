import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useBackgroundTasks(userId?: string) {
  // Fetch briefing when app resumes from background
  const fetchBriefingOnResume = useCallback(async () => {
    if (!userId) return;

    try {
      const { data, error } = await supabase.functions.invoke('generate-briefing', {
        body: { userId },
      });

      if (error) {
        console.error('[CLRK] Background briefing error:', error);
        return;
      }

      if (data?.briefing) {
        toast('CLRK Intelligence Update', {
          description: data.briefing.slice(0, 100) + '...',
          duration: 8000,
        });
      }
    } catch (e) {
      console.error('[CLRK] Background task failed:', e);
    }
  }, [userId]);

  // Sync device data in background
  const syncDeviceData = useCallback(async () => {
    if (!userId) return;

    try {
      const { error } = await supabase.functions.invoke('process-device-data', {
        body: { userId },
      });

      if (error) console.error('[CLRK] Device sync error:', error);
    } catch (e) {
      console.error('[CLRK] Device sync failed:', e);
    }
  }, [userId]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !userId) return;

    // Listen for app state changes
    const resumeListener = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        console.log('[CLRK] App resumed — syncing intelligence');
        fetchBriefingOnResume();
        syncDeviceData();
      }
    });

    // Initial sync
    syncDeviceData();

    return () => {
      resumeListener.then(l => l.remove());
    };
  }, [userId, fetchBriefingOnResume, syncDeviceData]);

  return { fetchBriefingOnResume, syncDeviceData };
}
