import React, { useEffect, useRef, useState } from 'react';
import { ShoppingCart, Package, Truck, Printer, Users, BarChart3, ShieldCheck, Settings, ArrowRight, Check, Calendar, Store, DollarSign, Sparkles, Search, Zap, Headphones, LayoutDashboard, Tag, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import shoeStoreBg from '../../assets/images/shoe_store_blurred_bg_1790706924465.jpg';
import { api } from '../../services/api';
import type { TenantInfo } from '../../types';
import { FreeTrialOnboardingModal } from './FreeTrialOnboardingModal';
import { useTheme } from '../../context/ThemeContext';
import { Navbar } from './Navbar';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Autoplay, Pagination } from 'swiper/modules';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

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
  onSelect?: (tenant: TenantInfo) => void;
}> = ({ tenant, index, onSelect }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(tenant)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(tenant);
        }
      }}
      aria-label={`${tenant.name} store — click to sign in`}
      className="group relative flex flex-col items-center justify-between rounded-2xl border border-indigo-400/25 lt:border-indigo-200/80 bg-gradient-to-b from-[#12154A]/80 lt:from-white to-[#0A0C2E]/90 lt:to-[#F8FAFF] p-4 sm:p-5 text-center shadow-[0_12px_28px_-12px_rgba(91,75,255,0.4)] lt:shadow-sm hover:border-purple-400/60 hover:shadow-purple-500/25 hover:scale-[1.02] cursor-pointer transition-all duration-200 select-none w-full h-[175px] sm:h-[185px]"
    >
      {/* 1. Store Logo OR Store Name First and Second Letter as Fallback */}
      <StoreLogoBadge tenant={tenant} index={index} />

      {/* Subtle Divider */}
      <div className="w-3/4 my-2 border-t border-white/10 lt:border-slate-200" aria-hidden="true" />

      {/* 2. Store Name Below Logo (plain div, no anchor or h-tag) */}
      <div className="w-full flex-1 flex flex-col items-center justify-center min-w-0 px-2">
        <div
          className="w-full text-sm sm:text-base font-bold text-white lt:text-slate-900 truncate group-hover:text-purple-300 lt:group-hover:text-purple-600 transition-colors"
          title={tenant.name}
        >
          {tenant.name}
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-xs font-medium">
          <div className="font-courgette flex items-center gap-1.5 text-emerald-400 lt:text-emerald-600" style={{ fontFamily: "'Courgette', cursive, sans-serif" }}>
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
  onSelectStore?: (tenant: TenantInfo) => void;
}

export const SaasLandingPage: React.FC<SaasLandingPageProps> = ({
  availableTenants,
  onGlobalLogin,
  onOpenSuperAdmin,
  onStoreCreated,
  onSelectStore,
}) => {
  const [activeNav, setActiveNav] = useState<'home' | 'features' | 'stores' | 'pricing' | 'about'>('home');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [publicStats, setPublicStats] = useState<PublicStats | null>(null);
  const [platformOwnerEmail, setPlatformOwnerEmail] = useState<string>('');
  const [platformOwnerPhone, setPlatformOwnerPhone] = useState<string>('');
  const [storeDirectory, setStoreDirectory] = useState<TenantInfo[]>(availableTenants);
  const [statsInView, setStatsInView] = useState(false);
  const [statsAnimationStartTime, setStatsAnimationStartTime] = useState<number | null>(null);
  const statsSectionRef = useRef<HTMLElement>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const { theme, setThemeMode } = useTheme();
  const landingTheme = theme;

  useEffect(() => {
    try {
      localStorage.setItem('pos_landing_theme', theme);
    } catch {}
  }, [theme]);

  const toggleLandingTheme = () => {
    const nextMode = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('pos_landing_theme', nextMode);
    } catch {}
    try {
      setThemeMode(nextMode);
    } catch {}
  };

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

  const handlePrevSlide = () => {
    swiperRef.current?.slidePrev();
  };

  const handleNextSlide = () => {
    swiperRef.current?.slideNext();
  };

  const [plan, setPlan] = useState('TRIAL');

  const openGetStartedWithPlan = (selectedPlan: string) => {
    setPlan(selectedPlan);
    setShowRequestModal(true);
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
      title: 'POS & Sales Operations',
      desc: 'Fast billing, offline support, barcode scanning, returns and exchanges.',
      icon: ShoppingCart,
      iconBg: 'bg-[#EBF3FF]',
      iconColor: 'text-violet-300',
    },
    {
      title: 'Inventory Management',
      desc: 'Set prices, check stock levels and record changes to your products.',
      icon: Package,
      iconBg: 'bg-[#E6F8EF]',
      iconColor: 'text-[#10B981]',
    },
    {
      title: 'Purchases & Suppliers',
      desc: 'Supplier khata, purchase orders and supplier returns.',
      icon: Truck,
      iconBg: 'bg-[#FFEBEB]',
      iconColor: 'text-[#EF4444]',
    },
    {
      title: 'Hardware & Printing',
      desc: 'Thermal receipts, barcode labels and direct hardware control.',
      icon: Printer,
      iconBg: 'bg-[#F3E8FF]',
      iconColor: 'text-[#8B5CF6]',
    },
    {
      title: 'Customers & Returns',
      desc: 'Customer profiles, sales returns and POS exchanges.',
      icon: Users,
      iconBg: 'bg-[#E6F8EF]',
      iconColor: 'text-[#10B981]',
    },
    {
      title: 'Sales & Stock Reports',
      desc: 'Sales, profit, inventory valuation and low-stock alerts.',
      icon: BarChart3,
      iconBg: 'bg-[#FFF4E5]',
      iconColor: 'text-[#F59E0B]',
    },
    {
      title: 'Security & User Management',
      desc: 'Role-based access, secure accounts and automated backups.',
      icon: ShieldCheck,
      iconBg: 'bg-[#EBF3FF]',
      iconColor: 'text-violet-300',
    },
    {
      title: 'Store Settings & Branding',
      desc: 'Set up your shop, customize receipts and manage your team.',
      icon: Settings,
      iconBg: 'bg-[#F1F5F9]',
      iconColor: 'text-[#475569]',
    },
    {
      title: 'AI Store Assistant',
      desc: 'Get help with store operations and POS questions, plus AI suggestions when adding products.',
      icon: Sparkles,
      iconBg: 'bg-[#F3E8FF]',
      iconColor: 'text-[#8B5CF6]',
    },
  ];

  const landingNavItems = [
    { key: 'home', label: 'Home', section: 'top' },
    { key: 'features', label: 'Features', section: 'features' },
    { key: 'pricing', label: 'Pricing', section: 'pricing' },
    { key: 'stores', label: 'Stores', section: 'stores' },
    { key: 'about', label: 'About', section: 'about' },
  ] as const;

  const planFeatures = [
    'Full access to all features',
    'Multi-role staff access',
    'Built-in AI assistant',
    'Free updates & support',
    'Secure data backup',
  ];

  const primaryBtn = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 active:from-purple-800 active:to-indigo-800 dark:from-purple-600 dark:to-indigo-600 dark:hover:from-purple-500 dark:hover:to-indigo-500 text-white font-bold border border-purple-400/40 dark:border-purple-400/50 shadow-md shadow-purple-600/25 dark:shadow-[0_0_18px_rgba(147,51,234,0.35)] transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 active:scale-[0.98]';
  const outlineBtn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-400/50 lt:border-indigo-300 bg-transparent hover:bg-indigo-500/10 lt:hover:bg-indigo-50 text-white lt:text-slate-900 font-semibold transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300';

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
      onboardingCompleted: Boolean(user?.onboardingCompleted),
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
              <div
                className="font-courgette inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-100 lt:text-indigo-700"
                style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
              >
                <Zap className="w-3.5 h-3.5 text-violet-300 lt:text-[#5B4BFF]" aria-hidden="true" />
                Dual-Engine Wholesale & Retail POS Solution for Shoe Stores
              </div>
              <h1 className="mt-5 text-[40px] sm:text-5xl lg:text-[54px] font-extrabold tracking-tight leading-[1.05] text-white lt:text-slate-900">
                Grow your shoe<br />
                business <span className="font-courgette font-normal tracking-normal text-[#8B7CFF] lt:text-[#5B4BFF]" style={{ fontFamily: "'Courgette', cursive, sans-serif" }}>smarter</span> &amp;<br />
                <span className="font-courgette font-normal tracking-normal bg-gradient-to-r from-[#8B7CFF] lt:from-[#5B4BFF] to-[#B9A9FF] lt:to-[#8B7CFF] bg-clip-text text-transparent" style={{ fontFamily: "'Courgette', cursive, sans-serif" }}>faster</span>
              </h1>
              <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-200 lt:text-slate-700">
                SarbaazSoft POS gives you everything you need to manage sales, track inventory, and grow your footwear business — all in one powerful, easy-to-use platform.
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
                  { icon: Sparkles, title: 'Easy Setup', desc: 'Get started in minutes' },
                  { icon: ShieldCheck, title: 'Secure & Reliable', desc: 'Your data is safe' },
                  { icon: Headphones, title: '24/7 Support', desc: "We're always here" },
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
            <div
              className="font-courgette inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Features
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-extrabold tracking-tight leading-[1.15] text-white lt:text-slate-900">
              Everything you need to run your shoe store
            </h2>
            <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300 lt:text-slate-600">
              From sales to inventory, suppliers to reports — SarbaazSoft POS helps you manage your complete wholesale & retail business in one powerful platform.
            </p>

            {/* keep-dark:start */}
            <div className="mt-8 grid grid-cols-3 gap-3" aria-hidden="true">
              {/* Executive dashboard */}
              <div className="text-center">
                <div className="flex h-28 flex-col justify-between rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2 text-left">
                  <div className="flex items-center justify-between rounded bg-indigo-500/15 px-1.5 py-0.5 text-[7px] font-bold text-white">
                    <span>SarbaazSoft</span><span className="text-violet-300">KPIs</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="rounded border border-indigo-400/20 bg-[#080A2A] p-1">
                      <div className="text-[6px] text-slate-400">Today&apos;s sales</div>
                      <div className="text-[8px] font-extrabold text-white">Rs. 48,750</div>
                      <div className="text-[6px] font-bold text-emerald-400">+12%</div>
                    </div>
                    <div className="rounded border border-indigo-400/20 bg-[#080A2A] p-1">
                      <div className="text-[6px] text-slate-400">Orders</div>
                      <div className="text-[8px] font-extrabold text-white">36</div>
                      <div className="text-[6px] font-bold text-emerald-400">+8%</div>
                    </div>
                  </div>
                  <div className="flex h-7 items-end gap-1 px-1">
                    {['h-2 bg-violet-300/70', 'h-3 bg-violet-300', 'h-4 bg-violet-400', 'h-5 bg-[#8B7CFF]', 'h-6 bg-[#7C6CFF]', 'h-7 bg-[#6D5CFF]'].map((c) => <span key={c} className={`flex-1 rounded-t ${c}`} />)}
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">Executive dashboard</div>
              </div>

              {/* POS counter */}
              <div className="text-center">
                <div className="flex h-28 flex-col justify-between rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2 text-left">
                  <div className="flex items-center justify-between rounded bg-indigo-500/15 px-1.5 py-0.5 text-[7px] font-bold text-white">
                    <span>POS terminal</span><span className="text-emerald-400">F9</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <div key={n} className="flex h-6 items-center justify-center rounded border border-indigo-400/20 bg-[#080A2A] p-0.5"><SneakerGlyph /></div>
                    ))}
                  </div>
                  <div className="rounded bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-0.5 text-center text-[7px] font-bold text-white shadow-xs">Checkout · Rs. 16,699</div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">POS counter</div>
              </div>

              {/* Barcode labels */}
              <div className="text-center">
                <div className="flex h-28 items-center justify-center rounded-xl border border-indigo-400/25 bg-gradient-to-b from-[#12154A]/70 to-[#0A0C2E]/80 p-2">
                  <div className="w-full rounded bg-slate-50 p-1.5 text-center">
                    <div className="text-[7px] font-extrabold text-slate-900">Shoe store</div>
                    <div className="text-[8px] font-black text-slate-900">HS-1021</div>
                    <div className="my-0.5 h-4 bg-[repeating-linear-gradient(90deg,#0f172a,#0f172a_1px,transparent_1px,transparent_3px)]" />
                    <div className="font-mono text-[6px] text-slate-600">0108923000012</div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-semibold text-white">Barcode labels</div>
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
                  <span className="min-w-0">
                    <h3 className="text-sm font-bold text-white lt:text-slate-900">{feat.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400 lt:text-slate-500">{feat.desc}</p>
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
            <div
              className="font-courgette inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
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
              <div
                className="font-courgette inline-flex items-center gap-2 rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3 py-1 text-xs text-violet-200 lt:text-indigo-700 font-semibold mb-2"
                style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
              >
                <Store className="w-3.5 h-3.5" aria-hidden="true" /> Live Wholesale & Retail Network
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white lt:text-slate-900">
                Shops using SarbaazSoft POS
              </h2>
              <p className="mt-1 text-sm text-slate-300 lt:text-slate-600">
                Browse the wholesale & retail stores currently registered and running on SarbaazSoft POS.
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

          {/* Swiper Slider Container */}
          {storesForSlider.length > 0 ? (
            <div className="w-full relative pb-4 select-none">
              <Swiper
                onSwiper={(swiper) => {
                  swiperRef.current = swiper;
                }}
                modules={[Navigation, Autoplay, Pagination]}
                navigation={{
                  prevEl: '#prevBtn',
                  nextEl: '#nextBtn',
                }}
                autoplay={{
                  delay: 3500,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }}
                loop={storesForSlider.length >= 5}
                grabCursor={true}
                slidesPerView={1.2}
                spaceBetween={12}
                breakpoints={{
                  420: { slidesPerView: 1.8, spaceBetween: 14 },
                  560: { slidesPerView: 2.3, spaceBetween: 16 },
                  768: { slidesPerView: 3.1, spaceBetween: 18 },
                  1024: { slidesPerView: 4, spaceBetween: 20 },
                  1280: { slidesPerView: 5, spaceBetween: 22 },
                }}
                className="w-full !overflow-hidden"
                aria-label="Retail stores currently registered in SarbaazSoft POS"
              >
                {storesForSlider.map((tenant, index) => (
                  <SwiperSlide
                    key={`${tenant.id || tenant.name}-${index}`}
                    className="!h-auto flex"
                  >
                    <StoreSliderCard
                      tenant={tenant}
                      index={index}
                      onSelect={onSelectStore}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>
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
            <div
              className="font-courgette inline-flex rounded-full border border-indigo-400/40 lt:border-indigo-200 bg-indigo-500/10 lt:bg-indigo-50 px-3.5 py-1.5 text-xs text-violet-200 lt:text-indigo-700"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
              Simple, transparent pricing
            </div>
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
                  <span
                    className="font-courgette absolute -top-3 left-1/2 -translate-x-1/2 rounded-md bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 px-3 py-0.5 text-[11px] font-bold text-white shadow-xs border border-purple-400/30"
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                  >
                    Free 30-Day Access
                  </span>
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
            <h2
              className="font-courgette text-xl sm:text-2xl lg:text-[28px] font-extrabold tracking-tight text-white lt:text-slate-900 [text-shadow:0_1px_14px_rgba(8,10,42,0.9)] lt:[text-shadow:none]"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
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
              <span
                className="font-courgette inline-flex items-center gap-1.5 font-bold text-emerald-400 lt:text-emerald-600"
                style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 lt:bg-emerald-500" aria-hidden="true" />
                System Online
              </span>
              <span className="text-slate-500 lt:text-slate-400" aria-hidden="true">&bull;</span>
              <button
                type="button"
                onClick={onOpenSuperAdmin}
                className="text-slate-400 hover:text-white lt:text-slate-500 lt:hover:text-slate-800 transition cursor-pointer underline-offset-2 hover:underline"
              >
                SuperAdmin
              </button>
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
