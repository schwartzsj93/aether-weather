/**
 * WeatherChat — slide-out text chat panel powered by Claude Haiku.
 *
 * Separate from the Bond voice agent. Pulls Kalshi market data on mount
 * and injects it into every conversation turn as context.
 *
 * Supports multimodal file uploads:
 *   • Images (JPEG, PNG, GIF, WEBP) — sent as Claude vision blocks
 *   • Text files (TXT, MD, CSV, JSON) — read and appended as text
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Paperclip, FileText, ImageIcon } from 'lucide-react';
import type { WeatherBundle } from '@/types/weather';
import { fetchWeatherMarkets, type KalshiMarket } from '@/lib/api/kalshi';
import { streamWeatherChat, type ChatMessage, type AttachmentBlock } from '@/lib/ai/weatherChat';

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  bundle: WeatherBundle | null;
  onClose: () => void;
}

// ── Pending attachment (before send) ─────────────────────────────────────────

interface PendingAttachment {
  block: AttachmentBlock;
  previewUrl?: string;   // blob URL for images — revoked after send
}

// ── File helpers ──────────────────────────────────────────────────────────────

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// ── Suggested starters ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What's driving today's forecast?",
  'Will it rain this weekend?',
  "What are the Kalshi odds on this week's weather?",
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

// ── Attachment chip (inside messages + pending area) ──────────────────────────

function FileChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] text-white/70">
      <FileText className="h-3 w-3 shrink-0 text-sky-400" />
      {name}
    </span>
  );
}

// ── Message attachment renderer ───────────────────────────────────────────────

function MessageAttachments({ attachments }: { attachments: AttachmentBlock[] }) {
  if (!attachments.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((att, i) =>
        att.type === 'image' ? (
          <img
            key={i}
            src={`data:${att.mediaType};base64,${att.data}`}
            alt={att.name}
            className="max-h-40 max-w-[220px] rounded-xl object-cover"
          />
        ) : (
          <FileChip key={i} name={att.name} />
        ),
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function WeatherChat({ bundle, onClose }: Props) {
  const [messages,  setMessages]  = useState<ChatMessage[]>([]);
  const [draft,     setDraft]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [markets,   setMarkets]   = useState<KalshiMarket[]>([]);
  const [streaming, setStreaming] = useState('');
  const [pending,   setPending]   = useState<PendingAttachment[]>([]);

  const listRef    = useRef<HTMLDivElement>(null);
  const textaRef   = useRef<HTMLTextAreaElement>(null);
  const fileRef    = useRef<HTMLInputElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

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
    ta.style.height = Math.min(ta.scrollHeight, 20 * 4 + 16) + 'px';
  }, [draft]);

  // ── Handle file selection ──────────────────────────────────────────────────
  const handleFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;

    const next: PendingAttachment[] = [];
    for (const file of files) {
      if (IMAGE_TYPES.has(file.type)) {
        const data       = await readBase64(file);
        const previewUrl = URL.createObjectURL(file);
        next.push({
          block: {
            type: 'image',
            data,
            mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
            name: file.name,
          },
          previewUrl,
        });
      } else {
        const text = await readText(file);
        next.push({ block: { type: 'text', text, name: file.name } });
      }
    }
    setPending((prev) => [...prev, ...next]);
    e.target.value = '';
  }, []);

  const removePending = (idx: number) => {
    setPending((prev) => {
      const p = prev[idx];
      if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const send = useCallback(
    async (text: string) => {
      const trimmed     = text.trim();
      const attachments = pending.map((p) => p.block);
      if ((!trimmed && !attachments.length) || !bundle || loading) return;

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        attachments: attachments.length ? attachments : undefined,
      };

      // Revoke blob preview URLs — images are stored as base64 in the block.
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));

      setMessages((prev) => [...prev, userMsg]);
      setDraft('');
      setPending([]);
      setLoading(true);
      setStreaming('');

      try {
        const final = await streamWeatherChat({
          bundle,
          markets,
          history: messages,
          userMessage: trimmed,
          attachments,
          signal: ctrl.signal,
          onDelta: (_chunk, total) => setStreaming(total),
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
    [bundle, loading, markets, messages, pending],
  );

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(draft);
    }
  };

  const canSend = (draft.trim().length > 0 || pending.length > 0) && !loading && !!bundle;

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
        <span className="flex-1 text-[13px] font-semibold tracking-wide text-white/80">
          Weather Chat
        </span>

        {markets.length > 0 ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold tracking-widest text-emerald-400">
            KALSHI
          </span>
        ) : (
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/25">
            NO MARKETS
          </span>
        )}

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
        {/* Suggestions */}
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
              <div className="max-w-[88%]">
                {msg.content && (
                  <div className="rounded-2xl rounded-tr-sm bg-sky-500/20 px-3 py-2 text-sm text-white">
                    {msg.content}
                  </div>
                )}
                {msg.attachments && (
                  <div className="mt-1 flex justify-end">
                    <MessageAttachments attachments={msg.attachments} />
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-[92%] text-sm leading-relaxed text-white/90 whitespace-pre-wrap">
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {/* Streaming response */}
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
        {/* Pending attachment previews */}
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p, i) =>
              p.block.type === 'image' ? (
                /* Image thumbnail with remove button */
                <div key={i} className="group relative">
                  <img
                    src={p.previewUrl}
                    alt={p.block.name}
                    className="h-16 w-16 rounded-xl object-cover"
                  />
                  <button
                    onClick={() => removePending(i)}
                    className="absolute -right-1.5 -top-1.5 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-black/70 text-white/70 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 rounded-b-xl bg-gradient-to-t from-black/60 to-transparent px-1 py-0.5">
                    <span className="truncate text-[9px] text-white/60">{p.block.name}</span>
                  </div>
                </div>
              ) : (
                /* Text file chip with remove */
                <div
                  key={i}
                  className="group flex items-center gap-1.5 rounded-xl bg-white/8 px-2.5 py-1.5 text-[11px] text-white/65"
                  style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <FileText className="h-3 w-3 shrink-0 text-sky-400" />
                  <span className="max-w-[100px] truncate">{p.block.name}</span>
                  <button
                    onClick={() => removePending(i)}
                    className="ml-0.5 text-white/30 hover:text-white/70"
                    aria-label="Remove"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ),
            )}
          </div>
        )}

        {/* Textarea row */}
        <div
          className="flex items-end gap-2 rounded-2xl px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Hidden file input */}
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/gif,image/webp,text/plain,text/markdown,text/csv,application/json,.md,.csv,.json"
            className="hidden"
            onChange={handleFiles}
          />

          {/* Paperclip / attach button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!bundle || loading}
            className="mb-0.5 shrink-0 rounded-full p-1.5 text-white/35 transition-all hover:bg-white/8 hover:text-white/70 disabled:pointer-events-none disabled:opacity-25"
            aria-label="Attach file or image"
            title="Attach image or file"
          >
            <Paperclip className="h-4 w-4" />
          </button>

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
          Enter to send · Shift+Enter for newline · <ImageIcon className="mb-px inline h-2.5 w-2.5" /> images &amp; files supported
        </p>
      </div>
    </motion.div>
  );
}
