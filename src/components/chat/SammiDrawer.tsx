import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SammiAssistantView } from './SammiAssistantView.tsx';

export interface SammiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onExpandFullScreen?: () => void;
  storeName: string;
  currentUser?: any;
  companySettings?: any;
  onNavigateTab?: (tab: string) => void;
}

export const SammiDrawer: React.FC<SammiDrawerProps> = ({
  isOpen,
  onClose,
  onExpandFullScreen,
  storeName,
  currentUser,
  companySettings,
  onNavigateTab,
}) => {
  // Listen for Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden pointer-events-auto no-print">
          {/* Backdrop Overlay with smooth blur */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Slide-over Drawer Panel */}
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 pointer-events-none">
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="w-screen max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl bg-[#F8FAFC] dark:bg-[#0A0E1A] shadow-2xl border-l border-slate-200/90 dark:border-purple-800/60 flex flex-col pointer-events-auto overflow-hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Sammi AI Assistant Drawer"
            >
              <SammiAssistantView
                storeName={storeName}
                currentUser={currentUser}
                companySettings={companySettings}
                onNavigateTab={onNavigateTab}
                isDrawer={true}
                onClose={onClose}
                onExpandFullScreen={onExpandFullScreen}
              />
            </motion.aside>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
};
