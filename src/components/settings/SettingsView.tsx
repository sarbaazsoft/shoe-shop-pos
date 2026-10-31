import React, { useState, useEffect, useRef } from 'react';
import { Store, Users, Globe, Trash2, CheckCircle2, AlertCircle, ExternalLink, Printer, Building2, Phone, Mail, MapPin, Coins, Hash, Link, ShieldCheck, ShieldAlert, Lock, Server, RefreshCw, Sparkles, Eye, EyeOff, Unlock, UserPlus, X, TrendingUp, Camera, Upload, Image as ImageIcon, Calendar, Sliders, Bell, Cpu, KeyRound, Receipt, Save } from 'lucide-react';
import { api } from '../../services/api.ts';
import { PrinterHardwareSettings } from './PrinterHardwareSettings.tsx';
import { DataBackupRestore } from './DataBackupRestore.tsx';
import { UserAvatar } from '../common/UserAvatar.tsx';
import { motion, AnimatePresence } from 'motion/react';
import { CreateStaffModal } from './CreateStaffModal.tsx';
import { useScrollActiveTab } from '../../hooks/useScrollActiveTab.ts';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat.ts';
import { calculateDaysLeft, daysLeft, normalizeSubscriptionPlan, normalizeSubscriptionType, isFreeTrial, getSubscriptionLabel, getSubscriptionShortLabel, RENEWAL_TEMPLATE_CHIPS, getRenewalMessageTemplate, resolveDefaultRenewalTemplateType, type RenewalTemplateType } from '../../utils/subscription.ts';

interface SettingsViewProps {
  currentUser: any;
  companySettings: any;
  onSettingsUpdated: (updatedSettings?: any) => void;
  onOpenInstallWizard?: () => void;
  initialTab?: 'store' | 'users' | 'app_settings' | 'printers' | 'backup' | 'install';
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  companySettings,
  onSettingsUpdated,
  onOpenInstallWizard,
  initialTab,
}) => {
  const userRole = (currentUser?.role || '').toUpperCase();
  const isSuperAdmin = userRole === 'SUPERADMIN';
  const isPlatformOwner = isSuperAdmin;
  const isStoreAdmin = userRole === 'ADMIN';
  const isCashier = userRole === 'CASHIER';
  const isAdmin = isStoreAdmin;

  // Strict role-based active tab initialization:
  // - Platform Owner (SUPERADMIN): strictly restricted to app-level configs ('app_settings', 'backup', 'install')
  // - Store Owner (ADMIN): store management tabs ('store', 'users', 'printers')
  // - Cashiers: strictly constrained to 'printers'
  const [activeTab, setActiveTab] = useState<'store' | 'users' | 'app_settings' | 'printers' | 'backup' | 'install'>(() => {
    if (isSuperAdmin) {
      if (initialTab && ['app_settings', 'backup', 'install'].includes(initialTab)) {
        return initialTab;
      }
      return 'app_settings';
    }
    if (isCashier) {
      return 'printers';
    }
    // Store Admin (ADMIN)
    if (initialTab && ['store', 'users', 'printers'].includes(initialTab)) {
      return initialTab;
    }
    return 'store';
  });

  const handleSelectTab = (tab: 'store' | 'users' | 'app_settings' | 'printers' | 'backup' | 'install') => {
    if (isSuperAdmin) {
      if (['app_settings', 'backup', 'install'].includes(tab)) {
        setActiveTab(tab);
      } else {
        setActiveTab('app_settings');
      }
      return;
    }
    if (isCashier) {
      setActiveTab('printers');
      return;
    }
    // Store Admin (ADMIN)
    if (['store', 'users', 'printers'].includes(tab)) {
      setActiveTab(tab);
    } else {
      setActiveTab('store');
    }
  };

  const { containerRef: settingsTabContainerRef } = useScrollActiveTab<HTMLDivElement>(activeTab, {
    padding: 16,
    behavior: 'smooth',
  });

  useEffect(() => {
    if (isSuperAdmin) {
      if (!['app_settings', 'backup', 'install'].includes(activeTab)) {
        setActiveTab(initialTab && ['app_settings', 'backup', 'install'].includes(initialTab) ? initialTab : 'app_settings');
      }
    } else if (isCashier) {
      if (activeTab !== 'printers') {
        setActiveTab('printers');
      }
    } else {
      // Store Admin (ADMIN)
      if (!['store', 'users', 'printers'].includes(activeTab)) {
        setActiveTab(initialTab && ['store', 'users', 'printers'].includes(initialTab) ? initialTab : 'store');
      }
    }
  }, [isSuperAdmin, isStoreAdmin, isCashier, initialTab]);

  // Store Subscription Info State
  const extractSubInfo = (src: any) => {
    const sub = src?.subscriptionInfo || src || {};
    const rawPlan =
      sub?.subscriptionPlan ||
      sub?.subscription_plan ||
      src?.subscriptionPlan ||
      src?.subscription_plan ||
      sub?.plan ||
      src?.plan;
    const subscriptionPlan = normalizeSubscriptionPlan(
      rawPlan || sub?.subscriptionType || sub?.subscription_type || src?.subscriptionType || src?.subscription_type
    );
    const subscriptionType = normalizeSubscriptionType(
      subscriptionPlan !== 'free_tier'
        ? subscriptionPlan
        : sub?.subscriptionType || sub?.subscription_type || src?.subscriptionType || src?.subscription_type || 'free_tier'
    );
    const isTrial = subscriptionPlan === 'free_tier';
    const subscriptionStartDate =
      sub?.subscriptionStartDate ||
      sub?.subscription_start_date ||
      sub?.startDate ||
      src?.subscriptionStartDate ||
      src?.subscription_start_date ||
      new Date().toISOString();
    const defaultEnd = new Date(subscriptionStartDate);
    if (isTrial) {
      defaultEnd.setDate(defaultEnd.getDate() + 30);
    } else if (subscriptionPlan === '6_MONTHS') {
      defaultEnd.setMonth(defaultEnd.getMonth() + 6);
    } else {
      defaultEnd.setFullYear(defaultEnd.getFullYear() + 1);
    }
    const subscriptionEndDate =
      sub?.subscriptionEndDate ||
      sub?.subscription_end_date ||
      sub?.endDate ||
      src?.subscriptionEndDate ||
      src?.subscription_end_date ||
      defaultEnd.toISOString();
    const endMs = new Date(subscriptionEndDate).getTime();
    const daysRemaining = calculateDaysLeft(subscriptionEndDate, new Date(), subscriptionPlan);
    const rawStatus = String(
      sub?.subscriptionStatus ||
        sub?.subscription_status ||
        sub?.status ||
        src?.subscriptionStatus ||
        src?.subscription_status ||
        (!Number.isNaN(endMs) && endMs < Date.now() ? 'EXPIRED' : 'ACTIVE')
    ).toUpperCase();
    const subscriptionStatus = ['ACTIVE', 'EXPIRED', 'SUSPENDED'].includes(rawStatus)
      ? rawStatus
      : 'ACTIVE';
    const pendingRenewalRequest =
      sub?.pendingRenewalRequest ||
      src?.pendingRenewalRequest ||
      null;

    return {
      subscriptionType,
      subscriptionPlan,
      subscriptionStartDate,
      subscriptionEndDate,
      subscriptionStatus,
      daysRemaining,
      daysLeft: daysRemaining,
      isTrial,
      isExpired: (!Number.isNaN(endMs) && endMs < Date.now()) || subscriptionStatus === 'EXPIRED',
      pendingRenewalRequest,
    };
  };

  const [subscriptionInfo, setSubscriptionInfo] = useState(() =>
    extractSubInfo(companySettings)
  );


  // Subscription Renewal Request Modal State
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedRenewalPlan, setSelectedRenewalPlan] = useState<'6_MONTHS' | 'YEARLY'>(() =>
    extractSubInfo(companySettings).subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY'
  );
  const [activeTemplateChip, setActiveTemplateChip] = useState<RenewalTemplateType>(() =>
    resolveDefaultRenewalTemplateType(
      companySettings?.subscriptionStatus || companySettings?.subscription_status,
      companySettings?.subscriptionPlan || companySettings?.subscription_plan
    )
  );
  const [hasUserEditedNotes, setHasUserEditedNotes] = useState(false);
  const [renewalNotes, setRenewalNotes] = useState<string>(() => {
    const initialPlan = extractSubInfo(companySettings).subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY';
    const initType = resolveDefaultRenewalTemplateType(
      companySettings?.subscriptionStatus || companySettings?.subscription_status,
      companySettings?.subscriptionPlan || companySettings?.subscription_plan
    );
    return getRenewalMessageTemplate(initType, initialPlan);
  });
  const [isSubmittingRenewal, setIsSubmittingRenewal] = useState(false);
  const [renewalSuccessMessage, setRenewalSuccessMessage] = useState<string | null>(null);
  const [renewalErrorMessage, setRenewalErrorMessage] = useState<string | null>(null);
  const hasAutoPromptedExpiredRef = useRef(false);

  // Automatically display the 'Renew' modal if the store subscription status is EXPIRED
  useEffect(() => {
    const currentStatus = String(
      subscriptionInfo.subscriptionStatus ||
        companySettings?.subscriptionStatus ||
        companySettings?.subscription_status ||
        ''
    ).toUpperCase();
    if (currentStatus === 'EXPIRED' && !hasAutoPromptedExpiredRef.current) {
      hasAutoPromptedExpiredRef.current = true;
      const plan = subscriptionInfo.subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY';
      setSelectedRenewalPlan(plan);
      setActiveTemplateChip('REACTIVATION');
      setHasUserEditedNotes(false);
      setRenewalNotes(getRenewalMessageTemplate('REACTIVATION', plan));
      setIsRenewModalOpen(true);
    }
  }, [subscriptionInfo.subscriptionStatus, subscriptionInfo.subscriptionPlan, companySettings?.subscriptionStatus, companySettings?.subscription_status]);

  const handleOpenRenewModal = () => {
    setRenewalErrorMessage(null);
    setRenewalSuccessMessage(null);
    const plan = subscriptionInfo.subscriptionPlan === '6_MONTHS' ? '6_MONTHS' : 'YEARLY';
    setSelectedRenewalPlan(plan);
    const defaultType = resolveDefaultRenewalTemplateType(
      subscriptionInfo.subscriptionStatus,
      subscriptionInfo.subscriptionPlan
    );
    setActiveTemplateChip(defaultType);
    setHasUserEditedNotes(false);
    setRenewalNotes(getRenewalMessageTemplate(defaultType, plan));
    setIsRenewModalOpen(true);
  };

  const handleSelectRenewalPlan = (plan: '6_MONTHS' | 'YEARLY') => {
    setSelectedRenewalPlan(plan);
    if (!hasUserEditedNotes) {
      setRenewalNotes(getRenewalMessageTemplate(activeTemplateChip, plan));
    }
  };

  const handleSelectTemplateChip = (chipType: RenewalTemplateType) => {
    setActiveTemplateChip(chipType);
    setHasUserEditedNotes(false);
    setRenewalNotes(getRenewalMessageTemplate(chipType, selectedRenewalPlan));
  };

  const handleRequestSubscriptionRenewal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSubmittingRenewal(true);
    setRenewalErrorMessage(null);
    setRenewalSuccessMessage(null);
    try {
      const res = await api.settings.requestSubscriptionRenewal({
        plan: selectedRenewalPlan,
        notes: renewalNotes.trim() || undefined,
      });
      const pendingReq = res?.request || {
        plan: selectedRenewalPlan,
        status: 'PENDING',
        requestType: 'RENEWAL',
        createdAt: new Date().toISOString(),
        notes: renewalNotes.trim(),
      };
      setSubscriptionInfo((prev) => ({
        ...prev,
        pendingRenewalRequest: pendingReq,
      }));
      setRenewalSuccessMessage(
        res?.message ||
          'Subscription renewal request has been sent to the SuperAdmin for approval.'
      );
      setRenewalNotes('');
      onSettingsUpdated();
    } catch (err: any) {
      setRenewalErrorMessage(
        err?.message || 'Failed to submit subscription renewal request to SuperAdmin.'
      );
    } finally {
      setIsSubmittingRenewal(false);
    }
  };

  // Store Settings Form
  const [formData, setFormData] = useState({
    company_name: companySettings?.company_name || companySettings?.companyName || companySettings?.name || '',
    company_phone: companySettings?.company_phone || companySettings?.companyPhone || companySettings?.phone || '',
    company_email: companySettings?.company_email || companySettings?.companyEmail || companySettings?.email || '',
    company_address: companySettings?.company_address || companySettings?.companyAddress || companySettings?.address || '',
    strn: companySettings?.strn || '',
    tax_id: companySettings?.tax_id || companySettings?.taxId || companySettings?.tax_number || companySettings?.taxNumber || '',
    website: companySettings?.website || '',
    logo: companySettings?.logo || '',
    show_receipt_logo: Boolean(companySettings?.show_receipt_logo ?? companySettings?.showReceiptLogo ?? false),
    receipt_logo: companySettings?.receipt_logo || companySettings?.receiptLogo || companySettings?.logo || '',

    currency_name: companySettings?.currency_name || companySettings?.currencyName || 'Pakistani Rupee',
    currency_symbol: companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.',


    currency: companySettings?.currency || 'PKR',
    business_type: String(companySettings?.business_type || companySettings?.businessType || 'RETAIL').toUpperCase() as 'RETAIL' | 'WHOLESALE',
    min_selling_quantity: Number(
      companySettings?.min_selling_quantity ??
      companySettings?.minSellingQuantity ??
      ((companySettings?.allow_half_carton === false || companySettings?.allowHalfCarton === false) ? 1.0 : 0.5)
    ),
    allow_half_carton: (
      companySettings?.allow_half_carton !== undefined
        ? Boolean(companySettings.allow_half_carton)
        : (companySettings?.allowHalfCarton !== undefined
            ? Boolean(companySettings.allowHalfCarton)
            : true)
    ),
    invoice_footer: companySettings?.invoice_footer || companySettings?.invoiceFooter || 'Exchanges accepted within 7 days with original sales receipt. Thank you for shopping with us!',
    low_stock_limit: companySettings?.low_stock_limit || companySettings?.lowStockLimit || 5,
    pricingMode: (companySettings?.pricingMode || 'FIXED').toUpperCase(),
    pricing_policy_locked: Boolean(
      companySettings?.pricing_policy_locked ??
      companySettings?.pricingPolicyLocked ??
      true
    ),
    subscription_plan: extractSubInfo(companySettings).subscriptionPlan,
    subscription_start_date: extractSubInfo(companySettings).subscriptionStartDate,
    subscription_end_date: extractSubInfo(companySettings).subscriptionEndDate,
    subscription_status: extractSubInfo(companySettings).subscriptionStatus,
  });

  useEffect(() => {
    let mounted = true;
    Promise.all([
      api.settings.get().catch(() => null),
      api.settings.getSubscription().catch(() => null),
    ]).then(([res, subRes]) => {
      if (!mounted) return;
      const s = res?.settings;
      const mergedSub = extractSubInfo({
        ...(s || {}),
        ...(subRes || {}),
        subscriptionInfo: subRes?.subscriptionInfo || s?.subscriptionInfo,
      });
      setSubscriptionInfo(mergedSub);

      if (s) {
        setFormData({
          company_name: s?.company_name || s?.companyName || s?.name || '',
          company_phone: s?.company_phone || s?.companyPhone || s?.phone || '',
          company_email: s?.company_email || s?.companyEmail || s?.email || '',
          company_address: s?.company_address || s?.companyAddress || s?.address || '',
          strn: s?.strn || '',
          tax_id: s?.tax_id || s?.taxId || s?.tax_number || s?.taxNumber || '',
          website: s?.website || '',
          logo: s?.logo || '',
          show_receipt_logo: Boolean(s?.show_receipt_logo ?? s?.showReceiptLogo ?? false),
          receipt_logo: s?.receipt_logo || s?.receiptLogo || s?.logo || '',

          currency_name: s?.currency_name || s?.currencyName || 'Pakistani Rupee',
          currency_symbol: s?.currency_symbol || s?.currencySymbol || 'Rs.',


          currency: s?.currency || 'PKR',
          business_type: String(s?.business_type || s?.businessType || 'RETAIL').toUpperCase() as 'RETAIL' | 'WHOLESALE',
          min_selling_quantity: Number(
            s?.min_selling_quantity ??
            s?.minSellingQuantity ??
            ((s?.allow_half_carton === false || s?.allowHalfCarton === false) ? 1.0 : 0.5)
          ),
          allow_half_carton: (
            s?.allow_half_carton !== undefined
              ? Boolean(s.allow_half_carton)
              : (s?.allowHalfCarton !== undefined
                  ? Boolean(s.allowHalfCarton)
                  : true)
          ),
          invoice_footer: s?.invoice_footer || s?.invoiceFooter || '',
          low_stock_limit: s?.low_stock_limit || s?.lowStockLimit || 5,
          pricingMode: (s?.pricingMode || 'FIXED').toUpperCase(),
          pricing_policy_locked: Boolean(
            s?.pricing_policy_locked ??
            s?.pricingPolicyLocked ??
            true
          ),
          subscription_plan: mergedSub.subscriptionPlan,
          subscription_start_date: mergedSub.subscriptionStartDate,
          subscription_end_date: mergedSub.subscriptionEndDate,
          subscription_status: mergedSub.subscriptionStatus,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (companySettings) {
      const nextSub = extractSubInfo(companySettings);
      setSubscriptionInfo(nextSub);
      setFormData({
        company_name: companySettings?.company_name || companySettings?.companyName || companySettings?.name || '',
        company_phone: companySettings?.company_phone || companySettings?.companyPhone || companySettings?.phone || '',
        company_email: companySettings?.company_email || companySettings?.companyEmail || companySettings?.email || '',
        company_address: companySettings?.company_address || companySettings?.companyAddress || companySettings?.address || '',
        strn: companySettings?.strn || '',
        tax_id: companySettings?.tax_id || companySettings?.taxId || companySettings?.tax_number || companySettings?.taxNumber || '',
        website: companySettings?.website || '',
        logo: companySettings?.logo || '',
        show_receipt_logo: Boolean(companySettings?.show_receipt_logo ?? companySettings?.showReceiptLogo ?? false),
        receipt_logo: companySettings?.receipt_logo || companySettings?.receiptLogo || companySettings?.logo || '',

        currency_name: companySettings?.currency_name || companySettings?.currencyName || 'Pakistani Rupee',
        currency_symbol: companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.',


        currency: companySettings?.currency || 'PKR',
        business_type: String(
          companySettings?.business_type || companySettings?.businessType || 'RETAIL'
        ).toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL',
        min_selling_quantity: Number(
          companySettings?.min_selling_quantity ??
          companySettings?.minSellingQuantity ??
          ((companySettings?.allow_half_carton === false || companySettings?.allowHalfCarton === false) ? 1.0 : 0.5)
        ),
        allow_half_carton: (
          companySettings?.allow_half_carton !== undefined
            ? Boolean(companySettings.allow_half_carton)
            : (companySettings?.allowHalfCarton !== undefined
                ? Boolean(companySettings.allowHalfCarton)
                : true)
        ),
        invoice_footer: companySettings?.invoice_footer || companySettings?.invoiceFooter || '',
        low_stock_limit: companySettings?.low_stock_limit || companySettings?.lowStockLimit || 5,
        pricingMode: String(companySettings?.pricingMode || 'FIXED').toUpperCase(),
        pricing_policy_locked: Boolean(
          companySettings?.pricing_policy_locked ??
          companySettings?.pricingPolicyLocked ??
          true
        ),
        subscription_plan: nextSub.subscriptionPlan,
        subscription_start_date: nextSub.subscriptionStartDate,
        subscription_end_date: nextSub.subscriptionEndDate,
        subscription_status: nextSub.subscriptionStatus,
      });
    }
  }, [companySettings]);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsSuccess, setSettingsSuccess] = useState(false);

  // Active Free Trial Determination
  const effectiveSubPlan =
    subscriptionInfo.subscriptionPlan ||
    formData.subscription_plan ||
    companySettings?.subscriptionPlan ||
    companySettings?.subscription_plan;

  const isTrialActive =
    effectiveSubPlan === '6_MONTHS' ||
    effectiveSubPlan === 'YEARLY' ||
    String(effectiveSubPlan) === '6_months' ||
    String(effectiveSubPlan) === '1_year'
      ? false
      : Boolean(
          effectiveSubPlan === 'free_tier' ||
          (subscriptionInfo as any).isTrial ||
          isFreeTrial(effectiveSubPlan)
        );

  // Receipt Logo Upload & Camera Capture State
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const logoCameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const processLogoImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 240;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL('image/png', 0.9);
          setFormData((prev) => ({
            ...prev,
            receipt_logo: dataUrl,
            logo: dataUrl,
            show_receipt_logo: true,
          }));
        }
      };
      if (typeof ev.target?.result === 'string') {
        img.src = ev.target.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processLogoImageFile(file);
    }
    e.target.value = '';
  };

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  const handleOpenCameraForLogo = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      logoCameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      setCameraStream(stream);
      setIsCameraOpen(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);
    } catch {
      logoCameraInputRef.current?.click();
    }
  };

  const handleCaptureCameraLogo = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const vw = video.videoWidth || 320;
    const vh = video.videoHeight || 240;
    const maxDim = 240;
    let w = vw;
    let h = vh;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/png', 0.9);
      setFormData((prev) => ({
        ...prev,
        receipt_logo: dataUrl,
        logo: dataUrl,
        show_receipt_logo: true,
      }));
    }
    stopCameraStream();
  };

  // Users Management
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);
  const [deleteUserError, setDeleteUserError] = useState<string | null>(null);

  // Server Installation Status & Lockdown
  const [installStatus, setInstallStatus] = useState<any | null>(null);
  const [isLoadingInstallStatus, setIsLoadingInstallStatus] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingInstall, setIsResettingInstall] = useState(false);
  const [isLockingInstall, setIsLockingInstall] = useState(false);
  const [dropTablesOnUnlock, setDropTablesOnUnlock] = useState(false);
  const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Overall settings refresh state & guards
  const [appSettingsForm, setAppSettingsForm] = useState<Record<string, string>>({
    RESEND_API_KEY: '',
    RESEND_FROM: 'SarbaazSoft Shoe POS <noreply@sarbaazsoft.com>',
    EMAIL_WEBHOOK_URL: '',
    RESEND_WEBHOOK_URL: '',
    VAPID_PUBLIC_KEY: '',
    VAPID_PRIVATE_KEY: '',
    VAPID_SUBJECT: 'mailto:support@sarbaazsoft.com',
    SW_KILL_SWITCH: 'false',
    DISABLE_HMR: 'false',
  });
  const [appSettingsGrouped, setAppSettingsGrouped] = useState<Record<string, any[]>>({});
  const [isLoadingAppSettings, setIsLoadingAppSettings] = useState(false);
  const [isSavingAppSettings, setIsSavingAppSettings] = useState(false);
  const [appSettingsSuccess, setAppSettingsSuccess] = useState(false);
  const [appSettingsError, setAppSettingsError] = useState<string | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, boolean>>({});
  const hasLoadedAppSettingsRef = useRef(false);

  const toggleSecretVisibility = (key: string) => {
    setRevealedSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadAppSettings = async () => {
    setIsLoadingAppSettings(true);
    setAppSettingsError(null);
    try {
      const res = await api.settings.getAppSettings();
      if (res?.appSettings) {
        setAppSettingsForm((prev) => ({ ...prev, ...res.appSettings }));
      }
      if (res?.appSettingsGrouped) {
        setAppSettingsGrouped(res.appSettingsGrouped);
      }
      hasLoadedAppSettingsRef.current = true;
    } catch (err: any) {
      console.error('Failed to load app settings:', err);
      try {
        const fullRes = await api.settings.get();
        if (fullRes?.appSettings) {
          setAppSettingsForm((prev) => ({ ...prev, ...fullRes.appSettings }));
        }
        if (fullRes?.appSettingsGrouped) {
          setAppSettingsGrouped(fullRes.appSettingsGrouped);
        }
        hasLoadedAppSettingsRef.current = true;
      } catch (fallbackErr: any) {
        setAppSettingsError(fallbackErr.message || 'Could not load application settings from server.');
      }
    } finally {
      setIsLoadingAppSettings(false);
    }
  };

  const handleSaveAppSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingAppSettings(true);
    setAppSettingsSuccess(false);
    setAppSettingsError(null);
    try {
      const res = await api.settings.saveAppSettings(appSettingsForm);
      setAppSettingsSuccess(true);
      if (res?.appSettings) {
        setAppSettingsForm((prev) => ({ ...prev, ...res.appSettings }));
      }
      setTimeout(() => setAppSettingsSuccess(false), 4500);
      onSettingsUpdated();
    } catch (err: any) {
      setAppSettingsError(err.message || 'Failed to save application settings.');
    } finally {
      setIsSavingAppSettings(false);
    }
  };

  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const isRefreshingAllRef = useRef(false);
  const isRefreshingUsersRef = useRef(false);
  const isRefreshingInstallRef = useRef(false);

  useEffect(() => {
    if (isStoreAdmin) {
      loadUsers();
    } else if (isSuperAdmin) {
      loadInstallStatus();
      loadAppSettings();
    }
  }, [isStoreAdmin, isSuperAdmin]);

  useEffect(() => {
    if (activeTab === 'users' && isStoreAdmin) {
      loadUsers();
    } else if (activeTab === 'install' && isSuperAdmin) {
      loadInstallStatus();
    } else if (activeTab === 'app_settings' && isSuperAdmin && !hasLoadedAppSettingsRef.current) {
      loadAppSettings();
    }
  }, [activeTab, isStoreAdmin, isSuperAdmin]);

  const loadInstallStatus = async () => {
    if (isRefreshingInstallRef.current) return;
    isRefreshingInstallRef.current = true;
    setIsLoadingInstallStatus(true);
    try {
      const res = await api.install.status();
      setInstallStatus(res);
    } catch (e) {
      console.error(e);
    } finally {
      isRefreshingInstallRef.current = false;
      setIsLoadingInstallStatus(false);
    }
  };

  const handleUnlockInstaller = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPassword = resetPasswordInput.trim();
    if (!cleanPassword) return;
    setIsResettingInstall(true);
    setResetMessage(null);
    try {
      const email = currentUser?.email;
      const res = await api.install.reset(cleanPassword, email, dropTablesOnUnlock);
      setResetMessage({ type: 'success', text: res.message });
      setResetPasswordInput('');
      await loadInstallStatus();
      onSettingsUpdated();
    } catch (err: any) {
      setResetMessage({
        type: 'error',
        text: err.message || 'Unlock authorization failed: Invalid admin password.',
      });
    } finally {
      setIsResettingInstall(false);
    }
  };

  const handleDropTablesAndReinstall = async () => {
    const cleanPassword = resetPasswordInput.trim();
    if (!cleanPassword) {
      alert('Please enter your Admin / Store Owner password in the password field first to confirm this action.');
      return;
    }
    if (
      !window.confirm(
        '⚠️ CRITICAL WARNING: This will completely reset all system data and configurations!\n\nAll store records, catalogs, transactions, and settings will be permanently erased for a fresh reinstall.\n\nAre you sure you want to proceed?'
      )
    ) {
      return;
    }

    setIsResettingInstall(true);
    setResetMessage(null);
    try {
      const res = await api.install.dropTables(cleanPassword);
      setResetMessage({ type: 'success', text: res.message });
      setResetPasswordInput('');
      await loadInstallStatus();
      onSettingsUpdated();
      if (onOpenInstallWizard) {
        onOpenInstallWizard();
      } else {
        window.location.href = '/install';
      }
    } catch (err: any) {
      setResetMessage({
        type: 'error',
        text: err.message || 'Failed to drop tables. Check admin password.',
      });
    } finally {
      setIsResettingInstall(false);
    }
  };

  const handleLockInstaller = async () => {
    setIsLockingInstall(true);
    setResetMessage(null);
    try {
      const res = await api.install.lock();
      setResetMessage({ type: 'success', text: res.message });
      await loadInstallStatus();
      onSettingsUpdated();
    } catch (err: any) {
      setResetMessage({ type: 'error', text: err.message || 'Failed to lock installer route.' });
    } finally {
      setIsLockingInstall(false);
    }
  };

  const loadUsers = async () => {
    if (isRefreshingUsersRef.current) return;
    isRefreshingUsersRef.current = true;
    setIsLoadingUsers(true);
    try {
      const res = await api.settings.getUsers();
      setUsersList(res.users || []);
    } catch (e) {
      console.error(e);
    } finally {
      isRefreshingUsersRef.current = false;
      setIsLoadingUsers(false);
    }
  };

  const handleGlobalRefresh = async () => {
    if (isRefreshingAllRef.current) return;
    isRefreshingAllRef.current = true;
    setIsRefreshingAll(true);
    try {
      const promises: Promise<any>[] = [
        Promise.resolve(onSettingsUpdated()),
        api.settings
          .getSubscription()
          .then((subRes) => {
            if (subRes?.subscriptionInfo) {
              setSubscriptionInfo(extractSubInfo(subRes));
            }
          })
          .catch(() => {}),
      ];
      if (isAdmin) {
        promises.push(loadUsers(), loadInstallStatus());
      }
      await Promise.all(promises);
    } catch (err) {
      console.error('Settings refresh error:', err);
    } finally {
      isRefreshingAllRef.current = false;
      setIsRefreshingAll(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!formData.company_name.trim()) {
      errors.company_name = 'Company name is required.';
    }
    if (!formData.company_phone.trim()) {
      errors.company_phone = 'Company phone is required.';
    }
    if (formData.company_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.company_email.trim())) {
      errors.company_email = 'Please provide a valid email address (e.g., info@company.com).';
    }
    if (!formData.currency_name.trim()) {
      errors.currency_name = 'Currency name is required (e.g., "Pakistani Rupee", "US Dollar").';
    }
    if (!formData.currency_symbol.trim()) {
      errors.currency_symbol = 'Currency symbol is required (e.g., "Rs.", "$", "PKR").';
    }

setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSavingSettings(true);
    setSettingsSuccess(false);
    try {
      const sanitizedFormData: any = {
        ...formData,
        company_name: toTitleCaseTrimmed(formData.company_name),
        company_address: toTitleCaseTrimmed(formData.company_address),
        company_email: toLowerTrimmed(formData.company_email),
        website: toLowerTrimmed(formData.website),
        currency_name: toTitleCaseTrimmed(formData.currency_name),
        invoice_footer: toTitleCaseTrimmed(formData.invoice_footer),
      };

      // Strict RBAC: Non-Platform Owners cannot mutate root configurations
      if (!isPlatformOwner) {
        delete sanitizedFormData.business_type;
        delete sanitizedFormData.businessType;
        delete sanitizedFormData.pricing_mode;
        delete sanitizedFormData.pricingMode;
        delete sanitizedFormData.min_selling_quantity;
        delete sanitizedFormData.minSellingQuantity;
        delete sanitizedFormData.allow_half_carton;
        delete sanitizedFormData.allowHalfCarton;
        delete sanitizedFormData.pricing_policy_locked;
        delete sanitizedFormData.pricingPolicyLocked;
        delete sanitizedFormData.appSettings;
      }
      const updateRes = await api.settings.update(sanitizedFormData);
      setSettingsSuccess(true);
      await Promise.resolve(onSettingsUpdated(updateRes?.settings));
      setTimeout(() => setSettingsSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleUpdateUserStatus = async (id: number, status: 'APPROVED' | 'PENDING') => {
    try {
      await api.settings.updateUserStatus(id, status);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const handleUpdateUserRole = async (id: number, role: 'ADMIN' | 'CASHIER') => {
    try {
      await api.settings.updateUserRole(id, role);
      loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user role');
    }
  };

  const handleOpenAddUserModal = () => {
    setIsAddUserModalOpen(true);
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    setDeleteUserError(null);
    try {
      await api.settings.deleteUser(userToDelete.id);
      setUserToDelete(null);
      loadUsers();
    } catch (err: any) {
      setDeleteUserError(err.message || 'Failed to delete staff account.');
    } finally {
      setIsDeletingUser(false);
    }
  };

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto">
      {/* Top Banner & Actions matching Product Management */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-3.5 bg-white dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-purple-800/80 shadow-sm transition-colors dark:text-white"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isSuperAdmin
                ? 'Application & Platform Configuration'
                : isStoreAdmin
                ? 'Store Settings & Configuration'
                : 'Hardware & Printer Settings'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 font-medium mt-0.5">
              {isSuperAdmin
                ? 'Global transactional email services (Resend API keys), Web Push credentials, and system environment policies'
                : isStoreAdmin
                ? 'Store profile, cashier staff access, receipt & label printers, and store policies'
                : 'Receipt & barcode label printer configuration, USB hardware, and silent printing setup'}
            </p>
          </div>

          <div className="flex items-center space-x-2.5">
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-purple-950/60 border border-slate-200 dark:border-purple-800/70 text-xs font-semibold text-slate-700 dark:text-purple-200 shadow-2xs">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600 dark:text-purple-300" />
              <span className="font-medium text-xs">
                {isSuperAdmin ? 'SuperAdmin •' : isStoreAdmin ? 'Store Admin •' : 'Cashier •'}
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Online
              </span>
            </div>

            <button
              type="button"
              onClick={handleGlobalRefresh}
              disabled={isRefreshingAll}
              className="btn-outline-landing px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] font-bold rounded-xl text-xs transition cursor-pointer flex items-center space-x-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              title={isRefreshingAll ? "Reloading settings..." : "Reload settings"}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-purple-300 ${isRefreshingAll ? 'animate-spin' : ''}`} />
              <span>{isRefreshingAll ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Store Subscription Header Strip (Strictly Store Admin Only) */}
        {isStoreAdmin && (
          <div className="pt-3 border-t border-slate-200/80 dark:border-purple-800/50 flex flex-wrap items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Subscription Status */}
              {(() => {
                const rawStatus = String(
                  subscriptionInfo.subscriptionStatus ||
                    formData.subscription_status ||
                    companySettings?.subscriptionStatus ||
                    companySettings?.subscription_status ||
                    'ACTIVE'
                ).toUpperCase();
                const isExpired = rawStatus === 'EXPIRED';
                const isSuspended = rawStatus === 'SUSPENDED';
                const statusDisplay = isExpired
                  ? 'EXPIRED'
                  : isSuspended
                  ? 'SUSPENDED'
                  : isTrialActive
                  ? 'FREE TRIAL'
                  : rawStatus;
                return (
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono font-bold border ${
                      isExpired
                        ? 'bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                        : isSuspended
                        ? 'bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-500/30'
                        : isTrialActive
                        ? 'bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-500/30'
                        : 'bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isExpired
                          ? 'bg-amber-500'
                          : isSuspended
                          ? 'bg-rose-500'
                          : isTrialActive
                          ? 'bg-indigo-500 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span>Status: {statusDisplay}</span>
                  </div>
                );
              })()}

              {/* Subscription Plan */}
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold border ${
                  isTrialActive
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/50 border-indigo-200/80 dark:border-indigo-800/60 text-indigo-700 dark:text-indigo-200'
                    : 'bg-purple-50/70 dark:bg-purple-950/50 border border-purple-200/80 dark:border-purple-800/60 text-purple-700 dark:text-purple-200'
                }`}
              >
                <span>Plan:</span>
                <span className="font-mono font-bold">
                  {isTrialActive
                    ? '30-Day Free Trial'
                    : (() => {
                        const curPlan =
                          subscriptionInfo.subscriptionPlan ||
                          formData.subscription_plan ||
                          companySettings?.subscriptionPlan ||
                          companySettings?.subscription_plan;
                        const cleanPlan = String(curPlan || '').toUpperCase();
                        if (cleanPlan === '6_MONTHS' || cleanPlan === '6_MONTH') return '6 Months';
                        if (cleanPlan === 'YEARLY' || cleanPlan === '1_YEAR') return 'Yearly';
                        return getSubscriptionShortLabel(curPlan);
                      })()}
                </span>
              </div>
            </div>

            {/* Subscription Expiry Date & Renew Subscription Action */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-purple-800/60 text-slate-700 dark:text-purple-200 font-mono">
                <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
                <span className="text-[11px] font-sans font-bold text-slate-400 dark:text-purple-300/70 uppercase">
                  Expires:
                </span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {(() => {
                    const rawEnd =
                      subscriptionInfo.subscriptionEndDate ||
                      formData.subscription_end_date ||
                      companySettings?.subscriptionEndDate ||
                      companySettings?.subscription_end_date;
                    if (!rawEnd) return 'Active License';
                    const d = new Date(rawEnd);
                    if (Number.isNaN(d.getTime())) return String(rawEnd);
                    return d.toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                  })()}
                </span>
                <span className="text-[10px] font-sans font-semibold text-purple-600 dark:text-purple-300 ml-1">
                  ({subscriptionInfo.daysRemaining}d left)
                </span>
              </div>

              <button
                id="settings-header-renew-subscription-btn"
                type="button"
                onClick={handleOpenRenewModal}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer ${
                  String(subscriptionInfo.subscriptionStatus || formData.subscription_status || '').toUpperCase() === 'EXPIRED'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white animate-pulse'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>
                  {subscriptionInfo.pendingRenewalRequest
                    ? 'Renewal Pending'
                    : 'Renew Subscription'}
                </span>
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Settings Tab Menu - Responsive Scrollable Underline Navigation */}
      <motion.div
        ref={settingsTabContainerRef}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        className="bg-white dark:bg-[#131B2E] px-3 sm:px-5 rounded-2xl border border-slate-200 dark:border-purple-900/60 shadow-sm transition-colors flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar scrollbar-none tab-scrollbar-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar-thumb]:hidden [&::-webkit-scrollbar-track]:hidden border-b border-b-slate-200/90 dark:border-b-purple-900/80"
      >
        {isStoreAdmin && (
          <button
            id="settings-tab-store"
            type="button"
            data-active={activeTab === 'store'}
            data-tab="store"
            onClick={() => handleSelectTab('store')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'store'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Store className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'store' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Shop &amp; Invoice Settings</span>
            {activeTab === 'store' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {isStoreAdmin && (
          <button
            id="settings-tab-users"
            type="button"
            data-active={activeTab === 'users'}
            data-tab="users"
            onClick={() => handleSelectTab('users')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'users'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Users className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'users' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Cashier Approvals &amp; Staff</span>
            {usersList.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono transition-colors duration-200 ${
                activeTab === 'users'
                  ? 'bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}>
                {usersList.length}
              </span>
            )}
            {activeTab === 'users' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {isSuperAdmin && (
          <button
            id="settings-tab-app-settings"
            type="button"
            data-active={activeTab === 'app_settings'}
            data-tab="app_settings"
            onClick={() => handleSelectTab('app_settings')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'app_settings'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Sliders className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'app_settings' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>App &amp; Environment Config</span>
            {activeTab === 'app_settings' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {!isSuperAdmin && (
          <button
            id="settings-tab-printers"
            type="button"
            data-active={activeTab === 'printers'}
            data-tab="printers"
            onClick={() => handleSelectTab('printers')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'printers'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Printer className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'printers' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Hardware &amp; Printers</span>
            {activeTab === 'printers' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {isSuperAdmin && (
          <button
            id="settings-tab-backup"
            type="button"
            data-active={activeTab === 'backup'}
            data-tab="backup"
            onClick={() => handleSelectTab('backup')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'backup'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <Save className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'backup' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Data Backup &amp; Restore</span>
            {activeTab === 'backup' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {isSuperAdmin && (
          <button
            id="settings-tab-install"
            type="button"
            data-active={activeTab === 'install'}
            data-tab="install"
            onClick={() => handleSelectTab('install')}
            className={`tab-underline-link relative px-3.5 sm:px-4 py-3.5 text-xs sm:text-sm font-semibold transition-colors duration-300 flex items-center space-x-2 whitespace-nowrap cursor-pointer shrink-0 ${
              activeTab === 'install'
                ? 'active text-purple-600 dark:text-purple-400 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-300'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 transition-colors duration-200 ${activeTab === 'install' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`} />
            <span>Server Installer &amp; Security</span>
            {activeTab === 'install' && (
              <motion.div
                layoutId="settingsActiveUnderline"
                className="absolute bottom-0 left-0 right-0 h-[3px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)] pointer-events-none z-10"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
          </button>
        )}

        {/* Scroll End Buffer Spacer: Ensures the last tab is 100% visible and never clipped or flush against right edge */}
        <div className="tab-end-spacer shrink-0 w-8 sm:w-10 h-1 pointer-events-none self-stretch" aria-hidden="true" role="presentation" />
      </motion.div>

      {/* TAB 1: STORE & INVOICE SETTINGS (Store Admin Only) */}
      {isStoreAdmin && activeTab === 'store' && (
        <form onSubmit={handleSaveSettings} className="space-y-5">
          {settingsSuccess && (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center space-x-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <span className="font-bold text-xs">Settings Saved Successfully!</span>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  Company profile and store settings have been updated successfully.
                </p>
              </div>
            </div>
          )}

          {Object.keys(formErrors).length > 0 && (
            <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-start space-x-3 shadow-xs">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <div className="text-xs">
                <span className="font-bold">Please fix the following issues:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5 text-rose-600/90 dark:text-rose-400/90">
                  {Object.values(formErrors).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* CARD 0: STORE SUBSCRIPTION INFO */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm transition-colors">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-purple-900/40 gap-3">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/20 border border-purple-100 dark:border-purple-400/30 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-2xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                    Store Subscription
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5 font-normal">
                    Active tenant subscription plan cycle, activation date, and expiry status
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {subscriptionInfo.pendingRenewalRequest && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>
                      Renewal Requested ({subscriptionInfo.pendingRenewalRequest.plan === '6_MONTHS' ? '6 Months' : 'Yearly'})
                    </span>
                  </span>
                )}
                {(() => {
                  const statusUpper = String(
                    subscriptionInfo.subscriptionStatus || formData.subscription_status || 'ACTIVE'
                  ).toUpperCase();
                  const isExp = statusUpper === 'EXPIRED';
                  const isSusp = statusUpper === 'SUSPENDED';
                  const statusBadgeText = isExp
                    ? 'EXPIRED'
                    : isSusp
                    ? 'SUSPENDED'
                    : isTrialActive
                    ? 'FREE TRIAL'
                    : statusUpper;
                  return (
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                        isExp
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/60'
                          : isSusp
                          ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800/60'
                          : isTrialActive
                          ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/60'
                          : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isExp
                            ? 'bg-amber-500'
                            : isSusp
                            ? 'bg-rose-500'
                            : isTrialActive
                            ? 'bg-indigo-500 animate-pulse'
                            : 'bg-emerald-500 animate-pulse'
                        }`}
                      />
                      <span>{statusBadgeText}</span>
                    </span>
                  );
                })()}
                <button
                  id="settings-card-renew-subscription-btn"
                  type="button"
                  onClick={handleOpenRenewModal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>{isTrialActive ? 'Upgrade / Extend' : 'Renew Subscription'}</span>
                </button>
              </div>
            </div>

            {String(subscriptionInfo.subscriptionStatus || formData.subscription_status || '').toUpperCase() === 'EXPIRED' && (
              <div className="mb-4 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Store Subscription Expired
                    </h4>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-0.5">
                      Your store license has expired. Submit a subscription extension request to the SuperAdmin to restore full POS and inventory access.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenRenewModal}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs transition"
                >
                  Open Renew Modal
                </button>
              </div>
            )}

            {isTrialActive && String(subscriptionInfo.subscriptionStatus || formData.subscription_status || '').toUpperCase() !== 'EXPIRED' && (
              <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-indigo-50/90 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                      <span>Active 30-Day Free Trial</span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                        {subscriptionInfo.daysRemaining} days left
                      </span>
                    </h4>
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300/90 mt-0.5">
                      Your store has full access to all retail shoe POS, inventory, barcode, and reporting features during your free trial. You can request a 6-month or yearly plan extension at any time.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleOpenRenewModal}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shrink-0 cursor-pointer shadow-xs transition"
                >
                  Upgrade / Extend Plan
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Subscription Plan */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 block">
                  Subscription Plan <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px] ml-1">(plan)</span>
                </label>
                <div className="h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {isTrialActive
                      ? '30-Day Free Trial'
                      : (subscriptionInfo.subscriptionPlan || formData.subscription_plan) === '6_MONTHS'
                      ? '6 Months Plan'
                      : 'Yearly Plan (1 Year)'}
                  </span>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded-md ${
                      isTrialActive
                        ? 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300'
                        : 'bg-purple-100 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300'
                    }`}
                  >
                    {isTrialActive
                      ? 'FREE_TRIAL'
                      : (subscriptionInfo.subscriptionPlan || formData.subscription_plan || 'YEARLY')}
                  </span>
                </div>
              </div>


              {/* Subscription Expiry & Days Remaining */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>Valid Until / Expiry</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {subscriptionInfo.daysRemaining} days left
                  </span>
                </label>
                <div className="h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 flex items-center gap-2 text-xs font-mono">
                  <Calendar className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />
                  <span className="font-bold text-slate-900 dark:text-white truncate">
                    {(() => {
                      const rawEnd =
                        subscriptionInfo.subscriptionEndDate ||
                        formData.subscription_end_date ||
                        companySettings?.subscriptionEndDate ||
                        companySettings?.subscription_end_date;
                      if (!rawEnd) return 'Active License';
                      const d = new Date(rawEnd);
                      if (Number.isNaN(d.getTime())) return String(rawEnd);
                      return d.toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      });
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 1: COMPANY PROFILE */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm transition-colors">
            {/* Card Header */}
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-purple-900/40">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-purple-500/20 border border-blue-100 dark:border-purple-400/30 text-blue-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-2xs">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Company Profile</h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5 font-normal">
                    Official business details, contact coordinates, and tax registrations
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-slate-100 dark:bg-purple-950/60 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-800/60">
                Business Identity
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* company_name (Text, Required) */}
              <div className="md:col-span-2">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Company Name <span className="text-rose-500 font-bold">*</span>
                    <span className="text-slate-400 dark:text-slate-500 font-normal text-[11px] ml-1.5">(company_name)</span>
                  </span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => {
                      setFormData({ ...formData, company_name: toTitleCaseLive(e.target.value) });
                      if (formErrors.company_name) {
                        setFormErrors({ ...formErrors, company_name: '' });
                      }
                    }}
                    placeholder="e.g., Apex Footwear"
                    className={`capitalize w-full h-11 pl-10 pr-3.5 rounded-xl border bg-slate-50 dark:bg-[#060B18]/90 font-bold text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all ${
                      formErrors.company_name
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : 'border-slate-300 dark:border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                    required
                  />
                </div>
                {formErrors.company_name && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px] mt-1.5">{formErrors.company_name}</p>
                )}
              </div>

              {/* company_phone (Text, Required) */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Company Phone <span className="text-rose-500 font-bold">*</span>
                  </span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.company_phone}
                    onChange={(e) => {
                      setFormData({ ...formData, company_phone: e.target.value });
                      if (formErrors.company_phone) {
                        setFormErrors({ ...formErrors, company_phone: '' });
                      }
                    }}
                    placeholder="e.g., +92-321-2257340"
                    className={`w-full h-11 pl-10 pr-3.5 rounded-xl border bg-slate-50 dark:bg-[#060B18]/90 text-xs font-medium text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all ${
                      formErrors.company_phone
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : 'border-slate-300 dark:border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                    required
                  />
                </div>
                {formErrors.company_phone && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px] mt-1.5">{formErrors.company_phone}</p>
                )}
              </div>

              {/* company_email (Email format) */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Company Email
                 </span>
                 <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="email"
                    value={formData.company_email}
                    onChange={(e) => {
                      setFormData({ ...formData, company_email: e.target.value });
                      if (formErrors.company_email) {
                        setFormErrors({ ...formErrors, company_email: '' });
                      }
                    }}
                    placeholder="e.g., info@store.com"
                    className={`w-full h-11 pl-10 pr-3.5 rounded-xl border bg-slate-50 dark:bg-[#060B18]/90 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all ${
                      formErrors.company_email
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : 'border-slate-300 dark:border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                  />
                </div>
                {formErrors.company_email && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px] mt-1.5">{formErrors.company_email}</p>
                )}
              </div>

              {/* strn (Text, Optional - Sales Tax Registration Number) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    STRN 
                  </label>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </div>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.strn}
                    onChange={(e) => setFormData({ ...formData, strn: e.target.value })}
                    placeholder="e.g., STRN-9876543-2"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Sales Tax Registration across POS receipts</p>
              </div>

              {/* tax_id (Text, Optional - NTN / Tax ID) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Tax ID / NTN 
                  </label>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </div>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={(e) => setFormData({ ...formData, tax_id: e.target.value })}
                    placeholder="e.g., NTN-1234567-8"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">National Tax Number / Business Tax ID</p>
              </div>

              {/* website (URL, Optional) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Website
                  </label>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </div>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                    placeholder="e.g., https://www.shoepos.com"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Logo URL & Receipt Printout Store Logo Toggle / Upload */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Company Brand Logo URL
                  </label>
                  <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 px-2 py-0.5 rounded-full">
                    Optional
                  </span>
                </div>
                <div className="relative">
                  <Link className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.logo}
                    onChange={(e) => setFormData({ ...formData, logo: e.target.value, receipt_logo: e.target.value })}
                    placeholder="https://images.unsplash.com/... or /logo.png"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              {/* Receipt Printout Store Logo Toggle & Upload (Camera / System File) */}
              <div className="md:col-span-3 p-4 rounded-xl border border-slate-200 dark:border-purple-800/50 bg-slate-50/70 dark:bg-[#0B1222]/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start space-x-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-500/20 border border-purple-200 dark:border-purple-500/30 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 mt-0.5">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                          Receipt Printout Store Logo
                        </h4>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            formData.show_receipt_logo
                              ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {formData.show_receipt_logo ? 'Enabled on Receipt' : 'Hidden on Receipt'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Toggle and upload a small store logo to display at the top of receipt previews and printouts via camera or system file browser.
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={formData.show_receipt_logo}
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        show_receipt_logo: !prev.show_receipt_logo,
                      }))
                    }
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      formData.show_receipt_logo
                        ? 'bg-purple-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <span className="sr-only">Toggle receipt store logo</span>
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        formData.show_receipt_logo ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Upload Controls & Small Receipt Logo Preview */}
                <div className="mt-4 pt-3.5 border-t border-slate-200/80 dark:border-purple-900/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3.5">
                    <div className="w-14 h-14 rounded-xl bg-white dark:bg-[#060B18] border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                      {formData.receipt_logo || formData.logo ? (
                        <img
                          src={formData.receipt_logo || formData.logo}
                          alt="Receipt Store Logo"
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <Store className="w-5 h-5 text-slate-400 dark:text-slate-600" />
                      )}
                    </div>
                    <div className="text-xs">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {formData.receipt_logo || formData.logo ? 'Store Logo Ready for Receipt' : 'No Store Logo Uploaded'}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Auto-optimized to a compact size (max 240px) for fast thermal &amp; A4 printing.
                      </p>
                    </div>
                  </div>

                  {/* Hidden File Inputs for System Browser and Mobile Camera */}
                  <input
                    ref={logoFileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                  <input
                    ref={logoCameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-[#131B2E] hover:bg-slate-100 dark:hover:bg-purple-950/60 text-slate-700 dark:text-purple-200 border border-slate-300 dark:border-purple-800/70 font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition shadow-2xs"
                    >
                      <Upload className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                      <span>Upload from System</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenCameraForLogo}
                      className="px-3 py-2 rounded-xl bg-purple-50 dark:bg-purple-500/20 hover:bg-purple-100 dark:hover:bg-purple-500/30 text-purple-700 dark:text-purple-200 border border-purple-200 dark:border-purple-500/40 font-semibold text-xs flex items-center space-x-1.5 cursor-pointer transition shadow-2xs"
                    >
                      <Camera className="w-3.5 h-3.5 text-purple-600 dark:text-purple-300" />
                      <span>Capture via Camera</span>
                    </button>

                    {(formData.receipt_logo || formData.logo) && (
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            receipt_logo: '',
                            logo: '',
                            show_receipt_logo: false,
                          }))
                        }
                        className="px-2.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 font-semibold text-xs flex items-center space-x-1 cursor-pointer transition"
                        title="Remove store logo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* company_address (Text) */}
              <div className="md:col-span-3">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Company Address 
                  </span>
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.company_address}
                    onChange={(e) => setFormData({ ...formData, company_address: toTitleCaseLive(e.target.value) })}
                    placeholder="e.g., Shop #14, Royal Commercial Plaza, Saddar, Karachi"
                    className="capitalize w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2: CURRENCY SETTINGS (POS DEFAULTS — Locked after initial store setup) */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm transition-colors">
            {/* Card Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-purple-900/40 gap-3">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-purple-500/20 border border-blue-100 dark:border-purple-400/30 text-blue-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-2xs">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex flex-wrap items-center gap-2">
                    <span>Currency Settings (POS Defaults)</span>
                    {formData.pricing_policy_locked && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800/60 flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-500" />
                        Locked After Initial Setup
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5 font-normal">
                    {formData.pricing_policy_locked
                      ? 'Core POS defaults, including currency and fixed document numbering, are permanently locked after initial store setup.'
                      : 'System identifiers and currency parameters required to run POS'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-xl bg-slate-100 dark:bg-purple-950/60 text-slate-700 dark:text-purple-200 border border-slate-200 dark:border-purple-800/60 flex items-center gap-1.5 shrink-0">
                {formData.pricing_policy_locked && <Lock className="w-3.5 h-3.5 text-amber-500" />}
                <span>{formData.pricing_policy_locked ? 'POS Defaults Locked' : 'System Formats'}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {/* currency_name (Text, Required) */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Currency Name <span className="text-rose-500 font-bold">*</span>
                  </span>
                  {formData.pricing_policy_locked && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Coins className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={formData.currency_name}
                    disabled={Boolean(formData.pricing_policy_locked)}
                    readOnly={Boolean(formData.pricing_policy_locked)}
                    onChange={(e) => {
                      if (formData.pricing_policy_locked) return;
                      setFormData({ ...formData, currency_name: toTitleCaseLive(e.target.value) });
                      if (formErrors.currency_name) {
                        setFormErrors({ ...formErrors, currency_name: '' });
                      }
                    }}
                    placeholder='e.g., "Pakistani Rupee", "US Dollar"'
                    className={`capitalize w-full h-11 pl-10 pr-3.5 rounded-xl border bg-slate-50 dark:bg-[#060B18]/90 font-medium text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all ${
                      formData.pricing_policy_locked
                        ? 'opacity-75 cursor-not-allowed select-none border-slate-200 dark:border-slate-800'
                        : formErrors.currency_name
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : 'border-slate-300 dark:border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                    required
                  />
                </div>
                {formErrors.currency_name && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px] mt-1.5">{formErrors.currency_name}</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Full title for reports &amp; vouchers</p>
              </div>

              {/* currency_symbol (Text, Required) */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>
                    Currency Symbol <span className="text-rose-500 font-bold">*</span>
                  </span>
                  {formData.pricing_policy_locked && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
                      <Lock className="w-2.5 h-2.5" /> Locked
                    </span>
                  )}
                </label>
                <div className="relative">
                  <span className="font-bold text-slate-400 absolute left-3.5 top-3 text-xs pointer-events-none">₨</span>
                  <input
                    type="text"
                    value={formData.currency_symbol}
                    disabled={Boolean(formData.pricing_policy_locked)}
                    readOnly={Boolean(formData.pricing_policy_locked)}
                    onChange={(e) => {
                      if (formData.pricing_policy_locked) return;
                      setFormData({ ...formData, currency_symbol: e.target.value });
                      if (formErrors.currency_symbol) {
                        setFormErrors({ ...formErrors, currency_symbol: '' });
                      }
                    }}
                    placeholder='e.g., "Rs.", "$", "PKR"'
                    className={`w-full h-11 pl-10 pr-3.5 rounded-xl border bg-slate-50 dark:bg-[#060B18]/90 font-bold font-mono text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all ${
                      formData.pricing_policy_locked
                        ? 'opacity-75 cursor-not-allowed select-none border-slate-200 dark:border-slate-800'
                        : formErrors.currency_symbol
                        ? 'border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/10'
                        : 'border-slate-300 dark:border-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20'
                    }`}
                    required
                  />
                </div>
                {formErrors.currency_symbol && (
                  <p className="text-rose-600 dark:text-rose-400 text-[11px] mt-1.5">{formErrors.currency_symbol}</p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Printed on POS receipts &amp; invoice totals</p>
              </div>

              {/* Low Stock Limit (Store-Type-Aware) */}
              <div>
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                  <span>Low stock threshold</span>
                  {formData.business_type === 'WHOLESALE' && (
                    <span className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      Cartons (= {formData.low_stock_limit} Pairs)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  min="1"
                  value={
                    formData.business_type === 'WHOLESALE'
                      ? Math.max(1, Math.round(Number(formData.low_stock_limit || 12) / 12))
                      : formData.low_stock_limit
                  }
                  onChange={(e) => {
                    const entered = parseInt(e.target.value, 10) || 1;
                    setFormData({
                      ...formData,
                      low_stock_limit: formData.business_type === 'WHOLESALE' ? entered * 12 : entered,
                    });
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs font-bold font-mono text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                  {formData.business_type === 'WHOLESALE'
                    ? `Alerts POS and inventory reports when stock falls at or below ${Math.max(1, Math.round(Number(formData.low_stock_limit || 12) / 12))} cartons (${formData.low_stock_limit} pairs)`
                    : 'Alerts POS when quantity falls at or below this limit'}
                </p>
              </div>
            </div>

            {/* Receipt Footer Note */}
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-purple-900/40">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span>Receipt &amp; Invoice Footer Terms / Return Policy</span>
              </label>
              <textarea
                rows={3}
                value={formData.invoice_footer}
                onChange={(e) => setFormData({ ...formData, invoice_footer: toTitleCaseLive(e.target.value) })}
                placeholder="Exchanges accepted within 7 days with original sales slip..."
                className="capitalize w-full p-3.5 rounded-xl border border-slate-300 dark:border-slate-800 bg-slate-50 dark:bg-[#060B18]/90 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 outline-none transition-all focus:border-blue-500 dark:focus:border-purple-400 focus:ring-2 focus:ring-blue-500/20 dark:focus:ring-purple-500/20"
              />
            </div>
          </div>

          {/* CARD 3: STORE TYPE AND PRICING POLICY (Locked after initial setup) */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm transition-colors">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 mb-5 border-b border-slate-100 dark:border-purple-900/40 gap-3">
              <div className="flex items-center space-x-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/20 border border-purple-100 dark:border-purple-400/30 text-purple-600 dark:text-purple-300 flex items-center justify-center shrink-0 shadow-2xs">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                    <span>Store Type &amp; Pricing Policy</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800/60 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-amber-500" />
                      Locked After Initialization
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/70 mt-0.5 font-normal">
                    Business type and pricing rule selected during setup. These store-wide policies are read-only after initialization.
                  </p>
                </div>
              </div>
            </div>

            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-800/60 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-emerald-950 dark:text-emerald-100">
                    Your store operates as a {formData.business_type === 'WHOLESALE' ? 'wholesale B2B' : 'retail B2C'} store with a {formData.pricingMode === 'FIXED' ? 'fixed' : 'negotiable'} pricing policy.
                  </p>
                  <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-200/80">
                    Both settings are locked after initialization and apply across your store.
                  </p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-3 dark:border-emerald-800/50 dark:bg-slate-950/30">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Business type · Locked</span>
                      <span className="mt-1 block text-sm font-bold text-slate-900 dark:text-white">
                        {formData.business_type === 'WHOLESALE' ? 'Wholesale (B2B)' : 'Retail (B2C)'}
                      </span>
                    </div>
                    <div className="rounded-lg border border-emerald-200/80 bg-white/80 px-3 py-3 dark:border-emerald-800/50 dark:bg-slate-950/30">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Pricing policy · Locked</span>
                      <span className="mt-1 block text-sm font-bold text-slate-900 dark:text-white">
                        {formData.pricingMode === 'FIXED' ? 'Fixed Price' : 'Negotiable Price'}
                      </span>
                    </div>
                  </div>
                </div>
                <Lock className="mt-1 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
              </div>
            </div>

            {formData.business_type === 'WHOLESALE' && (
              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-4 dark:border-purple-800/60 dark:bg-purple-950/20 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                      📦
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Globally Allow Half-Carton Selling (0.5 Carton)</span>
                        {!isPlatformOwner && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-bold border border-amber-200 dark:border-amber-800/60 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-amber-500" />
                            Platform Owner Only
                          </span>
                        )}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-purple-200/80">
                        {isPlatformOwner
                          ? 'If disabled globally, you can still enable or override this option individually at the product level.'
                          : 'Root Store Configuration: Only the Platform Owner (SuperAdmin) can change carton quantity rules. If disabled globally, you can still enable or override this option individually at the product level.'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-300 dark:border-purple-700">
                    Active: {Number(formData.min_selling_quantity) <= 0.5 ? '0.5 Carton (Half)' : '1.0 Carton (Full)'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                      !isPlatformOwner ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      Number(formData.min_selling_quantity) <= 0.5
                        ? 'border-purple-600 bg-white dark:bg-purple-950/50 dark:border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="settingsMinSellingQty"
                      value="0.5"
                      disabled={!isPlatformOwner}
                      checked={Number(formData.min_selling_quantity) <= 0.5}
                      onChange={() => {
                        if (!isPlatformOwner) return;
                        setFormData((prev) => ({
                          ...prev,
                          min_selling_quantity: 0.5,
                          allow_half_carton: true,
                        }));
                      }}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="text-xs min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">Globally Allow Half-Carton Selling (0.5 Carton)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-semibold font-mono">
                          Flexible
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1 leading-relaxed">
                        If disabled globally, you can still enable or override this option individually at the product level.
                      </span>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all ${
                      !isPlatformOwner ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'
                    } ${
                      Number(formData.min_selling_quantity) > 0.5
                        ? 'border-purple-600 bg-white dark:bg-purple-950/50 dark:border-purple-500 ring-2 ring-purple-500/20 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/50 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="settingsMinSellingQty"
                      value="1.0"
                      disabled={!isPlatformOwner}
                      checked={Number(formData.min_selling_quantity) > 0.5}
                      onChange={() => {
                        if (!isPlatformOwner) return;
                        setFormData((prev) => ({
                          ...prev,
                          min_selling_quantity: 1.0,
                          allow_half_carton: false,
                        }));
                      }}
                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="text-xs min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">1 Carton (Full Carton)</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold font-mono">
                          Standard
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1 leading-relaxed">
                        Strict full-carton packing. Customers must order at least 1 full unbroken carton (e.g. 12 or 16 pairs).
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
              <span>Fields marked with</span>
              <span className="text-rose-500 font-bold">*</span>
              <span>are strictly required before saving.</span>
            </div>
            <button
              type="submit"
              disabled={isSavingSettings}
              className="w-full sm:w-auto bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 dark:from-purple-600 dark:to-indigo-600 text-white border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] font-bold text-xs px-6 py-2.5 rounded-xl flex items-center justify-center space-x-2 cursor-pointer transition-all disabled:opacity-50 active:scale-95"
            >
              {isSavingSettings ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Saving Settings...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Save Company &amp; Prefix Settings</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: USERS & CASHIER APPROVALS (Store Admin Only) */}
      {activeTab === 'users' && isStoreAdmin && (
        <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm space-y-5 transition-colors">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-100 dark:border-purple-900/40 gap-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Staff &amp; Cashier Authorizations</h3>
                <p className="text-slate-500 dark:text-purple-200/70 text-xs mt-0.5">
                  Authorized Administrators can create and provision cashier or admin accounts directly, and manage active staff permissions.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                id="create-staff-user-btn"
                onClick={handleOpenAddUserModal}
                className="btn-pure-white px-3.5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white font-bold rounded-xl text-xs cursor-pointer transition shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] border border-purple-400/40 flex items-center space-x-1.5"
                style={{ color: '#ffffff' }}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Create Cashier / Admin</span>
              </button>
              <button
                type="button"
                onClick={loadUsers}
                disabled={isLoadingUsers}
                title={isLoadingUsers ? "Refreshing users..." : "Refresh List"}
                className="btn-outline-landing px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] text-xs font-bold rounded-xl cursor-pointer transition-all flex items-center space-x-1.5 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-purple-300 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                <span>Refresh List</span>
              </button>
            </div>
          </div>

          <div className="border border-slate-200 dark:border-purple-800/60 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 text-slate-700 dark:text-white font-bold border-b border-slate-200 dark:border-purple-800/80 text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Staff Name</th>
                  <th className="py-3 px-4">Email Address</th>
                  <th className="py-3 px-4">Phone</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Access Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <RefreshCw className="w-6 h-6 animate-spin text-blue-600 dark:text-purple-400 mx-auto" />
                        <p className="font-medium text-xs">Loading staff accounts...</p>
                      </div>
                    </td>
                  </tr>
                ) : usersList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                      No staff accounts found.
                    </td>
                  </tr>
                ) : (
                  usersList.map((u) => {
                  const isPending = u.status === 'PENDING';

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/80 dark:hover:bg-purple-950/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center space-x-2.5">
                          <UserAvatar
                            name={u.name}
                            avatarUrl={u.avatarUrl || u.avatar_url}
                            role={u.role}
                            size="sm"
                          />
                          <span className="truncate">{u.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-purple-200/80">{u.email}</td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-mono text-xs">{u.phone || '-'}</td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleUpdateUserRole(u.id, e.target.value as any)}
                          className="px-2.5 py-1.5 bg-slate-50 dark:bg-purple-500/20 border border-slate-300 dark:border-purple-400/40 text-slate-900 dark:text-purple-200 hover:bg-slate-100 dark:hover:bg-purple-500/30 dark:hover:text-white dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] rounded-lg font-semibold text-xs focus:border-blue-500 dark:focus:border-purple-400 outline-none cursor-pointer"
                        >
                          <option value="CASHIER" className="dark:bg-[#120726] dark:text-purple-100">CASHIER</option>
                          <option value="ADMIN" className="dark:bg-[#120726] dark:text-purple-100">ADMIN</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            isPending
                              ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateUserStatus(u.id, 'APPROVED')}
                              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 px-3 py-1.5 font-bold rounded-lg cursor-pointer text-xs shadow-md shadow-purple-600/25 dark:shadow-[0_0_12px_rgba(147,51,234,0.3)] transition-all hover:scale-105 active:scale-95"
                            >
                              Approve
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateUserStatus(u.id, 'PENDING')}
                              className="bg-slate-100 hover:bg-slate-200 dark:bg-purple-950/40 text-slate-700 dark:text-purple-200 hover:text-slate-900 border border-slate-200 dark:border-purple-800/60 px-3 py-1.5 font-semibold rounded-lg cursor-pointer text-xs transition-colors"
                            >
                              Suspend
                            </button>
                          )}

                          {(() => {
                            const isSelf =
                              (currentUser?.id && u.id && Number(currentUser.id) === Number(u.id)) ||
                              (currentUser?.email && u.email && currentUser.email.trim().toLowerCase() === u.email.trim().toLowerCase());

                            return isSelf ? (
                              <button
                                type="button"
                                disabled
                                title="You cannot delete your own active logged-in administrator account"
                                className="p-1.5 rounded-lg text-slate-300 dark:text-slate-600 cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setDeleteUserError(null);
                                  setUserToDelete(u);
                                }}
                                title={`Delete account for ${u.name}`}
                                className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800/60 transition cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>

          {/* Add Staff / Cashier Modal */}
          <AnimatePresence>
            {isAddUserModalOpen && (
              <CreateStaffModal
                isOpen={isAddUserModalOpen}
                onClose={() => setIsAddUserModalOpen(false)}
                onUserCreated={loadUsers}
              />
            )}
          </AnimatePresence>

          {/* Delete Staff / Cashier / Admin Confirmation Modal */}
          <AnimatePresence>
            {userToDelete && (
              <div
                className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
                onClick={() => !isDeletingUser && setUserToDelete(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 16 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl border border-slate-200 dark:border-purple-800/80 w-full max-w-md overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-5 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-2xs">
                        <Trash2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">Delete Staff Account</h3>
                        <p className="text-xs text-slate-500 dark:text-purple-200/80">Permanent removal of staff member access</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isDeletingUser && setUserToDelete(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body */}
                  <div className="p-5 space-y-4 text-xs">
                    {deleteUserError && (
                      <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-700 dark:text-red-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                        <span>{deleteUserError}</span>
                      </div>
                    )}

                    <div className="flex items-center space-x-3 p-3 bg-slate-50 dark:bg-purple-950/20 border border-slate-200 dark:border-purple-900/40 rounded-xl">
                      <UserAvatar
                        name={userToDelete.name}
                        avatarUrl={userToDelete.avatarUrl || userToDelete.avatar_url}
                        role={userToDelete.role}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                          {userToDelete.name}
                        </h4>
                        <p className="text-slate-500 dark:text-purple-200/70 font-mono text-[11px] truncate">
                          {userToDelete.email}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          userToDelete.role === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}
                      >
                        {userToDelete.role}
                      </span>
                    </div>

                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                      Are you sure you want to permanently delete this account for{' '}
                      <strong className="text-slate-900 dark:text-white font-bold">"{userToDelete.name}"</strong>?
                      This user will immediately lose access to the system and POS register.
                    </p>

                    {userToDelete.role === 'ADMIN' && (
                      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <span>
                          <strong>Administrator Account Notice:</strong> Ensure at least one other active Administrator account remains in the system to prevent administrative lockout.
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-5 py-3.5 bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900/90 dark:via-indigo-950/85 dark:to-slate-900 border-t border-slate-100 dark:border-purple-800/80 flex items-center justify-end space-x-2">
                    <button
                      type="button"
                      onClick={() => setUserToDelete(null)}
                      disabled={isDeletingUser}
                      className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteUser}
                      disabled={isDeletingUser}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white text-xs font-bold shadow-xs shadow-rose-500/25 transition cursor-pointer disabled:opacity-50"
                    >
                      {isDeletingUser ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Deleting Account...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Confirm Delete</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* TAB: APPLICATION & ENVIRONMENT CONFIG (PostgreSQL app_settings table) */}
      {isSuperAdmin && activeTab === 'app_settings' && (
        <form onSubmit={handleSaveAppSettings} className="space-y-6">
          {appSettingsSuccess && (
            <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center space-x-3 shadow-xs">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <span className="font-bold text-xs">Settings Saved Successfully!</span>
                <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                  All platform configurations have been updated and synchronized into active memory.
                </p>
              </div>
            </div>
          )}

          {appSettingsError && (
            <div className="p-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center space-x-3 shadow-xs">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
              <div className="text-xs">
                <span className="font-bold">Error saving application settings:</span>
                <p className="text-rose-600/90 dark:text-rose-400/90 mt-0.5">{appSettingsError}</p>
              </div>
            </div>
          )}

          {/* Top Banner & Action Bar */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0 shadow-xs">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <span>System &amp; Platform Configuration</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                    Platform Settings
                  </span>
                </h3>
                <p className="text-slate-500 dark:text-purple-200/70 text-xs mt-0.5 font-normal">
                  Configure transactional email delivery (Resend API key &amp; verified sender), Web Push notification keys, and system environment policies dynamically.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={loadAppSettings}
                disabled={isLoadingAppSettings}
                className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAppSettings ? 'animate-spin text-purple-600' : ''}`} />
                <span>{isLoadingAppSettings ? 'Reloading...' : 'Reload Settings'}</span>
              </button>

              <button
                type="submit"
                disabled={isSavingAppSettings}
                className="px-4 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-md shadow-purple-600/25 active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSavingAppSettings ? 'Saving...' : 'Save All Settings'}</span>
              </button>
            </div>
          </div>

          {/* CATEGORY 2: RESEND TRANSACTIONAL EMAIL DELIVERY */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm space-y-5">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-purple-900/40">
              <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 flex items-center justify-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  Email Delivery via Resend (Category: <span className="font-mono text-blue-600 dark:text-blue-400">email</span>)
                </h4>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Configure Resend API credentials, verified sender address, and optional notification webhooks for password resets and transactional emails.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                Resend HTTPS Configuration
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Resend API Key (RESEND_API_KEY)
                  </label>
                  <div className="relative">
                    <input
                      type={revealedSecrets.RESEND_API_KEY ? 'text' : 'password'}
                      value={appSettingsForm.RESEND_API_KEY ?? ''}
                      onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, RESEND_API_KEY: e.target.value }))}
                      placeholder="re_xxxxxxxxxxxxxx"
                      className="w-full h-9 pl-3 pr-8 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecretVisibility('RESEND_API_KEY')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {revealedSecrets.RESEND_API_KEY ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Verified Sender Address (RESEND_FROM)
                  </label>
                  <input
                    type="text"
                    value={appSettingsForm.RESEND_FROM ?? ''}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, RESEND_FROM: e.target.value }))}
                    placeholder="SarbaazSoft Shoe POS <noreply@sarbaazsoft.com>"
                    className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Email Notification Webhook (EMAIL_WEBHOOK_URL)
                  </label>
                  <input
                    type="text"
                    value={appSettingsForm.EMAIL_WEBHOOK_URL ?? ''}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, EMAIL_WEBHOOK_URL: e.target.value }))}
                    placeholder="https://hooks.yourdomain.com/emails"
                    className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">
                    Resend Delivery Webhook (RESEND_WEBHOOK_URL)
                  </label>
                  <input
                    type="text"
                    value={appSettingsForm.RESEND_WEBHOOK_URL ?? ''}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, RESEND_WEBHOOK_URL: e.target.value }))}
                    placeholder="https://api.yourdomain.com/webhooks/resend"
                    className="w-full h-9 px-3 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CATEGORY 3: WEB PUSH & NOTIFICATIONS */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-purple-900/40">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  Web Push &amp; Device Notifications
                </h4>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Notification keys used for instant browser and mobile device alerts.
                </p>
              </div>
            </div>

            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                  Web Push Public Key
                </label>
                <textarea
                  rows={2}
                  value={appSettingsForm.VAPID_PUBLIC_KEY ?? ''}
                  onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, VAPID_PUBLIC_KEY: e.target.value }))}
                  placeholder="BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDNTGsj50cx2UQWd51NsPPNPBM6mSD30JmjRbfJ0b8EE"
                  className="w-full p-2.5 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    Web Push Private Key
                  </label>
                  <div className="relative">
                    <input
                      type={revealedSecrets.VAPID_PRIVATE_KEY ? 'text' : 'password'}
                      value={appSettingsForm.VAPID_PRIVATE_KEY ?? ''}
                      onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, VAPID_PRIVATE_KEY: e.target.value }))}
                      placeholder="••••••••••••••••••••••••••••••••"
                      className="w-full h-10 pl-3 pr-8 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                    />
                    <button
                      type="button"
                      onClick={() => toggleSecretVisibility('VAPID_PRIVATE_KEY')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {revealedSecrets.VAPID_PRIVATE_KEY ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    Web Push Notification Contact
                  </label>
                  <input
                    type="text"
                    value={appSettingsForm.VAPID_SUBJECT ?? 'mailto:support@sarbaazsoft.com'}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, VAPID_SUBJECT: e.target.value }))}
                    placeholder="mailto:support@sarbaazsoft.com"
                    className="w-full h-10 px-3 font-mono bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-purple-600"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CATEGORY 4: SYSTEM & PWA CONTROLS */}
          <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm space-y-4">
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-100 dark:border-purple-900/40">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  System &amp; PWA Runtime Controls (Category: <span className="font-mono text-emerald-600 dark:text-emerald-400">system</span>)
                </h4>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Runtime toggles for emergency PWA Service Worker bypass and Hot Module Reloading suppression.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Service Worker Kill Switch (SW_KILL_SWITCH)
                  </label>
                  <select
                    value={String(appSettingsForm.SW_KILL_SWITCH || 'false').toLowerCase()}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, SW_KILL_SWITCH: e.target.value }))}
                    className="h-8 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-purple-700 dark:text-purple-300"
                  >
                    <option value="false">false (Normal PWA Offline Cache)</option>
                    <option value="true">true (Emergency Cache Clear &amp; Unregister)</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  When enabled (<code className="font-mono font-bold text-rose-500">true</code>), forces all browser client service workers to unregister and purge browser storage.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Disable HMR Notice (DISABLE_HMR)
                  </label>
                  <select
                    value={String(appSettingsForm.DISABLE_HMR || 'false').toLowerCase()}
                    onChange={(e) => setAppSettingsForm((prev) => ({ ...prev, DISABLE_HMR: e.target.value }))}
                    className="h-8 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-purple-700 dark:text-purple-300"
                  >
                    <option value="false">false (HMR Active)</option>
                    <option value="true">true (Disabled in Sandboxes)</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Suppresses benign WebSocket connection notices inside sandboxed iframe preview environments.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Callout & Save Bar */}
          <div className="p-4 rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-gradient-to-r from-purple-50/80 via-indigo-50/60 to-purple-50/80 dark:from-purple-950/30 dark:via-indigo-950/20 dark:to-purple-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 dark:text-purple-200/80 flex items-start gap-2.5">
              <KeyRound className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white">Core Security Policy</span>
                <p className="text-[11px] text-slate-500 dark:text-purple-300/70 mt-0.5">
                  Core security keys and credentials remain managed securely through platform configuration.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingAppSettings}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 transition shadow-md shadow-purple-600/25 active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingAppSettings ? 'Saving...' : 'Save All Changes'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 4: HARDWARE & PRINTERS (Store Admin & Cashiers) */}
      {!isSuperAdmin && activeTab === 'printers' && (
        <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm transition-colors">
          <PrinterHardwareSettings />
        </div>
      )}

      {/* Fallback Guard: Cashiers attempting to access unauthorized non-printer tabs */}
      {isCashier && activeTab !== 'printers' && (
        <div className="p-8 text-center bg-white dark:bg-[#131B2E] rounded-2xl border border-amber-200 dark:border-amber-900/60 shadow-sm max-w-xl mx-auto my-6">
          <ShieldAlert className="w-10 h-10 text-amber-600 dark:text-amber-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Store Configuration Access Restricted</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Cashier accounts are authorized to configure local hardware &amp; printer settings only. Store profiles, tax numbers, and staff management require Store Administrator privileges.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('printers')}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Open Printer Settings
          </button>
        </div>
      )}

      {/* Fallback Guard: Store Admins or Cashiers attempting to access system configuration */}
      {!isSuperAdmin && (activeTab === 'app_settings' || activeTab === 'backup' || activeTab === 'install') && (
        <div className="p-8 text-center bg-white dark:bg-[#131B2E] rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-sm max-w-xl mx-auto my-6">
          <Lock className="w-10 h-10 text-rose-600 dark:text-rose-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">System Configuration Restricted</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Application settings, data backups, and security management are strictly reserved for Platform SuperAdministrators.
          </p>
        </div>
      )}

      {/* Fallback Guard: SuperAdmin attempting to access store tabs */}
      {isSuperAdmin && (activeTab === 'store' || activeTab === 'users' || activeTab === 'printers') && (
        <div className="p-8 text-center bg-white dark:bg-[#131B2E] rounded-2xl border border-purple-200 dark:border-purple-900/60 shadow-sm max-w-xl mx-auto my-6">
          <Sliders className="w-10 h-10 text-purple-600 dark:text-purple-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Store Management Restricted</h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
            Store shop profile, cashier approvals, and hardware printers are managed within individual store tenants. SuperAdmin access is strictly restricted to application-level configurations.
          </p>
          <button
            type="button"
            onClick={() => setActiveTab('app_settings')}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Open App &amp; Environment Config
          </button>
        </div>
      )}

      {/* TAB: DATABASE BACKUP & SAFETY RESTORE */}
      {activeTab === 'backup' && isSuperAdmin && (
        <DataBackupRestore
          currentUser={currentUser}
          companySettings={companySettings}
          onDataRestored={onSettingsUpdated}
        />
      )}

      {/* TAB 5: SERVER INSTALLER & ROUTE LOCKDOWN */}
      {isSuperAdmin && activeTab === 'install' && (
        <div className="bg-white dark:bg-[#131B2E] p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-purple-800/60 shadow-sm space-y-6 transition-colors">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-slate-100 dark:border-purple-900/40 pb-4 gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">Server Commissioning &amp; Route Lockout Security</h3>
                <p className="text-slate-500 dark:text-purple-200/70 text-xs mt-0.5">
                  Manage first-time setup installer state, route lockdown guard, and retail recommissioning.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadInstallStatus}
              disabled={isLoadingInstallStatus}
              title={isLoadingInstallStatus ? "Refreshing status..." : "Refresh Status"}
              className="btn-outline-landing px-3.5 py-2.5 bg-slate-100 dark:bg-purple-500/20 hover:bg-slate-200 dark:hover:bg-purple-500/30 text-slate-700 dark:text-purple-200 dark:hover:text-white border border-slate-200 dark:border-purple-400/40 dark:shadow-[0_0_14px_rgba(147,51,234,0.2)] text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInstallStatus ? 'animate-spin text-blue-600 dark:text-purple-300' : 'text-blue-600 dark:text-purple-300'}`} />
              <span>Refresh Status</span>
            </button>
          </div>

          {/* Security Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl border space-y-1.5 ${
              installStatus?.isInstalled
                ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60'
            }`}>
              <span className={`text-[10px] font-bold uppercase tracking-wider block ${
                installStatus?.isInstalled ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300'
              }`}>
                Installer Route Guard
              </span>
              <div className="flex items-center gap-2">
                {installStatus?.isInstalled ? (
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Unlock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                )}
                <span className={`font-bold text-xs ${
                  installStatus?.isInstalled ? 'text-emerald-950 dark:text-emerald-100' : 'text-amber-950 dark:text-amber-100'
                }`}>
                  {installStatus?.isInstalled ? 'SECURELY LOCKED (403)' : 'UNLOCKED (Setup Ready)'}
                </span>
              </div>
              <p className={`text-[11px] ${
                installStatus?.isInstalled ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'
              }`}>
                {installStatus?.isInstalled
                  ? 'Setup endpoint /api/install/setup is protected against unauthorized re-initialization.'
                  : 'Installer is currently unlocked and ready for execution.'}
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-purple-950/30 border-slate-200 dark:border-purple-800/60 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-600 dark:text-purple-300 uppercase tracking-wider block">Storage Status</span>
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600 dark:text-purple-400" />
                <span className="font-bold text-slate-900 dark:text-white text-xs">
                  Cloud Synchronized
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-purple-200/70 truncate">
                Active administrator accounts: {installStatus?.adminCount || 1}
              </p>
            </div>

            <div className="p-4 rounded-xl border bg-slate-50 dark:bg-purple-950/30 border-slate-200 dark:border-purple-800/60 space-y-1.5">
              <span className="text-[10px] font-bold text-slate-600 dark:text-purple-300 uppercase tracking-wider block">Provisioned Store</span>
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-blue-600 dark:text-purple-400" />
                <span className="font-bold text-slate-900 dark:text-white text-xs truncate">
                  {installStatus?.storeName || companySettings?.name || 'Shoe Shop POS'}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-purple-200/70">
                Currency: {companySettings?.currency || 'PKR'} ({companySettings?.currency_symbol || companySettings?.currencySymbol || 'Rs.'})
              </p>
            </div>
          </div>

          {/* Quick Action: Initial Store Setup & POS Defaults Status */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-purple-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs border border-slate-200 dark:border-purple-800/60">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {installStatus?.isInstalled || formData.pricing_policy_locked ? (
                  <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Sparkles className="w-4 h-4 text-blue-600 dark:text-purple-300" />
                )}
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  Initial Store Setup &amp; POS Defaults
                </span>
                {(installStatus?.isInstalled || formData.pricing_policy_locked) && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/70">
                    <Lock className="w-2.5 h-2.5" />
                    LOCKED AFTER SETUP
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-purple-200/70">
                {installStatus?.isInstalled || formData.pricing_policy_locked
                  ? 'Initial Store Setup & POS Defaults have been completed by the Store Owner and are permanently locked against unauthorized modification.'
                  : 'Launch the setup wizard interface to complete first-time store configuration and POS defaults.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onOpenInstallWizard) {
                  onOpenInstallWizard();
                } else {
                  window.location.href = '/install';
                }
              }}
              className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 font-bold text-xs py-2.5 px-4 rounded-xl shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] transition-all shrink-0 flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {installStatus?.isInstalled || formData.pricing_policy_locked ? (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>View Locked Setup Status</span>
                </>
              ) : (
                <>
                  <span>Open Initial Store Setup</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Recommissioning & Unlock Installer Form */}
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-purple-800/60 bg-slate-50 dark:bg-purple-950/20 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-purple-500/20 text-blue-600 dark:text-purple-300 border border-blue-100 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0 mt-0.5">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">Server Recommissioning &amp; Installer Lockout</h4>
                  <p className="text-xs text-slate-600 dark:text-purple-200/70 mt-0.5">
                    Unlock the installation wizard to reconfigure store defaults or migrate to a new branch.
                    Requires verification using an approved Administrator or Store Owner password.
                  </p>
                </div>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-bold shrink-0 ${
                  installStatus?.isInstalled
                    ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800 animate-pulse'
                }`}
              >
                {installStatus?.isInstalled ? 'Guard: Locked' : 'Guard: Unlocked'}
              </span>
            </div>

            {resetMessage && (
              <div
                className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                  resetMessage.type === 'success'
                    ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                }`}
              >
                {resetMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{resetMessage.text}</span>
              </div>
            )}

            {!installStatus?.isInstalled ? (
              <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-3">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>The Setup Wizard is currently UNLOCKED and ready to run!</span>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-300">
                  You can now re-run the setup wizard, change shop currency, create cashiers, or update branch details.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (onOpenInstallWizard) {
                        onOpenInstallWizard();
                      } else {
                        window.location.href = '/install';
                      }
                    }}
                    className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 font-bold px-4 py-2 rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/25 active:scale-95"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Launch Setup Wizard Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDropTablesAndReinstall}
                    disabled={isResettingInstall}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Drop Tables &amp; Fresh Reinstall</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleLockInstaller}
                    disabled={isLockingInstall}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>{isLockingInstall ? 'Securing...' : 'Re-Lock Route (Production Mode)'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleUnlockInstaller} className="space-y-3 max-w-xl">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span>Authorizing account:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {currentUser?.email || 'Store Owner (admin@shoepos.com)'}
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      placeholder="Enter Store Owner / Admin password"
                      value={resetPasswordInput}
                      onChange={(e) => setResetPasswordInput(e.target.value)}
                      className="w-full h-11 pl-3.5 pr-9 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isResettingInstall || !resetPasswordInput}
                    className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white border border-purple-400/40 dark:border-purple-400/50 font-bold px-5 h-11 rounded-xl text-xs transition disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.3)] shrink-0 active:scale-95"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>{isResettingInstall ? 'Verifying...' : 'Unlock Install Wizard'}</span>
                  </button>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800/80">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dropTablesOnUnlock}
                      onChange={(e) => setDropTablesOnUnlock(e.target.checked)}
                      className="w-4 h-4 rounded text-rose-600 border-slate-300 dark:border-slate-700 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-[11px] text-slate-600 dark:text-slate-400 flex items-center gap-1 font-medium">
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                      Also DROP ALL tables on unlock (Clean wipe)
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={handleDropTablesAndReinstall}
                    disabled={isResettingInstall || !resetPasswordInput}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-500 disabled:opacity-40 transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Direct Drop &amp; Reinstall</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Renew Subscription Modal (Auto-displayed when status is EXPIRED or triggered via Renew Subscription button) */}
      {isRenewModalOpen && (
        <div
          id="renew-subscription-modal"
          className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsRenewModalOpen(false);
          }}
        >
          <div
            className="relative w-full max-w-xl bg-white dark:bg-[#131B2E] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[94vh] border border-slate-200 dark:border-purple-800/80 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header matching ProductFormModal dark gradient */}
            <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border-b border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold shadow-2xs ${
                    String(subscriptionInfo.subscriptionStatus || '').toUpperCase() === 'EXPIRED'
                      ? 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-500/20 dark:border-amber-400/30'
                      : 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30'
                  }`}
                >
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
                    {String(subscriptionInfo.subscriptionStatus || '').toUpperCase() === 'EXPIRED'
                      ? 'Subscription Expired — Renew Store License'
                      : isTrialActive
                      ? 'Free Tier Evaluation — Upgrade Store License'
                      : 'Renew Store Subscription'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-purple-200/80">
                    {isTrialActive
                      ? 'Upgrade from Free Tier to keep your footwear POS and store data active'
                      : 'Request a subscription extension from the Platform SuperAdmin'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsRenewModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:text-purple-300 dark:hover:text-white rounded-lg hover:bg-slate-200/60 dark:hover:bg-white/10 transition cursor-pointer"
                aria-label="Close renewal modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleRequestSubscriptionRenewal} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {/* Expired Alert Banner inside Modal */}
              {String(subscriptionInfo.subscriptionStatus || '').toUpperCase() === 'EXPIRED' && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-700/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Your store subscription is currently EXPIRED.</span>
                    <p className="text-[11px] text-amber-700 dark:text-amber-300/90 mt-0.5">
                      Select a renewal plan below to notify the SuperAdmin for immediate 1-click reactivation.
                    </p>
                  </div>
                </div>
              )}

              {/* Grouped rounded container: Current License Summary */}
              <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-purple-300 mb-2.5 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-purple-500" />
                  <span>Current License Details</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                      Current Plan
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {isTrialActive
                        ? '30-Day Free Tier'
                        : subscriptionInfo.subscriptionPlan === '6_MONTHS'
                        ? '6 Months Plan'
                        : 'Yearly Plan (1 Year)'}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800">
                    <span className="text-[10px] font-mono uppercase text-slate-400 dark:text-slate-500 block">
                      Current Status &amp; Expiry
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white mt-0.5 block">
                      {isTrialActive && subscriptionInfo.subscriptionStatus === 'ACTIVE'
                        ? `Active Trial • ${subscriptionInfo.daysRemaining}d left`
                        : `${subscriptionInfo.subscriptionStatus} • ${subscriptionInfo.daysRemaining}d left`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Pending Renewal Banner if already requested */}
              {subscriptionInfo.pendingRenewalRequest && (
                <div className="p-3.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/60 flex items-start gap-2.5 text-xs text-purple-800 dark:text-purple-200">
                  <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">
                      Pending Renewal Request ({subscriptionInfo.pendingRenewalRequest.plan === '6_MONTHS' ? '6 Months Plan' : 'Yearly Plan'})
                    </span>
                    <p className="text-[11px] text-purple-700 dark:text-purple-300/80 mt-0.5">
                      Awaiting SuperAdmin approval. Submitting again will update your preferred plan choice and payment notes.
                    </p>
                  </div>
                </div>
              )}

              {renewalSuccessMessage && (
                <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/60 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-300 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>{renewalSuccessMessage}</span>
                </div>
              )}

              {renewalErrorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-700/60 flex items-center gap-2.5 text-xs text-rose-700 dark:text-rose-300 font-semibold">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{renewalErrorMessage}</span>
                </div>
              )}

              {/* Grouped rounded container: Interactive Plan Selection */}
              <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Select Extension Plan <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 dark:text-purple-300/70">
                    Click to switch duration
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => handleSelectRenewalPlan('6_MONTHS')}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative ${
                      selectedRenewalPlan === '6_MONTHS'
                        ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 dark:border-purple-400 ring-2 ring-purple-500/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0E1A] hover:border-purple-300 dark:hover:border-purple-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        6 Months Extension
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/70 text-purple-700 dark:text-purple-300">
                        6_MONTHS
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Extends store license by +6 months from current expiry or approval date.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectRenewalPlan('YEARLY')}
                    className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative ${
                      selectedRenewalPlan === 'YEARLY'
                        ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/60 dark:border-purple-400 ring-2 ring-purple-500/30 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0A0E1A] hover:border-purple-300 dark:hover:border-purple-900/60'
                    }`}
                  >
                    <span className="absolute -top-2 right-3 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-2xs">
                      Best Value
                    </span>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">
                        Yearly Extension (1 Year)
                      </span>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/70 text-emerald-700 dark:text-emerald-300">
                        YEARLY
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Extends store license by +12 months with uninterrupted POS access and full support.
                    </p>
                  </button>
                </div>
              </div>

              {/* Grouped rounded container: Dynamic Payment Message & Quick Template Selector Chips */}
              <div className="p-4 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#131B2E]/90 dark:to-[#0A0E1A]/80 border border-gray-200 dark:border-[#1A263D] shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Message / Payment Reference for SuperAdmin
                  </label>
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">
                    Quick Templates:
                  </span>
                </div>

                {/* Quick Action Template Selector Chips */}
                <div className="flex flex-wrap gap-1.5">
                  {RENEWAL_TEMPLATE_CHIPS.map((chip) => {
                    const isSelected = activeTemplateChip === chip.type && !hasUserEditedNotes;
                    return (
                      <button
                        key={chip.type}
                        type="button"
                        onClick={() => handleSelectTemplateChip(chip.type)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 border ${
                          isSelected
                            ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                            : 'bg-slate-100 dark:bg-purple-950/40 text-slate-700 dark:text-purple-200 border-slate-200 dark:border-purple-900/60 hover:bg-purple-100 dark:hover:bg-purple-900/60'
                        }`}
                      >
                        <span>[{chip.label}]</span>
                      </button>
                    );
                  })}
                </div>

                {/* Editable Textarea */}
                <div className="relative">
                  <textarea
                    rows={3}
                    value={renewalNotes}
                    onChange={(e) => {
                      setRenewalNotes(e.target.value);
                      setHasUserEditedNotes(true);
                    }}
                    placeholder="e.g. Hi Admin, completed Free Tier evaluation and upgrading to 1 Year Premium Plan for my store. Payment Ref ID: [Insert Ref ID]"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-purple-400/40 bg-white dark:bg-purple-500/20 text-xs text-slate-900 dark:text-purple-100 outline-none focus:border-indigo-600 dark:focus:border-purple-400 transition leading-relaxed"
                  />
                </div>
                <p className="text-[10px] text-slate-500 dark:text-purple-300/80">
                  Tip: Pre-filled with standard format. Simply replace <code className="bg-slate-100 dark:bg-purple-950/60 px-1 py-0.5 rounded text-purple-600 dark:text-purple-300 font-mono">[Insert Ref ID]</code> with your actual bank/online transfer reference ID.
                </p>
              </div>
            </form>

            {/* Modal Footer Buttons matching ProductFormModal */}
            <div className="px-6 py-4 border-t border-slate-200 dark:border-purple-800/80 bg-slate-50/70 dark:bg-[#0D1322]/70 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsRenewModalOpen(false)}
                className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                id="submit-renew-subscription-btn"
                type="button"
                onClick={handleRequestSubscriptionRenewal}
                disabled={isSubmittingRenewal}
                className="btn-primary px-5 py-2.5 text-xs flex items-center gap-2 cursor-pointer shadow-md font-bold disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSubmittingRenewal ? 'animate-spin' : ''}`} />
                <span>
                  {isSubmittingRenewal
                    ? 'Sending Request...'
                    : subscriptionInfo.pendingRenewalRequest
                    ? 'Update Renewal Request'
                    : 'Send Renewal Request to SuperAdmin'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera Capture Modal for Store Receipt Logo */}
      {isCameraOpen && (
        <div className="form-modal-theme fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#131B2E] rounded-2xl border border-slate-200 dark:border-purple-800/70 shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-purple-900/50">
              <div className="flex items-center space-x-2">
                <Camera className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Capture Store Receipt Logo</h3>
              </div>
              <button
                type="button"
                onClick={stopCameraStream}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="relative aspect-4/3 w-full bg-black rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 flex items-center justify-center">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              </div>
              {cameraError && (
                <p className="text-xs text-rose-600 dark:text-rose-400">{cameraError}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCameraStream();
                    logoCameraInputRef.current?.click();
                  }}
                  className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Use System Camera / File
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={stopCameraStream}
                    className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCaptureCameraLogo}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center space-x-1.5 cursor-pointer shadow-sm"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Capture Logo</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
