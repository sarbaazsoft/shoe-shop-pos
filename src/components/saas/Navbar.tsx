import React, { useState } from 'react';
import { Menu, X, Sun, Moon, Monitor, LogIn, ArrowRight } from 'lucide-react';
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
  landingTheme,
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, themeMode, setThemeMode } = useTheme();
  const isDark = (landingTheme || theme) === 'dark';

  const handleNavClick = (section: string, key: string) => {
    setMobileMenuOpen(false);
    onNavigate(section, key);
  };

  const primaryBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 active:scale-[0.98] text-xs sm:text-sm px-4 py-2';

  const outlineBtn =
    'inline-flex items-center justify-center gap-2 rounded-xl border border-indigo-400/40 bg-transparent hover:bg-indigo-500/10 text-white lt:text-slate-900 font-semibold transition-colors cursor-pointer whitespace-nowrap text-xs sm:text-sm px-3.5 py-2';

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md border-b border-indigo-900/30 lt:border-slate-200 bg-[#070A24]/85 lt:bg-white/90 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20 gap-2 sm:gap-4">
          {/* MOBILE VIEWPORT: Hamburger on Left */}
          <div className="flex items-center md:hidden shrink-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-300 lt:text-slate-700 hover:text-white lt:hover:text-slate-900 hover:bg-indigo-500/10 lt:hover:bg-indigo-50 transition-colors"
              aria-label="Toggle navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* BRAND LOGO, TITLE & SUBTITLE:
              Matches and aligns identically with the auth route header styling */}
          <div className="flex items-center min-w-0 md:flex-none">
            <button
              type="button"
              onClick={() => handleNavClick('top', 'home')}
              className="flex items-center gap-2.5 sm:gap-3 text-left select-none group cursor-pointer min-w-0"
              aria-label="SarbaazSoft Shoe POS Home"
            >
              <div className="w-8.5 h-8.5 sm:w-9 sm:h-9 rounded-lg bg-gradient-to-tr from-purple-600 via-indigo-600 to-purple-700 text-white flex items-center justify-center font-bold text-sm shadow-md shadow-purple-600/25 dark:shadow-[0_0_14px_rgba(147,51,234,0.35)] border border-purple-400/40 shrink-0 transition-transform group-hover:scale-105">
                <ShoeIcon className="w-4.5 h-4.5 stroke-[2.2]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white lt:text-slate-900 dark:text-white text-sm sm:text-base tracking-tight leading-tight truncate block">
                    SarbaazSoft Shoe POS
                  </span>
                </div>
                <span className="text-[11px] sm:text-xs text-slate-300/80 lt:text-slate-500 dark:text-indigo-200/70 font-medium flex items-center gap-1 truncate mt-0.5">
                  <span className="text-purple-400 lt:text-purple-600 dark:text-purple-400">👟</span>
                  <span>Multi-tenant shoe shop POS</span>
                </span>
              </div>
            </button>
          </div>

          {/* DESKTOP VIEWPORT: Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 lg:gap-2">
            {navItems.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item.section, item.key)}
                  className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer bg-transparent ${
                    isActive
                      ? 'text-[#A99CFF] lt:text-[#5B4BFF] font-bold'
                      : 'text-slate-300 lt:text-slate-600 hover:text-[#A99CFF] lt:hover:text-[#5B4BFF]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* DESKTOP & MOBILE RIGHT ACTIONS */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 3-Way Theme Dropdown (Light, Dark, System) matching store header */}
            <ThemeDropdown
              id="navbar-theme-dropdown-trigger"
              dropdownAlign="right"
              showLabel={true}
            />

            {/* Desktop-only action buttons */}
            <div className="hidden md:flex items-center gap-2.5">
              <button
                type="button"
                onClick={onLogin}
                className={outlineBtn}
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
              </button>

              <button
                type="button"
                onClick={onStartFreeTrial}
                className={primaryBtn}
              >
                <span>Free Trial</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE VIEWPORT: Collapsible Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-indigo-900/30 lt:border-slate-200 bg-[#070A24] lt:bg-white px-4 pt-3 pb-6 space-y-3 shadow-2xl transition-all">
          <nav className="flex flex-col space-y-1">
            {navItems.map((item) => {
              const isActive = activeNav === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavClick(item.section, item.key)}
                  className={`w-full text-left px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer bg-transparent ${
                    isActive
                      ? 'text-[#A99CFF] lt:text-[#5B4BFF] font-bold'
                      : 'text-slate-300 lt:text-slate-700 hover:text-[#A99CFF] lt:hover:text-[#5B4BFF]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Mobile Theme Preference Selector */}
          <div className="pt-2 border-t border-indigo-900/30 lt:border-slate-200">
            <div className="flex items-center justify-between px-3 py-1.5 mb-1.5">
              <span className="text-[11px] font-bold text-slate-300 lt:text-slate-700 uppercase tracking-wider">
                Theme Preference
              </span>
              <span className="text-[10px] font-semibold text-purple-400 lt:text-purple-600 bg-purple-500/10 lt:bg-purple-50 px-2 py-0.5 rounded-full border border-purple-400/30 lt:border-purple-200 capitalize">
                {themeMode}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 px-1">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition cursor-pointer border ${
                  themeMode === 'light'
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white border-purple-400/50 shadow-md shadow-purple-600/25'
                    : 'bg-indigo-950/40 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
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
                    : 'bg-indigo-950/40 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
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
                    : 'bg-indigo-950/40 lt:bg-slate-100 text-slate-300 lt:text-slate-700 border-indigo-400/20 lt:border-slate-200 hover:text-white lt:hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>System</span>
              </button>
            </div>
          </div>

          <div className="pt-2 border-t border-indigo-900/30 lt:border-slate-200 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onStartFreeTrial();
              }}
              className={`${primaryBtn} w-full py-2.5 text-sm`}
            >
              <span>Start Free Trial</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                onLogin();
              }}
              className={`${outlineBtn} w-full py-2.5 text-sm`}
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
