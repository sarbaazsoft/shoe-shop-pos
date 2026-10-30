import React, { useState, useEffect } from 'react';
import { Building2, Check, CheckCircle2, ArrowRight, ArrowLeft, Plus, Trash2, Smartphone, Package, Upload, ReceiptText, Barcode, Percent, MapPin, Phone, Mail, ShieldCheck, Sparkles, Lock, UserCheck, Users, Eye, EyeOff, UserPlus, SkipForward } from 'lucide-react';
import { api, setAuthSession } from '../../services/api';
import { ShowroomBackground } from '../common/ShowroomBackground';
import { PublicHeader } from '../common/PublicHeader';
import { PublicFooter } from '../common/PublicFooter';
import { toTitleCaseLive, toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { User } from '../../types';

interface TenantOnboardingWizardProps {
  tenantId: number;
  onCompleted: (tenantId: number, user?: User | null, token?: string | null, settings?: any) => void;
  onCancel: () => void;
  isRequiredFirstLogin?: boolean;
}

interface StarterProductInput {
  name: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  purchasePrice: number;
  sellingPrice: number;
  stock: number;
}

export const TenantOnboardingWizard: React.FC<TenantOnboardingWizardProps> = ({
  tenantId,
  onCompleted,
  onCancel,
  isRequiredFirstLogin = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);

  // 1. Store Identity & Administrator Account (Primary Store Owner - ADMIN)
  const [storeName, setStoreName] = useState('');
  const [address, setAddress] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // 2. Cashier Account Setup (Recommended for POS counter staff separation)
  const [enableCashier, setEnableCashier] = useState(true);
  const [cashierName, setCashierName] = useState('');
  const [cashierEmail, setCashierEmail] = useState('');
  const [cashierPhone, setCashierPhone] = useState('');
  const [cashierPassword, setCashierPassword] = useState('');
  const [showCashierPassword, setShowCashierPassword] = useState(false);

  // 3. Document Prefixes, Tax Rates, Currency & POS Defaults


  const [lowStockLimit, setLowStockLimit] = useState(5);
  const [businessType, setBusinessType] = useState<'RETAIL' | 'WHOLESALE'>('RETAIL');
  const [pricingMode, setPricingMode] = useState<'FIXED' | 'NEGOTIABLE'>('FIXED');
  const [minSellingQuantity, setMinSellingQuantity] = useState<number>(1.0);
  const [currency, setCurrency] = useState('PKR');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [taxId, setTaxId] = useState('');
  const [strn, setStrn] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState(
    'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
  );

  // 4. Store Logo & Optional Starter Footwear Products
  const [logoUrl, setLogoUrl] = useState('/pwa-512x512.png');
  const [initialProducts, setInitialProducts] = useState<StarterProductInput[]>([]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    api.saas
      .getOnboarding(tenantId)
      .then((res) => {
        if (!mounted) return;
        const t = res.tenant;
        if (t) {
          setStoreName(t.name || '');
          setOwnerName(t.ownerName || t.admin_name || '');
          setOwnerEmail(t.ownerEmail || t.admin_email || '');
          setPhone(t.ownerPhone || t.admin_phone || '');
          setAddress(t.address || '');
          setTaxId(t.taxId || '');
          setStrn(t.strn || '');
          setTaxRate(Number(t.taxRate) || 0);
          setCurrency(t.currency || 'PKR');


          setInvoiceFooter(
            t.invoiceFooter ||
              'Thank you for shopping with us! Exchanges accepted within 7 days with original receipt.'
          );
          setLowStockLimit(Number(t.lowStockLimit) || 5);
          const bType = ((t as any).businessType || (t as any).business_type || 'RETAIL').toUpperCase() === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL';
          setBusinessType(bType);
          if (bType === 'WHOLESALE') {
            setPricingMode('FIXED');
          } else {
            setPricingMode(t.pricingMode === 'NEGOTIABLE' ? 'NEGOTIABLE' : 'FIXED');
          }
          const rawMin = (t as any).minSellingQuantity ?? (t as any).min_selling_quantity;
          if (rawMin !== undefined && rawMin !== null && String(rawMin).trim() !== '') {
            setMinSellingQuantity(parseFloat(String(rawMin)) <= 0.5 ? 0.5 : 1.0);
          } else if ((t as any).allowHalfCarton !== undefined || (t as any).allow_half_carton !== undefined) {
            const allowHalf = Boolean((t as any).allowHalfCarton ?? (t as any).allow_half_carton);
            setMinSellingQuantity(allowHalf ? 0.5 : 1.0);
          }
          setLogoUrl(t.logoUrl || '/pwa-512x512.png');
          setAlreadyCompleted(Boolean(t.onboardingCompleted || (t as any).isLocked));
          if (t.hasCashier) {
            setEnableCashier(true);
          }
        }
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Failed to load store onboarding configuration.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tenantId]);

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddProductRow = () => {
    setInitialProducts((prev) => [
      ...prev,
      {
        name: '',
        brand: 'Unbranded',
        category: 'Sneakers',
        size: '42',
        color: 'Black',
        purchasePrice: 2200,
        sellingPrice: 3800,
        stock: 12,
      },
    ]);
  };

  const handleRemoveProductRow = (idx: number) => {
    setInitialProducts((prev) => prev.filter((_, i) => i !== idx));
  };

  const validateStep1 = () => {
    if (!storeName.trim()) {
      setError('Store name is required.');
      return false;
    }
    if (!ownerName.trim()) {
      setError('Owner / Admin full name is required.');
      return false;
    }
    if (!ownerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ownerEmail.trim())) {
      setError('A valid owner email address is required.');
      return false;
    }
    if (adminPassword.trim() && adminPassword.trim().length < 6) {
      setError('If setting a new password, administrator password must be at least 6 characters.');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (enableCashier) {
      if (!cashierName.trim()) {
        setError('Cashier name is required when cashier account is enabled.');
        return false;
      }
      if (!cashierEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cashierEmail.trim())) {
        setError('A valid cashier email address is required when cashier account is enabled.');
        return false;
      }
      if (!cashierPassword || cashierPassword.length < 6) {
        setError('Cashier password of at least 6 characters is required when cashier account is enabled.');
        return false;
      }
    }
    return true;
  };

  const handleFinishOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (alreadyCompleted) return;
    if (!validateStep1()) {
      setStep(1);
      return;
    }
    if (!validateStep2()) {
      setStep(2);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const willCreateCashier =
        enableCashier &&
        cashierEmail.trim().length > 0 &&
        cashierPassword.trim().length > 0;

      const res = await api.saas.completeOnboarding({
        storeName: toTitleCaseTrimmed(storeName),
        address: toTitleCaseTrimmed(address),
        phone: phone.trim(),
        email: toLowerTrimmed(ownerEmail),
        ownerName: toTitleCaseTrimmed(ownerName),
        adminPassword: adminPassword.trim() || undefined,
        // Cashier account (Only created if explicitly enabled and filled; if skipped, false is sent and no cashier is created):
        createCashier: willCreateCashier,
        cashierName: willCreateCashier ? toTitleCaseTrimmed(cashierName) : undefined,
        cashierEmail: willCreateCashier ? toLowerTrimmed(cashierEmail) : undefined,
        cashierPhone: willCreateCashier ? cashierPhone.trim() : undefined,
        cashierPassword: willCreateCashier ? cashierPassword.trim() : undefined,
        // POS & Accounting Defaults:
        taxId: taxId.trim(),
        strn: strn.trim(),
        taxRate,
        currency,


        invoiceFooter: toTitleCaseTrimmed(invoiceFooter),
        lowStockLimit,
        businessType,
        pricingMode: businessType === 'WHOLESALE' ? 'FIXED' : pricingMode,
        minSellingQuantity: businessType === 'WHOLESALE' ? minSellingQuantity : 1.0,
        allowHalfCarton: businessType === 'WHOLESALE' ? minSellingQuantity <= 0.5 : true,
        logoUrl,
        initialProducts: initialProducts
          .filter((p) => p.name.trim().length > 0)
          .map((p) => ({
            ...p,
            name: toTitleCaseTrimmed(p.name),
            brand: toTitleCaseTrimmed(p.brand),
            category: toTitleCaseTrimmed(p.category),
            color: toTitleCaseTrimmed(p.color),
          })),
      }, tenantId);

      setAlreadyCompleted(true);
      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }

      // The server sends the single welcome notification/email after the onboarding
      // transaction commits successfully. Do not trigger a second client-side send.
      onCompleted(tenantId, res.user, res.token, res.settings);
    } catch (err: any) {
      setError(err.message || 'Failed to save initial store setup.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between relative overflow-x-hidden bg-slate-200 dark:bg-[#0A0E1A] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-200">
      <ShowroomBackground />

      <PublicHeader
        storeName={`${storeName || 'Store'} — Initial Store Setup`}
        badgeText={alreadyCompleted ? 'Setup Locked' : 'Owner Onboarding'}
        badgeVariant={alreadyCompleted ? 'locked' : 'wizard'}
        subtitle={
          alreadyCompleted
            ? 'Initial Store Setup & POS Defaults Sealed'
            : 'First-Time Store Owner Configuration'
        }
        dbText="Secure Store Setup"
      />

      <main className="relative z-10 w-full flex-1 py-8 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="bg-white/95 dark:bg-[#131B2E]/95 backdrop-blur-md rounded-3xl p-8 sm:p-10 shadow-2xl border border-white/30 dark:border-purple-800/60 flex flex-col items-center max-w-sm w-full mx-auto text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-purple-600/30 ring-2 ring-indigo-400/30">
                <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {storeName || 'Store Setup'}
              </h2>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                Loading Onboarding Configuration...
              </p>
            </div>
          ) : alreadyCompleted ? (
            <div
              id="tenant-onboarding-locked-card"
              className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-emerald-200/80 dark:border-emerald-800/70 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/80 dark:border-slate-800">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-sm">
                    <Lock className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-mono font-bold mb-1.5">
                      <Lock className="w-3 h-3" />
                      <span>Initial Store Setup &amp; POS Defaults Locked</span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                      Initial Store Setup &amp; POS Defaults
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      Store setup for <strong>{storeName || 'this store'}</strong> has already been completed by the Store Owner. To protect active POS invoice sequences, barcode standards, currency, and counter pricing rules, Initial Store Setup &amp; POS Defaults is permanently locked.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onCancel}
                  className="self-start sm:self-center inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md transition cursor-pointer shrink-0"
                >
                  <span>Open Store POS Portal</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Locked POS Defaults Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Store Identity</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {storeName || 'Store'}
                  </div>
                  {phone && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      Tel: {phone}
                    </div>
                  )}
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Fixed Document Numbers &amp; Barcode</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    Invoices: INV- • Purchases: PUR-
                  </div>
                  <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                    Barcode Standard: <span className="text-emerald-600 dark:text-emerald-400">Code-128</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Low Stock Alert: {businessType === 'WHOLESALE' ? `${Math.max(1, Math.round(lowStockLimit / 12))} Cartons (${lowStockLimit} Pairs)` : `${lowStockLimit} Pairs`}
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/90 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-mono font-bold uppercase text-slate-500 dark:text-slate-400">
                    <span>Business Type &amp; Pricing Policy</span>
                    <Lock className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {businessType === 'WHOLESALE'
                      ? 'Wholesale Store (B2B) • Fixed Carton Pricing'
                      : pricingMode === 'NEGOTIABLE'
                      ? 'Retail Store (B2C) • Bargaining Price Range'
                      : 'Retail Store (B2C) • Fixed Price'}
                  </div>
                  <div className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    Currency: <strong>{currency}</strong> • Sales Tax: <strong>{taxRate}%</strong>
                  </div>
                  {taxId && (
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                      Tax ID: {taxId}
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 text-amber-900 dark:text-amber-200">
                  <ShieldCheck className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>Commissioning Guard Active:</strong> Initial Store Setup &amp; POS Defaults is locked after first-time owner setup. Contact details, receipt logo, and printer hardware can be managed inside the Owner Portal under <strong>Settings</strong>.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shrink-0 cursor-pointer transition"
                >
                  Return to Dashboard →
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Top Welcome & Required Setup Notice */}
              <div className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl p-5 sm:p-6 mb-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-purple-600/25">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-semibold text-purple-600 dark:text-purple-300">
                        Store Onboarding
                      </div>
                      <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        Initial Store Setup &amp; POS Defaults
                      </h1>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                        Configure your store administrator account, optional cashier staff, document prefixes, and tax/receipt rules to unlock your Owner Portal.
                      </p>
                    </div>
                  </div>

                  {alreadyCompleted && !isRequiredFirstLogin && (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="self-start sm:self-center px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 transition cursor-pointer shrink-0"
                    >
                      Return to Dashboard →
                    </button>
                  )}
                </div>

                {/* 4-Step Stepper Navigation Aligned with ProductFormModal */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-5 pt-5 border-t border-slate-200/80 dark:border-purple-900/50">
                  {[
                    {
                      num: 1,
                      title: 'Store & Admin Account',
                      stepLabel: 'Step 1',
                    },
                    {
                      num: 2,
                      title: 'Cashier Account Setup',
                      stepLabel: 'Step 2',
                    },
                    {
                      num: 3,
                      title: 'Invoices, Taxes & Receipts',
                      stepLabel: 'Step 3',
                    },
                    {
                      num: 4,
                      title: 'Branding & Quick Launch',
                      stepLabel: 'Step 4',
                    },
                  ].map((s) => {
                    const active = step === s.num;
                    const done = step > s.num;
                    return (
                      <button
                        key={s.num}
                        type="button"
                        onClick={() => {
                          if (s.num === 1) {
                            setError(null);
                            setStep(1);
                          } else if (s.num === 2) {
                            if (validateStep1()) {
                              setError(null);
                              setStep(2);
                            }
                          } else if (s.num === 3) {
                            if (validateStep1() && validateStep2()) {
                              setError(null);
                              setStep(3);
                            }
                          } else if (s.num === 4) {
                            if (validateStep1() && validateStep2()) {
                              setError(null);
                              setStep(4);
                            }
                          }
                        }}
                        className={`flex items-center gap-1.5 p-2 rounded-xl text-left transition cursor-pointer border ${
                          active
                            ? 'btn-primary text-white shadow-xs font-semibold border-transparent'
                            : done
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60'
                            : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-800/50'
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            active
                              ? 'bg-white text-blue-600 dark:text-purple-700'
                              : done
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-600 dark:bg-purple-900/60 dark:text-purple-200'
                          }`}
                        >
                          {done ? <Check className="w-3 h-3 stroke-[3]" /> : s.num}
                        </div>
                        <div className="truncate min-w-0">
                          <span className="block text-[9px] uppercase font-bold tracking-wider opacity-75">
                            {s.stepLabel}
                          </span>
                          <span className="block text-xs font-semibold truncate">
                            {s.title}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="mb-5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-500/40 text-rose-700 dark:text-rose-200 text-xs font-medium shadow-md">
                  {error}
                </div>
              )}

              <form
                onSubmit={handleFinishOnboarding}
                className="app-card bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border border-purple-200/80 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl text-slate-900 dark:text-slate-100"
              >
                {/* STEP 1: STORE DETAILS & MASTER ADMINISTRATOR ACCOUNT */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <UserCheck className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Store Identity &amp; Master Administrator Account</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        During store creation, only one primary Administrator account is created. Configure your store name, physical address, and master admin credentials below:
                      </p>
                    </div>

                    {/* Store Physical Identity */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-purple-900/40 space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" />
                        <span>Store Basic Information</span>
                      </div>

                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Store Name *
                          </label>
                          <div className="relative">
                            <Building2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              required
                              value={storeName}
                              onChange={(e) => setStoreName(toTitleCaseLive(e.target.value))}
                              placeholder="Apex Footwear"
                              className="app-input capitalize w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>

                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Store Physical Address (Printed on Receipts) *
                        </label>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                          <textarea
                            rows={2}
                            required
                            value={address}
                            onChange={(e) => setAddress(toTitleCaseLive(e.target.value))}
                            placeholder="Shop #14, Ground Floor, Dolmen Mall Clifton, Karachi"
                            className="app-input capitalize w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Master Administrator Account (Only 1 Account Created) */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span>Store Administrator Account (ADMIN)</span>
                        </div>
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 border border-purple-200 dark:border-purple-700 text-purple-800 dark:text-purple-200 text-[11px] font-mono font-bold">
                          Single Master Account
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        This is your primary login credential. The Store Admin has unrestricted access to reporting, financial summaries, sales history, inventory purchases, and staff management.
                      </p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Administrator Full Name *
                          </label>
                          <div className="relative">
                            <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type="text"
                              required
                              value={ownerName}
                              onChange={(e) => setOwnerName(toTitleCaseLive(e.target.value))}
                              placeholder="e.g. Talhah Jan"
                              className="app-input capitalize w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Administrator Login Email *
                          </label>
                          <div className="relative">
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="email"
                              required
                              value={ownerEmail}
                              onChange={(e) => setOwnerEmail(e.target.value)}
                              placeholder="admin@shoepos.com"
                              className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Contact Phone Number
                          </label>
                          <div className="relative">
                            <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="text"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="+92 300 1234567"
                              className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Administrator Password <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">(Optional)</span>
                          </label>
                          <div className="relative">
                            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              type={showAdminPassword ? 'text' : 'password'}
                              value={adminPassword}
                              onChange={(e) => setAdminPassword(e.target.value)}
                              placeholder="Leave blank to use password set during registration"
                              className="app-input w-full pl-9 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminPassword(!showAdminPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                            >
                              {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                            Leave blank to keep the password you set during the free trial registration.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={onCancel}
                        className="btn-secondary px-4 py-2.5 text-xs font-semibold cursor-pointer"
                      >
                        Cancel Setup
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                          title="Save and launch store portal directly"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>{saving ? 'Saving...' : 'Save & Launch'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (validateStep1()) {
                              setError(null);
                              setStep(2);
                            }
                          }}
                          className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                        >
                          <span>Next: Cashier Account Setup (Recommended)</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: CASHIER ACCOUNT SETUP (RECOMMENDED) */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/50 border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 text-[11px] font-mono font-bold mb-1.5">
                        <Users className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        <span>Counter Staff Setup (Recommended)</span>
                      </div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Users className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Add Cashier Account (Recommended)</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Recommended: Cashier accounts are restricted to POS barcode checkout, billing, and receipt printing without access to business profits, cost prices, or settings. If you prefer to operate solo, you can skip this step.
                      </p>
                    </div>

                    {/* Toggle: Recommend Add Cashier, Option to Skip */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div
                        onClick={() => setEnableCashier(true)}
                        className={`p-4 rounded-2xl border transition cursor-pointer ${
                          enableCashier
                            ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-500 shadow-sm ring-1 ring-purple-500/20'
                            : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold uppercase text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                            <UserPlus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                            <span>Add Cashier Account (Recommended)</span>
                          </span>
                          {enableCashier && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          Provision a dedicated counter staff account for daily POS checkout, keeping your Store Owner credentials, wholesale profits, and ledger private.
                        </p>
                      </div>

                      <div
                        onClick={() => setEnableCashier(false)}
                        className={`p-4 rounded-2xl border transition cursor-pointer ${
                          !enableCashier
                            ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-500 shadow-sm ring-1 ring-purple-500/20'
                            : 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-slate-300 opacity-90'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-mono font-bold uppercase text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <SkipForward className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            <span>Skip Cashier Setup</span>
                          </span>
                          {!enableCashier && <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          Do not create a cashier account right now. Only your Store Owner / Admin account will be active. You can create cashier accounts anytime later from <strong>Settings &rarr; Staff</strong>.
                        </p>
                      </div>
                    </div>

                    {!enableCashier ? (
                      <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-3 text-xs text-emerald-800 dark:text-emerald-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <strong>Cashier Account Skipped:</strong> Only your Store Owner / Admin account (<code>{ownerEmail || 'admin'}</code>) will be created. No cashier account will be generated automatically.
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-purple-200 dark:border-purple-800/60 space-y-4">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Cashier Account Details</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Cashier Full Name *
                            </label>
                            <input
                              type="text"
                              value={cashierName}
                              onChange={(e) => setCashierName(toTitleCaseLive(e.target.value))}
                              placeholder="e.g. Counter Cashier 1"
                              className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Cashier Email / Login ID *
                            </label>
                            <div className="relative">
                              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="email"
                                value={cashierEmail}
                                onChange={(e) => setCashierEmail(e.target.value)}
                                placeholder="cashier@store.com"
                                className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Cashier Phone Number (Optional)
                            </label>
                            <div className="relative">
                              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                value={cashierPhone}
                                onChange={(e) => setCashierPhone(e.target.value)}
                                placeholder="+92 300 0000000"
                                className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                              Cashier Password *
                            </label>
                            <div className="relative">
                              <input
                                type={showCashierPassword ? 'text' : 'password'}
                                value={cashierPassword}
                                onChange={(e) => setCashierPassword(e.target.value)}
                                placeholder="Enter cashier password"
                                className="app-input w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowCashierPassword(!showCashierPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                              >
                                {showCashierPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              setEnableCashier(false);
                              setCashierEmail('');
                              setCashierPassword('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline cursor-pointer"
                          >
                            Skip cashier setup instead &rarr;
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setStep(1);
                        }}
                        className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                          title="Save and launch store portal directly"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>{saving ? 'Saving...' : 'Save & Launch'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (validateStep2()) {
                              setError(null);
                              setStep(3);
                            }
                          }}
                          className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                        >
                          <span>Next: Invoices, Taxes &amp; Receipts</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 3: DOCUMENT PREFIXES, TAXES & RECEIPT FOOTER */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Barcode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Document Prefixes, Inventory Defaults &amp; Taxes</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Document numbering uses INV- for sales and PUR- for purchases. Configure stock alerts, pricing policies, and receipt notes.
                      </p>
                    </div>

                    {/* Numbering & POS Settings */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-purple-900/40 space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300">
                        Document Prefixes &amp; Inventory Defaults
                      </div>

                      <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-800 dark:text-blue-200 text-xs">
                        Choose the business type and pricing policy for this store. These settings remain editable until you finish onboarding, then they are locked.
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            {businessType === 'WHOLESALE' ? 'Low Stock Threshold (Cartons)' : 'Low Stock Alert Threshold (Pairs)'}
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={businessType === 'WHOLESALE' ? Math.max(1, Math.round(lowStockLimit / 12)) : lowStockLimit}
                            onChange={(e) => {
                              const entered = Math.max(1, Number(e.target.value) || 1);
                              setLowStockLimit(businessType === 'WHOLESALE' ? entered * 12 : entered);
                            }}
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                          {businessType === 'WHOLESALE' && (
                            <p className="text-[10px] text-purple-700 dark:text-purple-300 font-mono mt-1">
                              = {lowStockLimit} pairs ({Math.max(1, Math.round(lowStockLimit / 12))} cartons × 12 pairs)
                            </p>
                          )}
                        </div>

                        <div className="sm:col-span-2 pt-2 border-t border-slate-200/80 dark:border-purple-900/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                              Business Type &amp; Pricing Policy *
                            </label>
                            <span className="text-[11px] text-purple-700 dark:text-purple-300 font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800">
                              {businessType === 'RETAIL' ? 'Retail (B2C)' : 'Wholesale (B2B)'}
                            </span>
                          </div>

                          {/* Business Type Selector */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label
                              className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                                businessType === 'RETAIL'
                                  ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                              } cursor-pointer`}
                            >
                              <input
                                type="radio"
                                name="onboardingBusinessType"
                                value="RETAIL"
                                checked={businessType === 'RETAIL'}
                                onChange={() => setBusinessType('RETAIL')}
                                className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <div className="text-xs">
                                <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                                  <span>Retail Store (B2C)</span>
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                  Individual pair sales, barcode scanning, walk-in shoppers &amp; returns
                                </span>
                              </div>
                            </label>

                            <label
                              className={`flex items-start gap-3 p-3 rounded-xl border transition ${
                                businessType === 'WHOLESALE'
                                  ? 'border-purple-600 bg-purple-50/70 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                              } cursor-pointer`}
                            >
                              <input
                                type="radio"
                                name="onboardingBusinessType"
                                value="WHOLESALE"
                                checked={businessType === 'WHOLESALE'}
                                onChange={() => {
                                  setBusinessType('WHOLESALE');
                                  setPricingMode('FIXED');
                                }}
                                className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                              />
                              <div className="text-xs">
                                <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                                  <span>Wholesale Store (B2B)</span>
                                </span>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                  Bulk carton packing, min order pairs, khata credit ledger &amp; transport bilty
                                </span>
                              </div>
                            </label>
                          </div>

                          {/* Pricing Policy */}
                          {businessType === 'RETAIL' ? (
                            <div className="p-3.5 rounded-xl bg-purple-50/40 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-900/40 space-y-2">
                              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                                <span>Store Pricing Policy</span>
                                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold">Editable until setup is finished</span>
                              </label>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Select the pricing policy for this retail store:
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <label
                                  className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${
                                    pricingMode === 'FIXED'
                                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                                    } cursor-pointer`}
                                >
                                  <input
                                    type="radio"
                                    name="onboardingPricingMode"
                                    value="FIXED"
                                    checked={pricingMode === 'FIXED'}
                                    onChange={() => setPricingMode('FIXED')}
                                    className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                  />
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-900 dark:text-white block">Fixed Price</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                      Single fixed selling price printed on barcode tags
                                    </span>
                                  </div>
                                </label>

                                <label
                                  className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${
                                    pricingMode === 'NEGOTIABLE'
                                      ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                                    } cursor-pointer`}
                                >
                                  <input
                                    type="radio"
                                    name="onboardingPricingMode"
                                    value="NEGOTIABLE"
                                    checked={pricingMode === 'NEGOTIABLE'}
                                    onChange={() => setPricingMode('NEGOTIABLE')}
                                    className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                  />
                                  <div className="text-xs">
                                    <span className="font-bold text-slate-900 dark:text-white block">Bargaining / Range Price</span>
                                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                      Min / Max price range allowing customer bargaining
                                    </span>
                                  </div>
                                </label>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="p-3 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200/70 dark:border-purple-800/50 flex items-center gap-2 text-xs text-purple-800 dark:text-purple-300">
                                <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                                <span>
                                  <strong>Fixed Wholesale Pricing:</strong> Wholesale stores operate with standard fixed carton and wholesale pair rates.
                                </span>
                              </div>

                              {/* Minimum Selling Quantity (0.5 or 1 Carton) */}
                              <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                                  Globally Allow Half-Carton Selling (0.5 Carton)
                                </label>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  If disabled globally, you can still enable or override this option individually at the product level.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                  <label
                                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${
                                      minSellingQuantity === 0.5
                                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                                    } cursor-pointer`}
                                  >
                                    <input
                                      type="radio"
                                      name="onboardingMinSellingQty"
                                      value="0.5"
                                      checked={minSellingQuantity === 0.5}
                                      onChange={() => setMinSellingQuantity(0.5)}
                                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                                        <span>Globally Allow Half-Carton Selling (0.5 Carton)</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-mono">Flexible</span>
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                        If disabled globally, you can still enable or override this option individually at the product level.
                                      </span>
                                    </div>
                                  </label>

                                  <label
                                    className={`flex items-start gap-2.5 p-3 rounded-xl border transition ${
                                      minSellingQuantity === 1.0
                                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/40 dark:border-purple-500 ring-1 ring-purple-500/20'
                                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 opacity-60'
                                    } cursor-pointer`}
                                  >
                                    <input
                                      type="radio"
                                      name="onboardingMinSellingQty"
                                      value="1"
                                      checked={minSellingQuantity === 1.0}
                                      onChange={() => setMinSellingQuantity(1.0)}
                                      className="mt-0.5 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                    <div className="text-xs">
                                      <span className="font-bold text-slate-900 dark:text-white block flex items-center gap-1.5">
                                        <span>1 Carton (Full Carton)</span>
                                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">Standard</span>
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                                        Strict full-carton packing (minimum 1 carton, no broken cartons)
                                      </span>
                                    </div>
                                  </label>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tax & Currency */}
                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/90 dark:bg-slate-950/60 border border-slate-200/80 dark:border-purple-900/40 space-y-4">
                      <div className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                        <ReceiptText className="w-3.5 h-3.5" />
                        <span>Currency, Taxes &amp; Receipt Footer</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Store Currency *
                          </label>
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                          >
                            <option value="PKR">PKR (Rs. — Pakistani Rupee)</option>
                            <option value="USD">USD ($ — US Dollar)</option>
                            <option value="AED">AED (AED — UAE Dirham)</option>
                            <option value="SAR">SAR (SAR — Saudi Riyal)</option>
                            <option value="GBP">GBP (£ — British Pound)</option>
                            <option value="EUR">EUR (€ — Euro)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Sales Tax / GST Rate (%)
                          </label>
                          <div className="relative">
                            <Percent className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.5"
                              value={taxRate}
                              onChange={(e) => setTaxRate(Math.max(0, Number(e.target.value) || 0))}
                              placeholder="0"
                              className="app-input w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Tax ID / NTN Number
                          </label>
                          <input
                            type="text"
                            value={taxId}
                            onChange={(e) => setTaxId(e.target.value)}
                            placeholder="NTN-4829104-7"
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            STRN / Sales Tax Registration No.
                          </label>
                          <input
                            type="text"
                            value={strn}
                            onChange={(e) => setStrn(e.target.value)}
                            placeholder="STRN-327789012"
                            className="app-input w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm font-mono"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Receipt Footer Notes &amp; Exchange Policy *
                        </label>
                        <textarea
                          rows={3}
                          required
                          value={invoiceFooter}
                          onChange={(e) => setInvoiceFooter(toTitleCaseLive(e.target.value))}
                          placeholder="Thank you for shopping with us! Exchanges accepted within 7 days with original receipt."
                          className="app-input capitalize w-full px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-sm"
                        />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                          Printed automatically at the bottom of every thermal POS receipt.
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setStep(2);
                        }}
                        className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                          title="Save and launch store portal directly"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <span>{saving ? 'Saving...' : 'Save & Launch'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setStep(4);
                          }}
                          className="btn-primary px-5 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-sm font-bold"
                        >
                          <span>Next: Branding &amp; Catalog</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 4: OPTIONAL PWA BRANDING & STARTER FOOTWEAR CATALOG */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                        <span>Store Branding &amp; Optional Starter Inventory</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Set your store&apos;s logo, or add starter shoe articles before entering the full Owner Portal.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      <div className="md:col-span-7 space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                            Store Logo URL or Upload
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={logoUrl}
                              onChange={(e) => setLogoUrl(e.target.value)}
                              placeholder="/pwa-512x512.png"
                              className="app-input flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-purple-800/60 text-slate-900 dark:text-white text-xs font-mono"
                            />
                            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer shrink-0">
                              <Upload className="w-3.5 h-3.5" />
                              <span>Upload</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleLogoFileUpload}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="md:col-span-5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-purple-600 dark:text-purple-300 mb-2.5">
                          <Smartphone className="w-4 h-4" />
                          <span>Receipt &amp; PWA Preview</span>
                        </div>

                        <div
                          className="rounded-xl p-3.5 mb-3 flex items-center gap-3 border border-white/10 bg-purple-600"
                        >
                          <img
                            src={logoUrl || '/pwa-512x512.png'}
                            alt="Store Icon"
                            className="w-11 h-11 rounded-xl bg-slate-950/30 object-contain p-1"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/pwa-512x512.png';
                            }}
                          />
                          <div className="text-white min-w-0">
                            <div className="font-bold text-sm truncate">{storeName || 'Store'}</div>
                            <div className="text-[11px] opacity-90 font-mono truncate">Invoice: INV-00001 • Purchase: PUR-0001
                            </div>
                            <div className="text-[11px] opacity-90 font-mono truncate">
                              Tax: {taxRate}% • Currency: {currency}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optional Starter Footwear Articles */}
                    <div className="space-y-3 pt-2 border-t border-slate-200/80 dark:border-purple-900/40">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                            Optional Starter Footwear Articles
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddProductRow}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-purple-700 dark:text-purple-300 text-xs font-bold cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add Starter Shoe Article</span>
                        </button>
                      </div>

                      {initialProducts.length > 0 && (
                        <div className="space-y-2.5">
                          {initialProducts.map((prod, idx) => (
                            <div
                              key={idx}
                              className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 items-center"
                            >
                              <div className="sm:col-span-4">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Shoe Model / Article
                                </label>
                                <input
                                  type="text"
                                  value={prod.name}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].name = toTitleCaseLive(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  placeholder="e.g. Classic Leather Loafer"
                                  className="capitalize w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Brand
                                </label>
                                <input
                                  type="text"
                                  value={prod.brand}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].brand = toTitleCaseLive(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="capitalize w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Cost ({currency})
                                </label>
                                <input
                                  type="number"
                                  value={prod.purchasePrice}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].purchasePrice = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Retail ({currency})
                                </label>
                                <input
                                  type="number"
                                  value={prod.sellingPrice}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].sellingPrice = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-1">
                                <label className="text-[10px] font-mono text-slate-500 block">
                                  Qty
                                </label>
                                <input
                                  type="number"
                                  value={prod.stock}
                                  onChange={(e) => {
                                    const copy = [...initialProducts];
                                    copy[idx].stock = Number(e.target.value);
                                    setInitialProducts(copy);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-mono"
                                />
                              </div>

                              <div className="sm:col-span-1 flex justify-end pt-3">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProductRow(idx)}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200/80 dark:border-purple-900/40">
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setStep(3);
                        }}
                        className="btn-secondary px-4 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs font-bold"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>Back</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="submit"
                          disabled={saving}
                          className="btn-primary px-6 py-2.5 text-xs flex items-center gap-1.5 cursor-pointer shadow-md font-bold disabled:opacity-50"
                        >
                          {saving ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              <span>Finalizing Store Setup...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 stroke-[2.5]" />
                              <span>Complete Store Setup &amp; Unlock Owner Portal</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </main>

      <PublicFooter />
    </div>
  );
};
