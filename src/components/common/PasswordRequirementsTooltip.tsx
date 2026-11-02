import React, { useState, useRef, useEffect } from 'react';
import { Info, Shield, Check, AlertCircle } from 'lucide-react';
import { evaluatePasswordStrength } from '../../utils/passwordStrength.ts';

export interface PasswordRequirementsTooltipProps {
  minChars?: number;
  password?: string;
  className?: string;
  iconClassName?: string;
  placement?: 'top' | 'bottom' | 'right' | 'left';
}

export const PasswordRequirementsTooltip: React.FC<PasswordRequirementsTooltipProps> = ({
  minChars = 8,
  password = '',
  className = '',
  iconClassName = '',
  placement = 'top',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click if toggled open via tap on mobile
  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const strength = evaluatePasswordStrength(password, minChars);

  // Placement classes for the tooltip popover
  const placementClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }[placement];

  return (
    <div
      ref={containerRef}
      className={`relative inline-flex items-center align-middle group/tooltip ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        tabIndex={0}
        aria-label="Password Security Requirements"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
        className={`p-0.5 rounded-full text-slate-400 hover:text-purple-600 dark:text-purple-400/80 dark:hover:text-purple-300 transition-colors focus:outline-none focus:ring-1 focus:ring-purple-500/40 cursor-pointer ${iconClassName}`}
        title="Password Security Requirements"
      >
        <Info className="w-3.5 h-3.5 shrink-0" />
      </button>

      {/* Tooltip Popover */}
      <div
        role="tooltip"
        className={`absolute ${placementClasses} z-50 w-64 p-3 rounded-xl bg-slate-900 text-slate-100 dark:bg-[#0B1120] dark:text-slate-100 border border-slate-700/80 dark:border-purple-800/80 shadow-2xl backdrop-blur-md transition-all duration-150 pointer-events-none ${
          isOpen
            ? 'opacity-100 visible scale-100 translate-y-0'
            : 'opacity-0 invisible scale-95 pointer-events-none'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/80 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-xs font-bold text-white tracking-tight">
            <Shield className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>Password Security Requirements</span>
          </div>
        </div>

        {/* Requirements List */}
        <div className="space-y-1.5">
          {strength.requirements.map((req) => {
            const hasPassword = Boolean(password && password.length > 0);
            return (
              <div
                key={req.id}
                className={`flex items-center gap-2 text-[11px] font-medium leading-tight transition-colors ${
                  hasPassword
                    ? req.met
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-400'
                    : 'text-slate-300'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 text-[9px] ${
                    hasPassword
                      ? req.met
                        ? 'bg-emerald-500 text-white'
                        : 'border border-slate-600 text-transparent'
                      : 'border border-slate-500 text-transparent'
                  }`}
                >
                  {hasPassword && req.met ? (
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-slate-500" />
                  )}
                </div>
                <span>{req.label}</span>
              </div>
            );
          })}
        </div>

        <div className="mt-2.5 pt-2 border-t border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
          <span>Min {minChars} chars</span>
          <span className="text-purple-400 font-mono">Strong &bull; Secure</span>
        </div>
      </div>
    </div>
  );
};
