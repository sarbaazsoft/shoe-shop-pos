import React from 'react';
import {
  getLuxuryBadgeClass,
  getLuxuryBadgeStyle,
  LuxuryBadgeOptions,
  LuxuryBadgeTone,
  BadgeVariant,
  BadgeSize,
} from '../../utils/badgeStyles';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  tone?: LuxuryBadgeTone;
  size?: BadgeSize;
  icon?: React.ReactNode;
  pulse?: boolean;
  pulseColor?: string;
  glow?: boolean;
  pill?: boolean;
}

/**
 * Universal Badge component supporting the 'Luxury' variant with Courgette
 * font styling and subtle gradient border.
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'luxury',
  tone = 'purple',
  size = 'sm',
  icon,
  pulse = false,
  pulseColor,
  glow = true,
  pill = true,
  className = '',
  style,
  children,
  ...props
}) => {
  if (variant === 'luxury') {
    const luxuryClass = getLuxuryBadgeClass({ tone, size, glow, pill, className });
    const luxuryStyle = getLuxuryBadgeStyle(style);

    const defaultPulseColor =
      pulseColor ||
      (tone === 'emerald'
        ? 'bg-emerald-500 dark:bg-emerald-400'
        : tone === 'rose'
        ? 'bg-rose-500 dark:bg-rose-400'
        : tone === 'amber'
        ? 'bg-amber-500 dark:bg-amber-400'
        : tone === 'indigo'
        ? 'bg-indigo-500 dark:bg-indigo-400'
        : 'bg-purple-500 dark:bg-purple-400');

    return (
      <span className={luxuryClass} style={luxuryStyle} {...props}>
        {pulse && (
          <span
            className={`w-1.5 h-1.5 rounded-full ${defaultPulseColor} animate-pulse shrink-0`}
            aria-hidden="true"
          />
        )}
        {icon && <span className="shrink-0 flex items-center justify-center">{icon}</span>}
        <span>{children}</span>
      </span>
    );
  }

  // Fallback for standard or other variants
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${className}`}
      style={style}
      {...props}
    >
      {pulse && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0" />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
    </span>
  );
};

/**
 * Explicit LuxuryBadge convenience wrapper
 */
export const LuxuryBadge: React.FC<Omit<BadgeProps, 'variant'>> = (props) => (
  <Badge variant="luxury" {...props} />
);

export default Badge;
