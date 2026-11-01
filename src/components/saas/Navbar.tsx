import React, { useState } from 'react';
import { Menu, X, Sun, Moon, LogIn, ArrowRight } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';

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
  landingTheme: 'light' | 'dark';
  onToggleTheme: () => void;
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
  const isDark = landingTheme === 'dark';

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
        <div className="flex items-center justify-between h-16 sm:h-20">
          {/* MOBILE VIEWPORT: Hamburger on Left */}
          <div className="flex items-center md:hidden">
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

          {/* BRAND LOGO & TITLE:
              Mobile: Centered with reduced sizing.
              Desktop: Left-aligned with standard spacing. */}
          <div className="flex items-center md:flex-none">
            <button
              type="button"
              onClick={() => handleNavClick('top', 'home')}
              className="flex items-center gap-2 sm:gap-2.5 text-left select-none group cursor-pointer"
            >
              <BrandLogo
                logo="/pwa-192x192.png"
                name="SarbaazSoft POS"
                size="sm"
                className="transition-transform group-hover:scale-105"
              />
              <span className="font-montserrat font-extrabold text-sm sm:text-lg tracking-tight text-white lt:text-slate-900 truncate">
                SarbaazSoft <span className="text-[#8B7CFF] lt:text-[#5B4BFF]">POS</span>
              </span>
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                    isActive
                      ? 'text-[#A99CFF] lt:text-[#5B4BFF] bg-indigo-500/15 lt:bg-indigo-50 font-bold'
                      : 'text-slate-300 lt:text-slate-600 hover:text-white lt:hover:text-slate-900 hover:bg-indigo-500/10 lt:hover:bg-indigo-50/60'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* DESKTOP & MOBILE RIGHT ACTIONS */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Mode Toggle (Sun/Moon) */}
            <button
              type="button"
              onClick={onToggleTheme}
              className="p-2 rounded-xl border border-indigo-400/30 lt:border-slate-300 bg-indigo-950/40 lt:bg-slate-100 text-yellow-300 lt:text-slate-700 hover:scale-105 transition-all cursor-pointer"
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label="Toggle color theme"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-indigo-600" />}
            </button>

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
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'text-[#A99CFF] lt:text-[#5B4BFF] bg-indigo-500/15 lt:bg-indigo-50 font-bold'
                      : 'text-slate-300 lt:text-slate-700 hover:text-white lt:hover:text-slate-900 hover:bg-indigo-500/10 lt:hover:bg-indigo-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

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
