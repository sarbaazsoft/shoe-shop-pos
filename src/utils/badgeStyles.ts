import React from 'react';

export type LuxuryBadgeTone = 'purple' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'default';
export type BadgeVariant = 'luxury' | 'subtle' | 'solid' | 'outline';
export type BadgeSize = 'xs' | 'sm' | 'md' | 'lg';

export interface LuxuryBadgeOptions {
  tone?: LuxuryBadgeTone;
  size?: BadgeSize;
  glow?: boolean;
  className?: string;
  pill?: boolean;
}

/**
 * Returns Tailwind class names for the 'Luxury' badge variant.
 * Features:
 * - Courgette cursive font styling
 * - Subtle gradient border matching POS premium branding
 * - Semi-translucent gradient background
 * - Ambient luxury glow
 */
export function getLuxuryBadgeClass(options: LuxuryBadgeOptions = {}): string {
  const {
    tone = 'purple',
    size = 'sm',
    glow = true,
    pill = true,
    className = '',
  } = options;

  // Size specifications
  const sizeClasses: Record<BadgeSize, string> = {
    xs: 'text-[9.5px] px-2 py-0.5 gap-1',
    sm: 'text-[11px] sm:text-xs px-2.5 sm:px-3 py-0.5 sm:py-1 gap-1.5',
    md: 'text-xs sm:text-sm px-3 sm:px-3.5 py-1 sm:py-1.5 gap-2',
    lg: 'text-sm sm:text-base px-4 py-2 gap-2.5',
  };

  // Tone-specific gradient border, backdrop, and typography palettes
  const toneClasses: Record<LuxuryBadgeTone, string> = {
    purple: [
      'bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-purple-600/15',
      'dark:from-purple-500/20 dark:via-indigo-500/15 dark:to-purple-600/25',
      'border border-purple-400/40 dark:border-purple-400/50',
      'ring-1 ring-inset ring-indigo-400/20 dark:ring-purple-400/30',
      'text-purple-800 dark:text-purple-200',
      glow ? 'shadow-[0_0_14px_rgba(168,85,247,0.18)]' : 'shadow-2xs',
    ].join(' '),

    indigo: [
      'bg-gradient-to-r from-indigo-500/15 via-purple-500/10 to-indigo-600/15',
      'dark:from-indigo-500/20 dark:via-purple-500/15 dark:to-indigo-600/25',
      'border border-indigo-400/40 dark:border-indigo-400/50',
      'ring-1 ring-inset ring-purple-400/20 dark:ring-indigo-400/30',
      'text-indigo-800 dark:text-indigo-200',
      glow ? 'shadow-[0_0_14px_rgba(99,102,241,0.18)]' : 'shadow-2xs',
    ].join(' '),

    emerald: [
      'bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-emerald-600/15',
      'dark:from-emerald-500/20 dark:via-teal-500/15 dark:to-emerald-600/25',
      'border border-emerald-400/40 dark:border-emerald-400/50',
      'ring-1 ring-inset ring-teal-400/20 dark:ring-emerald-400/30',
      'text-emerald-800 dark:text-emerald-200',
      glow ? 'shadow-[0_0_14px_rgba(16,185,129,0.18)]' : 'shadow-2xs',
    ].join(' '),

    amber: [
      'bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-600/15',
      'dark:from-amber-500/20 dark:via-orange-500/15 dark:to-amber-600/25',
      'border border-amber-400/40 dark:border-amber-400/50',
      'ring-1 ring-inset ring-orange-400/20 dark:ring-amber-400/30',
      'text-amber-800 dark:text-amber-200',
      glow ? 'shadow-[0_0_14px_rgba(245,158,11,0.18)]' : 'shadow-2xs',
    ].join(' '),

    rose: [
      'bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-rose-600/15',
      'dark:from-rose-500/20 dark:via-pink-500/15 dark:to-rose-600/25',
      'border border-rose-400/40 dark:border-rose-400/50',
      'ring-1 ring-inset ring-pink-400/20 dark:ring-rose-400/30',
      'text-rose-800 dark:text-rose-200',
      glow ? 'shadow-[0_0_14px_rgba(244,63,94,0.18)]' : 'shadow-2xs',
    ].join(' '),

    default: [
      'bg-gradient-to-r from-purple-500/15 via-indigo-500/10 to-purple-600/15',
      'dark:from-purple-500/20 dark:via-indigo-500/15 dark:to-purple-600/25',
      'border border-purple-400/40 dark:border-purple-400/50',
      'ring-1 ring-inset ring-indigo-400/20 dark:ring-purple-400/30',
      'text-purple-800 dark:text-purple-200',
      glow ? 'shadow-[0_0_14px_rgba(168,85,247,0.18)]' : 'shadow-2xs',
    ].join(' '),
  };

  const baseClasses = [
    'font-courgette',
    'inline-flex',
    'items-center',
    pill ? 'rounded-full' : 'rounded-xl',
    'font-semibold',
    'backdrop-blur-xs',
    'transition-all',
    'duration-200',
    'select-none',
    sizeClasses[size],
    toneClasses[tone],
    className,
  ].filter(Boolean).join(' ');

  return baseClasses;
}

/**
 * Returns inline styling ensuring the Courgette cursive font is guaranteed
 * even before external font classes finish cascading.
 */
export function getLuxuryBadgeStyle(customStyle?: React.CSSProperties): React.CSSProperties {
  return {
    fontFamily: "'Courgette', cursive, sans-serif",
    ...customStyle,
  };
}

/**
 * Utility function to update any existing badge class string and styles
 * to the new 'Luxury' badge variant across the POS application.
 *
 * @param existingClassName - The existing badge class string
 * @param options - Custom options (tone, size, glow, etc.)
 */
export function updateBadgeToLuxuryStyle(
  existingClassName: string = '',
  options: LuxuryBadgeOptions = {}
): {
  className: string;
  style: React.CSSProperties;
} {
  const luxuryClass = getLuxuryBadgeClass(options);

  // Strip conflicting legacy font and border classes if present
  const cleaned = existingClassName
    .replace(/\bfont-(sans|mono|bold|extrabold|semibold|medium|normal|light|serif)\b/g, '')
    .replace(/\bborder-(slate|gray|zinc|neutral|stone)-[0-9/]+/g, '')
    .trim();

  return {
    className: `${luxuryClass} ${cleaned}`.trim(),
    style: getLuxuryBadgeStyle(),
  };
}

/**
 * Quick access presets for prominent POS badge types
 */
export const LUXURY_BADGE_PRESETS = {
  storeLive: updateBadgeToLuxuryStyle('', { tone: 'emerald', size: 'xs' }),
  superadmin: updateBadgeToLuxuryStyle('', { tone: 'purple', size: 'xs' }),
  admin: updateBadgeToLuxuryStyle('', { tone: 'amber', size: 'xs' }),
  cashier: updateBadgeToLuxuryStyle('', { tone: 'indigo', size: 'xs' }),
  freeTrial: updateBadgeToLuxuryStyle('', { tone: 'purple', size: 'sm' }),
  premium: updateBadgeToLuxuryStyle('', { tone: 'purple', size: 'sm' }),
  syncing: updateBadgeToLuxuryStyle('', { tone: 'indigo', size: 'xs' }),
  alert: updateBadgeToLuxuryStyle('', { tone: 'rose', size: 'xs' }),
};
