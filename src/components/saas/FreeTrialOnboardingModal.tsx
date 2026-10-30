import React, { useState, useEffect, useRef } from 'react';
import { User, Mail, Phone, Lock, Eye, EyeOff, ArrowRight, Loader2, X, AlertCircle, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { toTitleCaseLive, toLowerTrimmed } from '../../utils/textFormat';

interface FreeTrialOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  storeDirectory?: Array<{ id: number; name: string }>;
  platformOwnerEmail?: string;
  platformOwnerPhone?: string;
  onStoreCreated?: (tenantId: number, loginUrl: string, user?: any, token?: string) => void;
}

export const FreeTrialOnboardingModal: React.FC<FreeTrialOnboardingModalProps> = ({
  isOpen,
  onClose,
  initialPlan = 'TRIAL',
  storeDirectory: _storeDirectory,
  platformOwnerEmail: _platformOwnerEmail,
  platformOwnerPhone: _platformOwnerPhone,
  onStoreCreated,
}) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);

  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    password: false,
    confirmPassword: false,
  });

  const emailCheckTimerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setConfirmPassword('');
      setShowPassword(false);
      setShowConfirmPassword(false);
      setIsLoading(false);
      setErrorMessage(null);
      setEmailChecking(false);
      setEmailAvailable(null);
      setEmailCheckMessage(null);
      setTouched({
        name: false,
        email: false,
        phone: false,
        password: false,
        confirmPassword: false,
      });
    }
  }, [isOpen]);

  // Debounced check for email availability to prevent duplicate registrations
  useEffect(() => {
    if (emailCheckTimerRef.current) {
      clearTimeout(emailCheckTimerRef.current);
    }

    const cleanEmail = toLowerTrimmed(email);
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
      setEmailChecking(false);
      setEmailAvailable(null);
      setEmailCheckMessage(null);
      return;
    }

    setEmailChecking(true);
    setEmailAvailable(null);
    setEmailCheckMessage(null);

    emailCheckTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.saas.checkEmailAvailability(cleanEmail);
        setEmailChecking(false);
        if (res && res.available === false) {
          setEmailAvailable(false);
          setEmailCheckMessage(
            res.message || 'This email is already registered. Please log in or use another email.'
          );
        } else {
          setEmailAvailable(true);
          setEmailCheckMessage(null);
        }
      } catch {
        setEmailChecking(false);
        setEmailAvailable(null);
      }
    }, 400);

    return () => {
      if (emailCheckTimerRef.current) {
        clearTimeout(emailCheckTimerRef.current);
      }
    };
  }, [email]);

  if (!isOpen) return null;

  const cleanName = name.trim();
  const cleanEmail = toLowerTrimmed(email);
  const cleanPhone = phone.trim();
  const phoneDigits = cleanPhone.replace(/\D/g, '');

  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail);
  const isNameValid = cleanName.length >= 2;
  const isPhoneValid = phoneDigits.length >= 7 && phoneDigits.length <= 15;
  const isPasswordValid = password.length >= 6;
  const isConfirmPasswordValid = confirmPassword.length >= 6 && confirmPassword === password;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({
      name: true,
      email: true,
      phone: true,
      password: true,
      confirmPassword: true,
    });

    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('Please enter your full name (at least 2 characters).');
      return;
    }

    if (!cleanEmail || !isEmailFormatValid) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    if (!cleanPhone || !isPhoneValid) {
      setErrorMessage('Please enter a valid Phone / WhatsApp number (at least 7 digits).');
      return;
    }

    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your confirm password.');
      return;
    }

    if (emailAvailable === false) {
      setErrorMessage('This email is already in use. Please use a different email address or log in.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await api.saas.submitStoreRequest({
        name: toTitleCaseLive(cleanName),
        email: cleanEmail,
        phone: cleanPhone,
        password: password.trim(),
        confirmPassword: confirmPassword.trim(),
        plan: initialPlan || 'TRIAL',
      });

      if (!res || !res.success) {
        throw new Error(res?.message || 'Failed to complete registration.');
      }

      // Automatically log the newly registered store owner in
      if (res.token && res.user) {
        setAuthSession(res.token, {
          ...res.user,
          onboardingCompleted: false,
        });
      }

      const createdTenantId = Number(res.tenantId || res.user?.tenantId || 0);

      // Hand off to parent component router
      if (onStoreCreated) {
        onStoreCreated(
          createdTenantId,
          res.loginUrl || `/onboarding?tenantId=${createdTenantId}`,
          {
            ...res.user,
            onboardingCompleted: false,
            storeName: res.storeName,
          },
          res.token
        );
      } else {
        // Direct browser navigation to the onboarding wizard
        window.history.pushState({}, '', `/onboarding?tenantId=${createdTenantId}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }

      onClose();
    } catch (err: any) {
      if (
        err?.code === 'EMAIL_ALREADY_EXISTS' ||
        String(err?.message || '').toLowerCase().includes('already in use')
      ) {
        setErrorMessage('This email is already in use. Please use a different email address or sign in.');
        setEmailAvailable(false);
      } else {
        setErrorMessage(
          err?.message || 'An unexpected error occurred while creating your account. Please try again.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="free-trial-title"
      className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/75 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-[#131B2E] rounded-3xl shadow-2xl border border-purple-200/70 dark:border-purple-800/60 overflow-hidden my-auto animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="relative p-6 sm:p-7 bg-gradient-to-br from-purple-700 via-indigo-700 to-slate-900 text-white overflow-hidden">
          <div
            className="absolute -top-12 -right-12 w-36 h-36 bg-purple-400/25 rounded-full blur-2xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg text-white shrink-0">
                <Sparkles className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-purple-100 text-xs font-semibold mb-1">
                  <span>30-Day Free Trial</span>
                  <span className="w-1 h-1 rounded-full bg-emerald-400" />
                  <span>Instant Setup</span>
                </div>
                <h2 id="free-trial-title" className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                  Create Your Store Account
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              aria-label="Close dialog"
              className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors focus:outline-hidden focus:ring-2 focus:ring-white/40 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <p className="mt-2.5 text-xs sm:text-sm text-purple-100/90 leading-relaxed relative z-10">
            Get instant access to your dedicated footwear POS &amp; inventory counter. No credit card required.
          </p>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start space-x-3 text-rose-700 dark:text-rose-300 text-xs sm:text-sm animate-in fade-in"
            >
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* 1. Full Name */}
          <div className="space-y-1">
            <label
              htmlFor="trial-fullname"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Full Name <span className="text-purple-600 dark:text-purple-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <User className="w-5 h-5" />
              </div>
              <input
                id="trial-fullname"
                type="text"
                autoComplete="name"
                required
                value={name}
                onChange={(e) => {
                  setName(toTitleCaseLive(e.target.value));
                  if (errorMessage) setErrorMessage(null);
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, name: true }))}
                placeholder="e.g. Ahmed Raza"
                disabled={isLoading}
                className={`w-full pl-11 pr-4 py-2.5 sm:py-3 rounded-2xl text-sm bg-slate-50 dark:bg-slate-900/80 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-all ${
                  touched.name && !isNameValid
                    ? 'border-rose-400 focus:ring-rose-400/30'
                    : 'border-slate-200 dark:border-slate-800 focus:border-purple-500 focus:ring-purple-500/20'
                }`}
              />
            </div>
            {touched.name && !isNameValid && (
              <p className="text-[11px] text-rose-500 font-medium">Please enter your name (at least 2 characters).</p>
            )}
          </div>

          {/* 2. Email Address */}
          <div className="space-y-1">
            <label
              htmlFor="trial-email"
              className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
            >
              Email Address <span className="text-purple-600 dark:text-purple-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Mail className="w-5 h-5" />
              </div>
              <input
                id="trial-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                placeholder="owner@shoestore.com"
                disabled={isLoading}
                className={`w-full pl-11 pr-10 py-2.5 sm:py-3 rounded-2xl text-sm bg-slate-50 dark:bg-slate-900/80 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-all ${
                  (touched.email && !isEmailFormatValid) || emailAvailable === false
                    ? 'border-rose-400 focus:ring-rose-400/30'
                    : 'border-slate-200 dark:border-slate-800 focus:border-purple-500 focus:ring-purple-500/20'
                }`}
              />
              <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
                {emailChecking && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
                {!emailChecking && emailAvailable === true && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                )}
                {!emailChecking && emailAvailable === false && (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                )}
              </div>
            </div>
            {touched.email && !isEmailFormatValid && (
              <p className="text-[11px] text-rose-500 font-medium">Please enter a valid email address.</p>
            )}
            {emailCheckMessage && (
              <p className="text-[11px] text-rose-500 font-medium">{emailCheckMessage}</p>
            )}
          </div>

          {/* 3. Phone / WhatsApp Number */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label
                htmlFor="trial-phone"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Phone / WhatsApp Number <span className="text-purple-600 dark:text-purple-400">*</span>
              </label>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">For store alerts</span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                <Phone className="w-5 h-5" />
              </div>
              <input
                id="trial-phone"
                type="tel"
                autoComplete="tel"
                required
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                placeholder="e.g. +92 300 1234567"
                disabled={isLoading}
                className={`w-full pl-11 pr-4 py-2.5 sm:py-3 rounded-2xl text-sm font-mono bg-slate-50 dark:bg-slate-900/80 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-all ${
                  touched.phone && !isPhoneValid
                    ? 'border-rose-400 focus:ring-rose-400/30'
                    : 'border-slate-200 dark:border-slate-800 focus:border-purple-500 focus:ring-purple-500/20'
                }`}
              />
            </div>
            {touched.phone && !isPhoneValid && (
              <p className="text-[11px] text-rose-500 font-medium">Please enter a valid phone number (at least 7 digits).</p>
            )}
          </div>

          {/* 4. Password and Confirm Password Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Password */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="trial-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Password <span className="text-purple-600 dark:text-purple-400">*</span>
                </label>
                <span className="text-[10px] text-slate-400 dark:text-slate-500">Min 6</span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="trial-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="Min 6 characters"
                  disabled={isLoading}
                  className={`w-full pl-10 pr-9 py-2.5 rounded-2xl text-sm bg-slate-50 dark:bg-slate-900/80 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-all ${
                    touched.password && !isPasswordValid
                      ? 'border-rose-400 focus:ring-rose-400/30'
                      : 'border-slate-200 dark:border-slate-800 focus:border-purple-500 focus:ring-purple-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.password && !isPasswordValid && (
                <p className="text-[11px] text-rose-500 font-medium">Min 6 characters.</p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="trial-confirm-password"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Confirm Password <span className="text-purple-600 dark:text-purple-400">*</span>
                </label>
                {confirmPassword && password && (
                  <span
                    className={`text-[10px] font-semibold ${
                      confirmPassword === password ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {confirmPassword === password ? 'Matched' : 'Mismatch'}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="trial-confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onBlur={() => setTouched((prev) => ({ ...prev, confirmPassword: true }))}
                  placeholder="Re-enter password"
                  disabled={isLoading}
                  className={`w-full pl-10 pr-9 py-2.5 rounded-2xl text-sm bg-slate-50 dark:bg-slate-900/80 border text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:ring-2 transition-all ${
                    touched.confirmPassword && !isConfirmPasswordValid
                      ? 'border-rose-400 focus:ring-rose-400/30'
                      : confirmPassword && confirmPassword === password
                      ? 'border-emerald-400 dark:border-emerald-600 focus:border-emerald-500 focus:ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-800 focus:border-purple-500 focus:ring-purple-500/20'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {touched.confirmPassword && !isConfirmPasswordValid && (
                <p className="text-[11px] text-rose-500 font-medium">
                  {confirmPassword.length < 6 ? 'Min 6 characters.' : 'Passwords do not match.'}
                </p>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isLoading || (touched.email && emailAvailable === false)}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white font-bold text-sm shadow-xl shadow-purple-600/25 hover:shadow-purple-600/40 focus:outline-hidden focus:ring-2 focus:ring-purple-500/50 flex items-center justify-center space-x-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer active:scale-[0.99]"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating Your Store Account...</span>
                </>
              ) : (
                <>
                  <span>Start Free Trial &amp; Continue</span>
                  <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                </>
              )}
            </button>
          </div>

          {/* Trust Guarantees */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-center gap-4 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              30 Days Free
            </span>
            <span className="text-slate-300 dark:text-slate-700">&bull;</span>
            <span>No Credit Card</span>
            <span className="text-slate-300 dark:text-slate-700">&bull;</span>
            <span>Instant Login</span>
          </div>
        </form>
      </div>
    </div>
  );
};
