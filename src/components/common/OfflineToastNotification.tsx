import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { WifiOff, Cloud, RefreshCw, ChevronRight } from 'lucide-react';
import { useOfflineSync } from '../../utils/useOfflineSync.ts';
import { OfflineSyncModal } from '../pos/OfflineSyncModal.tsx';

interface OfflineToastNotificationProps {
  currencySymbol?: string;
}

export const OfflineToastNotification: React.FC<OfflineToastNotificationProps> = ({
  currencySymbol = 'Rs.',
}) => {
  // Directly bind to navigator.onLine state with window online/offline listeners
  const [isOnlineState, setIsOnlineState] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const { pendingCount, isSyncing } = useOfflineSync();

  useEffect(() => {
    const handleOnline = () => setIsOnlineState(true);
    const handleOffline = () => setIsOnlineState(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Strict condition: appears at the bottom of the screen ONLY when navigator.onLine is false
  const isOffline = !isOnlineState;

  return (
    <>
      <AnimatePresence>
        {isOffline && (
          <motion.div
            id="offline-mode-toast-notification"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 no-print pointer-events-auto"
          >
            <div className="relative w-full bg-white dark:bg-[#0E1628] rounded-2xl border border-slate-200 dark:border-purple-900/60 shadow-2xl overflow-hidden">
              {/* Header Accent Bar */}
              <div className="h-1.5 w-full bg-amber-500" />

              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {/* Icon container matching NotificationStatusModal */}
                    <div className="w-12 h-12 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm shrink-0">
                      <WifiOff className="w-6 h-6 stroke-[2.2]" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                          Offline Node Active
                        </h4>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                          No Internet
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        Local IndexedDB Ready
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <p>
                    POS operations are currently running offline. Sales will queue safely and synchronize automatically when reconnected.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <Cloud className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>
                      Queue: <strong className="text-slate-900 dark:text-white font-mono font-bold">{pendingCount}</strong>
                    </span>
                    {isSyncing && <RefreshCw className="w-3 h-3 text-purple-600 animate-spin ml-1 shrink-0" />}
                  </div>

                  <button
                    type="button"
                    id="offline-toast-view-queue-btn"
                    onClick={() => setIsModalOpen(true)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-white transition cursor-pointer shadow-xs active:scale-95 flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500"
                  >
                    <span>View Node Queue</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Queue & Sync Modal */}
      <OfflineSyncModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currencySymbol={currencySymbol}
      />
    </>
  );
};
