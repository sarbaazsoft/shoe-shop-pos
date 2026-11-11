import React, { useState, useEffect } from 'react';
import { LogIn, ArrowRight, ChevronRight, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoeIcon, TinyShoeIcon } from '../common/ShoeIcon.tsx';
import { ThemeDropdown } from '../common/ThemeDropdown.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';

export interface NavItem {
  key: string;
  label: string;
  section: string;
}

export interface NavbarProps {
  storeName?: string;
  subtitle?: string;
  badgeText?: string;
  badgeVariant?: 'online' | 'wizard' | 'connecting' | 'locked';
  activeNav?: string;
  navItems?: readonly NavItem[] | NavItem[];
  onNavigate?: (section: string, navKey: any) => void;
  onLogin?: () => void;
  onStartFreeTrial?: () => void;
  landingTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', section: 'top' },
  { key: 'features', label: 'Features', section: 'features' },
  { key: 'pricing', label: 'Pricing', section: 'pricing' },
  { key: 'stores', label: 'Stores', section: 'stores' },
  { key: 'about', label: 'About', section: 'about' },
];

const renderBrandName = (name: string) => {
  if (name.includes('SarbaazSoft')) {
    const parts = name.split('SarbaazSoft');
    return (
      <span className="font-roboto brand-name-roboto inline-flex items-center font-bold tracking-tight" style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}>
        {parts[0]}
        <span className="text-black dark:text-white">Sarbaaz</span>
        <span className="text-purple-600 dark:text-purple-400 font-extrabold ml-0.5">Soft</span>
        {parts[1] && <span className="text-black dark:text-white">{parts[1]}</span>}
      </span>
    );
  }
  return (
    <span className="font-roboto brand-name-roboto font-bold text-black dark:text-white tracking-tight" style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}>
      {name}
    </span>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  storeName = 'SarbaazSoft Shoe POS',
  subtitle = 'Dual-Engine Wholesale & Retail',
  activeNav = 'home',
  navItems = DEFAULT_NAV_ITEMS,
  onNavigate,
  onLogin,
  onStartFreeTrial,
  landingTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, themeMode, setThemeMode } = useTheme();

  // Determine effective theme mode (light vs dark)
  const isDark = (landingTheme ?? theme) === 'dark';

  // Close mobile menu on desktop breakpoint resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close mobile menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileMenuOpen) {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [mobileMenuOpen]);

  const handleNavClick = (section: string, key: string) => {
    setMobileMenuOpen(false);
    onNavigate?.(section, key);
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full backdrop-blur-md select-none transition-colors duration-200 border-b ${
        isDark
          ? 'bg-[#070A24]/95 border-indigo-500/20 text-[#f8fafc] shadow-lg shadow-black/20'
          : 'bg-white/95 border-indigo-500/20 text-slate-900 shadow-xs'
      }`}
      aria-label="Main Navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[3.8rem] py-2 gap-2 sm:gap-4">
          
          {/* ========================================================
              LEFT: BRANDING & LOGO (Clean wordmark + no status badge)
             ======================================================== */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
            {/* Mobile Hamburger Button (Screens < md) */}
            <div className="flex md:hidden mr-0.5">
              <button
                type="button"
                id="landing-mobile-menu-toggle"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`p-2 rounded-xl transition-all cursor-pointer border focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  isDark
                    ? 'bg-slate-800/80 text-slate-200 hover:text-white border-slate-700/60'
                    : 'bg-slate-100 text-slate-800 hover:text-slate-900 border-slate-200'
                }`}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              >
                {/* Morphing hamburger lines */}
                <div className="w-5 h-4 relative flex flex-col justify-between items-center" aria-hidden="true">
                  <span
                    className={`block h-0.5 w-5 rounded-full transition-all duration-300 ease-out origin-center ${
                      mobileMenuOpen
                        ? 'rotate-45 translate-y-[7px] bg-purple-600 dark:bg-purple-400'
                        : isDark ? 'bg-slate-200' : 'bg-slate-800'
                    }`}
                  />
                  <span
                    className={`block h-0.5 w-5 rounded-full transition-all duration-200 ease-out ${
                      mobileMenuOpen ? 'opacity-0 scale-x-0' : isDark ? 'bg-slate-200' : 'bg-slate-800'
                    }`}
                  />
                  <span
                    className={`block h-0.5 w-5 rounded-full transition-all duration-300 ease-out origin-center ${
                      mobileMenuOpen
                        ? '-rotate-45 -translate-y-[7px] bg-purple-600 dark:bg-purple-400'
                        : isDark ? 'bg-slate-200' : 'bg-slate-800'
                    }`}
                  />
                </div>
              </button>
            </div>

            {/* Brand identity & titles matching PublicHeader without badge */}
            <button
              type="button"
              onClick={() => handleNavClick('top', 'home')}
              className="group flex items-center gap-2.5 sm:gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg p-0.5 sm:p-1 cursor-pointer min-w-0"
              aria-label={`${storeName} Home`}
            >
              {/* Brand Emblem matching store sidebars top */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/25 shrink-0 shadow-xs flex items-center justify-center overflow-hidden transition-transform duration-200 group-hover:scale-105">
                <ShoeIcon src="/pwa-192x192.png" alt={`${storeName} Logo`} className="w-full h-full object-cover rounded-xl" />
              </div>

              {/* Brand Typography (Roboto font for brand name & subtitle) */}
              <div className="min-w-0 font-roboto brand-name-roboto" style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}>
                <div
                  className="font-roboto brand-name-roboto font-bold text-black dark:text-white text-sm sm:text-base tracking-tight leading-tight truncate block"
                  style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}
                >
                  {renderBrandName(storeName)}
                </div>
                <div
                  className="font-roboto brand-subtitle-roboto text-[11px] sm:text-xs text-slate-500 dark:text-indigo-200/70 font-medium flex items-center gap-1.5 truncate mt-0.5 tracking-normal"
                  style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}
                >
                  <TinyShoeIcon className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span className="font-roboto brand-subtitle-roboto" style={{ fontFamily: "'Roboto', system-ui, -apple-system, sans-serif" }}>
                    {subtitle}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* ========================================================
              CENTER: NAVIGATION LINKS (Courgette / Courgate Font, Desktop >= md)
              Clean, medium-weight links with app purple/indigo accent
             ======================================================== */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-3 shrink-0 font-courgette font-courgate nav-link-courgette">
            {navItems.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item.section, item.key)}
                  style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                  className={`nav-link relative px-3.5 py-2 text-base lg:text-lg font-normal tracking-wide transition-colors duration-200 rounded-lg cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 font-courgette font-courgate nav-link-courgette ${
                    isActive
                      ? isDark
                        ? 'text-white font-bold'
                        : 'text-purple-700 font-bold'
                      : isDark
                      ? 'text-slate-200 hover:text-white'
                      : 'text-black hover:text-purple-600'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <span
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className="nav-link relative z-10 transition-colors duration-200 group-hover:text-purple-600 dark:group-hover:text-purple-400 font-courgette font-courgate nav-link-courgette"
                  >
                    {item.label}
                  </span>

                  {/* Active / Hover underline accent in app's Purple/Indigo brand color */}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 shadow-[0_2px_8px_rgba(147,51,234,0.45)]"
                      aria-hidden="true"
                    />
                  )}
                  {!isActive && (
                    <span
                      className="absolute bottom-0 left-2 right-2 h-[2.5px] rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-center"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* ========================================================
              RIGHT: 3-WAY THEME DROPDOWN + CTAs
              (Unified 3-way theme switcher like PublicHeader / Header)
             ======================================================== */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {/* 3-Way Theme Dropdown Menu (Light, Dark, System) - Courgette Styled */}
            <div
              className="relative font-courgette font-courgate theme-dropdown-courgette"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
              <ThemeDropdown
                id="landing-navbar-theme-dropdown"
                dropdownAlign="right"
                showLabel={true}
                font="courgette"
                className="font-courgette font-courgate theme-dropdown-courgette"
              />
            </div>

            {/* Desktop Action Buttons (>= md) */}
            <div className="hidden md:flex items-center gap-2 lg:gap-2.5 font-courgette">
              {onLogin && (
                <button
                  type="button"
                  onClick={onLogin}
                  className={`inline-flex items-center justify-center gap-1.5 lg:gap-2 rounded-xl font-semibold transition-all cursor-pointer whitespace-nowrap text-xs lg:text-sm px-3 lg:px-3.5 py-2 border font-courgette ${
                    isDark
                      ? 'border-slate-700/80 bg-slate-800/50 hover:bg-slate-800 text-white hover:border-purple-500/50'
                      : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-black hover:border-purple-300'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                  <span>Login</span>
                </button>
              )}

              {onStartFreeTrial && (
                <button
                  type="button"
                  onClick={onStartFreeTrial}
                  className="inline-flex items-center justify-center gap-1.5 lg:gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 active:from-purple-800 active:to-indigo-800 text-white font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 transition-all cursor-pointer whitespace-nowrap text-xs lg:text-sm px-3.5 lg:px-4 py-2 active:scale-[0.98] font-courgette"
                >
                  <span>Free Trial</span>
                  <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* ========================================================
          MOBILE VIEWPORT: Responsive Animated Drawer & Backdrop
         ======================================================== */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop overlay to dismiss menu on tap */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-x-0 top-16 sm:top-18 bottom-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
              aria-hidden="true"
            />

            {/* Slide-down mobile drawer */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`absolute top-full left-0 right-0 z-40 md:hidden border-b shadow-2xl px-4 pt-3.5 pb-6 space-y-4 max-h-[calc(100vh-4.5rem)] overflow-y-auto font-courgette ${
                isDark
                  ? 'bg-[#070A24] border-indigo-950/70 text-[#f8fafc]'
                  : 'bg-white border-slate-200 text-black'
              }`}
            >
              {/* Navigation links */}
              <nav className="flex flex-col space-y-1 font-courgette font-courgate nav-link-courgette">
                <div
                  className={`px-2 pb-1.5 text-xs font-semibold tracking-wider uppercase font-courgette font-courgate ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Menu Navigation
                </div>
                {navItems.map((item) => {
                  const isActive = activeNav === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleNavClick(item.section, item.key)}
                      style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                      className={`nav-link w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-lg font-normal transition-all cursor-pointer font-courgette font-courgate nav-link-courgette ${
                        isActive
                          ? isDark
                            ? 'bg-slate-800/90 text-white font-bold border-l-4 border-purple-500'
                            : 'bg-purple-50 text-purple-700 font-bold border-l-4 border-purple-600'
                          : isDark
                          ? 'text-slate-200 hover:bg-slate-800/50 hover:text-white'
                          : 'text-black hover:bg-slate-100 hover:text-purple-600'
                      }`}
                    >
                      <span
                        style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                        className="nav-link flex items-center gap-2 font-courgette font-courgate nav-link-courgette"
                      >
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.7)]" />
                        )}
                        <span style={{ fontFamily: "'Courgette', cursive, sans-serif" }} className="nav-link font-courgette font-courgate nav-link-courgette">
                          {item.label}
                        </span>
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 opacity-50 ${
                          isActive ? 'text-purple-600 dark:text-purple-400 opacity-100' : ''
                        }`}
                      />
                    </button>
                  );
                })}
              </nav>

              {/* Mobile Quick Action CTAs */}
              <div
                className={`pt-2 border-t flex flex-col gap-2.5 font-courgette ${
                  isDark ? 'border-indigo-950/70' : 'border-slate-200'
                }`}
              >
                {onStartFreeTrial && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onStartFreeTrial();
                    }}
                    className="w-full py-3 text-sm font-bold flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer font-courgette"
                  >
                    <Sparkles className="w-4 h-4 text-purple-200" />
                    <span>Start 30-Day Free Trial</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}

                {onLogin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogin();
                    }}
                    className={`w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-2 rounded-xl border transition cursor-pointer font-courgette ${
                      isDark
                        ? 'border-slate-700 bg-slate-800/50 text-white hover:bg-slate-800'
                        : 'border-slate-300 bg-slate-100 text-black hover:bg-slate-200'
                    }`}
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Store Login &amp; Cashier Sign In</span>
                  </button>
                )}
              </div>

              {/* Mobile 3-Way Theme Mode Quick Switcher */}
              <div
                className={`pt-2 border-t font-courgette font-courgate ${
                  isDark ? 'border-indigo-950/70' : 'border-slate-200'
                }`}
                style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
              >
                <div className="flex items-center justify-between px-1 mb-2">
                  <span
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className={`text-xs font-bold uppercase tracking-wider font-courgette font-courgate ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Theme Mode
                  </span>
                  <span
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-400/30 capitalize font-courgette font-courgate"
                  >
                    {themeMode}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border font-courgette font-courgate ${
                      themeMode === 'light'
                        ? 'bg-purple-50 text-purple-700 border-purple-400 font-bold shadow-xs'
                        : isDark
                        ? 'bg-slate-800/40 text-slate-300 border-slate-700/60 hover:text-white'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-black'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border font-courgette font-courgate ${
                      themeMode === 'dark'
                        ? 'bg-purple-950/60 text-purple-300 border-purple-500 font-bold shadow-xs'
                        : isDark
                        ? 'bg-slate-800/40 text-slate-300 border-slate-700/60 hover:text-white'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-black'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 text-purple-400" />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('system')}
                    style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border font-courgette font-courgate ${
                      themeMode === 'system'
                        ? 'bg-purple-600 text-white border-purple-500 font-bold shadow-xs'
                        : isDark
                        ? 'bg-slate-800/40 text-slate-300 border-slate-700/60 hover:text-white'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:text-black'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5 text-indigo-400" />
                    <span>System</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
};
