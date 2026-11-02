import React from 'react';

export interface ShoeIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

/**
 * ShoeIcon
 * Crisp, modern shoe/sneaker icon designed on a 24x24 grid matching Lucide icon aesthetics.
 */
export const ShoeIcon: React.FC<ShoeIconProps> = ({
  className = 'w-4.5 h-4.5',
  size,
  strokeWidth = 2,
  ...props
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      {...props}
    >
      {/* Outer shoe silhouette */}
      <path d="M4 7h4.5a1.5 1.5 0 0 1 1.2.6l3.3 4.4h4.5a2 2 0 0 1 2 2v1.5a2.5 2.5 0 0 1-2.5 2.5H6a3 3 0 0 1-3-3V8a1 1 0 0 1 1-1z" />
      {/* Sole boundary */}
      <path d="M3 14.5h16.5" />
      {/* Laces */}
      <path d="M8 11.5l1.5-2.5" />
      <path d="M10.5 12l1.5-2.5" />
    </svg>
  );
};

export default ShoeIcon;
