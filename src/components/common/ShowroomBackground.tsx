import React from 'react';
import shoeStoreBg from '../../assets/images/shoe_store_blurred_bg_1790706924465.jpg';

interface ShowroomBackgroundProps {
  className?: string;
}

/**
 * ShowroomBackground
 * Aligned showroom background layer with 95% high visibility (`opacity-95`) as `bg-cover`
 * across AuthModal, Loading Platform, InstallationWizard, TenantOnboardingWizard,
 * SuperAdmin Login, SuspendedStoreView, and UnknownStore404View routes.
 */
export const ShowroomBackground: React.FC<ShowroomBackgroundProps> = ({ className = '' }) => {
  return (
    <>
      {/* Showroom Background Image Layer (70% opacity) */}
      <div
        id="showroom-bg-image-layer"
        className={`fixed inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-70 pointer-events-none transition-opacity duration-300 ${className}`}
        style={{
          backgroundImage: `url(${shoeStoreBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.70,
        }}
        aria-hidden="true"
      />
    </>
  );
};