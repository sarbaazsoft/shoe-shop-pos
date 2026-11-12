import React from 'react';
import { APP_VERSION } from '../../version.ts';

export interface PublicFooterProps {
  storeName?: string;
  subtitle?: string;
}

/**
 * PublicFooter
 * Global footer for public, onboarding, loading, and authentication views.
 * Reflects official SarbaazSoft SaaS provider branding & tenant separation.
 */
export const PublicFooter: React.FC<PublicFooterProps> = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id="global-public-footer"
      className="relative z-10 w-full px-4 sm:px-8 py-3 border border-indigo-500/20 bg-white/95 dark:bg-white/10 backdrop-blur-lg text-xs text-slate-800 dark:text-slate-100 transition-colors duration-500 shadow-lg shrink-0 no-print select-none"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-1 sm:gap-4 text-center sm:text-left">
        <div className="flex items-center gap-2 justify-center sm:justify-start">
          <strong
            id="sarbaazsoft-credit-text"
            className="font-bold text-slate-900 dark:text-white tracking-wide"
          >
            SarbaazSoft Shoe POS
          </strong>
          <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono font-medium rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
            {APP_VERSION}
          </span>
        </div>

        <span className="text-slate-500 dark:text-slate-400 text-[11px] sm:text-xs">
          &copy; {currentYear} SarbaazSoft Shoe POS. All rights reserved.
        </span>
      </div>
    </footer>
  );
};

