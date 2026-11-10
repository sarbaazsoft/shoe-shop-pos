import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Barcode,
  Bookmark,
  X,
  ArrowUpRight,
  ChevronRight,
  Clock,
  Sparkles,
  ArrowDown,
  ArrowUp,
  MessageSquare,
  ScanLine,
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

// Fixed barcode stripe pattern for consistent realistic rendering
const BARCODE_STRIPES = [
  2, 1, 3, 1, 1, 2, 4, 1, 2, 1, 3, 2, 1, 1, 4, 2, 1, 2, 3, 1, 1, 2, 1, 4, 1, 2, 1, 3, 2, 1, 2, 4, 1, 1, 3, 2, 1, 2, 1, 4, 2, 1, 3, 1, 2
];

/**
 * Extracts a concise, clean question title from user input.
 * Strips markdown and keeps the first 6-8 words or up to 45 characters.
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

  const receiptDate = useMemo(() => {
    const now = new Date();
    return now.toISOString().slice(2, 10).replace(/-/g, '');
  }, []);

  return (
    <>
      {/* Floating Minimized Edge Tab: Always accessible when collapsed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            key="collapsed-edge-tab"
            type="button"
            onClick={onToggle}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed right-3 sm:right-5 top-28 sm:top-32 z-30 group flex items-center gap-2 px-3 py-2.5 rounded-2xl bg-white/95 dark:bg-[#0D1527]/95 text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-purple-800/80 shadow-lg shadow-purple-900/10 hover:shadow-xl hover:border-purple-500/70 transition-all cursor-pointer backdrop-blur-md"
            title="Open Question Index (Receipt Ledger)"
            aria-label="Open Question Index"
          >
            <div className="relative">
              <div className="w-8 h-8 rounded-xl bg-purple-50 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 flex items-center justify-center font-bold">
                <Bookmark className="w-4 h-4" />
              </div>
              {userQuestions.length > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-mono font-bold flex items-center justify-center shadow-xs">
                  {userQuestions.length}
                </span>
              )}
            </div>
            <div className="text-left hidden md:block pr-1">
              <div className="text-[10px] font-mono tracking-wider font-bold text-purple-600 dark:text-purple-400 uppercase">
                Inquiry Index
              </div>
              <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
                <span>{userQuestions.length} Question{userQuestions.length === 1 ? '' : 's'}</span>
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
            className="fixed inset-0 bg-slate-950/40 dark:bg-black/60 backdrop-blur-xs z-40 sm:hidden"
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Main Collapsible Floating Sidebar Drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="floating-question-index-drawer"
            initial={{ opacity: 0, x: 60, scale: 0.98 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="fixed right-3 sm:right-5 top-20 sm:top-24 bottom-4 sm:bottom-6 w-[92vw] sm:w-84 xl:w-92 z-40 flex flex-col bg-white/95 dark:bg-[#0D1527]/95 border border-slate-200/90 dark:border-purple-800/80 rounded-2xl sm:rounded-3xl shadow-2xl shadow-purple-950/20 dark:shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden font-sans"
            aria-label="Question History Index"
          >
            {/* Top Thermal Receipt Edge & Header */}
            <div className="bg-slate-900 text-white dark:bg-black p-3.5 pb-2.5 border-b border-slate-800 dark:border-purple-950/80 relative">
              {/* Receipt Barcode Graphic */}
              <div className="flex items-center justify-between gap-2 mb-2 font-mono text-[10px] text-slate-300">
                <div className="flex items-center gap-1.5">
                  <Barcode className="w-4 h-4 text-purple-400 shrink-0" />
                  <span className="font-bold tracking-widest uppercase">POS INQUIRY TICKET</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-purple-300 font-bold bg-purple-950/80 px-1.5 py-0.5 rounded border border-purple-800/60">
                    REC#{receiptDate}
                  </span>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 dark:hover:bg-purple-900/40 transition cursor-pointer"
                    title="Close index drawer"
                    aria-label="Close index"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Barcode Strip Graphic */}
              <div
                className="h-5 w-full bg-slate-950 px-2 py-0.5 flex items-center justify-center gap-[2px] rounded-xs select-none overflow-hidden border border-slate-800"
                aria-hidden="true"
              >
                {BARCODE_STRIPES.map((w, i) => (
                  <div
                    key={i}
                    className={`h-full bg-slate-200 dark:bg-slate-100 ${
                      w === 1 ? 'w-[1px]' : w === 2 ? 'w-[2.5px]' : w === 3 ? 'w-[3.5px]' : 'w-[5px]'
                    } ${i % 5 === 0 ? 'opacity-40' : 'opacity-95'}`}
                  />
                ))}
              </div>

              {/* Metadata Subheader */}
              <div className="mt-2.5 pt-2 border-t border-dashed border-slate-700/80 text-[10px] font-mono flex items-center justify-between text-slate-400">
                <span className="truncate max-w-[170px]">STORE: {storeName.toUpperCase()}</span>
                <span className="text-emerald-400 font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  INDEX ACTIVE
                </span>
              </div>
            </div>

            {/* Receipt Summary Ribbon */}
            <div className="px-3.5 py-2 bg-purple-50/70 dark:bg-purple-950/40 border-b border-dashed border-purple-200/80 dark:border-purple-900/60 flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold text-purple-900 dark:text-purple-200">
                <Bookmark className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                <span>QUESTIONS LOGGED</span>
              </div>
              <span className="font-mono text-xs font-bold text-purple-700 dark:text-purple-300 bg-white dark:bg-purple-900/60 px-2 py-0.5 rounded-md border border-purple-200 dark:border-purple-800/80 shadow-2xs">
                {userQuestions.length} {userQuestions.length === 1 ? 'Entry' : 'Entries'}
              </span>
            </div>

            {/* Scrollable Questions Index Stream */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2 divide-y-0 scrollbar-thin scrollbar-thumb-purple-200 dark:scrollbar-thumb-purple-900">
              {userQuestions.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3 font-mono">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-900/60 flex items-center justify-center">
                    <ScanLine className="w-6 h-6 animate-pulse" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                      [ NO QUESTIONS LOGGED ]
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[200px] leading-relaxed">
                      Ask Sammi any shoe retail question or click a suggestion to generate instant jump links.
                    </p>
                  </div>
                  <div className="text-[9px] text-slate-400 dark:text-slate-500 border-t border-dashed border-slate-200 dark:border-purple-900/40 pt-2 w-full">
                    * * * WAITING FOR PROMPT * * *
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
                      className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer group relative overflow-hidden border ${
                        isHighlighted
                          ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 ring-2 ring-purple-400'
                          : 'bg-white dark:bg-[#131B2E] hover:bg-purple-50/80 dark:hover:bg-purple-950/40 text-slate-800 dark:text-slate-200 border-slate-200/80 dark:border-purple-900/50 shadow-2xs hover:border-purple-300 dark:hover:border-purple-700'
                      }`}
                      title={`Jump to Question #${q.questionIndex}: "${q.text.slice(0, 80)}"`}
                    >
                      {/* Laser scanner highlight bar on hover */}
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600 dark:bg-purple-400 opacity-0 group-hover:opacity-100 transition-opacity" />

                      {/* Header line: Question index + Timestamp */}
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                        <span
                          className={`font-bold px-1.5 py-0.2 rounded ${
                            isHighlighted
                              ? 'bg-white/20 text-white'
                              : 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                          }`}
                        >
                          #{String(q.questionIndex).padStart(2, '0')}
                        </span>
                        <div
                          className={`flex items-center gap-1 ${
                            isHighlighted
                              ? 'text-purple-100'
                              : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{q.timestamp}</span>
                        </div>
                      </div>

                      {/* Question extracted title */}
                      <div className="font-semibold text-xs leading-snug line-clamp-2 pr-4">
                        {q.title}
                      </div>

                      {/* Jump action prompt */}
                      <div
                        className={`flex items-center justify-between mt-2 pt-1.5 border-t border-dashed text-[10px] font-mono ${
                          isHighlighted
                            ? 'border-white/20 text-purple-100'
                            : 'border-slate-100 dark:border-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          <span>JUMP TO CHAT</span>
                        </span>
                        <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Bottom Quick Controls & Receipt Footer */}
            <div className="p-3 bg-slate-50 dark:bg-[#0B1120] border-t border-slate-200/90 dark:border-purple-900/70 space-y-2">
              <div className="grid grid-cols-2 gap-1.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={onScrollToTop}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-900/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-purple-900/30 transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Scroll to top of chat"
                >
                  <ArrowUp className="w-3 h-3 text-purple-500" />
                  <span>Top</span>
                </button>
                <button
                  type="button"
                  onClick={onScrollToBottom}
                  className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-900/50 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-purple-900/30 transition flex items-center justify-center gap-1 cursor-pointer"
                  title="Scroll to latest message"
                >
                  <ArrowDown className="w-3 h-3 text-purple-500" />
                  <span>Latest</span>
                </button>
              </div>

              {/* Faux thermal tear strip */}
              <div className="text-center font-mono text-[9px] text-slate-400 dark:text-slate-500 tracking-wider select-none pt-1 border-t border-dashed border-slate-200 dark:border-purple-900/40">
                - - - - SAMMI POS INTELLIGENCE - - - -
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
