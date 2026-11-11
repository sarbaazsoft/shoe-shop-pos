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
  const [useFallbackPng, setUseFallbackPng] = useState(false);
  const [customError, setCustomError] = useState(false);

  // If a custom store logo is provided and hasn't errored, use it;
  // otherwise, use the official professional PWA icon (/icon.svg -> /pwa-192x192.png)
  const resolvedSrc =
    !customError && src && src.trim()
      ? src.trim()
      : useFallbackPng
      ? '/pwa-192x192.png'
      : '/icon.svg';

  const handleError = () => {
    if (!customError && src && src.trim()) {
      setCustomError(true);
    } else if (!useFallbackPng) {
      setUseFallbackPng(true);
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
      className={`object-contain shrink-0 select-none ${className}`}
      style={style}
      {...props}
    />
  );
};

export const StoreIcon = ShoeIcon;
export default ShoeIcon;
