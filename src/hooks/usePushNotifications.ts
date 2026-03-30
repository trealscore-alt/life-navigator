import { useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { toast } from 'sonner';

export function usePushNotifications(userId?: string) {
  const registered = useRef(false);

  const register = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || registered.current) return;

    const permResult = await PushNotifications.requestPermissions();
    if (permResult.receive !== 'granted') {
      toast.error('Push notification permission denied');
      return;
    }

    await PushNotifications.register();
    registered.current = true;

    PushNotifications.addListener('registration', (token) => {
      console.log('[CLRK] Push token:', token.value);
      // TODO: Save token to user profile for server-side push
    });

    PushNotifications.addListener('registrationError', (err) => {
      console.error('[CLRK] Push registration error:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.log('[CLRK] Push received:', notification);
      toast(notification.title || 'CLRK', {
        description: notification.body,
      });
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      console.log('[CLRK] Push action:', action);
      // TODO: Navigate based on action data
    });

    // Also request local notification permissions
    await LocalNotifications.requestPermissions();
  }, []);

  const sendLocalNotification = useCallback(async (title: string, body: string, id?: number) => {
    if (!Capacitor.isNativePlatform()) {
      toast(title, { description: body });
      return;
    }

    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: id || Date.now(),
          schedule: { at: new Date(Date.now() + 1000) },
          sound: undefined,
          actionTypeId: '',
          extra: null,
        },
      ],
    });
  }, []);

  useEffect(() => {
    if (userId) register();
  }, [userId, register]);

  return { register, sendLocalNotification };
}
