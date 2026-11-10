import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound, AlertCircle, CheckCircle2, Eye, EyeOff, Store, ArrowRight } from 'lucide-react';
import { api, setAuthSession } from '../../services/api.ts';
import { ShoeIcon } from '../common/ShoeIcon.tsx';
import { ShowroomBackground } from '../common/ShowroomBackground.tsx';
import { PublicHeader } from '../common/PublicHeader.tsx';
import { PublicFooter } from '../common/PublicFooter.tsx';
import { getRememberedEmail, saveRememberedEmail, forgetRememberedEmail } from '../../utils/rememberedAccount.ts';
import { useTheme } from '../../context/ThemeContext.tsx';
import { PasswordStrengthIndicator } from '../common/PasswordStrengthIndicator.tsx';

interface AuthModalProps {
  onSuccess: (user: any) => void;
  companySettings: any;
  onBack?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  onSuccess,
  companySettings,
  onBack,
}) => {
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<'login' | 'forgot' | 'reset'>('login');

  // Form states with email retrieval from localStorage
  const [email, setEmail] = useState(() => getRememberedEmail('store') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => Boolean(getRememberedEmail('store')));
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [loginPasteBlocked, setLoginPasteBlocked] = useState(false);
  const [resetPasteBlocked, setResetPasteBlocked] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [matchingStores, setMatchingStores] = useState<Array<{ tenantId: number; name: string }>>([]);
  const [forgotEmailTouched, setForgotEmailTouched] = useState(false);

  const trimmedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail);
  const showForgotEmailError =
    (forgotEmailTouched || trimmedEmail.length > 0) && trimmedEmail.length > 0 && !isEmailValid;

  // Check GET payload query parameters (?tenantId=... or ?storeId=...) or path segments / unauth storage
  const queryTenantId = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const sp = new URLSearchParams(window.location.search);
      const pathMatch = window.location.pathname.match(/^\/(?:store|stores|tenant|t|directory|auth|login)\/([a-zA-Z0-9_-]+)/i);
      const val =
        sp.get('tenantId') ||
        sp.get('storeId') ||
        sp.get('tenant_id') ||
        sp.get('store_id') ||
        (pathMatch ? pathMatch[1] : '') ||
        sessionStorage.getItem('pos_unauth_scoped_tenant_id') ||
        localStorage.getItem('pos_unauth_scoped_tenant_id') ||
        '';
      const num = Number(val);
      return Number.isSafeInteger(num) && num > 0 ? num : null;
    } catch {
      return null;
    }
  })();

  const rawTenantId = Number(
    companySettings?.tenant_id ??
    companySettings?.tenantId ??
    companySettings?.id ??
    queryTenantId ??
    0
  );
  const activeTenantId = Number.isSafeInteger(rawTenantId) && rawTenantId > 0 ? rawTenantId : null;

  const initialStoreTitle = (() => {
    const raw = companySettings?.name || companySettings?.company_name || companySettings?.companyName || '';
    if (raw && raw !== 'SarbaazSoft Shoe POS' && raw !== 'Shoe Shop POS & Inventory') {
      return raw;
    }
    return '';
  })();

  const [storeTitle, setStoreTitle] = useState<string>(initialStoreTitle);

  // If activeTenantId is present from GET payload or props, resolve store name
  useEffect(() => {
    let isMounted = true;
    const provided = companySettings?.name || companySettings?.company_name || companySettings?.companyName;
    if (provided && provided !== 'SarbaazSoft Shoe POS' && provided !== 'Shoe Shop POS & Inventory') {
      setStoreTitle(provided);
      return;
    }

    if (activeTenantId) {
      api.saas.resolve(activeTenantId).then((res) => {
        if (!isMounted) return;
        const target = res?.availableTenants?.find((t: any) => Number(t.id) === activeTenantId);
        if (target?.name) {
          setStoreTitle(target.name);
        } else if (res?.resolution?.tenant?.name && Number(res.resolution.tenant.id) === activeTenantId) {
          setStoreTitle(res.resolution.tenant.name);
        }
      }).catch(() => {});
    }

    return () => {
      isMounted = false;
    };
  }, [activeTenantId, companySettings]);

  const effectiveStoreName =
    storeTitle ||
    (companySettings?.name && companySettings.name !== 'SarbaazSoft Shoe POS' && companySettings.name !== 'Shoe Shop POS & Inventory' ? companySettings.name : '') ||
    (activeTenantId ? `Store #${activeTenantId}` : 'SarbaazSoft Shoe POS');

  const isStoreSpecific = Boolean(activeTenantId || storeTitle);
  const storeName = effectiveStoreName;

  // Hidden by default for a few ms, then fades in smoothly
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlResetToken = searchParams.get('resetToken') || '';
    const urlEmail = searchParams.get('email') || '';

    if (urlResetToken) {
      setResetToken(urlResetToken);
      if (urlEmail) setEmail(urlEmail);
      setTab('reset');
      setErrorMessage(null);
      setInfoMessage('Reset link verified. Enter a new password below to complete your password reset.');
      api.auth
        .verifyResetToken(urlResetToken)
        .then((res) => {
          if (res?.valid && res.email) {
            setEmail(res.email);
          }
        })
        .catch((err) => {
          setErrorMessage(err?.message || 'This password reset link is invalid or has expired.');
        });
      return;
    }

    const savedEmail = getRememberedEmail('store') ?? '';
    setEmail(savedEmail);
    setRememberMe(Boolean(savedEmail));
    setPassword('');
    setErrorMessage(null);
    setInfoMessage(null);
    setMatchingStores([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setMatchingStores([]);
    try {
      const loginEmail = email.trim();
      const res = await api.auth.login({
        email: loginEmail,
        password,
        tenantId: activeTenantId,
        tenant_id: activeTenantId,
      });
      setAuthSession(res.token, res.user);

      // Save or remove remembered email according to Remember Me checkbox
      if (rememberMe) {
        saveRememberedEmail(res.user?.email || loginEmail, 'store');
      } else {
        forgetRememberedEmail('store');
      }

      onSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify your store credentials.');
      if (err.code === 'MULTIPLE_STORE_ACCOUNTS' && Array.isArray(err.stores)) {
        setMatchingStores(err.stores);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleStoreChoice = async (store: { tenantId: number; name: string }) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loginEmail = email.trim();
      const res = await api.auth.login({
        email: loginEmail,
        password,
        tenantId: store.tenantId,
        tenant_id: store.tenantId,
      });
      setAuthSession(res.token, res.user);

      // Save or remove remembered email according to Remember Me checkbox
      if (rememberMe) {
        saveRememberedEmail(res.user?.email || loginEmail, 'store');
      } else {
        forgetRememberedEmail('store');
      }

      onSuccess(res.user);
    } catch (err: any) {
      setErrorMessage(err.message || `Login failed for ${store.name}.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotEmailTouched(true);
    if (!isEmailValid) {
      setErrorMessage('Please enter a valid email address before sending a password reset request.');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const res = await api.auth.sendResetLink({
        email: trimmedEmail,
        tenantId: activeTenantId,
        origin: window.location.origin,
      });
      if (res.resetToken) {
        setResetToken(res.resetToken);
      } else {
        setResetToken('');
      }
      setInfoMessage(
        res.message ||
          `Password reset token and link have been sent by email to ${trimmedEmail}. Please check your inbox and enter the verification token below.`
      );
      setTab('reset');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send password reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      await api.auth.resetPassword({
        email: email.trim(),
        token: resetToken.trim(),
        newPassword,
        tenantId: activeTenantId,
      });
      setInfoMessage('Password has been reset successfully! You can now log in with your new password.');
      setResetToken('');
      setNewPassword('');
      setPassword('');
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('resetToken')) {
        searchParams.delete('resetToken');
        searchParams.delete('email');
        const nextQuery = searchParams.toString();
        window.history.replaceState({}, '', `/${nextQuery ? `?${nextQuery}` : ''}`);
      }
      setTab('login');
    } catch (err: any) {
      setErrorMessage(err.message || 'Password reset failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        backgroundColor: isDark ? '#0A0E1A' : '#E2E8F0',
      }}
      className={`min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-200 dark:bg-[#0A0E1A] ${
        isDark ? 'dark text-slate-100' : 'light text-slate-900'
      } font-sans selection:bg-purple-600 selection:text-white transition-colors duration-200`}
    >
      {/* Showroom Background Image Layer aligned with loading route */}
      <ShowroomBackground />

      {/* Top Application Bar with backdrop blur */}
      <PublicHeader
        storeName={storeName}
        actionText={onBack ? 'Store Directory' : undefined}
        actionIcon={<Store className="w-3.5 h-3.5" />}
        onActionClick={onBack}
      />

      {/* Main Content Area - Centered Login Form Card */}
      <main className="relative z-10 w-full flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985, filter: 'blur(6px)' }}
            animate={isVisible
              ? { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }
              : { opacity: 0, y: 18, scale: 0.985, filter: 'blur(6px)' }}
            transition={{
              duration: 0.48,
              delay: 0.08,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="w-full"
          >
            <div
              id="auth-card"
              style={{
                backgroundColor: isDark ? 'rgba(15, 23, 42, 0.94)' : 'rgba(255, 255, 255, 0.94)',
                backgroundImage: isDark
                  ? 'linear-gradient(to bottom, rgba(15,23,42,0.92), rgba(30,27,75,0.86), rgba(15,23,42,0.92))'
                  : 'none',
              }}
              className={`w-full backdrop-blur-xl border rounded-2xl sm:rounded-3xl p-6 sm:p-7 transition-all duration-200 ${
                isDark
                  ? 'border-purple-800/80 shadow-[0_10px_35px_rgba(15,23,42,0.8),0_0_25px_rgba(147,51,234,0.2)] text-slate-100'
                  : 'bg-white border-purple-200/90 shadow-2xl shadow-purple-950/10 text-slate-800'
              }`}
            >
              {/* Store Icon Header */}
              <div className="text-center mb-5">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50">
                  <ShoeIcon className="w-6 h-6 stroke-[2.2]" />
                </div>
                <div
                  id="auth-card-heading"
                  className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1"
                >
                  SarbaazSoft Shoe POS
                </div>
                <h2 id="auth-store-name" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {effectiveStoreName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-1 font-medium">
                  {isStoreSpecific
                    ? `Sign in to continue to ${effectiveStoreName}`
                    : 'Sign in to continue to store terminal'}
                </p>
              </div>

              {/* Dynamic Header for Password Reset Flows */}
              {(tab === 'forgot' || tab === 'reset') && (
                <div className="mb-4">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    {tab === 'forgot' && 'Forgot Password — Send Reset Link'}
                    {tab === 'reset' && 'Create New Password'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                    {tab === 'forgot' && 'Enter your registered email address to receive a password reset link.'}
                    {tab === 'reset' && 'Enter your reset verification token and choose a new password.'}
                  </p>
                </div>
              )}

              {/* Alerts */}
              {errorMessage && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex flex-col gap-2">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed font-medium">{errorMessage}</span>
                  </div>
                  {(errorMessage.toLowerCase().includes('verification') || errorMessage.toLowerCase().includes('activate your store')) && (
                    <button
                      type="button"
                      onClick={() => {
                        window.dispatchEvent(
                          new CustomEvent('auth:require-email-verification', {
                            detail: {
                              email: email.trim(),
                              tenantId: activeTenantId,
                              storeName: effectiveStoreName,
                            },
                          })
                        );
                      }}
                      className="mt-1 self-start inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px] shadow-xs transition-colors cursor-pointer"
                    >
                      Verify Email &amp; Activate Account &rarr;
                    </button>
                  )}
                </div>
              )}

              {matchingStores.length > 0 && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950/40">
                  <p className="mb-2 text-xs font-bold text-blue-900 dark:text-blue-100">
                    Choose which store to sign in to:
                  </p>
                  <div className="flex flex-col gap-2">
                    {matchingStores.map((store) => (
                      <button
                        key={store.tenantId}
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleStoreChoice(store)}
                        className="flex items-center justify-between rounded-lg border border-blue-200 bg-white px-3 py-2 text-left text-xs font-semibold text-slate-800 hover:border-blue-400 disabled:opacity-60 dark:border-blue-800 dark:bg-slate-900 dark:text-slate-100"
                      >
                        <span>{store.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {infoMessage && (
                <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{infoMessage}</span>
                </div>
              )}

              {/* TAB 1: LOGIN FORM */}
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label
                      htmlFor="login-email-input"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Email or Terminal ID
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="login-email-input"
                        name="email"
                        type="email"
                        required
                        autoComplete="username"
                        placeholder="admin@shoepos.com"
                        value={email}
                        disabled={isLoading}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setMatchingStores([]);
                        }}
                        className="app-input email-focus-pulse w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="login-password-input"
                        className="block text-xs font-bold text-slate-700 dark:text-slate-300"
                      >
                        Counter PIN / Password
                      </label>
                      <button
                        id="forgot-password-link"
                        type="button"
                        onClick={() => {
                          setTab('forgot');
                          setErrorMessage(null);
                          setInfoMessage(null);
                        }}
                        className="text-xs font-semibold text-purple-600 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200 hover:underline transition cursor-pointer"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Lock className="w-4 h-4" />
                      </div>

                      <input
                        id="login-password-input"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        autoFocus={Boolean(email)}
                        required
                        placeholder="••••••••"
                        value={password}
                        onPaste={(e) => {
                          e.preventDefault();
                          setLoginPasteBlocked(true);
                          setTimeout(() => setLoginPasteBlocked(false), 3500);
                        }}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setMatchingStores([]);
                          if (loginPasteBlocked) setLoginPasteBlocked(false);
                        }}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-12 transition outline-none"
                      />

                      <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
                          title={showPassword ? 'Hide password' : 'Show password'}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Paste Blocked Security Notice */}
                    {loginPasteBlocked && (
                      <div className="mt-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Pasting is disabled for security verification. Please type your password manually.</span>
                      </div>
                    )}
                  </div>

                  {/* Beneath Password Field: Remember Me & Keep me logged in on a single line (Left-and-Right Split) */}
                  <div className="flex items-center justify-between pt-0.5 text-xs text-slate-600 dark:text-purple-200/80 font-medium select-none">
                    <label
                      htmlFor="remember-me-checkbox"
                      className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <input
                        id="remember-me-checkbox"
                        name="rememberMe"
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-purple-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 accent-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Remember Me</span>
                    </label>

                    <label
                      htmlFor="keep-logged-in-checkbox"
                      className="flex items-center gap-2 cursor-pointer hover:text-slate-900 dark:hover:text-purple-100 transition-colors"
                    >
                      <input
                        id="keep-logged-in-checkbox"
                        name="keepLoggedIn"
                        type="checkbox"
                        checked={keepLoggedIn}
                        onChange={(e) => setKeepLoggedIn(e.target.checked)}
                        className="w-4 h-4 rounded border-purple-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 accent-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Keep me logged in</span>
                    </label>
                  </div>

                  <button
                    id="login-submit-btn"
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_16px_rgba(147,51,234,0.35)] font-bold text-xs sm:text-sm transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Verifying Credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Terminal</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* TAB 2: FORGOT PASSWORD FORM */}
              {tab === 'forgot' && (
                <form onSubmit={handleForgot} noValidate className="space-y-4">
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 leading-relaxed font-medium">
                    Enter the email address registered with your store or SuperAdmin account. We will send a password reset link to your email.
                  </p>

                  <div>
                    <label
                      htmlFor="forgot-email-input"
                      className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
                    >
                      Account Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        id="forgot-email-input"
                        type="email"
                        required
                        aria-invalid={showForgotEmailError}
                        aria-describedby="forgot-email-validation-msg"
                        placeholder="admin@shoepos.com"
                        value={email}
                        onBlur={() => setForgotEmailTouched(true)}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        className={`app-input email-focus-pulse w-full bg-slate-50 dark:bg-slate-900/80 border focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-9 transition outline-none ${
                          showForgotEmailError
                            ? 'border-rose-400 dark:border-rose-500/80 focus:border-rose-500'
                            : isEmailValid
                            ? 'border-emerald-400 dark:border-emerald-500/70 focus:border-emerald-500'
                            : 'border-slate-200 dark:border-purple-800/60 focus:border-purple-600 dark:focus:border-purple-400'
                        }`}
                      />
                      {trimmedEmail.length > 0 && (
                        <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                          {isEmailValid ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-rose-500" />
                          )}
                        </div>
                      )}
                    </div>
                    <div id="forgot-email-validation-msg" className="mt-1.5 min-h-[18px]">
                      {showForgotEmailError ? (
                        <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Enter a valid email address format (e.g., admin@shoepos.com).</span>
                        </p>
                      ) : isEmailValid ? (
                        <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Email format verified — ready to send request.</span>
                        </p>
                      ) : (
                        <p className="text-[11px] text-slate-400 dark:text-purple-300/60">
                          A valid email format is required to enable Send Request.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMessage(null);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                    >
                      Back to Sign In
                    </button>
                    <button
                      id="send-reset-link-btn"
                      type="submit"
                      disabled={isLoading || !isEmailValid}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isLoading ? 'Sending Request...' : 'Send Request'}
                    </button>
                  </div>
                </form>
              )}

              {/* TAB 4: RESET PASSWORD FORM */}
              {tab === 'reset' && (
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Verification Reset Token
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={resetToken}
                        onChange={(e) => setResetToken(e.target.value)}
                        placeholder="e.g. 7F3A9C12"
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white font-mono uppercase text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      New Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-purple-600 dark:text-purple-400">
                        <Lock className="w-4 h-4" />
                      </div>
                      <input
                        type={showResetPassword ? 'text' : 'password'}
                        required
                        placeholder="Enter new password"
                        value={newPassword}
                        onPaste={(e) => {
                          e.preventDefault();
                          setResetPasteBlocked(true);
                          setTimeout(() => setResetPasteBlocked(false), 3500);
                        }}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (resetPasteBlocked) setResetPasteBlocked(false);
                        }}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-12 transition outline-none"
                      />
                      <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center">
                        <button
                          type="button"
                          onClick={() => setShowResetPassword(!showResetPassword)}
                          className="p-1 text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
                          title={showResetPassword ? 'Hide password' : 'Show password'}
                        >
                          {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Reset Paste Blocked Security Notice */}
                    {resetPasteBlocked && (
                      <div className="mt-1.5 p-2 rounded-xl bg-amber-50 dark:bg-amber-950/35 border border-amber-200 dark:border-amber-800/60 text-[11px] font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span>Pasting is disabled for security verification. Please type your password manually.</span>
                      </div>
                    )}

                    {/* Password Strength Indicator (non-restrictive, leaves choice to user) */}
                    {newPassword.length > 0 && (
                      <PasswordStrengthIndicator password={newPassword} />
                    )}
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('login');
                        setErrorMessage(null);
                      }}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-purple-50/80 text-purple-700 hover:text-purple-800 border border-purple-200/90 shadow-xs hover:border-purple-300 dark:bg-slate-900/80 dark:hover:bg-purple-900/40 dark:border-purple-800/60 dark:text-purple-200 text-xs font-bold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs transition active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      {isLoading ? 'Updating...' : 'Set Password & Sign In'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </main>

      {/* Global Public Footer */}
      <PublicFooter storeName={storeName} />
    </div>
  );
};

