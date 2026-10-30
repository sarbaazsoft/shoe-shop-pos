import { useCallback, useState } from 'react';
import { forgetRememberedEmail, getRememberedEmail, saveRememberedEmail, type RememberedAccountScope } from '../utils/rememberedAccount.ts';

export type AccountViewMode = 'remembered' | 'other';

/**
 * Drives the "remembered account" login view.
 * - `rememberedEmail` is what is stored on this device (email only).
 * - `mode` is which view is showing: the locked remembered account, or the normal editable form.
 */
export function useRememberedAccount(scope: RememberedAccountScope = 'store') {
  const [rememberedEmail, setRememberedEmail] = useState<string | null>(() => getRememberedEmail(scope));
  const [mode, setMode] = useState<AccountViewMode>(() => (getRememberedEmail(scope) ? 'remembered' : 'other'));

  /** Silently remember the email after a successful login (no prompt). */
  const remember = useCallback(
    (email: unknown) => {
      if (saveRememberedEmail(email, scope)) {
        setRememberedEmail(getRememberedEmail(scope));
      }
    },
    [scope]
  );

  /** Remove the remembered email from storage and show the normal empty login form. */
  const forget = useCallback(() => {
    forgetRememberedEmail(scope);
    setRememberedEmail(null);
    setMode('other');
  }, [scope]);

  const useAnotherAccount = useCallback(() => setMode('other'), []);
  const returnToRemembered = useCallback(() => {
    if (getRememberedEmail(scope)) setMode('remembered');
  }, [scope]);

  return {
    rememberedEmail,
    mode,
    isShowingRemembered: Boolean(rememberedEmail) && mode === 'remembered',
    remember,
    forget,
    useAnotherAccount,
    returnToRemembered,
  };
}
