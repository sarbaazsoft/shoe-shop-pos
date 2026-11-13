import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { ShoeIcon, TinyShoeIcon } from './ShoeIcon.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { ThemeDropdown } from './ThemeDropdown.tsx';

export interface SarbaazSoftNavbarProps {
  /** Active navigation item key or label */
  activeItem?: 'Dashboard' | 'Orders' | 'Inventory' | 'Vendors' | 'Report';
  /** Callback fired when a navigation link is clicked */
  onNavigate?: (item: 'Dashboard' | 'Orders' | 'Inventory' | 'Vendors' | 'Report') => void;
  /** Optional custom class names */
  className?: string;
}

const renderBrandName = (name: string) => {
  return (
    <span className="font-bold text-slate-900 dark:text-white tracking-tight">
      {name}
    </span>
  );
};

export const SarbaazSoftNavbar: React.FC<SarbaazSoftNavbarProps> = ({
  activeItem = 'Dashboard',
  onNavigate,
  className = '',
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentActive, setCurrentActive] = useState(activeItem);

  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const navItems: Array<'Dashboard' | 'Orders' | 'Inventory' | 'Vendors' | 'Report'> = [
    'Dashboard',
    'Orders',
    'Inventory',
    'Vendors',
    'Report',
  ];

  const handleItemClick = (item: 'Dashboard' | 'Orders' | 'Inventory' | 'Vendors' | 'Report') => {
    setCurrentActive(item);
    onNavigate?.(item);
    setMobileMenuOpen(false);
  };

  return (
    <nav
      className={`relative z-50 w-full border-b select-none transition-colors duration-200 font-courgette ${
        isDark
          ? 'bg-[#070A24] border-indigo-950/70 text-[#f8fafc] shadow-lg shadow-black/25'
          : 'bg-white border-slate-200 text-black shadow-xs'
      } ${className}`}
      style={{
        fontFamily: "'Courgette', cursive, system-ui, -apple-system, sans-serif",
      }}
      aria-label="Main Navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          
          {/* ========================================================
              LEFT: BRANDING & LOGO (Aligned with PublicHeader)
             ======================================================== */}
          <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 min-w-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                handleItemClick('Dashboard');
              }}
              className="flex items-center gap-2.5 sm:gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 rounded-lg p-0.5 sm:p-1 min-w-0 hover:opacity-90 transition-opacity"
              aria-label="SarbaazSoft Shoe POS Home"
            >
              {/* Brand Emblem matching PublicHeader */}
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white dark:bg-slate-900 border border-indigo-500/25 shrink-0 shadow-xs flex items-center justify-center overflow-hidden">
                <ShoeIcon src="/pwa-192x192.png" alt="SarbaazSoft Shoe POS Logo" className="w-full h-full object-cover rounded-xl" />
              </div>

              {/* Brand Typography aligned with PublicHeader */}
              <div className="min-w-0">
                <div className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight leading-tight truncate block">
                  {renderBrandName('SarbaazSoft Shoe POS')}
                </div>
                <div className="text-[11px] sm:text-xs text-slate-500 dark:text-indigo-200/70 font-medium flex items-center gap-1.5 truncate mt-0.5 tracking-normal">
                  <TinyShoeIcon className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span>Dual-Engine Wholesale &amp; Retail</span>
                </div>
              </div>
            </a>
          </div>

          {/* ========================================================
              CENTER: NAVIGATION LINKS (Courgette / Courgate Font)
             ======================================================== */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-3 font-courgette font-courgate nav-link-courgette">
            {navItems.map((item) => {
              const isActive = currentActive === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                  className={`nav-link relative px-3.5 py-2 text-base font-normal tracking-wide transition-colors duration-200 rounded-lg cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 font-courgette font-courgate nav-link-courgette ${
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
                    {item}
                  </span>

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

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* 3-Way Theme Switcher - Courgette Styled */}
            <div
              className="relative font-courgette font-courgate theme-dropdown-courgette"
              style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
            >
              <ThemeDropdown
                id="sarbaaz-theme-dropdown-trigger"
                dropdownAlign="right"
                showLabel={true}
                font="courgette"
                className="font-courgette font-courgate theme-dropdown-courgette"
              />
            </div>

            {/* Mobile Hamburger Toggle Button */}
            <div className="flex md:hidden">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className={`p-2 rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
                  isDark
                    ? 'bg-slate-800/80 text-slate-200 hover:text-white border-slate-700/60'
                    : 'bg-slate-100 text-black hover:text-slate-900 border-slate-200'
                }`}
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              >
                {mobileMenuOpen ? <X className="w-5 h-5 text-purple-600 dark:text-purple-400" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE COLLAPSIBLE MENU */}
      {mobileMenuOpen && (
        <div
          className={`md:hidden border-t px-4 pt-3 pb-5 space-y-1.5 shadow-2xl animate-in slide-in-from-top-2 duration-150 font-courgette ${
            isDark
              ? 'bg-[#070A24] border-indigo-950/70 text-[#f8fafc]'
              : 'bg-white border-slate-200 text-black'
          }`}
        >
          <div
            className={`px-2 pb-2 text-xs font-semibold tracking-wider uppercase font-courgette ${
              isDark ? 'text-slate-400' : 'text-slate-500'
            }`}
          >
            Menu Navigation
          </div>
          {navItems.map((item) => {
            const isActive = currentActive === item;
            return (
              <button
                key={item}
                type="button"
                onClick={() => handleItemClick(item)}
                style={{ fontFamily: "'Courgette', cursive, sans-serif" }}
                className={`nav-link w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-base font-normal transition-all duration-150 cursor-pointer font-courgette font-courgate nav-link-courgette ${
                  isActive
                    ? isDark
                      ? 'bg-slate-800/90 text-white font-bold border-l-4 border-purple-500'
                      : 'bg-purple-50 text-purple-700 font-bold border-l-4 border-purple-600'
                    : isDark
                    ? 'text-slate-200 hover:bg-slate-800/50 hover:text-white'
                    : 'text-black hover:bg-slate-100 hover:text-purple-600'
                }`}
              >
                <span style={{ fontFamily: "'Courgette', cursive, sans-serif" }} className="nav-link font-courgette font-courgate nav-link-courgette">
                  {item}
                </span>
                {isActive && (
                  <span className="w-2 h-2 rounded-full bg-purple-600 dark:bg-purple-400 shadow-[0_0_6px_rgba(168,85,247,0.7)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
};

export default SarbaazSoftNavbar;
