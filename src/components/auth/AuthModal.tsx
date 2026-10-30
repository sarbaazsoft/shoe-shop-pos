import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Lock, Mail, KeyRound, AlertCircle, CheckCircle2, Eye, EyeOff, Fingerprint, Store, ArrowRight } from 'lucide-react';
import { api, setAuthSession } from '../../services/api.ts';
import { ShowroomBackground } from '../common/ShowroomBackground.tsx';
import { PublicHeader } from '../common/PublicHeader.tsx';
import { PublicFooter } from '../common/PublicFooter.tsx';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab.ts';
import { useRememberedAccount } from '../../hooks/useRememberedAccount.ts';
import { getRememberedEmail, normalizeRememberedEmail } from '../../utils/rememberedAccount.ts';
import { RememberedEmailField } from './RememberedEmailField.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';

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
  const { containerRef: authTabContainerRef } = useScrollActiveTab<HTMLDivElement>(tab, {
    padding: 16,
    behavior: 'smooth',
  });

  // Remembered email (email only; never passwords or tokens). Remembered automatically after login.
  const account = useRememberedAccount('store');

  // Form states
  const [email, setEmail] = useState(() => getRememberedEmail('store') ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [matchingStores, setMatchingStores] = useState<Array<{ tenantId: number; name: string }>>([]);
  const [forgotEmailTouched, setForgotEmailTouched] = useState(false);

  const trimmedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail);
  const showForgotEmailError =
    (forgotEmailTouched || trimmedEmail.length > 0) && trimmedEmail.length > 0 && !isEmailValid;

  // Check GET payload query parameters (?tenantId=... or ?storeId=...)
  const queryTenantId = (() => {
    if (typeof window === 'undefined') return null;
    try {
      const sp = new URLSearchParams(window.location.search);
      const val =
        sp.get('tenantId') ||
        sp.get('storeId') ||
        sp.get('tenant_id') ||
        sp.get('store_id') ||
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

    setEmail(account.isShowingRemembered && account.rememberedEmail ? account.rememberedEmail : '');
    setPassword('');
    setErrorMessage(null);
    setInfoMessage(null);
    setMatchingStores([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTenantId]);

  // The account being signed in to: the locked remembered account, or whatever was typed.
  const getLoginEmail = () =>
    account.isShowingRemembered && account.rememberedEmail ? account.rememberedEmail : email.trim();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);
    setMatchingStores([]);
    try {
      const loginEmail = getLoginEmail();
      const res = await api.auth.login({
            email: loginEmail,
            password,
            tenantId: activeTenantId,
            tenant_id: activeTenantId,
          });
      setAuthSession(res.token, res.user);
      account.remember(res.user?.email || loginEmail);
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
      const loginEmail = getLoginEmail();
      const res = await api.auth.login({
        email: loginEmail,
        password,
        tenantId: store.tenantId,
        tenant_id: store.tenantId,
      });
      setAuthSession(res.token, res.user);
      account.remember(res.user?.email || loginEmail);
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
      setResetToken('');
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
      // If the reset was for a different account than the remembered one, show the editable form.
      if (account.rememberedEmail && normalizeRememberedEmail(email) !== account.rememberedEmail) {
        account.useAnotherAccount();
      }
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
      <PublicHeader storeName={storeName} />

      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute left-4 top-20 z-20 rounded-lg border border-slate-200 dark:border-white/30 bg-white/90 dark:bg-slate-800/90 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-md hover:bg-white dark:hover:bg-slate-800 cursor-pointer"
        >
          Back to store directory
        </button>
      )}

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
              className={`w-full backdrop-blur-xl border rounded-2xl sm:rounded-3xl p-6 sm:p-8 transition-all duration-200 ${
                isDark
                  ? 'border-purple-800/80 shadow-[0_10px_35px_rgba(15,23,42,0.8),0_0_25px_rgba(147,51,234,0.2)] text-slate-100'
                  : 'bg-white border-purple-200/90 shadow-2xl shadow-purple-950/10 text-slate-800'
              }`}
            >
              {/* Store Icon Header */}
              <div className="text-center mb-6">
                <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-purple-600/30 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 dark:border-purple-400/50">
                  <Store className="w-6 h-6" />
                </div>
                <div
                  id="auth-card-heading"
                  className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 mb-1"
                >
                  {isStoreSpecific ? effectiveStoreName : 'SarbaazSoft Shoe POS'}
                </div>
                <h2 id="auth-store-name" className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {effectiveStoreName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-purple-200/80 mt-1 font-medium">
                  {isStoreSpecific
                    ? `Sign in to continue to ${effectiveStoreName}`
                    : 'Sign in to continue to store terminal'}
                </p>
                {activeTenantId && (
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-950/60 border border-purple-200/80 dark:border-purple-800/70 text-[11px] font-mono font-bold text-purple-700 dark:text-purple-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>Store ID: {activeTenantId}</span>
                  </div>
                )}
              </div>

              {/* Card Tabs Navigation - Responsive Scrollable Underline Navigation */}
              <div 
                ref={authTabContainerRef}
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                className="flex items-center justify-between border-b border-slate-200/80 dark:border-purple-900/60 mb-6 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden"
              >
                <button
                  id="auth-tab-login"
                  type="button"
                  data-active={tab === 'login'}
                  data-tab="login"
                  onClick={() => {
                    setTab('login');
                    setErrorMessage(null);
                    setInfoMessage(null);
                    if (account.isShowingRemembered && account.rememberedEmail) {
                      setEmail(account.rememberedEmail);
                    }
                  }}
                  className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    tab === 'login'
                      ? 'active text-purple-600 dark:text-purple-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                  }`}
                >
                  <Fingerprint className={`w-4 h-4 transition-colors duration-200 ${tab === 'login' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>Sign In</span>
                  {tab === 'login' && (
                    <motion.div
                      layoutId="authActiveUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>

                <button
                  id="auth-tab-forgot"
                  type="button"
                  data-active={tab === 'forgot' || tab === 'reset'}
                  data-tab="forgot"
                  onClick={() => {
                    setTab('forgot');
                    setErrorMessage(null);
                    setInfoMessage(null);
                  }}
                  className={`tab-underline-link relative flex-1 py-3 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center justify-center space-x-1.5 whitespace-nowrap cursor-pointer shrink-0 ${
                    tab === 'forgot' || tab === 'reset'
                      ? 'active text-purple-600 dark:text-purple-400 font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
                  }`}
                >
                  <KeyRound className={`w-4 h-4 transition-colors duration-200 ${tab === 'forgot' || tab === 'reset' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span>Forgot Password</span>
                  {(tab === 'forgot' || tab === 'reset') && (
                    <motion.div
                      layoutId="authActiveUnderline"
                      className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                    />
                  )}
                </button>

                {/* Scroll End Buffer Spacer: Ensures the last tab is 100% visible and never clipped */}
                <div className="tab-end-spacer shrink-0 w-6 sm:w-8 h-1 pointer-events-none self-stretch" aria-hidden="true" role="presentation" />
              </div>

              {/* Dynamic Header */}
              <div className="mb-4">
                <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                  {tab === 'login' && 'Sign in to Terminal'}
                  {tab === 'forgot' && 'Forgot Password — Send Reset Link'}
                  {tab === 'reset' && 'Create New Password'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5">
                  {tab === 'login' && 'Enter your authorized email and password to access POS operations.'}
                  {tab === 'forgot' && 'Enter your registered email address to receive a password reset link.'}
                  {tab === 'reset' && 'Enter your reset verification token and choose a new password.'}
                </p>
              </div>

              {/* Alerts */}
              {errorMessage && (
                <div role="alert" className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                  <span className="leading-relaxed font-medium">{errorMessage}</span>
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
                  <RememberedEmailField
                    account={account}
                    email={email}
                    onEmailChange={(value) => {
                      setEmail(value);
                      setMatchingStores([]);
                    }}
                    onAccountViewChange={() => {
                      setPassword('');
                      setErrorMessage(null);
                      setInfoMessage(null);
                      setMatchingStores([]);
                    }}
                    inputId="login-email-input"
                    label="Email or Terminal ID"
                    placeholder="admin@shoepos.com"
                    disabled={isLoading}
                    inputClassName="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-4 transition outline-none"
                  />

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
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
                        Forgot Password?
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
                        autoFocus={account.isShowingRemembered}
                        required
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setMatchingStores([]);
                        }}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-sans py-2.5 pl-[2.125rem] pr-9 transition outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-200 transition cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600 dark:text-purple-200/80 font-medium">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded border-purple-300 dark:border-purple-600 dark:bg-[#0E1628] text-purple-600 accent-purple-600 focus:ring-0 cursor-pointer"
                      />
                      <span>Keep logged in</span>
                    </label>
                    <span className="text-[11px] text-slate-400 dark:text-purple-300/60 font-mono">
                      JWT Auth &bull; PBKDF2
                    </span>
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
                        className={`app-input w-full bg-slate-50 dark:bg-slate-900/80 border focus:bg-white dark:focus:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-400 rounded-xl text-xs sm:text-sm font-medium py-2.5 pl-[2.125rem] pr-9 transition outline-none ${
                          showForgotEmailError
                            ? 'border-rose-400 dark:border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                            : isEmailValid
                            ? 'border-emerald-400 dark:border-emerald-500/70 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                            : 'border-slate-200 dark:border-purple-800/60 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20'
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
                        type="password"
                        required
                        placeholder="Enter new password (min 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="app-input w-full bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-purple-800/60 focus:bg-white dark:focus:bg-slate-900 focus:border-purple-600 dark:focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20 dark:focus:ring-purple-500/20 text-slate-900 dark:text-white text-xs sm:text-sm rounded-xl py-2.5 pl-[2.125rem] pr-3 outline-none font-medium"
                      />
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

