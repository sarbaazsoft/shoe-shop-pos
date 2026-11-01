import React, { useEffect, useRef, useState } from 'react';
import { ShoppingCart, Package, Truck, Printer, Users, BarChart3, ShieldCheck, Settings, ArrowRight, Check, Calendar, Store, X, DollarSign, Sparkles, Search, Menu, Sun, Moon, Zap, Headphones, LayoutDashboard, Tag, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import shoeStoreBg from '../../assets/images/shoe_store_blurred_bg_1790706924465.jpg';
import { api } from '../../services/api';
import { toTitleCaseTrimmed, toLowerTrimmed } from '../../utils/textFormat';
import type { TenantInfo, BusinessType, PricingMode } from '../../types';
import { FreeTrialOnboardingModal } from './FreeTrialOnboardingModal';
import { useTheme } from '../../context/ThemeContext';
import { Navbar } from './Navbar';

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

interface PublicStats {
  stores: number;
  products: number;
  invoicesToday: number;
  platformRevenue: number;
  superAdminEmail?: string;
  superAdminPhone?: string;
}

const AnimatedCounter: React.FC<{
  target: number;
  startTime: number | null;
  prefix?: string;
  suffix?: string;
}> = ({ target, startTime, prefix = '', suffix = '+' }) => {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (startTime === null) return;

    const duration = 1600;
    let animationFrame = 0;
    const animate = (timestamp: number) => {
      const progress = Math.min((timestamp - startTime) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(target * easedProgress));
      if (progress < 1) animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [startTime, target]);

  return <>{prefix}{value.toLocaleString('en-US')}{suffix}</>;
};

const SneakerGlyph: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg viewBox="0 0 120 70" className={className} aria-hidden="true">
    <path d="M8 50c0-6 4-10 10-12l22-8c6-2 11-8 15-15 2-3 6-3 8 0 4 6 10 10 17 12l22 6c7 2 12 8 12 15 0 4-3 7-7 7H15c-4 0-7-2-7-5z" fill="#F4F3FF" />
    <path d="M8 52h104c3 0 5 2 5 5s-2 5-5 5H14c-4 0-6-4-6-10z" fill="#C9C2FF" />
    <path d="M40 30l6 4m-10 2l6 4m-10 2l6 4" stroke="#7C6CFF" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M22 46c14-2 28-8 42-18" stroke="#8B7CFF" strokeWidth="3" strokeLinecap="round" fill="none" />
  </svg>
);

const DashboardMockup: React.FC = () => {
  const kpis = [
    { label: 'Total sales', value: 'Rs. 48,750', delta: '+12% from last week', icon: DollarSign },
    { label: 'Total orders', value: '142', delta: '+18% from last week', icon: ShoppingCart },
    { label: 'Total products', value: '1,248', delta: '+6% from last week', icon: Package },
  ];
  const popular = [
    { name: 'Classic runner', meta: 'Rs. 8,500 · 42 sold', tone: 'from-rose-300 to-rose-500' },
    { name: 'Court sneaker', meta: 'Rs. 7,200 · 36 sold', tone: 'from-slate-200 to-sky-300' },
    { name: 'Street low-top', meta: 'Rs. 6,900 · 28 sold', tone: 'from-sky-300 to-indigo-500' },
    { name: 'Canvas high-top', meta: 'Rs. 5,500 · 24 sold', tone: 'from-slate-500 to-slate-800' },
  ];
  const menu = [
    { label: 'Dashboard', icon: LayoutDashboard },
    { label: 'Sales', icon: ShoppingCart },
    { label: 'Products', icon: Tag },
    { label: 'Inventory', icon: Package },
    { label: 'Customers', icon: Users },
    { label: 'Reports', icon: BarChart3 },
    { label: 'Settings', icon: Settings },
  ];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="relative" role="img" aria-label="Sample SarbaazSoft POS dashboard with sales, orders, products, a sales chart and popular products">
      <div className="absolute -inset-4 rounded-[2rem] bg-violet-600/25 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[20px] border-2 border-indigo-400/50 bg-[#0A0C2E] shadow-[0_0_0_1px_rgba(124,108,255,0.2),0_30px_90px_-20px_rgba(91,75,255,0.65)]" aria-hidden="true">
        {/* top bar */}
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-white">
            <svg viewBox="0 0 64 42" className="h-4 w-6"><path d="M6 31c0-3 2-5 5-6l12-5c3-1.5 6-4.5 8-8 1-1.5 2.8-1.5 3.8 0 1.8 2.8 4.5 5 8.2 5.8l11 2.4c3.5.8 6 3.8 6 7.3 0 2.5-2 4.5-4.5 4.5H10.5C8 37 6 34.5 6 31z" fill="#7C6CFF" /></svg>
            SarbaazSoft
          </span>
          <span className="hidden sm:flex flex-1 max-w-[260px] items-center gap-1.5 rounded-md bg-white/5 px-2.5 py-1 text-[9px] text-slate-500"><Search className="h-2.5 w-2.5" />Search products, customers…</span>
          <span className="ml-auto flex items-center gap-2 text-[9px] text-slate-300">
            <span className="h-4 w-4 rounded-full bg-violet-500/40 ring-1 ring-violet-300/40" />
            <span className="leading-tight">Demo store<br /><span className="text-slate-500">Owner</span></span>
          </span>
        </div>
        <div className="flex">
          <ul className="hidden sm:block w-[118px] shrink-0 space-y-0.5 border-r border-white/5 p-2.5">
            {menu.map(({ label, icon: Icon }, i) => (
              <li key={label} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-[9px] ${i === 0 ? 'bg-violet-500/25 text-white font-semibold' : 'text-slate-400'}`}>
                <Icon className="h-3 w-3" />{label}
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 p-3 sm:p-4">
            <div className="mb-2.5 text-sm font-bold text-white">Dashboard</div>
            <div className="grid grid-cols-3 gap-2">
              {kpis.map(({ label, value, delta, icon: Icon }) => (
                <div key={label} className="rounded-lg border border-indigo-400/25 bg-gradient-to-b from-indigo-500/15 to-transparent p-2">
                  <div className="flex items-center gap-1.5 text-[8px] text-slate-300"><Icon className="h-3 w-3 text-violet-300" />{label}</div>
                  <div className="mt-1 text-[13px] sm:text-base font-extrabold text-white tabular-nums">{value}</div>
                  <div className="text-[7px] text-emerald-400">{delta}</div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-[1.55fr_1fr]">
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[9px] font-semibold text-white">Sales overview</span>
                  <span className="rounded border border-white/10 px-1.5 py-0.5 text-[7px] text-slate-400">Last 7 days ▾</span>
                </div>
                <div className="flex gap-1.5">
                  <div className="flex h-24 flex-col justify-between pb-3 text-[7px] text-slate-500"><span>4K</span><span>3K</span><span>2K</span><span>1K</span><span>0</span></div>
                  <div className="min-w-0 flex-1">
                    <svg viewBox="0 0 300 110" className="h-24 w-full" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="dm-area" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B7CFF" stopOpacity="0.55" />
                          <stop offset="100%" stopColor="#8B7CFF" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      {[15, 40, 65, 90].map((y) => <line key={y} x1="0" x2="300" y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />)}
                      <path d="M0 98 L45 90 L90 62 L130 68 L175 50 L215 46 L255 30 L300 12 L300 110 L0 110 Z" fill="url(#dm-area)" />
                      <path d="M0 98 L45 90 L90 62 L130 68 L175 50 L215 46 L255 30 L300 12" fill="none" stroke="#A395FF" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                    <div className="mt-0.5 flex justify-between text-[7px] text-slate-500">{days.map((d) => <span key={d}>{d}</span>)}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5">
                <div className="mb-1.5 text-[9px] font-semibold text-white">Popular products</div>
                <ul className="space-y-1.5">
                  {popular.map((p) => (
                    <li key={p.name} className="flex items-center gap-2">
                      <span className={`h-7 w-7 shrink-0 rounded bg-gradient-to-br ${p.tone}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-[9px] font-semibold text-white">{p.name}</span>
                        <span className="block truncate text-[7px] text-slate-400">{p.meta}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Floating product card */}
      <div className="absolute -bottom-10 left-3 sm:-left-8 w-44 rounded-xl border-2 border-indigo-400/50 bg-[#0B0E36] p-3 shadow-[0_20px_50px_-10px_rgba(91,75,255,0.7)]" aria-hidden="true">
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white"><ShoppingCart className="h-3 w-3" /></span>
        <div className="mx-auto h-16 w-28"><SneakerGlyph /></div>
        <div className="mt-1 text-[10px] font-semibold text-white">Classic runner</div>
        <div className="text-[11px] font-bold text-white">Rs. 8,500</div>
        <div className="mt-2 rounded-md bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-1.5 text-center text-[9px] font-bold text-white shadow-xs">Add to cart</div>
      </div>
    </div>
  );
};

// Set this to your demo video URL to make the hero's "Watch Demo" button open it.
const DEMO_VIDEO_URL = '';

/**
 * Interface representing a store displayed in the JS slider.
 * Includes isRegistered flag to distinguish real SaaS stores from partner showcase stores.
 */
export interface StoreSliderItem extends TenantInfo {
  isRegistered?: boolean;
}


/**
 * Returns the first and second letter of the store name as the fallback badge initials.
 */
function getStoreInitials(name: string): string {
  const clean = (name || '').trim();
  if (!clean) return 'SP';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0].replace(/[^a-zA-Z0-9]/g, '')[0] || '';
    const second = words[1].replace(/[^a-zA-Z0-9]/g, '')[0] || '';
    if (first && second) return (first + second).toUpperCase();
  }
  const alphaChars = clean.replace(/[^a-zA-Z0-9]/g, '');
  if (alphaChars.length >= 2) {
    return alphaChars.slice(0, 2).toUpperCase();
  }
  if (alphaChars.length === 1) {
    return alphaChars.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

const STORE_CARD_GRADIENTS = [
  'from-purple-600 via-indigo-600 to-purple-800 border-purple-400/40 text-white shadow-purple-600/30',
  'from-blue-600 via-indigo-600 to-cyan-600 border-blue-400/40 text-white shadow-blue-600/30',
  'from-emerald-600 via-teal-600 to-cyan-700 border-emerald-400/40 text-white shadow-emerald-600/30',
  'from-rose-600 via-pink-600 to-purple-700 border-rose-400/40 text-white shadow-rose-600/30',
  'from-amber-600 via-orange-600 to-rose-700 border-amber-400/40 text-white shadow-amber-600/30',
  'from-violet-600 via-purple-600 to-fuchsia-700 border-violet-400/40 text-white shadow-violet-600/30',
];

/**
 * Card bearing store logo, or store name first and second letter as fallback.
 */
const StoreLogoBadge: React.FC<{
  tenant: StoreSliderItem;
  index: number;
}> = ({ tenant, index }) => {
  const [imgError, setImgError] = useState(false);
  const initials = getStoreInitials(tenant.name);
  const hasStoreLogo =
    Boolean(tenant.logoUrl) &&
    !tenant.logoUrl?.endsWith('/pwa-512x512.png') &&
    !tenant.logoUrl?.endsWith('/favicon.png') &&
    !imgError;

  const gradientClass = STORE_CARD_GRADIENTS[index % STORE_CARD_GRADIENTS.length];

  return (
    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center p-1.5 relative shrink-0 transition-transform duration-200 group-hover:scale-105">
      {hasStoreLogo ? (
        <img
          src={tenant.logoUrl}
          alt={`${tenant.name} logo`}
          className="max-h-11 max-w-full object-contain rounded-xl drop-shadow-sm"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div
          className={`w-full h-full rounded-2xl bg-gradient-to-br ${gradientClass} border flex items-center justify-center shadow-md font-black text-xl sm:text-2xl tracking-wider select-none`}
          aria-hidden="true"
        >
          {initials}
        </div>
      )}
    </div>
  );
};

/**
 * Store Card: Proportional card bearing store logo or 1st & 2nd letter fallback, with store name below logo.
 * Strictly uses plain <div> tags with no anchor <a> tags or header <h*> tags.
 * Exclusively displays actual provisioned and registered stores in our SaaS database.
 */
const StoreSliderCard: React.FC<{
  tenant: StoreSliderItem;
  index: number;
}> = ({ tenant, index }) => {
  return (
    <div
      aria-label={`${tenant.name} store`}
      className="group relative flex flex-col items-center justify-between rounded-2xl border border-indigo-400/25 lt:border-indigo-200/80 bg-gradient-to-b from-[#12154A]/80 lt:from-white to-[#0A0C2E]/90 lt:to-[#F8FAFF] p-4 sm:p-5 text-center shadow-[0_12px_28px_-12px_rgba(91,75,255,0.4)] lt:shadow-sm transition-all duration-200 select-none w-full h-[175px] sm:h-[185px]"
    >
      {/* 1. Store Logo OR Store Name First and Second Letter as Fallback */}
      <StoreLogoBadge tenant={tenant} index={index} />

      {/* Subtle Divider */}
      <div className="w-3/4 my-2 border-t border-white/10 lt:border-slate-200" aria-hidden="true" />

      {/* 2. Store Name Below Logo (plain div, no anchor or h-tag) */}
      <div className="w-full flex-1 flex flex-col items-center justify-center min-w-0 px-2">
        <div
          className="w-full text-sm sm:text-base font-bold text-white lt:text-slate-900 truncate"
          title={tenant.name}
        >
          {tenant.name}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium">
          <div className="flex items-center gap-1.5 text-emerald-400 lt:text-emerald-600">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold">Registered Store</span>
          </div>
        </div>
      </div>
    </div>
  );
};


interface SaasLandingPageProps {
  availableTenants: TenantInfo[];
  onGlobalLogin: () => void;
  onOpenSuperAdmin: () => void;
  onStoreCreated?: (tenantId: number, loginUrl: string, user?: any, token?: string) => void;
}

export const SaasLandingPage: React.FC<SaasLandingPageProps> = ({
  availableTenants,
  onGlobalLogin,
  onOpenSuperAdmin,
  onStoreCreated,
}) => {
  const [activeNav, setActiveNav] = useState<'home' | 'features' | 'stores' | 'pricing' | 'about'>('home');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [platformOwnerEmail, setPlatformOwnerEmail] = useState<string>('');
  const [platformOwnerPhone, setPlatformOwnerPhone] = useState<string>('');
  const [platformOwnerName, setPlatformOwnerName] = useState<string>('');
  const [storeDirectory, setStoreDirectory] = useState<TenantInfo[]>(availableTenants);
  const [statsInView, setStatsInView] = useState(false);
  const [statsAnimationStartTime, setStatsAnimationStartTime] = useState<number | null>(null);
  const statsSectionRef = useRef<HTMLElement>(null);
  const storesSwiperRef = useRef<HTMLDivElement>(null);
  const swiperInstanceRef = useRef<any>(null);
  const { theme, themeMode, setThemeMode, toggleTheme } = useTheme();
  // landingTheme dynamically reflects the resolved theme ('dark' | 'light'), seamlessly supporting System preference
  const landingTheme: 'dark' | 'light' = theme;
  const toggleLandingTheme = toggleTheme;

  useEffect(() => {
    let isMounted = true;
    api.saas.getPublicStats()
      .then((stats) => {
        if (isMounted) {
          setPublicStats(stats);
          if (stats.superAdminEmail) {
            setPlatformOwnerEmail(stats.superAdminEmail);
          }
          if (stats.superAdminPhone) {
            setPlatformOwnerPhone(stats.superAdminPhone);
          }
        }
      })
      .catch(() => {
        // Keep the counters blank when live totals cannot be loaded; never show invented figures.
      });

    api.saas.getPlatformOwner()
      .then((owner) => {
        if (isMounted) {
          if (owner?.email) setPlatformOwnerEmail(owner.email);
          if (owner?.phone) setPlatformOwnerPhone(owner.phone);
          if (owner?.name) setPlatformOwnerName(owner.name);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (availableTenants && availableTenants.length > 0) {
      setStoreDirectory(availableTenants);
    }
  }, [availableTenants]);

  useEffect(() => {
    let isMounted = true;
    const refreshStoreDirectory = async () => {
      try {
        const result = await api.saas.resolve();
        if (isMounted && Array.isArray(result?.availableTenants) && result.availableTenants.length > 0) {
          setStoreDirectory(result.availableTenants as TenantInfo[]);
        }
      } catch {
        // Keep the last loaded store list if a refresh is temporarily unavailable.
      }
    };
    // Fetch immediately on mount so the store directory is ready without delay
    refreshStoreDirectory();
    const intervalId = window.setInterval(refreshStoreDirectory, 30_000);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  // Exclusively display actual stores provisioned and registered in our SaaS database (zero mockups)
  const mergedStores = React.useMemo<StoreSliderItem[]>(() => {
    const registeredList: StoreSliderItem[] = [];
    const seen = new Set<string>();

    // 1. Registered stores from live directory and availableTenants
    const registeredSources = [
      ...(Array.isArray(storeDirectory) ? storeDirectory : []),
      ...(Array.isArray(availableTenants) ? availableTenants : []),
    ];

    for (const t of registeredSources) {
      const key = (t.name || '').toLowerCase().trim();
      if (key && !seen.has(key)) {
        registeredList.push({
          ...t,
          isRegistered: true,
        });
        seen.add(key);
      }
    }

    // 2. Also check any newly registered stores saved in localStorage
    try {
      const cached = localStorage.getItem('pos_registered_stores_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          for (const t of parsed) {
            const key = (t.name || '').toLowerCase().trim();
            if (key && !seen.has(key)) {
              registeredList.push({
                ...t,
                isRegistered: true,
              });
              seen.add(key);
            }
          }
        }
      }
    } catch {
      // Ignore localStorage errors
    }

    return registeredList;
  }, [storeDirectory, availableTenants]);

  // Ensure sufficient slides for smooth infinite loop in Swiper while exclusively displaying actual registered stores
  const storesForSlider = React.useMemo<StoreSliderItem[]>(() => {
    if (mergedStores.length === 0) return [];
    // Cycle only real registered stores up to minimum slides needed for smooth Swiper infinite loop
    const minSlides = Math.max(mergedStores.length, 12);
    const result: StoreSliderItem[] = [];
    while (result.length < minSlides) {
      for (const s of mergedStores) {
        result.push(s);
        if (result.length >= minSlides) break;
      }
    }
    return result;
  }, [mergedStores]);

  useEffect(() => {
    const section = statsSectionRef.current;
    if (!section || statsInView) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setStatsInView(true);
        observer.disconnect();
      }
    }, { threshold: 0.25 });
    observer.observe(section);
    return () => observer.disconnect();
  }, [statsInView]);

  useEffect(() => {
    if (statsInView && publicStats && statsAnimationStartTime === null) {
      setStatsAnimationStartTime(performance.now());
    }
  }, [statsInView, publicStats, statsAnimationStartTime]);

  useEffect(() => {
    const container = storesSwiperRef.current;
    if (!container || storesForSlider.length === 0) return;

    type SwiperInstance = {
      destroy: (deleteInstance?: boolean, cleanStyles?: boolean) => void;
      update: () => void;
      slidePrev: () => void;
      slideNext: () => void;
    };
    let swiperInstance: SwiperInstance | null = null;
    let fallbackScrollInterval: number | null = null;

    const initializeSwiper = () => {
      const SwiperConstructor = (window as Window & {
        Swiper?: new (element: HTMLElement, options: Record<string, unknown>) => SwiperInstance;
      }).Swiper;
      if (!SwiperConstructor) return;

      if (swiperInstanceRef.current) {
        try {
          swiperInstanceRef.current.destroy(true, true);
        } catch {
          // Re-create if destroy failed
        }
      }

      try {
        swiperInstance = new SwiperConstructor(container, {
          slidesPerView: 'auto',
          spaceBetween: 10,
          centeredSlides: true,
          centeredSlidesBounds: true,
          watchOverflow: true,
          breakpointsBase: 'container',
          navigation: {
            nextEl: '#nextBtn',
            prevEl: '#prevBtn',
          },
          breakpoints: {
            480: { slidesPerView: 2.1, spaceBetween: 16 },
            768: { slidesPerView: 2.4, spaceBetween: 20 },
            920: { slidesPerView: 3.4, spaceBetween: 24 },
            1020: { slidesPerView: 4.2, spaceBetween: 30 },
          },
        });
        swiperInstanceRef.current = swiperInstance;
        container.style.overflow = 'hidden';
      } catch (err) {
        console.warn('Swiper init notice:', err);
      }
    };

    const swiperScript = document.querySelector<HTMLScriptElement>('script[data-swiper-cdn]');
    if ((window as Window & { Swiper?: unknown }).Swiper) {
      initializeSwiper();
    } else {
      swiperScript?.addEventListener('load', initializeSwiper);
      // Fallback smooth auto-scroll in case CDN script loading is delayed
      let isPaused = false;
      const onEnter = () => { isPaused = true; };
      const onLeave = () => { isPaused = false; };
      container.addEventListener('mouseenter', onEnter);
      container.addEventListener('mouseleave', onLeave);

      fallbackScrollInterval = window.setInterval(() => {
        if (!swiperInstance && container && !isPaused) {
          container.scrollLeft += 1.2;
          if (container.scrollLeft >= container.scrollWidth - container.clientWidth - 5) {
            container.scrollLeft = 0;
          }
        }
      }, 25);
    }

    return () => {
      swiperScript?.removeEventListener('load', initializeSwiper);
      if (fallbackScrollInterval) window.clearInterval(fallbackScrollInterval);
      swiperInstance?.destroy(true, true);
      swiperInstance = null;
      swiperInstanceRef.current = null;
    };
  }, [storesForSlider]);

  const handlePrevSlide = () => {
    if (swiperInstanceRef.current) {
      swiperInstanceRef.current.slidePrev();
    } else if (storesSwiperRef.current) {
      storesSwiperRef.current.scrollBy({ left: -240, behavior: 'smooth' });
    }
  };

  const handleNextSlide = () => {
    if (swiperInstanceRef.current) {
      swiperInstanceRef.current.slideNext();
    } else if (storesSwiperRef.current) {
      storesSwiperRef.current.scrollBy({ left: 240, behavior: 'smooth' });
    }
  };

  // Store request form states
  const [storeName, setStoreName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [plan, setPlan] = useState('TRIAL');
  const [businessType, setBusinessType] = useState<BusinessType>('RETAIL');
  const [pricingMode, setPricingMode] = useState<PricingMode>('FIXED');
  const [minSellingQuantity, setMinSellingQuantity] = useState<number>(1.0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{
    message: string;
    storeName?: string;
    ownerEmail?: string;
    superAdminEmail?: string;
    superAdminPhone?: string;
    trialActivated?: boolean;
    tenantId?: number;
    initialPassword?: string;
    loginUrl?: string;
    subscriptionEndDate?: string;
    trialDays?: number;
  } | null>(null);

  // Real-time validation & email availability states
  const [storeNameTouched, setStoreNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [emailAvailability, setEmailAvailability] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [emailAvailabilityMsg, setEmailAvailabilityMsg] = useState<string>('');

  const trimmedStoreName = storeName.trim();
  const isDuplicateStoreName =
    trimmedStoreName.length >= 2 &&
    storeDirectory.some((t) => String(t.name || '').trim().toLowerCase() === trimmedStoreName.toLowerCase());
  const isStoreNameValid =
    trimmedStoreName.length >= 3 &&
    trimmedStoreName.length <= 80 &&
    /[A-Za-z]{2,}/.test(trimmedStoreName) &&
    /^[A-Za-z0-9][A-Za-z0-9\s&'.,()-]{2,79}$/.test(trimmedStoreName) &&
    !isDuplicateStoreName;

  const storeNameErrorMsg = !trimmedStoreName
    ? 'Store name is required.'
    : isDuplicateStoreName
    ? 'A store with this name already exists. Please choose a different store name.'
    : trimmedStoreName.length < 3
    ? 'Store name must be at least 3 characters.'
    : !/[A-Za-z]{2,}/.test(trimmedStoreName)
    ? 'Store name must include letters (e.g. Metro Footwear).'
    : !isStoreNameValid
    ? 'Store name contains invalid characters.'
    : '';

  const trimmedEmail = ownerEmail.trim().toLowerCase();
  const isEmailFormatValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail);

  const trimmedPhone = ownerPhone.trim();
  const phoneDigitsCount = trimmedPhone.replace(/\D/g, '').length;
  const isPhoneValid =
    trimmedPhone.length > 0 &&
    /^[+]?[0-9\s\-()]{7,20}$/.test(trimmedPhone) &&
    phoneDigitsCount >= 10 &&
    phoneDigitsCount <= 15;

  const phoneErrorMsg = !trimmedPhone
    ? 'Phone / WhatsApp number is required.'
    : !/^[+]?[0-9\s\-()]+$/.test(trimmedPhone)
    ? 'Phone number can only contain digits, +, spaces, or hyphens.'
    : phoneDigitsCount < 10
    ? `Enter at least 10 digits (${phoneDigitsCount}/10 entered).`
    : phoneDigitsCount > 15
    ? 'Phone number cannot exceed 15 digits.'
    : '';

  // Real-time debounced email availability check
  useEffect(() => {
    if (!showRequestModal) return;
    if (!trimmedEmail || !isEmailFormatValid) {
      setEmailAvailability('idle');
      setEmailAvailabilityMsg('');
      return;
    }

    let cancelled = false;
    setEmailAvailability('checking');
    setEmailAvailabilityMsg('Checking email availability...');

    const timer = window.setTimeout(async () => {
      try {
        const res = await api.saas.checkEmailAvailability(trimmedEmail);
        if (cancelled) return;
        if (res.available) {
          setEmailAvailability('available');
          setEmailAvailabilityMsg(res.message || 'Email is available.');
        } else {
          setEmailAvailability('taken');
          setEmailAvailabilityMsg(
            res.message || 'This email is already in use. Please use a different email address.'
          );
        }
      } catch {
        if (!cancelled) {
          setEmailAvailability('available');
          setEmailAvailabilityMsg('Email format is valid.');
        }
      }
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [trimmedEmail, isEmailFormatValid, showRequestModal]);

  const canSubmitStoreRequest =
    isStoreNameValid &&
    isEmailFormatValid &&
    emailAvailability === 'available' &&
    isPhoneValid &&
    !submitting;

  const openGetStartedWithPlan = (selectedPlan: string) => {
    setPlan(selectedPlan);
    setSubmitError(null);
    setStoreNameTouched(false);
    setEmailTouched(false);
    setPhoneTouched(false);
    setShowRequestModal(true);
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setStoreNameTouched(true);
    setEmailTouched(true);
    setPhoneTouched(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!isStoreNameValid) {
      setSubmitError(storeNameErrorMsg || 'Please enter a valid store name.');
      return;
    }
    if (!isEmailFormatValid) {
      setSubmitError('Please enter a valid owner email address.');
      return;
    }
    if (emailAvailability === 'checking') {
      setSubmitError('Please wait while we verify email availability.');
      return;
    }
    if (emailAvailability === 'taken') {
      setSubmitError(emailAvailabilityMsg || 'This email is already in use. Please use a different email address.');
      return;
    }
    if (!isPhoneValid) {
      setSubmitError(phoneErrorMsg || 'Please enter a valid Phone / WhatsApp number (10 to 15 digits).');
      return;
    }

    const requestedStoreName = toTitleCaseTrimmed(storeName);
    const requestedOwnerEmail = toLowerTrimmed(ownerEmail);
    setSubmitting(true);
    try {
      const res = await api.saas.submitStoreRequest({
        storeName: requestedStoreName,
        ownerEmail: requestedOwnerEmail,
        ownerPhone: ownerPhone.trim(),
        plan,
        businessType,
        pricingMode: businessType === 'WHOLESALE' ? 'FIXED' : pricingMode,
        minSellingQuantity: businessType === 'WHOLESALE' ? minSellingQuantity : undefined,
        allowHalfCarton: businessType === 'WHOLESALE' ? minSellingQuantity <= 0.5 : undefined,
      });
      const resolvedSuperAdminEmail = res.superAdminEmail || platformOwnerEmail;
      const resolvedSuperAdminPhone = res.superAdminPhone || platformOwnerPhone;
      if (res.superAdminEmail) {
        setPlatformOwnerEmail(res.superAdminEmail);
      }
      if (res.superAdminPhone) {
        setPlatformOwnerPhone(res.superAdminPhone);
      }
      setSubmitSuccess({
        message: res.message,
        storeName: requestedStoreName,
        ownerEmail: requestedOwnerEmail,
        superAdminEmail: resolvedSuperAdminEmail,
        superAdminPhone: resolvedSuperAdminPhone,
        trialActivated: res.trialActivated,
        tenantId: res.tenantId,
        initialPassword: res.initialPassword,
        loginUrl: res.loginUrl,
        subscriptionEndDate: res.subscriptionEndDate,
        trialDays: res.trialDays || 30,
      });

      if (res.tenantId) {
        const newRegisteredTenant: TenantInfo = {
          id: res.tenantId,
          name: requestedStoreName,
          status: 'ACTIVE',
          subscriptionStatus: 'ACTIVE',
          businessType: businessType,
          pricingMode: pricingMode,
          logoUrl: '',
          currency: 'PKR',
          onboardingCompleted: true,
          appPath: `/?tenantId=${res.tenantId}`,
        };
        try {
          const existingRaw = localStorage.getItem('pos_registered_stores_cache');
          const existing = existingRaw ? JSON.parse(existingRaw) : [];
          const updated = [newRegisteredTenant, ...existing.filter((s: any) => s.id !== res.tenantId)];
          localStorage.setItem('pos_registered_stores_cache', JSON.stringify(updated));
        } catch {}
        setStoreDirectory((prev) => [newRegisteredTenant, ...prev.filter((t) => t.id !== res.tenantId)]);
        if (res.token && res.user) {
          handleStoreCreated(res.tenantId, res.loginUrl || '/dashboard', res.user, res.token);
          return;
        }
      }

      setStoreName('');
      setOwnerEmail('');
      setOwnerPhone('');
      setStoreNameTouched(false);
      setEmailTouched(false);
      setPhoneTouched(false);
      setEmailAvailability('idle');
      setEmailAvailabilityMsg('');
    } catch (err: any) {
      if (err?.code === 'EMAIL_ALREADY_EXISTS' || err?.code === 'PENDING_REQUEST_EXISTS') {
        setEmailAvailability('taken');
        setEmailAvailabilityMsg(err.message || 'This email is already in use.');
      }
      setSubmitError(err.message || 'Failed to submit store request.');
    } finally {
      setSubmitting(false);
    }
  };

  const scrollToSection = (id: string, navKey: 'home' | 'features' | 'stores' | 'pricing' | 'about') => {
    setActiveNav(navKey);
    if (id === 'top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const featureItems = [
    {
      title: 'POS & Exchanges',
      desc: 'High-speed barcode checkout, one-click shoe size swaps with automated price-difference calculation, and instant exchange receipts.',
      icon: ShoppingCart,
      category: 'Counter',
    },
    {
      title: 'Box Label Printing',
      desc: 'Generate and print shoe box labels, shelf price tags, and Code-128 / EAN-13 barcodes directly to TSPL and ESC/POS thermal printers.',
      icon: Printer,
      category: 'Barcodes',
    },
    {
      title: 'Shoe Inventory',
      desc: 'Track pairs by Brand, Article Code, Footwear Category (Men, Women, Boys, Girls, Kids), and full or half-carton master packs.',
      icon: Package,
      category: 'Sizes & Packs',
    },
    {
      title: 'Offline Checkout',
      desc: 'Ring up sales, scan shoes, and print customer receipts even when the internet drops. IndexedDB auto-syncs when reconnected.',
      icon: Zap,
      category: 'Zero Downtime',
    },
    {
      title: 'Retail & Wholesale',
      desc: 'Seamlessly toggle between counter retail billing and wholesale carton distribution with minimum quantity and half-carton policies.',
      icon: Tag,
      category: 'Dual Mode',
    },
    {
      title: 'Khata Ledgers',
      desc: 'Complete double-entry khata: customer credit limits, store balance statements, supplier purchase orders, and return credits.',
      icon: Users,
      category: 'Accounting',
    },
    {
      title: 'Financial Reports',
      desc: 'Instant Profit & Loss statements, gross margin analysis, best-selling footwear articles, stock valuation, and PDF export.',
      icon: BarChart3,
      category: 'Analytics',
    },
    {
      title: 'Sammi AI Assistant',
      desc: 'Powered by Gemini for automated shoe title and description drafting, sales trend summaries, and instant operational answers.',
      icon: Sparkles,
      category: 'AI Powered',
    },
    {
      title: 'Multi-Store & Apps',
      desc: 'Manage multiple shoe store branches under one account, install as desktop (.exe) or Android (.apk), with secure staff roles.',
      icon: LayoutDashboard,
      category: 'Cloud & PWA',
    },
  ];

  const landingNavItems = [
    { key: 'home', label: 'Home', section: 'top' },
    { key: 'features', label: 'Features', section: 'features' },
    { key: 'pricing', label: 'Pricing', section: 'pricing' },
    { key: 'stores', label: 'Stores', section: 'stores' },
    { key: 'about', label: 'About', section: 'about' },
  ] as const;

  const handleWatchDemo = () => {
    if (DEMO_VIDEO_URL) {
      window.open(DEMO_VIDEO_URL, '_blank', 'noopener,noreferrer');
      return;
    }
    scrollToSection('features', 'features');
  };

  const planFeatures = [
    'POS & size exchange',
    'Shoe box label printing',
    'Offline sales auto-sync',
    'Carton & size inventory',
    'Customer & supplier khata',
    'Sammi AI store assistant',
    'Desktop & Android apps',
    'Multi-role staff access',
  ];

  const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 active:from-purple-800 active:to-indigo-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white font-bold border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_18px_rgba(147,51,234,0.35)] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 active:scale-[0.98]';
  const outlineBtn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-400/50 lt:border-indigo-300 bg-transparent hover:bg-indigo-500/10 lt:hover:bg-indigo-50 text-white lt:text-slate-900 font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';
  const panel = 'rounded-2xl border border-indigo-400/25 lt:border-indigo-200 bg-gradient-to-b from-[#12154A]/70 lt:from-white to-[#0A0C2E]/80 lt:to-[#F3F4FF] shadow-[0_20px_60px_-25px_rgba(91,75,255,0.5)]';

  const handleStoreCreated = (tenantId: number, loginUrl: string, user?: any, token?: string) => {
    const createdStoreName = user?.storeName || 'New Registered Store';
    const newStore: TenantInfo = {
      id: tenantId,
      name: createdStoreName,
      status: 'ACTIVE',
      subscriptionStatus: 'ACTIVE',
      businessType: 'RETAIL',
      pricingMode: 'FIXED',
      logoUrl: '',
      currency: 'PKR',
      onboardingCompleted: true,
      appPath: `/?tenantId=${tenantId}`,
    };
    try {
      const existingRaw = localStorage.getItem('pos_registered_stores_cache');
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const updated = [newStore, ...existing.filter((s: any) => s.id !== tenantId)];
      localStorage.setItem('pos_registered_stores_cache', JSON.stringify(updated));
    } catch {}
    setStoreDirectory((prev) => [newStore, ...prev.filter((t) => t.id !== tenantId)]);
    onStoreCreated?.(tenantId, loginUrl, user, token);
  };

  return (
    <div
      data-landing-theme={landingTheme}
      style={{ colorScheme: landingTheme }}
      className="min-h-screen bg-[#070A24] lt:bg-[#F7F8FF] text-slate-100 lt:text-slate-800 font-sans selection:bg-violet-500 selection:text-white"
    >
      {/* 1. TOP NAVIGATION BAR */}
      <Navbar
        activeNav={activeNav}
        navItems={landingNavItems}
        onNavigate={scrollToSection}
        onLogin={onGlobalLogin}
        onStartFreeTrial={() => openGetStartedWithPlan('TRIAL')}
        landingTheme={landingTheme}
        onToggleTheme={toggleLandingTheme}
      />

      {/* 2. HERO */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#0B0C38_0%,#080A2C_60%,#070A24_100%)] lt:bg-[linear-gradient(180deg,#EEF0FF_0%,#F7F8FF_100%)]">
        <div className="pointer-events-none absolute -top-24 right-[-6%] h-[460px] w-[460px] rounded-full bg-[radial-gradient(circle,rgba(124,108,255,0.55),rgba(91,75,255,0.1)_60%,transparent_70%)] lt:opacity-40 blur-2xl" aria-hidden="true" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24 lg:pt-14 lg:pb-28">
          <div className="grid grid-cols-1 lg:grid-cols-[0.82fr_1.18fr] gap-16 lg:gap-6 items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-100 lt:text-indigo-700">
                <Zap className="w-3.5 h-3.5 text-violet-300 lt:text-[#5B4BFF]" aria-hidden="true" />
                Footwear Retail &amp; Wholesale Point of Sale
              </div>
              <h1 className="mt-5 text-[40px] sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.05] text-white lt:text-slate-900">
                The modern POS built for <br />
                <span className="text-[#8B7CFF] lt:text-[#5B4BFF]">shoe stores</span> &amp; footwear brands
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-200 lt:text-slate-700">
                Side-box label printing, 1-click shoe size exchanges, offline-ready checkouts, and complete customer &amp; supplier khata — tailored specifically for footwear merchants.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => openGetStartedWithPlan('TRIAL')} className={`${primaryBtn} px-7 py-3.5 text-sm`}>
                  Start Free Trial <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" onClick={onGlobalLogin} className={`${outlineBtn} px-7 py-3.5 text-sm`}>
                  <LogIn className="w-4 h-4" aria-hidden="true" /> Login
                </button>
              </div>
              <ul className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-5">
                {[
                  { icon: Printer, title: 'Shoe Box Labels', desc: 'TSPL & ESC/POS direct output' },
                  { icon: ShoppingCart, title: 'Instant Exchanges', desc: 'Size swaps with delta billing' },
                  { icon: ShieldCheck, title: 'Offline-Ready', desc: 'Sell without internet drops' },
                ].map(({ icon: Icon, title, desc }) => (
                  <li key={title} className="flex items-start gap-2.5">
                    <Icon className="w-5 h-5 mt-0.5 shrink-0 text-violet-300 lt:text-[#5B4BFF]" aria-hidden="true" />
                    <span>
                      <span className="block text-xs font-semibold text-violet-300 lt:text-[#5B4BFF]">{title}</span>
                      <span className="block text-[11px] text-slate-400 lt:text-slate-500">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="pb-10 lg:pl-6">
              <DashboardMockup />
            </div>
          </div>
        </div>
      </section>

      {/* 3. FEATURES */}
      <section id="features" className="bg-[#080A2A] lt:bg-[#F1F3FF] py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Tailored Footwear Features
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15] text-white lt:text-slate-900">
              Engineered specifically for the footwear industry
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300 lt:text-slate-600">
              Generic retail POS software ignores the reality of shoe shops: shoe box stickers, size assortments, carton pack ratios, and frequent exchanges. SarbaazSoft POS is purpose-built for shoe retailers and wholesalers.
            </p>

            {/* keep-dark:start */}
            <div className="mt-8 grid grid-cols-3 gap-3" aria-hidden="true">
              {/* Executive dashboard */}
              <div className="text-center">
                <div className="flex h-28 flex-col justify-between rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2 text-left">
                  <div className="flex items-center justify-between rounded bg-indigo-500/15 px-1.5 py-0.5 text-[7px] font-bold text-white">
                    <span>Footwear KPIs</span><span className="text-violet-300">Live</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="rounded border border-indigo-400/20 bg-[#080A2A] p-1">
                      <div className="text-[6px] text-slate-400">Today&apos;s sales</div>
                      <div className="text-[8px] font-extrabold text-white">Rs. 68,450</div>
                      <div className="text-[6px] font-bold text-emerald-400">+14%</div>
                    </div>
                    <div className="rounded border border-indigo-400/20 bg-[#080A2A] p-1">
                      <div className="text-[6px] text-slate-400">Pairs Sold</div>
                      <div className="text-[8px] font-extrabold text-white">48 pairs</div>
                      <div className="text-[6px] font-bold text-emerald-400">+10%</div>
                    </div>
                  </div>
                  <div className="flex h-7 items-end gap-1 px-1">
                    {['h-2 bg-violet-300/70', 'h-3 bg-violet-300', 'h-4 bg-violet-400', 'h-5 bg-[#8B7CFF]', 'h-6 bg-[#7C6CFF]', 'h-7 bg-[#6D5CFF]'].map((c) => <span key={c} className={`flex-1 rounded-t ${c}`} />)}
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">Footwear KPIs</div>
              </div>

              {/* POS counter */}
              <div className="text-center">
                <div className="flex h-28 flex-col justify-between rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2 text-left">
                  <div className="flex items-center justify-between rounded bg-indigo-500/15 px-1.5 py-0.5 text-[7px] font-bold text-white">
                    <span>Size Exchange</span><span className="text-emerald-400">F9</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div key={n} className="flex h-6 items-center justify-center rounded border border-indigo-400/20 bg-[#080A2A] p-0.5"><SneakerGlyph /></div>
                    ))}
                  </div>
                  <div className="rounded bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-0.5 text-center text-[7px] font-bold text-white shadow-xs">Swap 42 ⇄ 43 · Done</div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">Counter Exchanges</div>
              </div>

              {/* Barcode labels */}
              <div className="text-center">
                <div className="flex h-28 items-center justify-center rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2">
                  <div className="w-full rounded bg-slate-50 p-1.5 text-center">
                    <div className="text-[7px] font-extrabold text-slate-900 tracking-wider">AIR-RUNNER · 42</div>
                    <div className="text-[8px] font-black text-slate-900">AR-9021</div>
                    <div className="my-0.5 h-4 bg-[repeating-linear-gradient(90deg,#0f172a,#0f172a_1px,transparent_1px,transparent_3px)]" />
                    <div className="font-mono text-[6px] text-slate-700 font-bold">Rs. 6,500 · Code-128</div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">Side-Box Labels</div>
              </div>
            </div>
            {/* keep-dark:end */}
          </div>

          <ul className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {featureItems.map((feat, index) => {
              const Icon = feat.icon;
              const spansRow = featureItems.length % 2 === 1 && index === featureItems.length - 1;
              return (
                <li
                  key={feat.title}
                  className={`flex items-start gap-3.5 rounded-2xl border border-indigo-400/25 lt:border-indigo-200 bg-gradient-to-b from-[#12154A]/70 lt:from-white to-[#0A0C2E]/80 lt:to-[#F3F4FF] p-4 shadow-[0_0_20px_rgba(59,130,246,0.05)] transition-colors hover:border-violet-400/60 ${spansRow ? 'sm:col-span-2' : ''}`}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-indigo-400/30 lt:border-indigo-200 bg-indigo-500/15 lt:bg-indigo-100 text-violet-300 lt:text-[#5B4BFF]">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white lt:text-slate-900">{feat.title}</h3>
                      <span className="text-[10px] font-semibold text-violet-400 lt:text-indigo-600 shrink-0">{feat.category}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300 lt:text-slate-600">{feat.desc}</p>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 4. TRUST + STATS */}
      <section id="stores" ref={statsSectionRef} className="bg-gradient-to-b from-[#0B0D38] lt:from-[#EEF0FF] to-[#080A2A] lt:to-[#F7F8FF] py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700">
              <Store className="w-3.5 h-3.5" aria-hidden="true" /> Trusted by shoe businesses
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white lt:text-slate-900">
              Join the shoe stores already running on SarbaazSoft POS
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 lt:text-slate-600">
              From small boutiques to growing chains, shop owners use SarbaazSoft POS to streamline operations and grow their business.
            </p>
            <dl className="mt-9 grid w-full max-w-3xl grid-cols-2 sm:grid-cols-4 gap-y-6">
              {[
                { label: 'Active stores', value: publicStats?.stores, prefix: '', suffix: '+' },
                { label: 'Products tracked', value: publicStats?.products, prefix: '', suffix: '+' },
                { label: 'Invoices today', value: publicStats?.invoicesToday, prefix: '', suffix: '+' },
                { label: 'Platform revenue', value: publicStats?.platformRevenue, prefix: 'Rs. ', suffix: '' },
              ].map(({ label, value, prefix, suffix }, i) => (
                <div key={label} className={`pr-4 ${i > 0 ? 'sm:pl-5 sm:border-l sm:border-white/10 lt:sm:border-slate-200' : ''}`}>
                  <dd className="order-1 text-2xl font-extrabold tabular-nums text-[#9B8CFF] lt:text-[#5B4BFF]">
                    {typeof value === 'number'
                      ? <AnimatedCounter target={value} startTime={statsAnimationStartTime} prefix={prefix} suffix={suffix} />
                      : <span aria-label="Loading statistic">—</span>}
                  </dd>
                  <dt className="mt-1 text-xs text-slate-400 lt:text-slate-500">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* 4b. SHOPS USING SARBAAZSOFT POS */}
      <section id="shops" className="bg-[#0B0D38] lt:bg-[#EEF0FF] border-y border-white/10 lt:border-slate-200 py-12 lg:py-14 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-7 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3 py-1 text-xs text-violet-200 lt:text-indigo-700 font-semibold mb-2">
                <Store className="w-3.5 h-3.5" aria-hidden="true" /> Live Retail Network
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white lt:text-slate-900">
                Shops using SarbaazSoft POS
              </h2>
              <p className="mt-1 text-sm text-slate-300 lt:text-slate-600">
                Browse the retail stores currently registered and running on SarbaazSoft POS.
              </p>
            </div>

            {/* JS Slider Navigation Buttons */}
            {storesForSlider.length > 0 && (
              <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                <button
                  id="prevBtn"
                  type="button"
                  onClick={handlePrevSlide}
                  aria-label="Previous store"
                  className="w-10 h-10 rounded-xl border border-indigo-400/30 lt:border-indigo-200 bg-white/5 lt:bg-white text-white lt:text-slate-700 hover:bg-purple-600 hover:text-white lt:hover:bg-purple-600 lt:hover:text-white hover:border-purple-500 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  id="nextBtn"
                  type="button"
                  onClick={handleNextSlide}
                  aria-label="Next store"
                  className="w-10 h-10 rounded-xl border border-indigo-400/30 lt:border-indigo-200 bg-white/5 lt:bg-white text-white lt:text-slate-700 hover:bg-purple-600 hover:text-white lt:hover:bg-purple-600 lt:hover:text-white hover:border-purple-500 flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* JS Slider Container */}
          {storesForSlider.length > 0 ? (
            <div
              ref={storesSwiperRef}
              className="swiper w-full overflow-hidden pb-4 cursor-grab active:cursor-grabbing select-none"
              aria-label="Retail stores currently registered in SarbaazSoft POS"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="swiper-wrapper">
                {storesForSlider.map((tenant, index) => (
                  <div
                    key={`${tenant.id || tenant.name}-${index}`}
                    className="swiper-slide store-item shrink-0 h-auto w-[240px] max-w-[85%]"
                  >
                    <StoreSliderCard tenant={tenant} index={index} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-indigo-400/30 lt:border-indigo-200/80 bg-white/5 lt:bg-white p-8 text-center text-slate-300 lt:text-slate-600">
              <Store className="w-8 h-8 mx-auto mb-2 text-indigo-400 opacity-70" />
              <div className="font-semibold text-base text-white lt:text-slate-800">No registered stores yet</div>
              <p className="mt-1 text-sm text-slate-400 lt:text-slate-500 max-w-md mx-auto">
                Be the first to register and have your shoe store featured in our live network!
              </p>
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="mt-4 px-4 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors cursor-pointer"
              >
                Register Your Store
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 5. PRICING */}
      <section id="pricing" className="bg-[#080A2A] lt:bg-[#F1F3FF] py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-flex rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700">Simple, transparent pricing</div>
            <h2 className="mt-4 text-3xl sm:text-4xl font-extrabold tracking-tight text-white lt:text-slate-900">Choose the plan that fits your business</h2>
            <p className="mt-2 text-sm sm:text-base text-slate-300 lt:text-slate-600">No hidden fees. Full access to every feature on both plans.</p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {[
              { id: 'TRIAL', name: '30-Day Free Trial', price: 'Free', note: 'Instant 30-day access. No credit card required.', popular: true },
              { id: '6_MONTHS_RS_10000', name: '6 months', price: 'Rs. 10,000', note: 'Perfect for established stores or short-term needs.', popular: false },
              { id: '1_YEAR_RS_18000', name: '1 year', price: 'Rs. 18,000', note: 'Save more. Grow faster.', popular: false },
            ].map((p) => (
              <div
                key={p.id}
                className={`relative flex flex-col rounded-2xl p-7 ${p.popular
                  ? 'border-2 border-[#7C6CFF] bg-gradient-to-b from-[#1A1A66]/70 lt:from-[#EEEBFF] to-[#0A0C2E] lt:to-white shadow-[0_24px_70px_-20px_rgba(109,92,255,0.7)]'
                  : 'border border-indigo-400/25 lt:border-indigo-200 bg-gradient-to-b from-[#12154A]/60 lt:from-white to-[#0A0C2E] lt:to-white'}`}
              >
                {p.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-md bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 px-3 py-0.5 text-[11px] font-bold text-white shadow-xs border border-purple-400/30">Free 30-Day Access</span>
                )}
                <h3 className="flex items-center gap-2 text-lg font-bold text-white lt:text-slate-900">
                  <Calendar className="w-5 h-5 text-violet-300 lt:text-[#5B4BFF]" aria-hidden="true" /> {p.name}
                </h3>
                <div className="mt-3 flex items-baseline gap-1.5">
                  <span className="text-4xl font-extrabold tabular-nums text-white lt:text-slate-900">{p.price}</span>
                </div>
                <ul className="mt-6 space-y-3 text-sm text-slate-200 lt:text-slate-700">
                  {planFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-xs"><Check className="w-3 h-3 stroke-[3]" aria-hidden="true" /></span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-8">
                  <button
                    type="button"
                    onClick={() => openGetStartedWithPlan(p.id)}
                    className={`${p.popular ? primaryBtn : outlineBtn} w-full py-3 text-sm`}
                  >
                    {p.id === 'TRIAL' ? 'Start Free Trial' : 'Get started'}
                  </button>
                  <p className="mt-3 text-center text-xs text-slate-400 lt:text-slate-500">{p.note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 6. ABOUT / CTA BANNER */}
      <section
        id="about"
        className="relative overflow-hidden border-y border-indigo-400/20 lt:border-indigo-200 bg-gradient-to-r from-[#080A2A] via-[#0B0E36] to-[#0A0C2E] lt:from-[#EEF0FF] lt:via-[#F1F3FF] lt:to-[#F7F8FF] py-12"
      >
        {/* Showroom background overlay */}
        <div className="absolute inset-y-0 left-0 w-80 md:w-[36rem] opacity-60 lt:opacity-50 pointer-events-none" aria-hidden="true">
          <img
            src={shoeStoreBg}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#080A2A]/25 to-[#080A2A] lt:via-[#EEF0FF]/25 lt:to-[#EEF0FF]" />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_85%_0%,rgba(109,92,255,0.1),transparent_60%)] lt:opacity-40" aria-hidden="true" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <h2 className="text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight text-white lt:text-slate-900 [text-shadow:0_1px_14px_rgba(8,10,42,0.9)] lt:[text-shadow:none]">
              Ready to Take Your Shoe Business to the Next Level?
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm font-medium text-slate-200 lt:text-slate-600 [text-shadow:0_1px_10px_rgba(8,10,42,0.9)] lt:[text-shadow:none]">
              Join our growing community of store owners and start managing your business smarter today.
            </p>
          </div>
          <button
            type="button"
            onClick={() => openGetStartedWithPlan('TRIAL')}
            className={`${primaryBtn} px-7 py-3.5 text-sm shrink-0`}
          >
            Start Free Trial Now <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Global Application Footer */}
      <footer id="global-public-footer" className="border-t border-white/10 lt:border-slate-200 bg-[#080A2A] lt:bg-[#F1F3FF] px-4 sm:px-8 py-5 text-xs text-slate-300 lt:text-slate-600">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              id="sarbaazsoft-credit-link"
              href="https://portpolio-eight-pi.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white lt:text-slate-900 hover:text-[#B9A9FF] lt:hover:text-[#5B4BFF] hover:underline transition"
            >
              SarbaazSoft Shoe POS
            </a>
            <span className="text-slate-500 lt:text-slate-400" aria-hidden="true">&bull;</span>
            <span className="text-slate-400 lt:text-slate-500">Multi-Tenant Retail Shoe Shop POS &amp; Inventory Management SaaS</span>
          </div>
            <div className="flex items-center gap-3 font-medium">
              <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400 lt:text-emerald-600">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 lt:bg-emerald-500" aria-hidden="true" />
                System Online
              </span>
              <span className="text-slate-500 lt:text-slate-400" aria-hidden="true">&bull;</span>
              <span className="text-slate-400 lt:text-slate-500">&copy; 2026 All rights reserved.</span>
            </div>
        </div>
      </footer>
      {/* STEP-BY-STEP FREE TRIAL ONBOARDING WIZARD */}
      <FreeTrialOnboardingModal
        isOpen={showRequestModal}
        onClose={() => setShowRequestModal(false)}
        initialPlan={plan}
        storeDirectory={storeDirectory}
        platformOwnerEmail={platformOwnerEmail}
        platformOwnerPhone={platformOwnerPhone}
        onStoreCreated={handleStoreCreated}
        theme={landingTheme}
        onToggleTheme={toggleLandingTheme}
      />

    </div>
  );
};