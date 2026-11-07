import { useState, useEffect, useCallback } from 'react';
import { requestFcmDeviceToken, unregisterFcmDeviceToken, getStoredFcmToken, fetchFcmConfig } from '../services/firebaseConfig.ts';
import { api } from '../services/api.ts';

export function useFcmPushNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    return Boolean(getStoredFcmToken());
  });

  const [isLoading, setIsLoading] = useState(false);
  const [fcmConfigured, setFcmConfigured] = useState<boolean>(false);
  const [deviceStats, setDeviceStats] = useState<{ totalTokens: number; configured: boolean } | null>(null);

  const checkConfigAndStats = useCallback(async () => {
    try {
      const cfg = await fetchFcmConfig();
      setFcmConfigured(Boolean(cfg && cfg.configured));

      const stats = await api.notifications.getFcmStats().catch(() => null);
      if (stats) {
        setDeviceStats({ totalTokens: stats.totalTokens, configured: stats.configured });
      }
    } catch {
      setFcmConfigured(false);
    }
  }, []);

  useEffect(() => {
    checkConfigAndStats();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission);
      setIsSubscribed(Boolean(getStoredFcmToken() && Notification.permission === 'granted'));
    }
  }, [checkConfigAndStats]);

  const subscribe = useCallback(async (role?: string) => {
    setIsLoading(true);
    try {
      const res = await requestFcmDeviceToken(role);
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setPermission(Notification.permission);
      }
      if (res.success && res.token) {
        setIsSubscribed(true);
        await checkConfigAndStats();
        return { success: true, token: res.token };
      }
      return { success: false, error: res.error };
    } finally {
      setIsLoading(false);
    }
  }, [checkConfigAndStats]);

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      await unregisterFcmDeviceToken();
      setIsSubscribed(false);
      await checkConfigAndStats();
      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, [checkConfigAndStats]);

  return {
    permission,
    isSubscribed,
    isLoading,
    fcmConfigured,
    deviceStats,
    subscribe,
    unsubscribe,
    refreshStatus: checkConfigAndStats,
  };
}
