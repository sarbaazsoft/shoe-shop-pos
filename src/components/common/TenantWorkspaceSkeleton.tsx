import React from 'react';
import { LoadingWindow } from './LoadingWindow.tsx';

interface TenantWorkspaceSkeletonProps {
  storeName?: string;
  activeTab?: string;
  statusMessage?: string;
  isAdmin?: boolean;
}

/**
 * TenantWorkspaceSkeleton
 *
 * Refactored loading visual: renders the polished, branded LoadingWindow with
 * the Showroom Background (`shoeStoreBg`), replacing the legacy empty gray skeleton
 * with an aligned loading experience for both Store and SuperAdmin workflows.
 */
export const TenantWorkspaceSkeleton: React.FC<TenantWorkspaceSkeletonProps> = ({
  storeName,
  statusMessage,
  isAdmin = false,
  activeTab,
}) => {
  return (
    <LoadingWindow
      storeName={storeName}
      statusMessage={statusMessage}
      isAdmin={isAdmin}
      activeTab={activeTab}
    />
  );
};
