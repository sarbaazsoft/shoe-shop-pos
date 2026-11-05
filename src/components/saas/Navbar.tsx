import React, { useState, useEffect } from 'react';
import { LogIn, ArrowRight, ChevronRight, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoeIcon } from '../common/ShoeIcon.tsx';
import { ThemeDropdown } from '../common/ThemeDropdown.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';

export interface NavItem {
  key: string;
  label: string;
  section: string;
}

export interface NavbarProps {
  activeNav: string;
  navItems: readonly NavItem[] | NavItem[];
  onNavigate: (section: string, navKey: any) => void;
  onLogin: () => void;
  onStartFreeTrial: () => void;
  landingTheme?: 'light' | 'dark';
  onToggleTheme?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeNav,
  navItems,
  onNavigate,
  onLogin,
  onStartFreeTrial,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { themeMode, setThemeMode } = useTheme();

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

  // Lock body scroll when mobile drawer is open to prevent awkward background jitter
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
    onNavigate(section, key);
  };

  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 active:from-purple-800 active:to-indigo-800 text-white font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 active:scale-[0.98] text-xs lg:text-sm px-3 lg:px-4 py-1.5 lg:py-2';

  const outlineBtn =
    'inline-flex items-center justify-center gap-1.5 lg:gap-2 rounded-xl border border-indigo-400/40 lt:border-slate-300/90 bg-transparent hover:bg-indigo-500/10 lt:hover:bg-slate-100 text-white lt:text-slate-900 font-semibold transition-colors cursor-pointer whitespace-nowrap text-xs lg:text-sm px-2.5 lg:px-3.5 py-1.5 lg:py-2';

  const themeDropdownBtn = (isOpen: boolean) =>
    `inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl border font-semibold transition-colors cursor-pointer whitespace-nowrap text-xs lg:text-sm px-2.5 sm:px-3 py-1.5 sm:py-2 ${
      isOpen
        ? 'border-indigo-400/60 bg-indigo-500/20 lt:bg-slate-200 text-white lt:text-slate-900 ring-2 ring-indigo-400/30'
        : 'border-indigo-400/40 lt:border-slate-300/90 bg-transparent hover:bg-indigo-500/10 lt:hover:bg-slate-100 text-white lt:text-slate-900'
    }`;

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md border-b border-indigo-900/30 lt:border-slate-200 bg-[#070A24]/90 lt:bg-white/95 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 lg:h-20 gap-2 sm:gap-4">
          
          {/* 1. SMALL DEVICES (< md): Hamburger Button on LEFT side */}
          <div className="flex items-center md:hidden w-10 sm:w-12 shrink-0 justify-start">
            <button
              type="button"
              id="landing-mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 sm:p-2.5 rounded-xl border-0 bg-transparent text-slate-200 lt:text-slate-700 shadow-none cursor-pointer focus:outline-none"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
            >
              {/* Smooth morphing animated hamburger icon */}
              <div className="w-5 h-4 relative flex flex-col justify-between items-center" aria-hidden="true">
                <span
                  className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out origin-center ${
                    mobileMenuOpen
                      ? 'rotate-45 translate-y-[7px] text-purple-400 lt:text-purple-600 bg-purple-400 lt:bg-purple-600'
                      : ''
                  }`}
                />
                <span
                  className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-200 ease-out ${
                    mobileMenuOpen ? 'opacity-0 scale-x-0' : 'opacity-100'
                  }`}
                />
                <span
                  className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ease-out origin-center ${
                    mobileMenuOpen
                      ? '-rotate-45 -translate-y-[7px] text-purple-400 lt:text-purple-600 bg-purple-400 lt:bg-purple-600'
                      : ''
                  }`}
                />
              </div>
            </button>
          </div>

          {/* 2. BRANDING: Centered on small devices (< md), Left-aligned on Desktop (>= md) */}
          <div className="flex-1 flex items-center justify-center md:justify-start min-w-0 md:flex-none">
            <button
              type="button"
              onClick={() => handleNavClick('top', 'home')}
              className="flex items-center justify-center md:justify-start gap-2 sm:gap-2.5 select-none group cursor-pointer min-w-0"
              aria-label="SarbaazSoft Shoe POS Home"
            >
              <div className="w-7.5 h-7.5 sm:w-8.5 sm:h-8.5 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-700 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 shrink-0 transition-transform group-hover:scale-105">
                <ShoeIcon className="w-4 h-4 stroke-[2.2]" />
              </div>
              <div className="min-w-0 text-left">
                <span className="font-extrabold text-white lt:text-slate-900 dark:text-white text-xs sm:text-base tracking-tight leading-none truncate block">
                  SarbaazSoft Shoe POS
                </span>
                {/* Subtitle: Hidden on small mobile screens to keep center alignment clean */}
                <span className="hidden sm:flex text-[11px] text-slate-300/80 lt:text-slate-500 dark:text-indigo-200/70 font-medium items-center gap-1 truncate mt-0.5">
                  <span className="text-purple-400 lt:text-purple-600 dark:text-purple-400">👟</span>
                  <span>Multi-tenant shoe shop POS</span>
                </span>
              </div>
            </button>
          </div>

          {/* 3. DESKTOP VIEWPORT: Center Navigation Links (>= md / 768px) */}
          <nav className="hidden md:flex items-center gap-0.5 lg:gap-2 shrink-0">
            {navItems.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item.section, item.key)}
                  className={`px-2.5 lg:px-3 py-1.5 text-xs lg:text-sm font-semibold uppercase tracking-wider rounded-lg transition-colors cursor-pointer bg-transparent ${
                    isActive
                      ? 'text-[#A99CFF] lt:text-[#5B4BFF] font-bold bg-indigo-500/10 lt:bg-indigo-50'
                      : 'text-slate-300 lt:text-slate-600 hover:text-[#A99CFF] lt:hover:text-[#5B4BFF] hover:bg-white/5 lt:hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* 4. RIGHT SIDE: Theme Switcher on Small Devices; Theme Switcher + CTAs on Desktop */}
          <div className="w-10 sm:w-12 md:w-auto shrink-0 flex items-center justify-end gap-1.5 sm:gap-2.5">
            {/* 3-Way Theme Switcher (Right aligned on all screens) */}
            <div className="relative">
              <ThemeDropdown
                id="navbar-theme-dropdown-trigger"
                dropdownAlign="right"
                showLabel={true}
                triggerClassName={themeDropdownBtn}
              />
            </div>

            {/* Desktop Action Buttons (>= md) */}
            <div className="hidden md:flex items-center gap-2 lg:gap-2.5">
              <button
                type="button"
                onClick={onLogin}
                className={outlineBtn}
              >
                <LogIn className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
                <span>Login</span>
              </button>

              <button
                type="button"
                onClick={onStartFreeTrial}
                className={primaryBtn}
              >
                <span>Free Trial</span>
                <ArrowRight className="w-3.5 h-3.5 lg:w-4 lg:h-4" />
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* MOBILE VIEWPORT: Smooth Animated Drawer & Backdrop Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Semi-transparent backdrop overlay to dismiss menu on tap */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-x-0 top-16 sm:top-18 bottom-0 bg-black/60 lt:bg-slate-900/40 backdrop-blur-xs z-30 md:hidden"
              aria-hidden="true"
            />

            {/* Slide-down mobile drawer */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="absolute top-full left-0 right-0 z-40 md:hidden border-b border-indigo-900/40 lt:border-slate-200 bg-[#070A24] lt:bg-white shadow-2xl px-4 pt-3.5 pb-6 space-y-4 max-h-[calc(100vh-4.5rem)] overflow-y-auto"
            >
              {/* Navigation links */}
              <nav className="flex flex-col space-y-1">
                {navItems.map((item) => {
                  const isActive = activeNav === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => handleNavClick(item.section, item.key)}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-purple-600/20 to-indigo-600/20 lt:bg-indigo-50 text-[#A99CFF] lt:text-[#5B4BFF] font-bold border border-purple-500/30 lt:border-indigo-200 shadow-xs'
                          : 'text-slate-300 lt:text-slate-700 hover:text-white lt:hover:text-slate-900 hover:bg-white/5 lt:hover:bg-slate-100 border border-transparent'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {isActive && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 lt:bg-indigo-600" />}
                        <span>{item.label}</span>
                      </span>
                      <ChevronRight className={`w-4 h-4 opacity-50 ${isActive ? 'text-[#A99CFF] lt:text-[#5B4BFF] opacity-100' : ''}`} />
                    </button>
                  );
                })}
              </nav>

              {/* Mobile Quick Action CTAs */}
              <div className="pt-2 border-t border-indigo-900/30 lt:border-slate-200 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onStartFreeTrial();
                  }}
                  className={`${primaryBtn} w-full py-3 text-sm justify-center shadow-lg shadow-purple-600/30`}
                >
                  <Sparkles className="w-4 h-4 text-purple-200" />
                  <span>Start 30-Day Free Trial</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogin();
                  }}
                  className={`${outlineBtn} w-full py-2.5 text-sm justify-center border-indigo-400/40 lt:border-slate-300`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Store Login &amp; Cashier Sign In</span>
                </button>
              </div>

              {/* Mobile Quick Theme Switcher */}
              <div className="pt-2 border-t border-indigo-900/30 lt:border-slate-200">
                <div className="flex items-center justify-between px-1 mb-2">
                  <span className="text-[11px] font-bold text-slate-400 lt:text-slate-600 uppercase tracking-wider">
                    Theme Mode
                  </span>
                  <span className="text-[10px] font-bold text-purple-400 lt:text-purple-600 bg-purple-500/10 lt:bg-purple-50 px-2 py-0.5 rounded-full border border-purple-400/30 lt:border-purple-200 capitalize">
                    {themeMode}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setThemeMode('light')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      themeMode === 'light'
                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/25'
                        : 'bg-indigo-950/30 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('dark')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      themeMode === 'dark'
                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/25'
                        : 'bg-indigo-950/30 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThemeMode('system')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                      themeMode === 'system'
                        ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/25'
                        : 'bg-indigo-950/30 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
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
