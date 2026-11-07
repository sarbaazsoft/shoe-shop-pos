import React from 'react';
import { FreeTrialOnboardingModal } from '../saas/FreeTrialOnboardingModal.tsx';

export interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (loginData: { user: any; token: string; store: any }) => void;
  initialPlan?: string;
  sourceContext?: string;
}

/**
 * RegisterModal provides an alias wrapper around FreeTrialOnboardingModal
 * supporting both auth and SaaS registration modal flows.
 */
export const RegisterModal: React.FC<RegisterModalProps> = (props) => {
  return <FreeTrialOnboardingModal {...props} />;
};

export default RegisterModal;
