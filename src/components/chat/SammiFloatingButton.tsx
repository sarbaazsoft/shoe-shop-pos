import React, { useEffect } from 'react';
import { Bot, Sparkles } from 'lucide-react';

export interface SammiFloatingButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

export const SammiFloatingButton: React.FC<SammiFloatingButtonProps> = ({ onClick, isOpen }) => {
  // Listen for Alt + S keyboard shortcut to toggle drawer from anywhere
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input or textarea unless Alt is pressed
      if (e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        onClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  if (isOpen) return null;

  return (
    <div className="fixed bottom-5 right-5 z-40 no-print select-none">
      <button
        type="button"
        onClick={onClick}
        className="group relative flex items-center gap-2.5 px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-full bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 text-white shadow-xl shadow-purple-600/35 hover:shadow-2xl hover:shadow-purple-600/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer border border-white/20 backdrop-blur-md"
        title="Ask Sammi AI Assistant (Alt + S)"
        aria-label="Open Sammi AI Assistant Drawer (Alt + S)"
      >
        {/* Glowing pulse aura ring */}
        <span className="absolute -inset-1 rounded-full bg-purple-500/25 animate-pulse pointer-events-none group-hover:bg-purple-500/40" />

        <div className="relative flex items-center justify-center shrink-0">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/15 flex items-center justify-center">
            <Bot className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </div>
          <Sparkles className="w-2.5 h-2.5 text-amber-300 absolute -top-1 -right-1 animate-pulse" />
        </div>

        <div className="flex flex-col items-start leading-none text-left">
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold text-xs sm:text-sm tracking-tight text-white">Ask Sammi</span>
            <span className="text-[9px] sm:text-[10px] font-bold bg-white/25 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-2xs">
              AI
            </span>
          </div>
          <span className="text-[10px] text-purple-200/90 font-medium mt-0.5 hidden md:inline">
            Footwear & Store Intelligence
          </span>
        </div>

        <span className="ml-1 hidden lg:inline-flex items-center text-[10px] font-mono font-bold bg-black/25 text-purple-200 px-1.5 py-0.5 rounded border border-white/15">
          Alt+S
        </span>
      </button>
    </div>
  );
};
