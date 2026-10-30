import React, { useState } from 'react';
import { Menu, X, Sun, Moon } from 'lucide-react';

export interface NavItem {
  key: string;
  label: string;
  section: string;
}

export interface NavbarProps {
  activeNav?: string;
  navItems?: readonly NavItem[] | NavItem[];
  onNavigate?: (section: string, key: any) => void;
  onLogin?: () => void;
  onStartFreeTrial?: () => void;
  landingTheme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', section: 'top' },
  { key: 'features', label: 'Features', section: 'features' },
  { key: 'pricing', label: 'Pricing', section: 'pricing' },
  { key: 'stores', label: 'Stores', section: 'stores' },
  { key: 'about', label: 'About', section: 'about' },
];

export const Navbar: React.FC<NavbarProps> = ({
  activeNav = 'home',
  navItems = DEFAULT_NAV_ITEMS,
  onNavigate,
  onLogin,
  onStartFreeTrial,
  landingTheme = 'dark',
  onToggleTheme,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (section: string, key: string) => {
    setMobileMenuOpen(false);
    onNavigate?.(section, key);
  };

  const handleLoginClick = () => {
    setMobileMenuOpen(false);
    onLogin?.();
  };

  const handleFreeTrialClick = () => {
    setMobileMenuOpen(false);
    onStartFreeTrial?.();
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.04] lt:border-slate-200 bg-[#0A0B34]/90 lt:bg-white/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[68px] flex items-center justify-between gap-2 sm:gap-4">
        {/* MOBILE ONLY: Left Hamburger Menu Toggle */}
        <div className="flex md:hidden items-center shrink-0 w-9">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-expanded={mobileMenuOpen}
            aria-controls="landing-mobile-menu"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 lt:border-slate-200 text-white lt:text-slate-900 hover:bg-white/5 lt:hover:bg-slate-100 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        {/* BRAND LOGO & COMPANY NAME:
            - Mobile: flex-1 flex items-center justify-center text-center min-w-0
            - Desktop (md: and up): standard inherit left-aligned position alongside default nav items
        */}
        <div className="flex-1 md:flex-initial flex items-center justify-center md:justify-start min-w-0">
          <button
            type="button"
            onClick={() => handleNavClick('top', 'home')}
            className="flex items-center gap-2 sm:gap-2.5 text-center md:text-left cursor-pointer min-w-0 group"
            aria-label="SarbaazSoft POS home"
          >
            <svg viewBox="0 0 64 42" className="w-8 h-6 sm:w-10 sm:h-7 md:w-11 md:h-8 shrink-0 transition-transform group-hover:scale-105" aria-hidden="true">
              <path d="M6 31c0-3 2-5 5-6l12-5c3-1.5 6-4.5 8-8 1-1.5 2.8-1.5 3.8 0 1.8 2.8 4.5 5 8.2 5.8l11 2.4c3.5.8 6 3.8 6 7.3 0 2.5-2 4.5-4.5 4.5H10.5C8 37 6 34.5 6 31z" fill="#7C6CFF" />
              <path d="M6 33.5h53.5c1 0 1.8.8 1.8 1.8s-.8 1.7-1.8 1.7H8c-1.5 0-2.5-1-2-3.5z" fill="#B7ADFF" />
              <path d="M23 18l3 2m-6 1.5l3 2m-6 1.5l3 2" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              <path d="M14 29c7-1 14-3.5 21-8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
            <span className="min-w-0 text-left">
              <span className="block text-base sm:text-lg md:text-[22px] font-extrabold tracking-tight leading-none text-white lt:text-slate-900 truncate">
                SarbaazSoft POS
              </span>
              <span className="hidden sm:block mt-0.5 md:mt-1 text-[9px] md:text-[10px] text-slate-400 lt:text-slate-500 truncate">
                Smart POS for Shoe Businesses
              </span>
            </span>
          </button>
        </div>

        {/* DESKTOP NAV LINKS (md: and up): Horizontal list alongside brand */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-9 text-[13px] font-medium" aria-label="Primary">
          {navItems.map(({ key, label, section }) => (
            <button
              key={key}
              type="button"
              onClick={() => handleNavClick(section, key)}
              aria-current={activeNav === key ? 'page' : undefined}
              className={`py-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-300 ${
                activeNav === key
                  ? 'text-[#8B7CFF] lt:text-[#5B4BFF] font-bold'
                  : 'text-slate-100 lt:text-slate-800 hover:text-[#B9A9FF] lt:hover:text-[#5B4BFF]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* RIGHT ACTIONS:
            - Mobile: Light/Dark mode toggle placed on the right
            - Desktop: Light/Dark mode toggle + Login button + Free Trial button
        */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0 justify-end w-9 md:w-auto">
          {/* Light / Dark Mode Toggle Button (Mobile right, Desktop right) */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={landingTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            title={landingTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-indigo-400/40 lt:border-indigo-200 text-violet-200 lt:text-indigo-700 hover:bg-indigo-500/10 lt:hover:bg-indigo-50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          >
            {landingTheme === 'dark' ? <Sun className="w-4 h-4" aria-hidden="true" /> : <Moon className="w-4 h-4" aria-hidden="true" />}
          </button>

          {/* Desktop Login Button */}
          <button
            type="button"
            onClick={handleLoginClick}
            className="hidden md:inline-flex items-center justify-center rounded-lg border border-[#7C6CFF] px-6 lg:px-7 py-2 text-[13px] font-medium text-white lt:text-slate-900 hover:bg-[#6D5CFF]/15 lt:hover:bg-[#6D5CFF]/10 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-300"
          >
            Login
          </button>

          {/* Desktop Start Free Trial Button */}
          <button
            type="button"
            onClick={handleFreeTrialClick}
            className="hidden md:inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 active:from-purple-800 active:to-indigo-800 text-white px-4 lg:px-5 py-2 text-[13px] font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 transition-all cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-300 active:scale-[0.98]"
          >
            Start Free Trial
          </button>
        </div>
      </div>

      {/* MOBILE COLLAPSIBLE DRAWER / MENU:
          Opened by hamburger icon. Contains:
          - Main navigation links
          - Start Free Trial button
          - Login button
      */}
      {mobileMenuOpen && (
        <div
          id="landing-mobile-menu"
          className="md:hidden border-t border-white/5 lt:border-slate-200 bg-[#0A0B34]/95 lt:bg-white/95 backdrop-blur-xl px-4 py-4 shadow-xl"
        >
          <div className="flex flex-col space-y-1">
            {navItems.map(({ key, label, section }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleNavClick(section, key)}
                className={`py-2.5 px-3 rounded-lg text-left text-sm font-semibold transition-colors cursor-pointer ${
                  activeNav === key
                    ? 'bg-purple-600/20 text-[#8B7CFF] lt:bg-purple-50 lt:text-[#5B4BFF]'
                    : 'text-slate-100 lt:text-slate-800 hover:bg-white/5 lt:hover:bg-slate-100'
                }`}
              >
                {label}
              </button>
            ))}

            {/* Action Buttons in Mobile Drawer */}
            <div className="pt-3 mt-2 border-t border-white/10 lt:border-slate-200 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={handleFreeTrialClick}
                className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:via-indigo-700 hover:to-purple-800 text-white py-3 text-sm font-bold border border-purple-400/40 shadow-md shadow-purple-600/25 transition-all cursor-pointer"
              >
                Start Free Trial
              </button>

              <button
                type="button"
                onClick={handleLoginClick}
                className="w-full inline-flex items-center justify-center rounded-xl border border-[#7C6CFF] py-2.5 text-sm font-semibold text-white lt:text-slate-900 hover:bg-[#6D5CFF]/15 lt:hover:bg-[#6D5CFF]/10 transition-colors cursor-pointer"
              >
                Login
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Navbar;
