import React, { useState } from 'react';

export interface ShoeIconProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
  src?: string | null;
  alt?: string;
  title?: string;
  id?: string;
}

/**
 * ShoeIcon / StoreIcon
 * Standardized store icon component rendering the official professional PWA icon
 * (/icon.svg and /pwa-192x192.png) across all headers, navigation bars, modals,
 * and login screens. Supports optional custom store branding logo with graceful fallback.
 */
export const ShoeIcon: React.FC<ShoeIconProps> = ({
  className = 'w-5 h-5',
  size,
  strokeWidth: _unusedStrokeWidth,
  src,
  alt = 'SarbaazSoft Shoe POS',
  title,
  id,
  style,
  ...props
}) => {
  const [customError, setCustomError] = useState(false);
  const [fallbackAttempt, setFallbackAttempt] = useState(0);

  // If a custom store logo is provided and hasn't errored, use it;
  // otherwise default to the official store PWA icon (/pwa-192x192.png) as appears in store sidebar
  const resolvedSrc = (() => {
    if (!customError && src && src.trim()) {
      return src.trim();
    }
    if (fallbackAttempt === 1) return '/pwa-512x512.png';
    if (fallbackAttempt >= 2) return '/favicon.png';
    return '/pwa-192x192.png';
  })();

  const handleError = () => {
    if (!customError && src && src.trim()) {
      setCustomError(true);
    } else {
      setFallbackAttempt((prev) => prev + 1);
    }
  };

  return (
    <img
      id={id}
      src={resolvedSrc}
      alt={alt}
      title={title || alt}
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      onError={handleError}
      className={`shrink-0 select-none ${className.includes('object-') ? '' : 'object-cover'} ${className}`}
      style={style}
      {...props}
    />
  );
};

export const TinyShoeIcon: React.FC<{ className?: string }> = ({
  className = 'w-3.5 h-3.5 shrink-0',
}) => (
  <svg
    viewBox="0 0 64 42"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M6 31c0-3 2-5 5-6l12-5c3-1.5 6-4.5 8-8 1-1.5 2.8-1.5 3.8 0 1.8 2.8 4.5 5 8.2 5.8l11 2.4c3.5.8 6 3.8 6 7.3 0 2.5-2 4.5-4.5 4.5H10.5C8 37 6 34.5 6 31z" />
  </svg>
);

export const StoreIcon = ShoeIcon;
export default ShoeIcon;
