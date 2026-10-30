import React from 'react';
import { Store, Globe, AlertTriangle, ShieldAlert } from 'lucide-react';

interface UnknownStore404ViewProps {
  onBackHome: () => void;
  onGoToSuperAdmin: () => void;
}

export const UnknownStore404View: React.FC<UnknownStore404ViewProps> = ({
  onBackHome,
  onGoToSuperAdmin,
}) => {
  return (
    <div className="min-h-[calc(100vh-3rem)] bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(124,58,237,0.16),transparent_60%)] pointer-events-none" />

      <div className="max-w-xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 md:p-10 shadow-2xl relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono uppercase tracking-wider">
            <AlertTriangle className="w-3.5 h-3.5" />
            HTTP 404 • Tenant Not Found
          </div>
        </div>

        <div className="w-14 h-14 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center mb-6">
          <Store className="w-7 h-7 text-violet-400" />
        </div>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white mb-3">
          Store Not Found
        </h1>

        <p className="text-base text-slate-300 leading-relaxed mb-6">
          This store link is invalid or the store is no longer available. Return to the store directory or contact your platform administrator.
        </p>

        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <button
            type="button"
            onClick={onBackHome}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-violet-400" />
            Back to Home
          </button>

          <button
            type="button"
            onClick={onGoToSuperAdmin}
            className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
            Open SuperAdmin C-Panel
          </button>
        </div>
      </div>
    </div>
  );
};
