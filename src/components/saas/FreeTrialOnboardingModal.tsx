import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
  Check,
} from 'lucide-react';
import { api, setAuthSession } from '../../services/api.ts';
import { toTitleCaseLive, toLowerTrimmed, formatPhoneNumber, cleanPhoneNumber, isValidPhoneNumber, getPhoneValidationError } from '../../utils/textFormat.ts';
import { useTheme } from '../../context/ThemeContext.tsx';

interface FreeTrialOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPlan?: string;
  storeDirectory?: Array<{ id: number; name: string }>;
  platformOwnerEmail?: string;
  platformOwnerPhone?: string;
  onStoreCreated?: (tenantId: number, loginUrl: string, user?: any, token?: string) => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const FreeTrialOnboardingModal: React.FC<FreeTrialOnboardingModalProps> = ({
  isOpen,
  onClose,
  initialPlan = 'TRIAL',
  storeDirectory: _storeDirectory,
  platformOwnerEmail: _platformOwnerEmail,
  platformOwnerPhone: _platformOwnerPhone,
  onStoreCreated,
  theme: propTheme,
  onToggleTheme: _onToggleTheme,
}) => {
  const globalTheme = useTheme();

  // Dark mode resolution: supports propTheme, global ThemeContext, localStorage, and DOM
  const [internalTheme, setInternalTheme] = useState<'light' | 'dark'>(() => {
    if (propTheme) return propTheme;
    if (globalTheme?.theme) return globalTheme.theme;
    try {
      const landing = localStorage.getItem('pos_landing_theme');
      if (landing === 'light' || landing === 'dark') return landing;
      const app = localStorage.getItem('pos_theme');
      if (app === 'light' || app === 'dark') return app;
    } catch {}
    return 'dark';
  });

  useEffect(() => {
    if (propTheme) {
      setInternalTheme(propTheme);
    } else if (globalTheme?.theme) {
      setInternalTheme(globalTheme.theme);
    }
  }, [propTheme, globalTheme?.theme]);

  const isDark = internalTheme === 'dark';

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
    if (!cleanEmail || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail)) {
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

  // Validation calculations
  const cleanName = name.trim();
  const cleanEmail = toLowerTrimmed(email);
  const cleanPhone = cleanPhoneNumber(phone);
  const phoneDigits = cleanPhone.replace(/\D/g, '');

  const isNameValid = cleanName.length >= 2 && /[a-zA-Z\u0600-\u06FF]/.test(cleanName);
  const isEmailFormatValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(cleanEmail);
  const isPhoneValid = isValidPhoneNumber(cleanPhone, 10, 15);
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

    if (!cleanName || !isNameValid) {
      setErrorMessage('Please enter your full name (at least 2 letters).');
      return;
    }

    if (!cleanEmail || !isEmailFormatValid) {
      setErrorMessage('Please enter a valid email address (e.g. owner@shoestore.com).');
      return;
    }

    if (emailAvailable === false) {
      setErrorMessage('This email is already in use. Please log in or use another email.');
      return;
    }

    const phoneError = getPhoneValidationError(cleanPhone, { label: 'Phone / WhatsApp number', minDigits: 10, maxDigits: 15 });
    if (phoneError) {
      setErrorMessage(phoneError);
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please verify your confirm password.');
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

      const createdTenantId = Number(res.tenantId || res.user?.tenantId || 0);

      // LAYER 2: If email verification is required, STOP immediate auto-login and redirect to /verify-email notice view
      if (res.requiresVerification || !res.token) {
        onClose();
        const verifyUrl = `/verify-email?email=${encodeURIComponent(cleanEmail)}&tenantId=${createdTenantId}`;
        window.history.pushState({}, '', verifyUrl);
        window.dispatchEvent(new CustomEvent('auth:require-email-verification', {
          detail: {
            email: cleanEmail,
            tenantId: createdTenantId,
            storeName: res.storeName,
            verificationToken: res.verificationToken,
            verificationLink: res.verificationLink,
            message: res.message,
          },
        }));
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      // Automatically log the newly registered store owner in ONLY when verification toggle is OFF
      if (res.token && res.user) {
        setAuthSession(res.token, {
          ...res.user,
          onboardingCompleted: false,
        });
      }

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
        setErrorMessage('This email is already registered. Please sign in or use another email.');
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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="free-trial-title"
        className={`form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto transition-colors duration-200 ${
          isDark ? 'dark bg-black/80' : 'light bg-slate-900/60'
        } backdrop-blur-xs`}
        data-theme={isDark ? 'dark' : 'light'}
        style={{ colorScheme: isDark ? 'dark' : 'light' }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isLoading) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className={`relative w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto transition-colors duration-200 ${
            isDark
              ? 'bg-[#131B2E] text-white border border-purple-800/80 shadow-[0_12px_45px_rgba(0,0,0,0.8)]'
              : 'bg-white text-slate-900 border border-slate-200 shadow-2xl'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* MODAL HEADER - Full Dark Mode Support */}
          <div
            className={`px-6 py-4 transition-colors duration-200 border-b ${
              isDark
                ? 'bg-gradient-to-r from-purple-950 via-indigo-950 to-[#0F172A] border-purple-800/80 text-white'
                : 'bg-slate-50 border-slate-200 text-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold shadow-2xs shrink-0 ${
                    isDark
                      ? 'bg-purple-500/20 text-purple-300 border-purple-400/30'
                      : 'bg-purple-500/10 text-purple-600 border-purple-500/20'
                  }`}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      id="free-trial-title"
                      className={`font-bold text-base tracking-tight ${
                        isDark ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      Register Free Trial Store
                    </h3>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                        isDark
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      }`}
                    >
                      30 Days Free
                    </span>
                  </div>
                  <p
                    className={`text-xs ${
                      isDark ? 'text-purple-200/80' : 'text-slate-500'
                    }`}
                  >
                    Instant POS access • No credit card required • Full inventory features
                  </p>
                </div>
              </div>

              {/* Header Right Action: Close */}
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                aria-label="Close dialog"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isDark
                    ? 'text-purple-300 hover:text-white hover:bg-white/10'
                    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-200/60'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* MODAL BODY FORM */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col">
            <div className="p-5 sm:p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Alert Error Box */}
              {errorMessage && (
                <div
                  role="alert"
                  className={`p-3.5 rounded-xl border flex items-start gap-2.5 text-xs animate-in fade-in ${
                    isDark
                      ? 'bg-rose-950/60 border-rose-900/70 text-rose-300'
                      : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span className="font-medium leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {/* Card Container for Inputs */}
              <div
                className={`p-4 sm:p-5 rounded-2xl border shadow-xs space-y-4 transition-colors duration-200 ${
                  isDark
                    ? 'bg-[#0E1528] border-purple-900/50 shadow-inner'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                {/* 1. Full Name */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="trial-fullname"
                      className={`block font-bold text-xs ${
                        isDark ? 'text-slate-200' : 'text-gray-800'
                      }`}
                    >
                      Store Owner Full Name <span className="text-purple-500">*</span>
                    </label>
                    {touched.name && (
                      <span className="text-[11px] font-mono">
                        {isNameValid ? (
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" /> Valid
                          </span>
                        ) : (
                          <span className="text-rose-500">Min 2 letters</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
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
                      placeholder="e.g. Tariq Mehmood"
                      disabled={isLoading}
                      className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-xs sm:text-sm outline-none transition focus:ring-2 ${
                        isDark
                          ? 'bg-[#151E33] text-white placeholder-slate-500'
                          : 'bg-white text-slate-900 placeholder-slate-400'
                      } ${
                        touched.name && !isNameValid
                          ? isDark
                            ? 'border-rose-500/70 bg-rose-950/20 text-rose-100 focus:border-rose-500 focus:ring-rose-400/20'
                            : 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-400/20'
                          : touched.name && isNameValid
                          ? isDark
                            ? 'border-emerald-500/70 bg-emerald-950/20 focus:border-emerald-400 focus:ring-emerald-500/20'
                            : 'border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20'
                          : isDark
                          ? 'border-purple-900/80 focus:border-purple-400 focus:ring-purple-500/25'
                          : 'border-slate-300 focus:border-purple-600 focus:ring-purple-500/20'
                      }`}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {touched.name && isNameValid && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                      {touched.name && !isNameValid && (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  </div>
                  {touched.name && !isNameValid && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Please enter your full name (at least 2 letters).</span>
                    </div>
                  )}
                </div>

                {/* 2. Email Address */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="trial-email"
                      className={`block font-bold text-xs ${
                        isDark ? 'text-slate-200' : 'text-gray-800'
                      }`}
                    >
                      Email Address (Login Username) <span className="text-purple-500">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono ${
                        isDark ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      Primary store owner email
                    </span>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
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
                      className={`w-full pl-10 pr-9 py-2.5 rounded-xl text-xs sm:text-sm outline-none transition focus:ring-2 ${
                        isDark
                          ? 'bg-[#151E33] text-white placeholder-slate-500'
                          : 'bg-white text-slate-900 placeholder-slate-400'
                      } ${
                        (touched.email && !isEmailFormatValid) || emailAvailable === false
                          ? isDark
                            ? 'border-rose-500/70 bg-rose-950/20 text-rose-100 focus:border-rose-500 focus:ring-rose-400/20'
                            : 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-400/20'
                          : touched.email && isEmailFormatValid && emailAvailable === true
                          ? isDark
                            ? 'border-emerald-500/70 bg-emerald-950/20 focus:border-emerald-400 focus:ring-emerald-500/20'
                            : 'border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20'
                          : isDark
                          ? 'border-purple-900/80 focus:border-purple-400 focus:ring-purple-500/25'
                          : 'border-slate-300 focus:border-purple-600 focus:ring-purple-500/20'
                      }`}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {emailChecking && <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />}
                      {!emailChecking && touched.email && isEmailFormatValid && emailAvailable === true && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                      {!emailChecking && ((touched.email && !isEmailFormatValid) || emailAvailable === false) && (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  </div>
                  {touched.email && !isEmailFormatValid && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Please enter a valid email address (e.g. store@example.com).</span>
                    </div>
                  )}
                  {emailCheckMessage && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{emailCheckMessage}</span>
                    </div>
                  )}
                  {!emailChecking && touched.email && isEmailFormatValid && emailAvailable === true && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-500 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Email is available for registration.</span>
                    </div>
                  )}
                </div>

                {/* 3. Phone / WhatsApp Number */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="trial-phone"
                      className={`block font-bold text-xs ${
                        isDark ? 'text-slate-200' : 'text-gray-800'
                      }`}
                    >
                      Phone / WhatsApp Number <span className="text-purple-500">*</span>
                    </label>
                    {phone ? (
                      <span className="text-[11px] font-mono">
                        {isPhoneValid ? (
                          <span className="text-emerald-500 font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3 stroke-[3]" /> Valid ({phoneDigits.length} digits)
                          </span>
                        ) : (
                          <span className="text-rose-500 font-medium">
                            {phoneDigits.length < 7
                              ? `Need min 7 digits (${phoneDigits.length}/7)`
                              : 'Exceeds 15 digits'}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span
                        className={`text-[11px] font-mono ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        7 to 15 digits
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      id="trial-phone"
                      type="tel"
                      autoComplete="tel"
                      required
                      value={phone}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value, phone);
                        setPhone(formatted);
                        if (!touched.phone) {
                          setTouched((prev) => ({ ...prev, phone: true }));
                        }
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onBlur={() => setTouched((prev) => ({ ...prev, phone: true }))}
                      placeholder="e.g. 0321-1234567 or +92-300-1234567"
                      disabled={isLoading}
                      className={`w-full pl-10 pr-9 py-2.5 font-mono rounded-xl text-xs sm:text-sm outline-none transition focus:ring-2 ${
                        isDark
                          ? 'bg-[#151E33] text-white placeholder-slate-500'
                          : 'bg-white text-slate-900 placeholder-slate-400'
                      } ${
                        touched.phone && !isPhoneValid
                          ? isDark
                            ? 'border-rose-500/70 bg-rose-950/20 text-rose-100 focus:border-rose-500 focus:ring-rose-400/20'
                            : 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-400/20'
                          : touched.phone && isPhoneValid
                          ? isDark
                            ? 'border-emerald-500/70 bg-emerald-950/20 focus:border-emerald-400 focus:ring-emerald-500/20'
                            : 'border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20'
                          : isDark
                          ? 'border-purple-900/80 focus:border-purple-400 focus:ring-purple-500/25'
                          : 'border-slate-300 focus:border-purple-600 focus:ring-purple-500/20'
                      }`}
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                      {touched.phone && isPhoneValid && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      )}
                      {touched.phone && !isPhoneValid && (
                        <AlertCircle className="w-4 h-4 text-rose-500" />
                      )}
                    </div>
                  </div>
                  {touched.phone && !isPhoneValid && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {phoneDigits.length < 10
                          ? `Please enter at least 10 digits (e.g. 0321-1234567 or +92-300-1234567). Current: ${phoneDigits.length} digits.`
                          : phoneDigits.length > 15
                          ? 'Phone number cannot exceed 15 digits.'
                          : 'Invalid format: remove leading 0 immediately after the hyphen.'}
                      </span>
                    </div>
                  )}
                  {touched.phone && isPhoneValid && (
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-500 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Phone format verified ({phoneDigits.length} digits). Hyphens added automatically.</span>
                    </div>
                  )}
                </div>

                {/* 4. Password & Confirm Password Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                  {/* Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="trial-password"
                        className={`block font-bold text-xs ${
                          isDark ? 'text-slate-200' : 'text-gray-800'
                        }`}
                      >
                        Owner Password <span className="text-purple-500">*</span>
                      </label>
                      <span
                        className={`text-[10px] font-mono ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        Min 6 chars
                      </span>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
                        placeholder="At least 6 characters"
                        disabled={isLoading}
                        className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-xs sm:text-sm outline-none transition focus:ring-2 ${
                          isDark
                            ? 'bg-[#151E33] text-white placeholder-slate-500'
                            : 'bg-white text-slate-900 placeholder-slate-400'
                        } ${
                          touched.password && !isPasswordValid
                            ? isDark
                              ? 'border-rose-500/70 bg-rose-950/20 text-rose-100 focus:border-rose-500 focus:ring-rose-400/20'
                              : 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-400/20'
                            : touched.password && isPasswordValid
                            ? isDark
                              ? 'border-emerald-500/70 bg-emerald-950/20 focus:border-emerald-400 focus:ring-emerald-500/20'
                              : 'border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20'
                            : isDark
                            ? 'border-purple-900/80 focus:border-purple-400 focus:ring-purple-500/25'
                            : 'border-slate-300 focus:border-purple-600 focus:ring-purple-500/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className={`absolute inset-y-0 right-0 pr-3 flex items-center transition-colors cursor-pointer ${
                          isDark
                            ? 'text-slate-400 hover:text-white'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {touched.password && !isPasswordValid && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Must be at least 6 characters.</span>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="trial-confirm-password"
                        className={`block font-bold text-xs ${
                          isDark ? 'text-slate-200' : 'text-gray-800'
                        }`}
                      >
                        Confirm Password <span className="text-purple-500">*</span>
                      </label>
                      {confirmPassword && password && (
                        <span
                          className={`text-[10px] font-semibold ${
                            confirmPassword === password ? 'text-emerald-500' : 'text-rose-500'
                          }`}
                        >
                          {confirmPassword === password ? '✓ Match' : 'Mismatch'}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
                        className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-xs sm:text-sm outline-none transition focus:ring-2 ${
                          isDark
                            ? 'bg-[#151E33] text-white placeholder-slate-500'
                            : 'bg-white text-slate-900 placeholder-slate-400'
                        } ${
                          touched.confirmPassword && !isConfirmPasswordValid
                            ? isDark
                              ? 'border-rose-500/70 bg-rose-950/20 text-rose-100 focus:border-rose-500 focus:ring-rose-400/20'
                              : 'border-rose-400 bg-rose-50/30 text-rose-900 focus:border-rose-500 focus:ring-rose-400/20'
                            : confirmPassword && confirmPassword === password && isConfirmPasswordValid
                            ? isDark
                              ? 'border-emerald-500/70 bg-emerald-950/20 focus:border-emerald-400 focus:ring-emerald-500/20'
                              : 'border-emerald-400 bg-emerald-50/20 focus:border-emerald-500 focus:ring-emerald-500/20'
                            : isDark
                            ? 'border-purple-900/80 focus:border-purple-400 focus:ring-purple-500/25'
                            : 'border-slate-300 focus:border-purple-600 focus:ring-purple-500/20'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        tabIndex={-1}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className={`absolute inset-y-0 right-0 pr-3 flex items-center transition-colors cursor-pointer ${
                          isDark
                            ? 'text-slate-400 hover:text-white'
                            : 'text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {touched.confirmPassword && !isConfirmPasswordValid && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-rose-500 font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {confirmPassword.length < 6
                            ? 'Must be at least 6 characters.'
                            : 'Passwords do not match.'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Trust Badges / Bullet Info repositioned inside modal body at the bottom */}
              <div
                className={`flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 py-2.5 px-3 rounded-xl border text-[11px] sm:text-xs transition-colors ${
                  isDark
                    ? 'bg-purple-950/20 border-purple-900/40 text-slate-300'
                    : 'bg-purple-50/50 border-purple-200/60 text-slate-600'
                }`}
              >
                <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  30 Days Free
                </span>
                <span className={isDark ? 'text-purple-800' : 'text-purple-300'}>•</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  No Credit Card
                </span>
                <span className={isDark ? 'text-purple-800' : 'text-purple-300'}>•</span>
                <span className="inline-flex items-center gap-1 font-medium">
                  <Check className="w-3.5 h-3.5 text-emerald-500 stroke-[2.5]" />
                  Instant Launch
                </span>
              </div>
            </div>

            {/* MODAL FOOTER ACTION BAR - Aligned with ProductFormModal */}
            <div
              className={`px-6 py-4 border-t flex items-center justify-between gap-3 transition-colors duration-200 ${
                isDark
                  ? 'bg-[#0B1020] border-purple-900/60'
                  : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isLoading || (touched.email && emailAvailable === false)}
                  className="btn-primary px-5 py-2.5 text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md font-bold disabled:opacity-50 transition active:scale-[0.99]"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Store Account...</span>
                    </>
                  ) : (
                    <>
                      <span>Start 30-Day Free Trial</span>
                      <ArrowRight className="w-3.5 h-3.5 stroke-[2.5]" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
