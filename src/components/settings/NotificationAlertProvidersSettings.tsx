import React, { useState, useEffect } from 'react';
import {
  Send,
  Mail,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Sliders,
  Radio,
  ExternalLink,
  ShieldCheck,
  Smartphone,
  Save,
  Check,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';
import { api } from '../../services/api.ts';

export type AlertProviderMode = 'both' | 'telegram' | 'gmail' | 'none';

interface NotificationAlertProvidersSettingsProps {
  formData?: any;
  setFormData?: React.Dispatch<React.SetStateAction<any>>;
  isEmbeddedInForm?: boolean;
  onSaveSuccess?: (updated: any) => void;
  onClose?: () => void;
}

export const NotificationAlertProvidersSettings: React.FC<NotificationAlertProvidersSettingsProps> = ({
  formData: externalFormData,
  setFormData: externalSetFormData,
  isEmbeddedInForm = false,
  onSaveSuccess,
  onClose,
}) => {
  // Local state for standalone mode (e.g., when launched from NotificationsView)
  const [internalFormData, setInternalFormData] = useState({
    telegram_bot_token: '',
    telegram_chat_id: '',
    telegram_alerts_enabled: false,
    email_alerts_enabled: true,
    gmail_user: '',
    gmail_app_password: '',
    gmail_from_name: 'SarbaazSoft Store Alerts',
    active_alert_provider: 'both' as AlertProviderMode,
    company_email: '',
  });

  const [loading, setLoading] = useState(!externalFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Active Provider Tab inside panel
  const [activeTab, setActiveTab] = useState<'both' | 'telegram' | 'gmail'>('both');

  // Secrets visibility toggles
  const [showTelegramToken, setShowTelegramToken] = useState(false);
  const [showGmailPassword, setShowGmailPassword] = useState(false);

  // Test states
  const [isTestingTelegram, setIsTestingTelegram] = useState(false);
  const [telegramTestResult, setTelegramTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const [isTestingGmail, setIsTestingGmail] = useState(false);
  const [gmailTestRecipient, setGmailTestRecipient] = useState('');
  const [gmailTestResult, setGmailTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Use external formData when provided, otherwise internal state
  const data = externalFormData || internalFormData;
  const updateData = (updater: (prev: any) => any) => {
    if (externalSetFormData) {
      externalSetFormData(updater);
    } else {
      setInternalFormData(updater);
    }
  };

  // Fetch initial settings if running in standalone mode
  useEffect(() => {
    if (!externalFormData) {
      let isMounted = true;
      api.settings.get()
        .then((res: any) => {
          if (!isMounted) return;
          const s = res?.settings || res || {};
          setInternalFormData({
            telegram_bot_token: s.telegram_bot_token || s.telegramBotToken || '',
            telegram_chat_id: s.telegram_chat_id || s.telegramChatId || '',
            telegram_alerts_enabled: Boolean(s.telegram_alerts_enabled ?? s.telegramAlertsEnabled ?? false),
            email_alerts_enabled: s.email_alerts_enabled !== false,
            gmail_user: s.gmail_user || s.gmailUser || s.email || '',
            gmail_app_password: s.gmail_app_password || s.gmailAppPassword || '',
            gmail_from_name: s.gmail_from_name || s.gmailFromName || s.name || 'SarbaazSoft Store Alerts',
            active_alert_provider: (s.active_alert_provider || s.activeAlertProvider || 'both') as AlertProviderMode,
            company_email: s.company_email || s.companyEmail || s.email || '',
          });
          setGmailTestRecipient(s.gmail_user || s.email || '');
        })
        .catch((err) => {
          console.warn('Notice loading notification settings:', err);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setGmailTestRecipient(externalFormData.gmail_user || externalFormData.company_email || '');
    }
  }, [externalFormData]);

  // Handle master mode selection (both, telegram, gmail, none)
  const handleSelectMode = (mode: AlertProviderMode) => {
    updateData((prev: any) => {
      let nextTelegram = prev.telegram_alerts_enabled;
      let nextEmail = prev.email_alerts_enabled;

      if (mode === 'both') {
        nextTelegram = true;
        nextEmail = true;
      } else if (mode === 'telegram') {
        nextTelegram = true;
        nextEmail = false;
      } else if (mode === 'gmail') {
        nextTelegram = false;
        nextEmail = true;
      } else if (mode === 'none') {
        nextTelegram = false;
        nextEmail = false;
      }

      return {
        ...prev,
        active_alert_provider: mode,
        telegram_alerts_enabled: nextTelegram,
        email_alerts_enabled: nextEmail,
      };
    });
  };

  // Test Telegram Bot
  const handleTestTelegram = async () => {
    setIsTestingTelegram(true);
    setTelegramTestResult(null);
    try {
      const res = await api.settings.testTelegram({
        botToken: data.telegram_bot_token,
        chatId: data.telegram_chat_id,
      });
      setTelegramTestResult({
        success: Boolean(res.success),
        message: res.message || (res.success ? '✓ Telegram connection verified! Test alert received.' : 'Telegram test failed.'),
      });
    } catch (err: any) {
      setTelegramTestResult({
        success: false,
        message: err.message || 'Failed to dispatch Telegram test alert.',
      });
    } finally {
      setIsTestingTelegram(false);
    }
  };

  // Test Gmail SMTP
  const handleTestGmail = async () => {
    setIsTestingGmail(true);
    setGmailTestResult(null);
    try {
      const target = gmailTestRecipient.trim() || data.gmail_user || data.company_email;
      const res = await api.settings.testGmail({
        gmailUser: data.gmail_user,
        gmailAppPassword: data.gmail_app_password,
        fromName: data.gmail_from_name,
        recipientEmail: target,
      });
      setGmailTestResult({
        success: Boolean(res.success),
        message: res.message || (res.delivered ? `✓ Test alert delivered successfully to ${target}!` : 'Gmail delivery failed.'),
      });
    } catch (err: any) {
      setGmailTestResult({
        success: false,
        message: err.message || 'Gmail SMTP test failed. Please verify your email and 16-character App Password.',
      });
    } finally {
      setIsTestingGmail(false);
    }
  };

  // Save changes directly (standalone mode or quick save)
  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload = {
        telegram_bot_token: data.telegram_bot_token,
        telegram_chat_id: data.telegram_chat_id,
        telegram_alerts_enabled: data.telegram_alerts_enabled,
        email_alerts_enabled: data.email_alerts_enabled,
        gmail_user: data.gmail_user,
        gmail_app_password: data.gmail_app_password,
        gmail_from_name: data.gmail_from_name,
        active_alert_provider: data.active_alert_provider || 'both',
      };

      const res = await api.settings.post(payload);
      setSaveMessage({
        type: 'success',
        text: '✓ Notification alert providers successfully updated and active.',
      });
      onSaveSuccess?.(res?.settings || payload);
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      setSaveMessage({
        type: 'error',
        text: err?.message || 'Failed to save notification settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center space-x-3 text-slate-500">
        <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs font-medium">Loading alert provider settings...</span>
      </div>
    );
  }

  const currentMode: AlertProviderMode = (data.active_alert_provider as AlertProviderMode) || 'both';

  return (
    <div className="bg-white dark:bg-[#131B2E] rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-sm transition-all overflow-hidden space-y-5">
      {/* PANEL HEADER */}
      <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-indigo-950/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-500/20">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                System Alert Notification Providers
              </h3>
              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1.5 ${
                currentMode === 'both'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                  : currentMode === 'telegram'
                  ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800'
                  : currentMode === 'gmail'
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${currentMode !== 'none' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                {currentMode === 'both' ? 'Both Providers Active' : currentMode === 'telegram' ? 'Telegram Only' : currentMode === 'gmail' ? 'Gmail Only' : 'Alerts Disabled'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-1">
              Configure real-time push alerts for sales, returns, customer exchanges, and inventory updates delivered to your phone and inbox even when POS is closed.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="self-start sm:self-center p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Close settings panel"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="px-5 sm:px-6 space-y-5 pb-5">
        {/* 1. PROVIDER TOGGLE / MODE SELECTOR */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
            Select Active Alert Delivery Channel
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* Mode: Both */}
            <button
              type="button"
              onClick={() => handleSelectMode('both')}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                currentMode === 'both'
                  ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-500 ring-2 ring-purple-500/20 text-purple-950 dark:text-purple-100 shadow-sm'
                  : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  Both Providers
                </span>
                <span className={`w-2 h-2 rounded-full ${currentMode === 'both' ? 'bg-purple-600' : 'bg-transparent'}`} />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Simultaneous Telegram push + Gmail receipts.
              </p>
            </button>

            {/* Mode: Telegram Only */}
            <button
              type="button"
              onClick={() => handleSelectMode('telegram')}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                currentMode === 'telegram'
                  ? 'bg-sky-50/80 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-500/20 text-sky-950 dark:text-sky-100 shadow-sm'
                  : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 -rotate-12" />
                  Telegram Only
                </span>
                <span className={`w-2 h-2 rounded-full ${currentMode === 'telegram' ? 'bg-sky-600' : 'bg-transparent'}`} />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Instant lockscreen sound &amp; vibration alert.
              </p>
            </button>

            {/* Mode: Gmail Only */}
            <button
              type="button"
              onClick={() => handleSelectMode('gmail')}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                currentMode === 'gmail'
                  ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/20 text-rose-950 dark:text-rose-100 shadow-sm'
                  : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  Gmail Only
                </span>
                <span className={`w-2 h-2 rounded-full ${currentMode === 'gmail' ? 'bg-rose-600' : 'bg-transparent'}`} />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                HTML receipt notifications to your inbox.
              </p>
            </button>

            {/* Mode: None */}
            <button
              type="button"
              onClick={() => handleSelectMode('none')}
              className={`p-3 rounded-xl border text-left transition-all duration-200 cursor-pointer relative ${
                currentMode === 'none'
                  ? 'bg-slate-200/80 dark:bg-slate-800 border-slate-400 ring-2 ring-slate-400/20 text-slate-900 dark:text-white shadow-sm'
                  : 'bg-slate-50/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-xs flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-slate-400" />
                  Disable All
                </span>
                <span className={`w-2 h-2 rounded-full ${currentMode === 'none' ? 'bg-slate-600' : 'bg-transparent'}`} />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Temporarily pause all external notifications.
              </p>
            </button>
          </div>
        </div>

        {/* 2. SUB-TABS TO CONFIGURE TELEGRAM & GMAIL */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setActiveTab('both')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'both'
                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Overview &amp; Both Providers</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('telegram')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'telegram'
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Send className="w-3.5 h-3.5 -rotate-12" />
            <span>Telegram Bot API</span>
            {data.telegram_alerts_enabled && (
              <span className="w-2 h-2 rounded-full bg-sky-500" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('gmail')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'gmail'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail SMTP Configuration</span>
            {data.email_alerts_enabled && (
              <span className="w-2 h-2 rounded-full bg-rose-500" />
            )}
          </button>
        </div>

        {/* 3. TAB CONTENT: TELEGRAM BOT SETTINGS */}
        {(activeTab === 'both' || activeTab === 'telegram') && (
          <div className="p-4 sm:p-5 rounded-xl border border-sky-200/80 dark:border-sky-900/50 bg-sky-50/40 dark:bg-sky-950/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-sky-500/20">
                  <Send className="w-4 h-4 -rotate-12 translate-x-0.5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    Telegram Bot Mobile Push
                    <span className="text-[10px] font-mono font-bold bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded border border-sky-200 dark:border-sky-800">
                      Zero Battery Drain
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pushes sales alerts to your personal Telegram or store staff group.
                  </p>
                </div>
              </div>

              {/* Master Telegram Toggle */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {data.telegram_alerts_enabled ? 'Telegram: ON' : 'Telegram: OFF'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={data.telegram_alerts_enabled}
                  onClick={() =>
                    updateData((prev: any) => ({
                      ...prev,
                      telegram_alerts_enabled: !prev.telegram_alerts_enabled,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    data.telegram_alerts_enabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      data.telegram_alerts_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Telegram Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Chat ID */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Telegram Chat ID / Group ID</span>
                  <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <input
                  type="text"
                  value={data.telegram_chat_id || ''}
                  onChange={(e) =>
                    updateData((prev: any) => ({
                      ...prev,
                      telegram_chat_id: e.target.value.trim(),
                    }))
                  }
                  placeholder="e.g. 987654321 or -100123456789"
                  className="w-full h-9.5 px-3 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Message <strong>@userinfobot</strong> on Telegram to instantly receive your numeric Chat ID.
                </p>
              </div>

              {/* Custom Bot Token */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Custom Telegram Bot Token</span>
                  <span className="text-[10px] text-slate-400 font-normal ml-1.5">(Optional)</span>
                </label>
                <div className="relative">
                  <input
                    type={showTelegramToken ? 'text' : 'password'}
                    value={data.telegram_bot_token || ''}
                    onChange={(e) =>
                      updateData((prev: any) => ({
                        ...prev,
                        telegram_bot_token: e.target.value.trim(),
                      }))
                    }
                    placeholder="Leave blank to use platform default bot"
                    className="w-full h-9.5 pl-3 pr-9 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowTelegramToken(!showTelegramToken)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                    title={showTelegramToken ? 'Hide token' : 'Show token'}
                  >
                    {showTelegramToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Create a custom bot with <strong>@BotFather</strong>, or leave empty for SarbaazSoft's standard bot.
                </p>
              </div>
            </div>

            {/* Test Telegram Dispatcher */}
            <div className="pt-2 border-t border-sky-200/60 dark:border-sky-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Verify phone alert delivery:
              </span>
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={isTestingTelegram || !data.telegram_chat_id?.trim()}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
              >
                <Send className={`w-3.5 h-3.5 ${isTestingTelegram ? 'animate-spin' : ''}`} />
                <span>{isTestingTelegram ? 'Sending Test...' : 'Send Test Alert to Telegram'}</span>
              </button>
            </div>

            {telegramTestResult && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 border ${
                  telegramTestResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                {telegramTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{telegramTestResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* 4. TAB CONTENT: GMAIL SMTP SETTINGS */}
        {(activeTab === 'both' || activeTab === 'gmail') && (
          <div className="p-4 sm:p-5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/40 dark:bg-rose-950/20 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-rose-500/20">
                  <Mail className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                    Gmail Provider Alerts (Google SMTP)
                    <span className="text-[10px] font-mono font-bold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded border border-rose-200 dark:border-rose-800">
                      Standard Gmail / Workspace
                    </span>
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Dispatches formatted transactional receipts and system notices via your Gmail account.
                  </p>
                </div>
              </div>

              {/* Master Email Toggle */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {data.email_alerts_enabled ? 'Gmail: ON' : 'Gmail: OFF'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={data.email_alerts_enabled}
                  onClick={() =>
                    updateData((prev: any) => ({
                      ...prev,
                      email_alerts_enabled: !prev.email_alerts_enabled,
                    }))
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                    data.email_alerts_enabled ? 'bg-rose-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                      data.email_alerts_enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Gmail Inputs Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
              {/* Gmail Username */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Gmail Account Address</span>
                  <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={data.gmail_user || ''}
                    onChange={(e) =>
                      updateData((prev: any) => ({
                        ...prev,
                        gmail_user: e.target.value.trim(),
                      }))
                    }
                    placeholder="e.g. yourstore@gmail.com"
                    className="w-full h-9.5 px-3 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Sender email address for SMTP dispatch.
                </p>
              </div>

              {/* 16-Character App Password */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <span>16-Char Google App Password</span>
                  <span className="text-rose-500 ml-1 font-bold">*</span>
                </label>
                <div className="relative">
                  <input
                    type={showGmailPassword ? 'text' : 'password'}
                    value={data.gmail_app_password || ''}
                    onChange={(e) =>
                      updateData((prev: any) => ({
                        ...prev,
                        gmail_app_password: e.target.value.trim(),
                      }))
                    }
                    placeholder="abcd efgh ijkl mnop"
                    className="w-full h-9.5 pl-3 pr-9 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGmailPassword(!showGmailPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-1"
                    title={showGmailPassword ? 'Hide password' : 'Show password'}
                  >
                    {showGmailPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Google Account → Security → 2-Step Verification → App Passwords.
                </p>
              </div>

              {/* Sender Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">
                  <span>Sender Display Name</span>
                </label>
                <input
                  type="text"
                  value={data.gmail_from_name || ''}
                  onChange={(e) =>
                    updateData((prev: any) => ({
                      ...prev,
                      gmail_from_name: e.target.value,
                    }))
                  }
                  placeholder="e.g. SarbaazSoft Store Alerts"
                  className="w-full h-9.5 px-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Shown in customer and owner inboxes.
                </p>
              </div>
            </div>

            {/* Test Gmail Dispatcher */}
            <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 max-w-sm">
                <input
                  type="email"
                  value={gmailTestRecipient}
                  onChange={(e) => setGmailTestRecipient(e.target.value.trim())}
                  placeholder="Send test email to (defaults to Gmail above)"
                  className="w-full h-8.5 px-3 font-mono bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-lg text-xs text-slate-900 dark:text-white"
                />
              </div>

              <button
                type="button"
                onClick={handleTestGmail}
                disabled={isTestingGmail || (!data.gmail_user?.trim() && !gmailTestRecipient.trim())}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
              >
                <Mail className={`w-3.5 h-3.5 ${isTestingGmail ? 'animate-spin' : ''}`} />
                <span>{isTestingGmail ? 'Dispatching...' : 'Send Test Alert via Gmail'}</span>
              </button>
            </div>

            {gmailTestResult && (
              <div
                className={`p-3 rounded-xl text-xs font-semibold flex items-start gap-2 border ${
                  gmailTestResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}
              >
                {gmailTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{gmailTestResult.message}</span>
              </div>
            )}
          </div>
        )}

        {/* 5. SAVE BUTTON & FEEDBACK BANNER */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>Credentials are securely encrypted in your store's private isolated tenant database.</span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Close
              </button>
            )}

            <button
              type="button"
              onClick={handleSaveSettings}
              disabled={isSaving}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 flex items-center justify-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
              <span>{isSaving ? 'Saving Providers...' : 'Save Alert Provider Settings'}</span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
              saveMessage.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
            }`}
          >
            {saveMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <span>{saveMessage.text}</span>
          </div>
        )}
      </div>
    </div>
  );
};
