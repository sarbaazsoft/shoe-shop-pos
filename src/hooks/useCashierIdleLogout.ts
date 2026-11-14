import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CASHIER_ACTIVITY_STORAGE_KEY,
  DEFAULT_CASHIER_IDLE_TIMEOUT_MS,
  DEFAULT_CASHIER_WARNING_DURATION_MS,
  evaluateIdleState,
} from '../utils/cashierIdleTimer.ts';

interface UseCashierIdleLogoutOptions {
  enabled: boolean;
  onAutoLogout: () => void;
  idleTimeoutMs?: number;
  warningDurationMs?: number;
}

interface UseCashierIdleLogoutResult {
  isWarningOpen: boolean;
  remainingSeconds: number;
  totalWarningSeconds: number;
  staySignedIn: () => void;
  logoutNow: () => void;
}

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'pointerdown',
  'mousedown',
  'keydown',
  'touchstart',
  'mousemove',
  'wheel',
  'scroll',
];

const IMMEDIATE_EVENTS = new Set<string>(['pointerdown', 'mousedown', 'keydown', 'touchstart']);

export function useCashierIdleLogout({
  enabled,
  onAutoLogout,
  idleTimeoutMs = DEFAULT_CASHIER_IDLE_TIMEOUT_MS,
  warningDurationMs = DEFAULT_CASHIER_WARNING_DURATION_MS,
}: UseCashierIdleLogoutOptions): UseCashierIdleLogoutResult {
  const totalWarningSeconds = Math.max(1, Math.ceil(warningDurationMs / 1000));
  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(totalWarningSeconds);

  const lastActivityAtRef = useRef<number>(Date.now());
  const lastStorageSyncAtRef = useRef<number>(0);
  const lastMoveThrottleAtRef = useRef<number>(0);
  const isWarningOpenRef = useRef<boolean>(false);
  const hasLoggedOutRef = useRef<boolean>(false);
  const onAutoLogoutRef = useRef(onAutoLogout);

  useEffect(() => {
    onAutoLogoutRef.current = onAutoLogout;
  }, [onAutoLogout]);

  const syncActivityStorage = useCallback((timestamp: number, force = false) => {
    if (typeof localStorage === 'undefined') return;
    if (!force && timestamp - lastStorageSyncAtRef.current < 2000) return;
    lastStorageSyncAtRef.current = timestamp;
    try {
      localStorage.setItem(CASHIER_ACTIVITY_STORAGE_KEY, String(timestamp));
    } catch {}
  }, []);

  const clearActivityStorage = useCallback(() => {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(CASHIER_ACTIVITY_STORAGE_KEY);
    } catch {}
  }, []);

  const triggerAutoLogout = useCallback(() => {
    if (hasLoggedOutRef.current) return;
    hasLoggedOutRef.current = true;
    isWarningOpenRef.current = false;
    setIsWarningOpen(false);
    setRemainingSeconds(0);
    clearActivityStorage();
    onAutoLogoutRef.current();
  }, [clearActivityStorage]);

  const staySignedIn = useCallback(() => {
    const now = Date.now();
    hasLoggedOutRef.current = false;
    lastActivityAtRef.current = now;
    lastMoveThrottleAtRef.current = now;
    isWarningOpenRef.current = false;
    setIsWarningOpen(false);
    setRemainingSeconds(totalWarningSeconds);
    syncActivityStorage(now, true);
  }, [syncActivityStorage, totalWarningSeconds]);

  const logoutNow = useCallback(() => {
    triggerAutoLogout();
  }, [triggerAutoLogout]);

  useEffect(() => {
    if (!enabled) {
      hasLoggedOutRef.current = false;
      isWarningOpenRef.current = false;
      setIsWarningOpen(false);
      setRemainingSeconds(totalWarningSeconds);
      clearActivityStorage();
      return;
    }

    const initialNow = Date.now();
    hasLoggedOutRef.current = false;
    isWarningOpenRef.current = false;
    lastActivityAtRef.current = initialNow;
    lastMoveThrottleAtRef.current = initialNow;
    setIsWarningOpen(false);
    setRemainingSeconds(totalWarningSeconds);
    syncActivityStorage(initialNow, true);

    const evaluateNow = () => {
      if (hasLoggedOutRef.current) return;
      const evaluation = evaluateIdleState({
        lastActivityAt: lastActivityAtRef.current,
        now: Date.now(),
        idleTimeoutMs,
        warningDurationMs,
      });

      if (evaluation.status === 'EXPIRED') {
        triggerAutoLogout();
        return;
      }

      if (evaluation.status === 'WARNING') {
        if (!isWarningOpenRef.current) {
          isWarningOpenRef.current = true;
          setIsWarningOpen(true);
        }
        setRemainingSeconds((prev) =>
          prev !== evaluation.remainingWarningSeconds ? evaluation.remainingWarningSeconds : prev
        );
        return;
      }

      if (isWarningOpenRef.current) {
        isWarningOpenRef.current = false;
        setIsWarningOpen(false);
      }
      setRemainingSeconds((prev) => (prev !== totalWarningSeconds ? totalWarningSeconds : prev));
    };

    const handleUserActivity = (event: Event) => {
      // Do not dismiss the warning modal on incidental pointer movement or scroll;
      // require the cashier to explicitly acknowledge the modal.
      if (isWarningOpenRef.current || hasLoggedOutRef.current) {
        return;
      }
      const now = Date.now();
      if (!IMMEDIATE_EVENTS.has(event.type) && now - lastMoveThrottleAtRef.current < 500) {
        return;
      }
      lastMoveThrottleAtRef.current = now;
      lastActivityAtRef.current = now;
      syncActivityStorage(now);
    };

    const handleVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      evaluateNow();
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CASHIER_ACTIVITY_STORAGE_KEY && e.newValue) {
        const externalTs = Number(e.newValue);
        if (Number.isFinite(externalTs) && externalTs > lastActivityAtRef.current) {
          lastActivityAtRef.current = externalTs;
          evaluateNow();
        }
      }
    };

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handleUserActivity, { passive: true, capture: true });
    }
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);
    window.addEventListener('storage', handleStorageChange);

    const intervalId = window.setInterval(evaluateNow, 1000);

    return () => {
      window.clearInterval(intervalId);
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handleUserActivity, { capture: true });
      }
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [
    enabled,
    idleTimeoutMs,
    warningDurationMs,
    totalWarningSeconds,
    syncActivityStorage,
    clearActivityStorage,
    triggerAutoLogout,
  ]);

  return {
    isWarningOpen,
    remainingSeconds,
    totalWarningSeconds,
    staySignedIn,
    logoutNow,
  };
}
