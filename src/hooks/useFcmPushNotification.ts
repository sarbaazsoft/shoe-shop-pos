import { useState, useEffect, useCallback } from 'react';
import {
  requestFcmPermissionAndToken,
  syncFcmTokenSilently,
  unregisterFcmDeviceToken,
  getStoredFcmToken,
  fetchFcmConfig,
} from '../services/firebaseConfig.ts';
import {
  shouldShowSoftPushPrompt,
  dismissSoftPushPrompt,
  resetSoftPushPromptDismissal,
} from '../services/pushNotificationClient.ts';
import { api } from '../services/api.ts';

export function useFcmPushNotification() {
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const [isSubscribed, setIsSubscribed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(getStoredFcmToken() && Notification.permission === 'granted');
  });

  const [isLoading, setIsLoading] = useState(false);
  const [fcmConfigured, setFcmConfigured] = useState<boolean>(false);
  const [deviceStats, setDeviceStats] = useState<{ totalTokens: number; configured: boolean } | null>(null);
  const [showSoftPrompt, setShowSoftPrompt] = useState<boolean>(() => {
    return shouldShowSoftPushPrompt();
  });

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

  const refreshStatus = useCallback(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const currentPerm = Notification.permission;
      setPermission(currentPerm);
      setIsSubscribed(Boolean(getStoredFcmToken() && currentPerm === 'granted'));
      setShowSoftPrompt(shouldShowSoftPushPrompt());
    }
  }, []);

  useEffect(() => {
    checkConfigAndStats();
    refreshStatus();

    const handleStatusChanged = (e: any) => {
      refreshStatus();
      if (e?.detail?.permission) {
        setPermission(e.detail.permission);
      }
      if (typeof e?.detail?.isSubscribed === 'boolean') {
        setIsSubscribed(e.detail.isSubscribed);
      }
      setShowSoftPrompt(shouldShowSoftPushPrompt());
    };

    const handleSoftPromptUpdated = () => {
      setShowSoftPrompt(shouldShowSoftPushPrompt());
    };

    window.addEventListener('pos:push-status-changed', handleStatusChanged);
    window.addEventListener('pos:push-soft-prompt-updated', handleSoftPromptUpdated);

    return () => {
      window.removeEventListener('pos:push-status-changed', handleStatusChanged);
      window.removeEventListener('pos:push-soft-prompt-updated', handleSoftPromptUpdated);
    };
  }, [checkConfigAndStats, refreshStatus]);

  // Two-step permission flow: triggers prompt and acquires token on grant
  const subscribe = useCallback(
    async (role?: string) => {
      setIsLoading(true);
      try {
        const res = await requestFcmPermissionAndToken(role);
        refreshStatus();
        if (res.success && res.token) {
          setIsSubscribed(true);
          await checkConfigAndStats();
          return { success: true, token: res.token, permission: 'granted' as NotificationPermission };
        }
        return { success: false, error: res.error, permission: res.permission };
      } finally {
        setIsLoading(false);
      }
    },
    [checkConfigAndStats, refreshStatus]
  );

  // Silent background token synchronization
  const syncSilently = useCallback(
    async (role?: string) => {
      const success = await syncFcmTokenSilently(role);
      refreshStatus();
      return success;
    },
    [refreshStatus]
  );

  const unsubscribe = useCallback(async () => {
    setIsLoading(true);
    try {
      await unregisterFcmDeviceToken();
      setIsSubscribed(false);
      refreshStatus();
      await checkConfigAndStats();
      return { success: true };
    } finally {
      setIsLoading(false);
    }
  }, [checkConfigAndStats, refreshStatus]);

  const dismissPrompt = useCallback((days = 3) => {
    dismissSoftPushPrompt(days);
    setShowSoftPrompt(false);
  }, []);

  const resetPrompt = useCallback(() => {
    resetSoftPushPromptDismissal();
    setShowSoftPrompt(shouldShowSoftPushPrompt());
  }, []);

  return {
    permission,
    isSubscribed,
    isLoading,
    fcmConfigured,
    deviceStats,
    showSoftPrompt,
    subscribe,
    syncSilently,
    unsubscribe,
    dismissPrompt,
    resetPrompt,
    refreshStatus,
  };
}
