/**
 * Remembered-account helpers.
 *
 * Only the user's EMAIL ADDRESS is ever persisted here. Passwords, JWTs and any other
 * session secret must never be written through this module.
 *
 * Storage is intentionally separate from the auth session keys, so logging out (which clears
 * the session) never removes the remembered email — only "Forget this account" does.
 */

export type RememberedAccountScope = 'store' | 'platform';

export const REMEMBERED_EMAIL_KEYS: Record<RememberedAccountScope, string> = {
  store: 'pos_remembered_email',
  platform: 'pos_remembered_email_platform',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_EMAIL_LENGTH = 254;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage;
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    // Access can throw when storage is blocked (private mode, disabled cookies, etc.)
    return null;
  }
}

/** Returns a trimmed, lower-cased email, or null when the value is not a usable email. */
export function normalizeRememberedEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function getRememberedEmail(
  scope: RememberedAccountScope = 'store',
  storage?: StorageLike | null
): string | null {
  const store = resolveStorage(storage);
  if (!store) return null;
  try {
    return normalizeRememberedEmail(store.getItem(REMEMBERED_EMAIL_KEYS[scope]));
  } catch {
    return null;
  }
}

/** Persists the email. Returns false if the value is invalid or storage is unavailable. */
export function saveRememberedEmail(
  email: unknown,
  scope: RememberedAccountScope = 'store',
  storage?: StorageLike | null
): boolean {
  const normalized = normalizeRememberedEmail(email);
  const store = resolveStorage(storage);
  if (!normalized || !store) return false;
  try {
    store.setItem(REMEMBERED_EMAIL_KEYS[scope], normalized);
    return true;
  } catch {
    return false;
  }
}

export function forgetRememberedEmail(
  scope: RememberedAccountScope = 'store',
  storage?: StorageLike | null
): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(REMEMBERED_EMAIL_KEYS[scope]);
  } catch {
    // ignore
  }
}
