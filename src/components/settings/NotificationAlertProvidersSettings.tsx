import React, { useState, useEffect } from 'react';
import {
  Flame,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Save,
  RefreshCw,
  Send,
  X,
  BellRing,
  Laptop,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { requestFcmDeviceToken, getStoredFcmToken } from '../../services/firebaseConfig.ts';

interface NotificationAlertProvidersSettingsProps {
  formData?: any;
  setFormData?: React.Dispatch<React.SetStateAction<any>>;
  isEmbeddedInForm?: boolean;
  embedded?: boolean;
  onSaveSuccess?: (updated?: any) => void;
  onClose?: () => void;
}

export const NotificationAlertProvidersSettings: React.FC<NotificationAlertProvidersSettingsProps> = ({
  embedded = false,
  onSaveSuccess,
  onClose,
}) => {
  const [fcmSettings, setFcmSettings] = useState({
    FCM_PROJECT_ID: '',
    FCM_CLIENT_EMAIL: '',
    FCM_PRIVATE_KEY: '',
    FCM_API_KEY: '',
    FCM_MESSAGING_SENDER_ID: '',
    FCM_APP_ID: '',
    FCM_MEASUREMENT_ID: '',
    FCM_VAPID_KEY: '',
  });

  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password / Private Key visibility
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  // Test push state
  const [isTestingPush, setIsTestingPush] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Device registration state
  const [isSubscribingThisDevice, setIsSubscribingThisDevice] = useState(false);
  const [thisDeviceSubscribed, setThisDeviceSubscribed] = useState(false);
  const [deviceStats, setDeviceStats] = useState<{
    configured: boolean;
    projectId: string;
    totalTokens: number;
    tokensByRole: Record<string, number>;
  }>({
    configured: false,
    projectId: '',
    totalTokens: 0,
    tokensByRole: {},
  });

  // Load app settings from server
  const loadSettings = async () => {
    setLoading(true);
    try {
      const [appSettingsRes, statsRes] = await Promise.all([
        api.settings.getAppSettings().catch(() => null),
        api.notifications.getFcmStats().catch(() => null),
      ]);

      if (appSettingsRes?.appSettings) {
        const s = appSettingsRes.appSettings;
        setFcmSettings({
          FCM_PROJECT_ID: s.FCM_PROJECT_ID || '',
          FCM_CLIENT_EMAIL: s.FCM_CLIENT_EMAIL || '',
          FCM_PRIVATE_KEY: s.FCM_PRIVATE_KEY || '',
          FCM_API_KEY: s.FCM_API_KEY || '',
          FCM_MESSAGING_SENDER_ID: s.FCM_MESSAGING_SENDER_ID || '',
          FCM_APP_ID: s.FCM_APP_ID || '',
          FCM_MEASUREMENT_ID: s.FCM_MEASUREMENT_ID || '',
          FCM_VAPID_KEY: s.FCM_VAPID_KEY || '',
        });
      }

      if (statsRes) {
        setDeviceStats(statsRes);
      }

      setThisDeviceSubscribed(Boolean(getStoredFcmToken()));
    } catch (err: any) {
      console.warn('Could not load FCM settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (key: keyof typeof fcmSettings, value: string) => {
    setFcmSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    try {
      await api.settings.saveAppSettings({
        FCM_PROJECT_ID: fcmSettings.FCM_PROJECT_ID.trim(),
        FCM_CLIENT_EMAIL: fcmSettings.FCM_CLIENT_EMAIL.trim(),
        FCM_PRIVATE_KEY: fcmSettings.FCM_PRIVATE_KEY.trim(),
        FCM_API_KEY: fcmSettings.FCM_API_KEY.trim(),
        FCM_MESSAGING_SENDER_ID: fcmSettings.FCM_MESSAGING_SENDER_ID.trim(),
        FCM_APP_ID: fcmSettings.FCM_APP_ID.trim(),
        FCM_MEASUREMENT_ID: fcmSettings.FCM_MEASUREMENT_ID.trim(),
        FCM_VAPID_KEY: fcmSettings.FCM_VAPID_KEY.trim(),
      });

      setSaveMessage({
        type: 'success',
        text: 'Firebase Cloud Messaging credentials saved successfully!',
      });

      await loadSettings();
      if (onSaveSuccess) onSaveSuccess();
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      setSaveMessage({
        type: 'error',
        text: err?.message || 'Failed to save Firebase configuration.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestPush = async () => {
    setIsTestingPush(true);
    setTestResult(null);

    try {
      const res = await api.notifications.testFcm({
        title: '🔥 Firebase Cloud Messaging Test',
        message: `FCM push delivery confirmed at ${new Date().toLocaleTimeString()}! Real-time alerts are operational.`,
      });

      setTestResult({
        success: res.success,
        message: res.message || (res.success ? '✓ Test push notification dispatched!' : 'Failed to deliver test alert.'),
      });

      const stats = await api.notifications.getFcmStats().catch(() => null);
      if (stats) setDeviceStats(stats);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Error triggering test FCM push alert.',
      });
    } finally {
      setIsTestingPush(false);
    }
  };

  const handleSubscribeThisDevice = async () => {
    setIsSubscribingThisDevice(true);
    try {
      const res = await requestFcmDeviceToken('ADMIN');
      if (res.success) {
        setThisDeviceSubscribed(true);
        const stats = await api.notifications.getFcmStats().catch(() => null);
        if (stats) setDeviceStats(stats);
        setTestResult({
          success: true,
          message: '✓ This device is now registered to receive Firebase push notifications!',
        });
      } else {
        setTestResult({
          success: false,
          message: res.error || 'Failed to subscribe this device.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to request notification permission.',
      });
    } finally {
      setIsSubscribingThisDevice(false);
    }
  };

  const isBackendConfigured = Boolean(
    fcmSettings.FCM_PROJECT_ID && fcmSettings.FCM_CLIENT_EMAIL && fcmSettings.FCM_PRIVATE_KEY
  );

  const isClientConfigured = Boolean(
    fcmSettings.FCM_PROJECT_ID && fcmSettings.FCM_API_KEY && fcmSettings.FCM_APP_ID
  );

  if (loading) {
    return (
      <div className="p-8 text-center bg-white dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm">
        <RefreshCw className="w-6 h-6 animate-spin text-purple-600 mx-auto mb-2" />
        <span className="text-xs text-slate-500 dark:text-slate-400">Loading FCM configuration...</span>
      </div>
    );
  }

  const content = (
    <div className="space-y-5">
      {/* STATUS METRICS OVERVIEW */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-purple-900/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Push Provider</span>
          <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono mt-0.5 flex items-center gap-1">
            <Flame className="w-3.5 h-3.5 fill-amber-500" /> Firebase FCM
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-purple-900/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Admin SDK Status</span>
          <span
            className={`text-xs font-bold font-mono mt-0.5 ${
              isBackendConfigured ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isBackendConfigured ? '✓ Initialized' : 'Keys Needed'}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-purple-900/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">Registered Devices</span>
          <span className="text-xs font-bold text-purple-600 dark:text-purple-400 font-mono mt-0.5 flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5" />
            {deviceStats.totalTokens} Device(s)
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-purple-900/40">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">This Browser</span>
          <span
            className={`text-xs font-bold font-mono mt-0.5 flex items-center gap-1 ${
              thisDeviceSubscribed ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Laptop className="w-3.5 h-3.5" />
            {thisDeviceSubscribed ? 'Subscribed' : 'Not Subscribed'}
          </span>
        </div>
      </div>

      {/* SECTION 1: BACKEND FIREBASE ADMIN SDK KEYS */}
      <div className="space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-purple-900/40">
          <Key className="w-4 h-4 text-amber-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Backend Firebase Admin SDK Credentials
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Firebase Project ID</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_PROJECT_ID)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_PROJECT_ID}
              onChange={(e) => handleChange('FCM_PROJECT_ID', e.target.value.trim())}
              placeholder="e.g. shoe-pos-app-12345"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Service Account Client Email</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_CLIENT_EMAIL)</code>
            </label>
            <input
              type="email"
              value={fcmSettings.FCM_CLIENT_EMAIL}
              onChange={(e) => handleChange('FCM_CLIENT_EMAIL', e.target.value.trim())}
              placeholder="e.g. firebase-adminsdk-xyz@shoe-pos-app.iam.gserviceaccount.com"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200">
              <span>Service Account Private Key (PEM)</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_PRIVATE_KEY)</code>
            </label>
            <button
              type="button"
              onClick={() => setShowPrivateKey(!showPrivateKey)}
              className="text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 flex items-center gap-1 cursor-pointer font-medium"
            >
              {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showPrivateKey ? 'Hide Key' : 'Reveal Key'}</span>
            </button>
          </div>
          <textarea
            rows={4}
            value={showPrivateKey ? fcmSettings.FCM_PRIVATE_KEY : fcmSettings.FCM_PRIVATE_KEY ? '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••\n[Private Key Stored Securely]' : ''}
            onChange={(e) => handleChange('FCM_PRIVATE_KEY', e.target.value)}
            placeholder="-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----"
            className="w-full p-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20 leading-relaxed"
          />
        </div>
      </div>

      {/* SECTION 2: FRONTEND FIREBASE WEB CLIENT KEYS */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-purple-900/40">
          <Smartphone className="w-4 h-4 text-purple-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Frontend Firebase Web Client Configuration
          </h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Web API Key</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_API_KEY)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_API_KEY}
              onChange={(e) => handleChange('FCM_API_KEY', e.target.value.trim())}
              placeholder="AIzaSy..."
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Messaging Sender ID</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_MESSAGING_SENDER_ID)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_MESSAGING_SENDER_ID}
              onChange={(e) => handleChange('FCM_MESSAGING_SENDER_ID', e.target.value.trim())}
              placeholder="e.g. 104857291039"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Web App ID</span>
              <span className="text-rose-500 ml-1 font-bold">*</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_APP_ID)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_APP_ID}
              onChange={(e) => handleChange('FCM_APP_ID', e.target.value.trim())}
              placeholder="1:104857291039:web:abcdef"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Web Push Certificate / VAPID Key</span>
              <span className="text-[10px] text-slate-400 font-normal ml-1">(Optional)</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_VAPID_KEY)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_VAPID_KEY}
              onChange={(e) => handleChange('FCM_VAPID_KEY', e.target.value.trim())}
              placeholder="e.g. BEl62iUY... (Web Push Key Pair)"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
              <span>Analytics Measurement ID</span>
              <span className="text-[10px] text-slate-400 font-normal ml-1">(Optional)</span>
              <code className="text-[10px] text-purple-600 dark:text-purple-400 font-mono ml-1.5">(FCM_MEASUREMENT_ID)</code>
            </label>
            <input
              type="text"
              value={fcmSettings.FCM_MEASUREMENT_ID}
              onChange={(e) => handleChange('FCM_MEASUREMENT_ID', e.target.value.trim())}
              placeholder="G-XXXXXXX"
              className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-[#060B18]/90 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-purple-600 focus:ring-2 focus:ring-purple-600/20"
            />
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {saveMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
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

      {testResult && (
        <div
          className={`p-3.5 rounded-xl text-xs font-semibold flex items-start gap-2.5 border ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'
          }`}
        >
          {testResult.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1">
            <span>{testResult.message}</span>
          </div>
        </div>
      )}

      {/* ACTION BAR */}
      <div className="pt-4 border-t border-slate-100 dark:border-purple-900/40 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSubscribeThisDevice}
            disabled={isSubscribingThisDevice}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <BellRing className={`w-3.5 h-3.5 text-purple-500 ${isSubscribingThisDevice ? 'animate-spin' : ''}`} />
            <span>{thisDeviceSubscribed ? 'Re-register This Device' : 'Enable Push on This Device'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestPush}
            disabled={isTestingPush || !isBackendConfigured}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
            title={!isBackendConfigured ? 'Save Firebase credentials first to enable test push' : 'Send test FCM push notification'}
          >
            <Send className={`w-3.5 h-3.5 ${isTestingPush ? 'animate-spin' : ''}`} />
            <span>{isTestingPush ? 'Dispatching...' : 'Test Push Alert (FCM)'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving}
            className="w-full sm:w-auto px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-md shadow-purple-600/25 active:scale-95"
          >
            <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
            <span>{isSaving ? 'Saving...' : 'Save Firebase Credentials'}</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="bg-white dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm overflow-hidden transition-colors">
      {/* HEADER SECTION */}
      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-purple-900/40 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-purple-500/5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-orange-500/20">
              <Flame className="w-6 h-6 fill-white stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Firebase Cloud Messaging (FCM)
                </h3>
                <span
                  className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border flex items-center gap-1.5 ${
                    isBackendConfigured && isClientConfigured
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isBackendConfigured && isClientConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                    }`}
                  />
                  {isBackendConfigured && isClientConfigured ? 'FCM Active' : 'Setup Required'}
                </span>
              </div>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {content}
      </div>
    </div>
  );
};
