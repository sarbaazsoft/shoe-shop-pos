import React, { useState, useEffect, useRef } from 'react';
import {
  Bot,
  User,
  Send,
  RotateCcw,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
  Globe,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Loader2,
  Bookmark,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import { SammiQuestionIndexSidebar } from './SammiQuestionIndexSidebar.tsx';

const TYPING_HINTS = [
  { text: 'Thinking & retrieving knowledge...', icon: Bot },
  { text: 'Retrieving store data & footwear insights...', icon: Globe },
  { text: 'Analyzing operational details & catalog...', icon: Sparkles },
  { text: 'Drafting structured response...', icon: Bot },
];

export interface ChatMessageItem {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  modelUsed?: string;
  inspectedFiles?: string[];
  groundingSources?: Array<{ uri: string; title: string }>;
  searchQueries?: string[];
  liveDbSnapshot?: {
    tenantId?: number;
    storeName?: string;
    pricingMode?: string;
    totalProducts?: number;
    totalStockPairs?: number;
    lowStockCount?: number;
  };
}

interface SammiAssistantViewProps {
  storeName: string;
  currentUser?: any;
  companySettings?: any;
  onNavigateTab?: (tab: string) => void;
}

export const SammiAssistantView: React.FC<SammiAssistantViewProps> = ({
  storeName,
}) => {
  const [messages, setMessages] = useState<ChatMessageItem[]>(() => {
    try {
      const stored = localStorage.getItem('sammi_chat_history');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return [
      {
        id: 'init-1',
        role: 'model',
        text: `**Salam! Main Sammi hoon — ${storeName} POS System ki Search-Grounded AI Assistant.**\n\nMain real-time **Google Search Grounding** se juri hoon! Aap mujhse:\n* **📈 Live Retail Trends:** 2026 footwear demand, trending sneaker silhouettes, festive spikes, aur pricing insights.\n* **👞 Professional Shoe Care:** Genuine leather conditioning, suede/nubuck cleaning, white sole un-yellowing, aur waterproofing.\n* **⚡ POS & Store Operations:** Counter billing, barcode label printing, customer khata, aur returns/exchanges.\n\nAap kya daryaft karna chahte hain?`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'gemini-3.8-flash',
      },
    ];
  });

  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<'fast' | 'general' | 'complex'>('general');
  const [activePromptCategory, setActivePromptCategory] = useState<'all' | 'trends' | 'care' | 'pos'>('all');
  const [isIndexOpen, setIsIndexOpen] = useState(false);
  const [highlightedMsgId, setHighlightedMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cycle through contextual typing feedback hints while loading
  useEffect(() => {
    if (!isLoading) {
      setLoadingPhase(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingPhase((prev) => (prev + 1) % TYPING_HINTS.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [isLoading]);

  // Persist history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('sammi_chat_history', JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectQuestion = (msgId: string) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedMsgId(msgId);
      setTimeout(() => {
        setHighlightedMsgId((prev) => (prev === msgId ? null : prev));
      }, 2500);
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    const userMsg: ChatMessageItem = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInputMessage('');
    setIsLoading(true);

    try {
      let targetModel = 'gemini-3.8-flash';
      if (modelMode === 'fast') {
        targetModel = 'gemini-3.1-flash-lite';
      } else if (modelMode === 'complex') {
        targetModel = 'gemini-3.1-pro-preview';
      } else {
        targetModel = 'gemini-3.8-flash';
      }

      const payloadMessages = nextHistory
        .filter((m) => m.id !== 'init-1')
        .slice(-10)
        .map((m) => ({
          role: m.role,
          text: m.text,
        }));

      if (payloadMessages.length === 0) {
        payloadMessages.push({ role: 'user', text: query });
      }

      const res = await api.chat.send({
        messages: payloadMessages,
        model: targetModel,
        storeName,
      });

      const modelReply: ChatMessageItem = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: res.reply || `Sammi is ready to help at ${storeName}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: res.modelUsed || targetModel,
        inspectedFiles: Array.isArray(res.inspectedFiles) ? res.inspectedFiles : undefined,
        groundingSources: Array.isArray(res.groundingSources) ? res.groundingSources : undefined,
        searchQueries: Array.isArray(res.searchQueries) ? res.searchQueries : undefined,
        liveDbSnapshot: res.liveDbSnapshot || undefined,
      };

      setMessages((prev) => [...prev, modelReply]);
    } catch (err: any) {
      const errorReply: ChatMessageItem = {
        id: `err-${Date.now()}`,
        role: 'model',
        text: `**Notice:** AI service se rabta nahi ho saka (${err?.message || 'Error'}). Baraye meharbani dobara koshish karein.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelUsed: 'system',
      };
      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setIsLoading(false);
      setTimeout(scrollToBottom, 100);
    }
  };

  const handleClearHistory = () => {
    const initialMsg: ChatMessageItem = {
      id: `init-${Date.now()}`,
      role: 'model',
      text: `**Salam! Main Sammi hoon — ${storeName} POS System ki AI Assistant.**\n\nChat conversation clear ho gaya hai. Aap mujhse koi bhi naya sawal pooch sakte hain!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      modelUsed: 'gemini-3.5-flash',
    };
    setMessages([initialMsg]);
    try {
      localStorage.removeItem('sammi_chat_history');
    } catch {}
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const renderMessageContent = (text: string) => {
    const lines = text.split('\n');

    return (
      <div className="space-y-2 text-sm sm:text-base leading-relaxed text-slate-800 dark:text-slate-100">
        {lines.map((line, idx) => {
          if (!line.trim()) return <div key={idx} className="h-2" />;

          const isBullet = line.trim().startsWith('* ') || line.trim().startsWith('- ');
          const cleanLine = isBullet ? line.trim().substring(2) : line;

          const boldParts = cleanLine.split(/(\*\*[^*]+\*\*)/g);
          const renderedLine = boldParts.map((bPart, bIdx) => {
            if (bPart.startsWith('**') && bPart.endsWith('**')) {
              return (
                <strong key={bIdx} className="font-bold text-slate-900 dark:text-white">
                  {bPart.slice(2, -2)}
                </strong>
              );
            }
            return <span key={bIdx}>{bPart}</span>;
          });

          if (isBullet) {
            return (
              <div key={idx} className="flex items-start gap-2.5 pl-1.5 sm:pl-2">
                <span className="text-purple-600 dark:text-purple-400 mt-1 select-none font-bold text-base">•</span>
                <span className="flex-1">{renderedLine}</span>
              </div>
            );
          }

          if (line.startsWith('### ')) {
            return (
              <h4 key={idx} className="font-bold text-base sm:text-lg text-purple-950 dark:text-purple-200 mt-3 mb-1.5 flex items-center gap-2">
                {line.replace('### ', '')}
              </h4>
            );
          }

          return <p key={idx}>{renderedLine}</p>;
        })}
      </div>
    );
  };

  return (
    <div className="w-full min-h-full bg-[#F8FAFC] dark:bg-[#0A0E1A] pt-5 sm:pt-7 pb-10 flex flex-col relative">
      {/* TOP HEADER: Clean, pristine, minimalist */}
      <div className="max-w-4xl lg:max-w-5xl xl:max-w-6xl w-full mx-auto px-4 sm:px-6 mb-6">
        <div className="bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border border-slate-200 dark:border-purple-800/80 rounded-2xl p-4 sm:p-5 shadow-xs text-slate-800 dark:text-white flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300 border border-purple-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold shadow-xs shrink-0">
              <Bot className="w-6 h-6 text-purple-600 dark:text-purple-300" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-bold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">
                  Sammi — AI Assistant
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-700/60 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live AI
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300/80 dark:border-blue-700/60 flex items-center gap-1.5 shadow-2xs">
                  <Globe className="w-3 h-3 text-blue-500" />
                  Search Grounded
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-purple-200/80 mt-0.5">
                {storeName} • Real-Time Footwear Trends, Shoe Care & Store Operations
              </p>
            </div>
          </div>

          {/* Right Controls: Model Mode & Clear Chat */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-800/80 rounded-xl px-2.5 py-1.5 shadow-2xs">
              <Cpu className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0" />
              <span className="text-xs font-bold text-slate-400 dark:text-purple-300/80 hidden sm:inline">
                Mode:
              </span>
              <select
                value={modelMode}
                onChange={(e) => setModelMode(e.target.value as any)}
                className="text-xs sm:text-sm font-semibold bg-transparent text-slate-700 dark:text-purple-100 border-none cursor-pointer focus:outline-none"
                title="Select Assistant Mode"
              >
                <option value="fast" className="bg-white text-slate-900 dark:bg-[#131B2E] dark:text-white">
                  ⚡ Fast Response
                </option>
                <option value="general" className="bg-white text-slate-900 dark:bg-[#131B2E] dark:text-white">
                  Balanced (Search Grounded)
                </option>
                <option value="complex" className="bg-white text-slate-900 dark:bg-[#131B2E] dark:text-white">
                  Detailed Analysis
                </option>
              </select>
            </div>

            {/* Question Index Sidebar Drawer Toggle */}
            <button
              type="button"
              onClick={() => setIsIndexOpen((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl border transition cursor-pointer text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-2xs ${
                isIndexOpen
                  ? 'bg-purple-600 text-white border-purple-500 shadow-purple-600/25'
                  : 'border-slate-200 dark:border-purple-800/80 bg-white dark:bg-[#131B2E] text-slate-700 dark:text-purple-200 hover:bg-slate-100 dark:hover:bg-purple-900/40'
              }`}
              title={isIndexOpen ? 'Collapse Inquiry Index' : 'Open Inquiry History Index'}
              aria-label="Toggle Question Index"
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Index</span>
              {messages.filter((m) => m.role === 'user').length > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                    isIndexOpen
                      ? 'bg-white/20 text-white'
                      : 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300'
                  }`}
                >
                  {messages.filter((m) => m.role === 'user').length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleClearHistory}
              className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-purple-800/80 bg-white dark:bg-[#131B2E] text-slate-600 dark:text-purple-200 hover:bg-slate-100 dark:hover:bg-purple-900/40 text-xs sm:text-sm font-semibold transition cursor-pointer shadow-2xs flex items-center gap-1.5"
              title="Clear conversation history"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Chat</span>
            </button>
          </div>
        </div>
      </div>

      {/* CHAT MESSAGES STREAM: Clean, open, natural page flow */}
      <div className="max-w-4xl lg:max-w-5xl xl:max-w-6xl w-full mx-auto px-4 sm:px-6 flex-1 space-y-5 mb-6">
        {messages.map((msg) => (
          <div
            key={msg.id}
            id={`msg-${msg.id}`}
            className={`w-full flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} transition-all duration-300 ${
              highlightedMsgId === msg.id ? 'scale-[1.01]' : ''
            }`}
          >
            <div
              className={`w-full sm:max-w-[85%] lg:max-w-[80%] rounded-2xl p-4 sm:p-6 transition-all ${
                highlightedMsgId === msg.id
                  ? 'ring-2 ring-purple-500 dark:ring-purple-400 shadow-xl shadow-purple-500/20 ring-offset-2 dark:ring-offset-slate-900'
                  : ''
              } ${
                msg.role === 'user'
                  ? 'bg-slate-50 dark:bg-gradient-to-r dark:from-purple-900 dark:via-indigo-950 dark:to-slate-900 border border-slate-200 dark:border-purple-800/80 text-slate-800 dark:text-white shadow-xs rounded-br-xs ml-auto'
                  : 'bg-white dark:bg-[#131B2E] text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-purple-800/80 shadow-xs rounded-bl-xs'
              }`}
            >
              {/* Header inside user message bubble */}
              {msg.role === 'user' && (
                <div className="flex items-center justify-between gap-3 pb-2.5 mb-2.5 border-b border-slate-200/80 dark:border-purple-800/50">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-600 dark:bg-purple-500/20 dark:text-purple-300 border border-blue-500/20 dark:border-purple-400/30 flex items-center justify-center font-bold text-xs shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-white">
                      You
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-purple-200/70 bg-white/80 dark:bg-black/20 px-2 py-0.5 rounded-full border border-slate-200/60 dark:border-purple-700/40">
                    Prompt
                  </span>
                </div>
              )}

              {/* Header inside assistant message bubble */}
              {msg.role === 'model' && (
                <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-slate-100 dark:border-purple-900/40">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="font-bold text-sm text-purple-900 dark:text-purple-200">
                        Sammi • {storeName}
                      </span>
                    </div>
                  </div>

                  {msg.groundingSources && msg.groundingSources.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60 shadow-2xs">
                      <Globe className="w-3 h-3 text-blue-500" />
                      <span>Web Grounded</span>
                    </span>
                  )}
                </div>
              )}

              {/* Message text content */}
              {renderMessageContent(msg.text)}

              {/* Real-time Google Search Grounding Sources */}
              {msg.groundingSources && msg.groundingSources.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-purple-900/40">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-purple-200 mb-2.5">
                    <Globe className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>Live Search Grounding Sources:</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {msg.groundingSources.map((source, sIdx) => {
                      let domain = '';
                      try {
                        domain = new URL(source.uri).hostname.replace(/^www\./, '');
                      } catch {
                        domain = source.uri;
                      }
                      return (
                        <a
                          key={sIdx}
                          href={source.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between gap-2.5 p-2.5 rounded-xl bg-slate-50 hover:bg-purple-50/60 dark:bg-[#0B1120] dark:hover:bg-purple-950/30 border border-slate-200 hover:border-purple-300 dark:border-purple-900/50 dark:hover:border-purple-700 transition group text-left"
                          title={source.title || source.uri}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-5 h-5 rounded-md bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0 text-[10px] font-bold">
                              {sIdx + 1}
                            </span>
                            <div className="truncate">
                              <p className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate group-hover:text-purple-700 dark:group-hover:text-purple-300 transition-colors">
                                {source.title || domain}
                              </p>
                              <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
                                {domain}
                              </p>
                            </div>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-300 shrink-0 transition-colors" />
                        </a>
                      );
                    })}
                  </div>

                  {/* Search queries extracted from grounding */}
                  {msg.searchQueries && msg.searchQueries.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                      <span className="font-medium text-slate-500 dark:text-slate-400">Search queries:</span>
                      {msg.searchQueries.map((q, qIdx) => (
                        <span
                          key={qIdx}
                          className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700/60 text-[10px]"
                        >
                          "{q}"
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Message Footer: Timestamp and copy button */}
              <div className={`flex items-center justify-between gap-2 mt-3 pt-2 text-xs border-t ${
                msg.role === 'user'
                  ? 'text-slate-500 dark:text-purple-300/80 border-slate-200/70 dark:border-purple-800/40'
                  : 'text-slate-400 dark:text-slate-500 border-slate-100/60 dark:border-purple-900/20'
              }`}>
                <span className="text-[11px]">{msg.timestamp}</span>
                <button
                  type="button"
                  onClick={() => handleCopyText(msg.id, msg.text)}
                  className="p-1.5 rounded-lg hover:bg-slate-200/60 dark:hover:bg-purple-900/40 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer flex items-center gap-1"
                  title="Copy message"
                >
                  {copiedId === msg.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span className="text-[11px] font-medium">Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* VISUAL TYPING INDICATOR ANIMATION */}
        {isLoading && (
          <div className="w-full flex justify-start animate-in fade-in duration-200">
            <div className="w-full sm:max-w-[85%] lg:max-w-[80%] rounded-2xl p-4 sm:p-5 bg-white dark:bg-[#131B2E] text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-purple-800/80 shadow-xs rounded-bl-xs transition-all">
              {/* Header inside typing indicator */}
              <div className="flex items-center justify-between gap-3 pb-2.5 mb-3 border-b border-slate-100 dark:border-purple-900/40">
                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-900/60 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                      <Bot className="w-4 h-4 animate-pulse" />
                    </div>
                    {/* Glowing pulse ring */}
                    <span className="absolute -inset-0.5 rounded-xl bg-purple-500/20 dark:bg-purple-400/30 animate-pulse pointer-events-none" />
                  </div>
                  <div>
                    <span className="font-bold text-sm text-purple-900 dark:text-purple-200">
                      Sammi • {storeName}
                    </span>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/80 dark:border-purple-800/60 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600 dark:bg-purple-400 animate-ping" />
                  <span>Thinking...</span>
                </div>
              </div>

              {/* Typing Wave Animation & Context Hint */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Bouncing typing wave dots */}
                  <div
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-50/80 dark:bg-purple-950/50 border border-purple-100 dark:border-purple-900/40 shadow-2xs"
                    title="Assistant is typing"
                    aria-label="Assistant is typing"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 dark:bg-purple-400 typing-dot-1" />
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 dark:bg-purple-400 typing-dot-2" />
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-600 dark:bg-purple-400 typing-dot-3" />
                  </div>

                  {/* Dynamic rotating context hint */}
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-purple-200/90 py-0.5">
                    {(() => {
                      const hint = TYPING_HINTS[loadingPhase] || TYPING_HINTS[0];
                      const HintIcon = hint.icon;
                      return (
                        <>
                          <HintIcon className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400 shrink-0 animate-pulse" />
                          <span className="transition-all duration-300">{hint.text}</span>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Subtle streaming text shimmer placeholders */}
                <div className="space-y-2 pt-2 border-t border-slate-100/80 dark:border-purple-900/25">
                  <div className="h-2.5 w-3/4 rounded-full typing-shimmer opacity-80" />
                  <div className="h-2.5 w-1/2 rounded-full typing-shimmer opacity-60" />
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* STICKY BOTTOM INPUT: ChatGPT / Gemini Style Centered Dock */}
      <div className="sticky bottom-0 z-30 pt-3 pb-4 sm:pb-6 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC]/95 to-transparent dark:from-[#0A0E1A] dark:via-[#0A0E1A]/95 dark:to-transparent backdrop-blur-xs">
        <div className="max-w-4xl lg:max-w-5xl xl:max-w-6xl w-full mx-auto px-4 sm:px-6">
          {/* Quick suggested category tabs & chips with Retail Trends & Shoe Care */}
          <div className="space-y-2 mb-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px] font-bold">
              {[
                { id: 'all', label: 'All Suggestions', icon: Sparkles },
                { id: 'trends', label: '📈 Retail Trends', icon: TrendingUp },
                { id: 'care', label: '👞 Shoe Care Advice', icon: Sparkles },
                { id: 'pos', label: '⚡ Store Operations', icon: Bot },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActivePromptCategory(cat.id as any)}
                  className={`px-2.5 py-1 rounded-lg transition-all shrink-0 cursor-pointer border ${
                    activePromptCategory === cat.id
                      ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                      : 'bg-white/80 dark:bg-[#131B2E] text-slate-600 dark:text-purple-300 border-slate-200/90 dark:border-purple-800/60 hover:bg-purple-50 dark:hover:bg-purple-900/40'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { label: 'Trending Footwear Styles 2026', cat: 'trends', icon: TrendingUp },
                { label: 'Festive & Wedding Shoe Demand Spikes', cat: 'trends', icon: TrendingUp },
                { label: 'High-Demand Summer Breathable Footwear', cat: 'trends', icon: TrendingUp },
                { label: 'Leather Shoe Care & Conditioning Guide', cat: 'care', icon: Sparkles },
                { label: 'How to Clean Suede & Nubuck Shoes', cat: 'care', icon: Sparkles },
                { label: 'White Sneaker Sole Un-Yellowing Tips', cat: 'care', icon: Sparkles },
                { label: 'Footwear Waterproofing & Rain Protection', cat: 'care', icon: Sparkles },
                { label: 'CSV Bulk Product Import Workflow', cat: 'pos', icon: Bot },
                { label: 'Barcode Label Printing & TSPL Setup', cat: 'pos', icon: Bot },
                { label: 'Invoice Exchange & Return Policy', cat: 'pos', icon: Bot },
              ]
                .filter((chip) => activePromptCategory === 'all' || chip.cat === activePromptCategory)
                .map((chip, cIdx) => {
                  const IconComp = chip.icon;
                  return (
                    <button
                      key={cIdx}
                      type="button"
                      onClick={() => handleSendMessage(chip.label)}
                      disabled={isLoading}
                      className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-semibold bg-white dark:bg-[#131B2E] border border-purple-200 dark:border-purple-800/80 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 shadow-2xs transition-colors shrink-0 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <IconComp className="w-3.5 h-3.5 text-purple-500" />
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="bg-white dark:bg-[#131B2E] border border-slate-200 dark:border-purple-800/80 rounded-2xl shadow-lg p-2.5 sm:p-3 transition-shadow focus-within:shadow-xl">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-end gap-2.5"
            >
              <div className="relative flex-1">
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Sammi se koi bhi sawal poochiye..."
                  disabled={isLoading}
                  className="w-full resize-none rounded-xl bg-slate-50 dark:bg-[#0B1120] text-slate-900 dark:text-white px-3.5 py-2.5 text-sm sm:text-base focus:outline-none placeholder-slate-400 dark:placeholder-slate-500 border border-purple-300/80 dark:border-purple-700/60 max-h-36 overflow-y-auto"
                />
              </div>

              <button
                type="submit"
                disabled={!inputMessage.trim() || isLoading}
                className="px-5 py-3 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-200 dark:disabled:bg-slate-800 text-white font-bold text-sm transition cursor-pointer disabled:cursor-not-allowed shadow-md shadow-purple-600/25 active:scale-95 shrink-0 flex items-center gap-2"
                title="Send message (Enter)"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>

            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 mt-2 px-1.5">
              <span>Press <strong>Enter</strong> to send • <strong>Shift+Enter</strong> for newline</span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                Sammi AI Assistant
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Collapsible Floating Question Index Sidebar Drawer (Sleek Barcode / Receipt-Line Theme) */}
      <SammiQuestionIndexSidebar
        isOpen={isIndexOpen}
        onClose={() => setIsIndexOpen(false)}
        onToggle={() => setIsIndexOpen((prev) => !prev)}
        messages={messages}
        highlightedMsgId={highlightedMsgId}
        onSelectQuestion={handleSelectQuestion}
        storeName={storeName}
        onScrollToTop={handleScrollToTop}
        onScrollToBottom={scrollToBottom}
      />
    </div>
  );
};
