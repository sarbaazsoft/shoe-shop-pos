import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CASHIER_ACTIVITY_STORAGE_KEY,
  DEFAULT_CASHIER_IDLE_TIMEOUT_MS,
  DEFAULT_CASHIER_WARNING_DURATION_MS,
  evaluateIdleState,
  formatCountdownSeconds,
  isCashierIdleTimerEnabled,
} from '../src/utils/cashierIdleTimer.ts';
import { clearAllSessionState } from '../src/services/api.ts';

test('isCashierIdleTimerEnabled: activates only for genuine active cashier sessions', () => {
  assert.equal(
    isCashierIdleTimerEnabled(
      { role: 'CASHIER', originalRole: 'CASHIER', isSimulatedCashier: false },
      'TENANT_ACTIVE'
    ),
    true
  );

  // Case-insensitive role check
  assert.equal(
    isCashierIdleTimerEnabled({ role: 'cashier' }, 'TENANT_ACTIVE'),
    true
  );

  // Non-cashier roles must not be auto-logged out by the cashier timer
  assert.equal(
    isCashierIdleTimerEnabled(
      { role: 'ADMIN', originalRole: 'ADMIN', isSimulatedCashier: false },
      'TENANT_ACTIVE'
    ),
    false
  );
  assert.equal(
    isCashierIdleTimerEnabled(
      { role: 'SUPERADMIN', originalRole: 'SUPERADMIN', isSimulatedCashier: false },
      'TENANT_ACTIVE'
    ),
    false
  );

  // Admin previewing cashier terminal is excluded
  assert.equal(
    isCashierIdleTimerEnabled(
      { role: 'CASHIER', originalRole: 'ADMIN', isSimulatedCashier: true },
      'TENANT_ACTIVE'
    ),
    false
  );

  // Unauthenticated or non-active routes do not enable the timer
  assert.equal(isCashierIdleTimerEnabled(null, 'TENANT_ACTIVE'), false);
  assert.equal(
    isCashierIdleTimerEnabled({ role: 'CASHIER', originalRole: 'CASHIER' }, 'AUTH'),
    false
  );
  assert.equal(
    isCashierIdleTimerEnabled({ role: 'CASHIER', originalRole: 'CASHIER' }, 'LANDING'),
    false
  );
});

test('evaluateIdleState: transitions cleanly from ACTIVE to WARNING to EXPIRED', () => {
  const start = 1_700_000_000_000;
  const idleTimeoutMs = 5 * 60 * 1000;
  const warningDurationMs = 60 * 1000;

  assert.equal(DEFAULT_CASHIER_IDLE_TIMEOUT_MS, idleTimeoutMs);
  assert.equal(DEFAULT_CASHIER_WARNING_DURATION_MS, warningDurationMs);

  // Still active 1 ms before idle timeout
  const activeEval = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs - 1,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(activeEval.status, 'ACTIVE');
  assert.equal(activeEval.remainingIdleMs, 1);
  assert.equal(activeEval.remainingWarningSeconds, 60);

  // Enters warning exactly at idle timeout
  const warningStart = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(warningStart.status, 'WARNING');
  assert.equal(warningStart.remainingWarningSeconds, 60);

  // Mid-countdown
  const warningMid = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs + 44_200,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(warningMid.status, 'WARNING');
  assert.equal(warningMid.remainingWarningSeconds, 16);

  // Final second before expiry
  const warningFinal = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs + warningDurationMs - 200,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(warningFinal.status, 'WARNING');
  assert.equal(warningFinal.remainingWarningSeconds, 1);

  // Expired at exact total duration and after long tab sleep
  const expiredExact = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs + warningDurationMs,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(expiredExact.status, 'EXPIRED');
  assert.equal(expiredExact.remainingWarningSeconds, 0);

  const expiredSleep = evaluateIdleState({
    lastActivityAt: start,
    now: start + idleTimeoutMs + warningDurationMs + 900_000,
    idleTimeoutMs,
    warningDurationMs,
  });
  assert.equal(expiredSleep.status, 'EXPIRED');
});

test('formatCountdownSeconds: formats remaining seconds as MM:SS', () => {
  assert.equal(formatCountdownSeconds(60), '1:00');
  assert.equal(formatCountdownSeconds(45), '0:45');
  assert.equal(formatCountdownSeconds(5), '0:05');
  assert.equal(formatCountdownSeconds(0), '0:00');
  assert.equal(formatCountdownSeconds(-3), '0:00');
});

test('clearAllSessionState: clears auth tokens and cashier idle activity timestamp', () => {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };

  const prevLocal = (globalThis as any).localStorage;
  const prevSession = (globalThis as any).sessionStorage;
  (globalThis as any).localStorage = mockStorage;
  (globalThis as any).sessionStorage = mockStorage;

  try {
    mockStorage.setItem('pos_auth_token', 'jwt-token');
    mockStorage.setItem('pos_current_user', JSON.stringify({ role: 'CASHIER' }));
    mockStorage.setItem(CASHIER_ACTIVITY_STORAGE_KEY, String(Date.now()));
    mockStorage.setItem('pos_theme', 'dark');

    clearAllSessionState();

    assert.equal(mockStorage.getItem('pos_auth_token'), null);
    assert.equal(mockStorage.getItem('pos_current_user'), null);
    assert.equal(mockStorage.getItem(CASHIER_ACTIVITY_STORAGE_KEY), null);
  } finally {
    (globalThis as any).localStorage = prevLocal;
    (globalThis as any).sessionStorage = prevSession;
  }
});
