/**
 * WeatherChat — slide-out text chat panel powered by Claude Haiku.
 *
 * Separate from the Bond voice agent. Pulls Kalshi market data on mount
 * and injects it into every conversation turn as context.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send } from 'lucide-react';
import type { WeatherBundle } from '@/types/weather';
import { fetchWeatherMarkets, type KalshiMarket } from '@/lib/api/kalshi';
import { streamWeatherChat, type ChatMessage } from '@/lib/ai/weatherChat';

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  bundle: WeatherBundle | null;
  onClose: () => void;
}

// ── Suggested starters ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's driving today's forecast?",
  'Will it rain this weekend?',
  'What are the Kalshi odds on this week\'s weather?',
  'Compare model forecast vs market predictions',
];

// ── Thinking dots ─────────────────────────────────────────────────────────────

function ThinkingDots() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 0.18, 0.36].map((d, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-amber-300/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: d, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WeatherChat({ bundle, onClose }: Props) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [draft,     setDraft]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [markets,   setMarkets]   = useState<KalshiMarket[]>([]);
  const [streaming, setStreaming] = useState(''); // text being streamed in

  const listRef   = useRef<HTMLDivElement>(null);
  const textaRef  = useRef<HTMLTextAreaElement>(null);
  const abortRef  = useRef<AbortController | null>(null);

  // ── Fetch markets on mount ─────────────────────────────────────────────────
  useEffect(() => {
    const ctrl = new AbortController();
    fetchWeatherMarkets(ctrl.signal).then(setMarkets).catch(() => {});
    return () => ctrl.abort();
  }, []);

  // ── Abort in-flight request on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  // ── Auto-scroll to bottom ──────────────────────────────────────────────────
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming, loading]);

  // ── Auto-resize textarea ───────────────────────────────────────────────────
  useEffect(() => {
    const ta = textaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineH    = 20; // px per line
    const maxRows  = 4;
    ta.style.height = Math.min(ta.scrollHeight, lineH * maxRows + 16) + 'px';
  }, [draft]);

  // ── Send message ───────────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !bundle || loading) return;

      // Abort any in-flight request.
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userMsg: ChatMessage = { role: 'user', content: trimmed };
      setMessages((prev) => [...prev, userMsg]);
      setDraft('');
      setLoading(true);
      setStreaming('');

      try {
        const final = await streamWeatherChat({
          bundle,
          markets,
          history: messages,          // history BEFORE the new user msg
          userMessage: trimmed,
          signal: ctrl.signal,
          onDelta: (_chunk, total) => {
            setStreaming(total);
          },
        });

        if (ctrl.signal.aborted) return;

        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: final },
        ]);
        setStreaming('');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'Sorry, I ran into an error fetching the analysis. Please try again.',
          },
        ]);
        setStreaming('');
      } finally {
        setLoading(false);
      }
    },
    [bundle, loading, markets, messages]
  );

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const canSend = draft.trim().length > 0 && !loading && !!bundle;

  return (
    <motion.div
      key="weather-chat"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      className="pointer-events-auto fixed right-0 top-0 z-[300] flex h-dvh w-[min(92vw,400px)] flex-col"
      style={{
        background:     'linear-gradient(158deg, rgba(10,14,30,0.96) 0%, rgba(5,7,15,0.98) 100%)',
        borderLeft:     '1px solid rgba(255,255,255,0.08)',
        backdropFilter: 'blur(32px) saturate(180%)',
        boxShadow:      '-8px 0 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex shrink-0 items-center gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Title */}
        <span className="flex-1 text-[13px] font-semibold tracking-wide text-white/80">
          Weather Chat
        </span>

        {/* Kalshi badge */}
        {markets.length > 0 ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-emerald-400">
            KALSHI
          </span>
        ) : (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/25">
            NO MARKETS
          </span>
        )}

        {/* Close */}
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-white/30 transition-colors hover:text-white/80"
          aria-label="Close chat"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Message list ──────────────────────────────────────────────────── */}
      <div
        ref={listRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4"
        style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.08) transparent' }}
      >
        {/* Suggestions (shown only when no messages yet) */}
        {messages.length === 0 && !loading && (
          <div className="mt-auto flex flex-col gap-2 pb-2">
            <p className="mb-1 text-[11px] uppercase tracking-widest text-white/25">
              Suggested questions
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                disabled={!bundle}
                className="rounded-xl px-3 py-2 text-left text-[13px] text-white/55 transition-colors hover:bg-white/5 hover:text-white/80 disabled:pointer-events-none disabled:opacity-30"
                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-500/20 px-3 py-2 text-sm text-white">
                {msg.content}
              </div>
            ) : (
              <div className="max-w-[92%] text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Streaming response (live) */}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[92%] text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
              {streaming}
            </div>
          </div>
        )}

        {/* Thinking dots */}
        {loading && !streaming && (
          <div className="flex justify-start">
            <ThinkingDots />
          </div>
        )}
      </div>

      {/* ── Input area ────────────────────────────────────────────────────── */}
      <div
        className="shrink-0 px-3 pb-4 pt-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <textarea
            ref={textaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={bundle ? 'Ask about the weather…' : 'Loading forecast data…'}
            disabled={!bundle}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30 disabled:opacity-40"
            style={{ maxHeight: `${4 * 20 + 16}px`, lineHeight: '20px' }}
          />
          <button
            onClick={() => send(draft)}
            disabled={!canSend}
            className="mb-0.5 shrink-0 rounded-full p-1.5 text-sky-400 transition-all hover:bg-sky-500/20 disabled:pointer-events-none disabled:opacity-25"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-white/20">
          Enter to send · Shift+Enter for newline
        </p>
      </div>
    </motion.div>
  );
}
