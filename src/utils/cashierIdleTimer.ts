export const DEFAULT_CASHIER_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes before warning modal
export const DEFAULT_CASHIER_WARNING_DURATION_MS = 60 * 1000; // 60-second countdown before auto-logout
export const CASHIER_ACTIVITY_STORAGE_KEY = 'pos_cashier_last_activity_at';
export const CASHIER_IDLE_LOGOUT_NOTICE =
  'Your cashier session was automatically signed out due to inactivity. Please sign in again to continue.';

export type IdleStatus = 'ACTIVE' | 'WARNING' | 'EXPIRED';

export interface IdleEvaluation {
  status: IdleStatus;
  elapsedMs: number;
  remainingIdleMs: number;
  remainingWarningMs: number;
  remainingWarningSeconds: number;
}

export function isCashierIdleTimerEnabled(
  user: {
    role?: string | null;
    originalRole?: string | null;
    isSimulatedCashier?: boolean;
  } | null | undefined,
  saasMode: string
): boolean {
  if (saasMode !== 'TENANT_ACTIVE' || !user) {
    return false;
  }
  const effectiveRole = String(user.role || '').trim().toUpperCase();
  const originalRole = String(user.originalRole || effectiveRole).trim().toUpperCase();
  if (user.isSimulatedCashier) {
    return false;
  }
  return effectiveRole === 'CASHIER' && originalRole === 'CASHIER';
}

export function evaluateIdleState(params: {
  lastActivityAt: number;
  now: number;
  idleTimeoutMs?: number;
  warningDurationMs?: number;
}): IdleEvaluation {
  const idleTimeoutMs = Math.max(1000, params.idleTimeoutMs ?? DEFAULT_CASHIER_IDLE_TIMEOUT_MS);
  const warningDurationMs = Math.max(1000, params.warningDurationMs ?? DEFAULT_CASHIER_WARNING_DURATION_MS);
  const totalDurationMs = idleTimeoutMs + warningDurationMs;

  const elapsedMs = Math.max(0, params.now - params.lastActivityAt);
  const remainingIdleMs = Math.max(0, idleTimeoutMs - elapsedMs);

  if (elapsedMs >= totalDurationMs) {
    return {
      status: 'EXPIRED',
      elapsedMs,
      remainingIdleMs: 0,
      remainingWarningMs: 0,
      remainingWarningSeconds: 0,
    };
  }

  if (elapsedMs >= idleTimeoutMs) {
    const remainingWarningMs = Math.max(0, totalDurationMs - elapsedMs);
    return {
      status: 'WARNING',
      elapsedMs,
      remainingIdleMs: 0,
      remainingWarningMs,
      remainingWarningSeconds: Math.max(1, Math.ceil(remainingWarningMs / 1000)),
    };
  }

  return {
    status: 'ACTIVE',
    elapsedMs,
    remainingIdleMs,
    remainingWarningMs: warningDurationMs,
    remainingWarningSeconds: Math.ceil(warningDurationMs / 1000),
  };
}

export function formatCountdownSeconds(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
