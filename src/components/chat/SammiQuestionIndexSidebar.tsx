import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bookmark,
  X,
  ArrowUpRight,
  ChevronRight,
  Clock,
  ArrowDown,
  ArrowUp,
  MessageSquare,
} from 'lucide-react';
import type { ChatMessageItem } from './SammiAssistantView.tsx';

interface SammiQuestionIndexSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onToggle: () => void;
  messages: ChatMessageItem[];
  highlightedMsgId: string | null;
  onSelectQuestion: (msgId: string) => void;
  storeName: string;
  onScrollToTop: () => void;
  onScrollToBottom: () => void;
}

/**
 * Extracts a concise, clean question title from user input.
 * Strips markdown and keeps the first 6-8 words or up to 48 characters.
 */
export const extractQuestionTitle = (text: string, maxWords: number = 7): string => {
  if (!text) return 'General Inquiry';
  const clean = text
    .replace(/[*_#`~>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const firstLine = clean.split('\n')[0].trim();
  const words = firstLine.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Inquiry';
  if (words.length <= maxWords && firstLine.length <= 48) {
    return firstLine;
  }
  return words.slice(0, maxWords).join(' ') + '...';
};

export const SammiQuestionIndexSidebar: React.FC<SammiQuestionIndexSidebarProps> = ({
  isOpen,
  onClose,
  onToggle,
  messages,
  highlightedMsgId,
  onSelectQuestion,
  storeName,
  onScrollToTop,
  onScrollToBottom,
}) => {
  // Extract all user messages with their order index
  const userQuestions = useMemo(() => {
    return messages
      .filter((m) => m.role === 'user')
      .map((m, index) => ({
        ...m,
        questionIndex: index + 1,
        title: extractQuestionTitle(m.text),
      }));
  }, [messages]);

  return (
    <>
      {/* Floating Minimized Edge Tab (Styled like a modern Toast Pill) */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="collapsed-edge-tab"
            type="button"
            onClick={onToggle}
            initial={{ opacity: 0, x: 20, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed right-3 sm:right-6 top-24 sm:top-28 z-30 group flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/95 dark:bg-[#0D1527]/95 text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-purple-800/80 shadow-xl shadow-purple-950/10 hover:shadow-2xl hover:border-purple-400 dark:hover:border-purple-500/80 transition-all cursor-pointer backdrop-blur-md"
            title="Open Inquiry Index"
            aria-label="Open Inquiry Index"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0">
              <Bookmark className="w-4 h-4" />
            </div>
            <div className="text-left hidden sm:block pr-1">
              <div className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-1.5">
                <span>Inquiry Index</span>
                {userQuestions.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[10px] font-bold font-mono">
                    {userQuestions.length}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-0.5">
                <span>Quick jump links</span>
                <ChevronRight className="w-3 h-3 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Backdrop for Mobile (< sm) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/30 dark:bg-black/50 backdrop-blur-xs z-40 sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Main Toast-Aligned Floating Popup Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="floating-question-index-drawer"
            initial={{ opacity: 0, y: -15, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -15, scale: 0.96 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="fixed right-3 sm:right-6 top-20 sm:top-24 bottom-4 sm:bottom-6 w-[92vw] sm:w-84 xl:w-92 z-40 flex flex-col bg-white/95 dark:bg-[#0D1527]/95 border border-purple-200/80 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl shadow-2xl shadow-purple-950/15 dark:shadow-[0_16px_48px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden font-sans ring-1 ring-purple-500/10 dark:ring-purple-400/20"
            aria-label="Inquiry History Index"
          >
            {/* Header: Toast Notification Styled (Clean, uncolored, matching PosToast header) */}
            <div className="p-4 pb-3 border-b border-slate-200/80 dark:border-purple-900/50 flex items-center justify-between gap-3 bg-gradient-to-b from-purple-50/50 via-transparent to-transparent dark:from-purple-950/20">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                  <Bookmark className="w-5 h-5 text-purple-600 dark:text-purple-300" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight truncate">
                      Inquiry Index
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
                      {userQuestions.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-purple-300/80 truncate mt-0.5">
                    {storeName} • Quick Jump Links
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-purple-900/40 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer shrink-0"
                title="Dismiss window"
                aria-label="Close index"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Questions Index Stream */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5 scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-900">
              {userQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/60 flex items-center justify-center shadow-2xs">
                    <MessageSquare className="w-6 h-6 opacity-75" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      No Questions Yet
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-[210px] leading-relaxed">
                      Ask Sammi any question in chat or select a suggested topic to populate this quick index.
                    </p>
                  </div>
                </div>
              ) : (
                userQuestions.map((q) => {
                  const isHighlighted = highlightedMsgId === q.id;

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => onSelectQuestion(q.id)}
                      className={`w-full text-left p-3 rounded-2xl transition-all cursor-pointer group relative border ${
                        isHighlighted
                          ? 'bg-purple-50 dark:bg-purple-950/60 text-slate-900 dark:text-white border-purple-400 dark:border-purple-500 shadow-md ring-2 ring-purple-400/50'
                          : 'bg-white dark:bg-[#131B2E] hover:bg-purple-50/50 dark:hover:bg-purple-950/30 text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-purple-900/40 shadow-2xs hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                      title={`Jump to Question #${q.questionIndex}: "${q.text.slice(0, 80)}"`}
                    >
                      {/* Top Row: Sequential index & Timestamp */}
                      <div className="flex items-center justify-between text-[11px] mb-1.5">
                        <span
                          className={`font-mono font-bold px-2 py-0.5 rounded-md text-[10px] ${
                            isHighlighted
                              ? 'bg-purple-600 text-white'
                              : 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          #{String(q.questionIndex).padStart(2, '0')}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                          <Clock className="w-3 h-3" />
                          <span>{q.timestamp}</span>
                        </div>
                      </div>

                      {/* Question Extracted Title */}
                      <p className="font-semibold text-xs leading-snug line-clamp-2 text-slate-800 dark:text-slate-100 group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                        {q.title}
                      </p>

                      {/* Jump Link Footer */}
                      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-purple-900/30 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>Jump to message</span>
                        </span>
                        <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Controls (Aligned with Toast Window Theme) */}
            <div className="p-3 bg-slate-50/80 dark:bg-[#0B1120] border-t border-slate-200/80 dark:border-purple-900/50 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={onScrollToTop}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-900/50 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition flex items-center gap-1 cursor-pointer text-xs"
                  title="Scroll to top of chat"
                >
                  <ArrowUp className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Top</span>
                </button>
                <button
                  type="button"
                  onClick={onScrollToBottom}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-900/50 text-slate-700 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition flex items-center gap-1 cursor-pointer text-xs"
                  title="Scroll to latest message"
                >
                  <ArrowDown className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Latest</span>
                </button>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition cursor-pointer shadow-sm shadow-purple-600/20 active:scale-95"
              >
                Close
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
