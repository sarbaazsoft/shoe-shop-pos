import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Lock, Mail, Phone, Server, ShieldCheck, Sparkles, User, UserRoundPlus, X } from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { PublicLayout } from '../common/PublicLayout';
import { toTitleCaseLive } from '../../utils/textFormat';

interface InstallationWizardProps {
  onCompleted: (user?: any) => void;
}

interface InstallStatus {
  dbReady: boolean;
  installed: boolean;
  hasSuperAdmin: boolean;
  missingTables: string[];
  error?: string;
}

export const InstallationWizard: React.FC<InstallationWizardProps> = ({ onCompleted }) => {
  const [status, setStatus] = useState<InstallStatus | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    api.install
      .status()
      .then((nextStatus: InstallStatus) => {
        if (mounted) setStatus(nextStatus);
      })
      .catch((err: any) => {
        if (mounted) {
          setStatus({
            dbReady: false,
            installed: false,
            hasSuperAdmin: false,
            missingTables: [],
            error: err?.message,
          });
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    const normalizedEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    if (!status?.hasSuperAdmin) {
      if (!name.trim()) {
        setError('Enter the superadmin name.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizedEmail)) {
        setError('Enter a valid email address.');
        return;
      }
      if (!cleanPhone) {
        setError("Enter the superadmin's phone / WhatsApp number.");
        return;
      }
      const digits = cleanPhone.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) {
        setError('Enter a valid phone / WhatsApp number (7-15 digits, e.g. +923001234567 or +15550199).');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('The passwords do not match. Check the confirmation and try again.');
        return;
      }
    }
    setSaving(true);
    try {
      const res: any = await api.install.installPlatform({
        name: name.trim(),
        email: normalizedEmail,
        phone: cleanPhone,
        whatsapp: cleanPhone,
        password,
      });
      if (res?.token && res?.user) {
        setAuthSession(res.token, res.user);
      }
      onCompleted(res?.user);
    } catch (err: any) {
      setError(err?.message || 'Installation could not be completed.');
      const nextStatus = await api.install.status().catch(() => null);
      if (nextStatus) setStatus(nextStatus);
    } finally {
      setSaving(false);
    }
  };

  return (
    <PublicLayout
      storeName="SarbaazSoft Shoe POS Setup"
      badgeText={status?.dbReady ? 'Setup required' : 'System connecting'}
      badgeVariant={status?.dbReady ? 'wizard' : 'connecting'}
      subtitle="SarbaazSoft Shoe POS Initial Platform Setup"
      dbText="Secure system setup"
    >
      <motion.section
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-2xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80"
      >
        {/* MODAL HEADER ALIGNED WITH PRODUCT FORM MODAL */}
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs shrink-0">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    Install your platform
                  </h1>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200 border border-purple-200 dark:border-purple-400/30">
                    <Sparkles className="w-2.5 h-2.5" />
                    First run
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-purple-200/80">
                  The installer configures the initial setup and creates the platform administrator account.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-mono font-bold ${
                  status?.dbReady
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60'
                    : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>{status?.dbReady ? 'DB Ready' : 'Checking DB'}</span>
              </span>
              {status?.installed && (
                <button
                  type="button"
                  onClick={onCompleted}
                  title="Close installer"
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* WIZARD FORM CONTENT ALIGNED WITH PRODUCT FORM MODAL */}
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto p-6 space-y-5 text-xs bg-slate-50/50 dark:bg-[#070B14]"
        >
          {status && !status.dbReady && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-100 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">System storage is not ready</div>
                <p className="mt-0.5">
                  Check the server connection, then reload this page.
                </p>
                {status.error && <p className="mt-1.5 break-words text-[11px] opacity-80 font-mono">{status.error}</p>}
              </div>
            </div>
          )}

          {Boolean(status?.missingTables?.length) && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3.5 text-xs text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-950/30 dark:text-indigo-100 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">Initial setup required</div>
                <p className="mt-0.5 text-[11px] leading-5">
                  Continue to complete the setup. No store or demo records will be added.
                </p>
              </div>
            </div>
          )}

          {!status?.hasSuperAdmin && (
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <div className="font-bold">Create the first superadmin</div>
                <p className="mt-0.5 text-[11px] leading-5">
                  Use an email and password you control. No default credentials will be generated.
                </p>
              </div>
            </div>
          )}

          {status?.hasSuperAdmin && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-950/30 dark:text-emerald-100 flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>An existing superadmin account was found and will be preserved.</span>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="alert-danger flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800 dark:border-rose-500/30 dark:bg-rose-950/40 dark:text-rose-200 animate-in fade-in"
            >
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {!status?.hasSuperAdmin && (
            <>
              {/* CARD 1: SUPERADMIN IDENTITY (Aligned with ProductFormModal & SettingsView inputs) */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <User className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>1. Superadmin Identity</span>
                  </h5>
                  <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium">Step 1 of 2</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Superadmin name */}
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>
                        Superadmin name <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </span>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 dark:text-purple-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        required
                        autoComplete="name"
                        value={name}
                        onChange={(e) => setName(toTitleCaseLive(e.target.value))}
                        placeholder="Your name"
                        className="capitalize w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 font-bold text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
                      <span>Primary platform administrator profile</span>
                    </p>
                  </label>

                  {/* Superadmin email */}
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>
                        Superadmin email <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </span>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-400 dark:text-purple-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="admin@example.com"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 font-mono font-medium text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
                      <span>Master login email for SuperAdmin C-Panel</span>
                    </p>
                  </label>

                  {/* Superadmin Phone / WhatsApp */}
                  <label className="block sm:col-span-2 lg:col-span-1">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>
                        Phone / WhatsApp <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </span>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 dark:text-purple-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        required
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+92 300 1234567"
                        className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 font-mono font-medium text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span>WhatsApp notifications &amp; recovery contact</span>
                    </p>
                  </label>
                </div>
              </div>

              {/* CARD 2: SECURITY & CREDENTIALS (Aligned with ProductFormModal & SettingsView inputs) */}
              <div className="bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 p-5 rounded-2xl border border-gray-200 dark:border-[#1A263D] shadow-xs dark:shadow-[0_0_20px_rgba(59,130,246,0.05)] space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-slate-800">
                  <h5 className="font-bold text-gray-800 dark:text-white text-xs uppercase tracking-wider flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
                    <span>2. Security &amp; Password Credentials</span>
                  </h5>
                  <span className="text-[10px] text-purple-600 dark:text-purple-300 font-semibold bg-purple-50 dark:bg-purple-950/50 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800">
                    Step 2 of 2 • Min 8 Chars
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Password */}
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>
                        Password <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </span>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 dark:text-purple-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        required
                        minLength={8}
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 font-mono text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 shrink-0" />
                      <span>Minimum 8 characters required</span>
                    </p>
                  </label>

                  {/* Confirm password */}
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                      <span>
                        Confirm password <span className="text-rose-500 font-bold">*</span>
                      </span>
                    </span>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 dark:text-purple-400 absolute left-3.5 top-3.5 pointer-events-none" />
                      <input
                        required
                        minLength={8}
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Enter the password again"
                        className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 font-mono text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                        title={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                      <span>Re-enter password to confirm</span>
                    </p>
                  </label>
                </div>

                {/* Real-time Password Match Indicator */}
                {password && confirmPassword && (
                  <div
                    className={`p-2.5 rounded-xl text-xs flex items-center gap-2 border ${
                      password === confirmPassword
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                        : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60'
                    }`}
                  >
                    {password === confirmPassword ? (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <span>Passwords match securely.</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Passwords do not match yet.</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}

          {/* FOOTER NAVIGATION & ACTION BUTTONS ALIGNED WITH PRODUCT FORM MODAL */}
          <div className="pt-4 -mx-6 -mb-6 p-6 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-gray-200 dark:border-purple-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-[11px] text-slate-500 dark:text-purple-200/80 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300 shrink-0" />
              <span>
                Fields marked with <strong className="text-rose-500">*</strong> are required for platform setup.
              </span>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {status?.installed && (
                <button
                  type="button"
                  onClick={onCompleted}
                  className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={saving || !status?.dbReady}
                className="btn-primary w-full sm:w-auto px-6 py-2.5 text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-md font-bold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : status?.hasSuperAdmin ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <UserRoundPlus className="h-4 w-4" />
                )}
                <span>
                  {saving
                    ? 'Installing…'
                    : status?.hasSuperAdmin
                    ? 'Repair missing schema'
                    : 'Create schema and superadmin'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </motion.section>
    </PublicLayout>
  );
};

