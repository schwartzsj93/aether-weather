/**
 * VoiceAgent — the Bond voice intelligence orchestrator.
 *
 * State machine:
 *   idle → listening  (user clicks orb or presses Space)
 *   listening → processing  (SpeechRecognition fires onend with transcript)
 *   processing → speaking   (Claude responds; TTS begins)
 *   speaking → idle         (TTS finishes)
 *   any → idle              (user taps orb to cancel)
 *
 * Key fixes vs original:
 *   • Mic permission errors are surfaced immediately with a friendly Bond message
 *   • Panel opens and shows speech.error — no more silent dead click
 *   • AudioContext is unlocked on click so async TTS audio isn't blocked
 *   • tts.speak / tts.stop accessed via stable ref so handleFinal deps stay lean
 *   • "no-speech" (user was silent) handled gracefully — closes panel quietly
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { VoiceOrb, type OrbState } from './VoiceOrb';
import { useSpeechInput } from '@/lib/voice/useSpeechInput';
import { useTTS } from '@/lib/voice/useTTS';
import { askBond, type ConversationTurn, type VoiceAction } from '@/lib/voice/bondAgent';
import { useAppStore } from '@/store/appStore';
import { searchLocations } from '@/lib/api/geocoding';
import type { WeatherBundle } from '@/types/weather';

interface Props {
  bundle: WeatherBundle | null;
}

const MAX_HISTORY = 8;

// ── Action executor (module-level — no hooks) ─────────────────────────────────

async function executeAction(action: VoiceAction) {
  const store = useAppStore.getState();
  switch (action.type) {
    case 'setLayer':
      store.setActiveLayer(action.layer);
      break;
    case 'setZoom':
      store.setZoomTier(action.tier);
      break;
    case 'expandMap':
      document.dispatchEvent(new CustomEvent('aether:expandMap'));
      break;
    case 'scrollTo': {
      const ids: Record<string, string> = {
        map:        'section-map',
        current:    'section-current',
        hourly:     'section-hourly',
        daily:      'section-daily',
        airQuality: 'section-airquality',
      };
      document.getElementById(ids[action.section])?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'changeLocation': {
      try {
        const results = await searchLocations(action.query);
        if (results[0]) store.addLocation(results[0]);
      } catch { /* Bond already responded */ }
      break;
    }
    case 'setUnits':
      store.setUnits(action.units);
      break;
    default:
      break;
  }
}

// ── Unlock AudioContext so async .play() isn't blocked by autoplay policy ────

function unlockAudio() {
  try {
    const ctx = new AudioContext();
    ctx.resume().then(() => ctx.close()).catch(() => {});
  } catch { /* Safari AudioContext requires user gesture — that's fine */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoiceAgent({ bundle }: Props) {
  const [orbState,   setOrbState]   = useState<OrbState>('idle');
  const [history,    setHistory]    = useState<ConversationTurn[]>([]);
  const [lastUser,   setLastUser]   = useState('');
  const [lastBond,   setLastBond]   = useState('');
  const [bondError,  setBondError]  = useState<string | null>(null); // API-layer errors
  const [panelOpen,  setPanelOpen]  = useState(false);

  const abortRef        = useRef<AbortController | null>(null);
  const prevListeningRef = useRef(false);
  const tts             = useTTS();
  // Stable refs so handleFinal can call tts.speak / tts.stop without
  // re-creating the callback every time tts state changes.
  const ttsRef    = useRef(tts);
  useEffect(() => { ttsRef.current = tts; }, [tts]);

  const activeLayer = useAppStore((s) => s.activeLayer);
  const zoomTier    = useAppStore((s) => s.zoomTier);
  const units       = useAppStore((s) => s.units);

  // ── STT callback ───────────────────────────────────────────────────────────
  const handleFinal = useCallback(
    async (text: string) => {
      if (!bundle || !text.trim()) { setOrbState('idle'); return; }

      setLastUser(text);
      setLastBond('');
      setBondError(null);
      setOrbState('processing');
      setPanelOpen(true);

      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      try {
        const response = await askBond(
          text,
          bundle,
          { activeLayer, zoomTier, units },
          history,
          ctrl.signal,
        );

        if (ctrl.signal.aborted) return;

        setHistory((prev) => {
          const next: ConversationTurn[] = [
            ...prev,
            { role: 'user',      content: text },
            { role: 'assistant', content: response.speech },
          ];
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        });

        setLastBond(response.speech);

        if (response.action && response.action.type !== 'none') {
          await executeAction(response.action);
        }

        setOrbState('speaking');
        await ttsRef.current.speak(response.speech);
        if (ctrl.signal.aborted) return;
        setOrbState('idle');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const msg = 'The intelligence network experienced an interruption, sir. Shall we try again?';
        setBondError(msg);
        setLastBond(msg);
        setOrbState('idle');
        ttsRef.current.speak(msg);
      }
    },
    // tts intentionally omitted — accessed via ttsRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bundle, history, activeLayer, zoomTier, units],
  );

  const speech = useSpeechInput(handleFinal);

  // ── Sync orb state when STT ends unexpectedly ─────────────────────────────
  // Use a ref to track the true→false transition so we never have orbState
  // in deps (which would fire immediately on 'listening', reverting state).
  useEffect(() => {
    const wasListening = prevListeningRef.current;
    prevListeningRef.current = speech.listening;

    if (speech.listening) return; // still active — nothing to do

    // A genuine session end: recognition was running and just stopped
    if (wasListening) {
      // handleFinal already handled results; only clean up orb if still stuck
      setOrbState((s) => (s === 'listening' ? 'idle' : s));
      return;
    }

    // Error surfaced without a session (e.g. startGuard timeout fires)
    if (speech.error) {
      setPanelOpen(true);
      setOrbState((s) => (s === 'listening' ? 'idle' : s));
    }
  }, [speech.listening, speech.error]);

  // ── Orb click ─────────────────────────────────────────────────────────────
  const handleOrbClick = useCallback(() => {
    if (orbState === 'idle') {
      if (!bundle) {
        // Data not yet loaded — show a nudge
        setPanelOpen(true);
        setBondError('One moment — the forecast data is still loading, sir.');
        return;
      }

      // Unlock AudioContext NOW, during the user gesture, so async TTS later
      // isn't blocked by Chrome's autoplay policy.
      unlockAudio();

      // Clear any stale error from a previous session so the UI starts clean.
      speech.reset();
      setBondError(null);
      setOrbState('listening');
      speech.start();
      setPanelOpen(true);
    } else {
      // Cancel everything
      abortRef.current?.abort();
      speech.stop();
      ttsRef.current.stop();
      setOrbState('idle');
    }
  }, [orbState, bundle, speech]);

  // Space-bar shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const tag = (e.target as Element)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      handleOrbClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleOrbClick]);

  // ── Mic-error friendly text ────────────────────────────────────────────────
  const micErrorMessage = (() => {
    if (!speech.error) return null;
    if (speech.error.includes('not-allowed') || speech.error.includes('permission')) {
      return 'Microphone access is required, sir. Please allow it via your browser\'s site settings, then try again.';
    }
    if (speech.error.includes('no-speech')) return null; // silent — user just didn't speak
    return `Voice input error: ${speech.error}`;
  })();

  // Panel visible when there's content OR when actively listening/processing
  // (so the "Listening — speak your query, sir" footer and live transcript show
  // even on first use before any conversation has happened).
  const showPanel = panelOpen && (
    !!(lastUser || lastBond || bondError || micErrorMessage) ||
    orbState === 'listening' ||
    orbState === 'processing'
  );

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-3">

      {/* ── Conversation panel ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            key="panel"
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0,  scale: 1    }}
            exit={{   opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto w-[min(88vw,340px)] overflow-hidden rounded-2xl"
            style={{
              background:     'linear-gradient(158deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              border:         '1px solid rgba(255,255,255,0.10)',
              backdropFilter: 'blur(28px) saturate(160%)',
              boxShadow:      '0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.09)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-300/80">007</span>
                <span className="text-[11px] uppercase tracking-widest text-white/40">AETHER Intelligence</span>
              </div>
              <button
                onClick={() => { setPanelOpen(false); setLastUser(''); setLastBond(''); setBondError(null); }}
                className="rounded-full p-1 text-white/30 hover:text-white/70 transition-colors"
                aria-label="Close panel"
              >
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {/* Mic permission / speech error — highest priority */}
              {micErrorMessage && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 text-[11px] text-rose-400/80">!</span>
                  <p className="text-[12px] leading-snug text-rose-300/85">{micErrorMessage}</p>
                </div>
              )}

              {/* User said */}
              {lastUser && (
                <div className="flex gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-white/10 text-center text-[9px] leading-4 text-white/50">
                    You
                  </span>
                  <p className="text-[13px] italic leading-snug text-white/65">"{lastUser}"</p>
                </div>
              )}

              {/* Bond response */}
              {lastBond && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold text-amber-300/70">007</span>
                  <p className="text-[13px] leading-snug text-white/90">{lastBond}</p>
                </div>
              )}

              {/* API / network error */}
              {bondError && !lastBond && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold text-amber-300/70">007</span>
                  <p className="text-[12px] leading-snug text-white/55 italic">{bondError}</p>
                </div>
              )}

              {/* Processing dots */}
              {orbState === 'processing' && !lastBond && !bondError && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold text-amber-300/70">007</span>
                  <ThinkingDots />
                </div>
              )}

              {/* Live interim transcript */}
              {orbState === 'listening' && speech.transcript && (
                <div className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] italic text-white/55">
                  {speech.transcript}…
                </div>
              )}
            </div>

            {/* Listening footer */}
            {orbState === 'listening' && !micErrorMessage && (
              <div className="border-t border-white/5 px-4 py-2 text-[11px] text-white/35">
                Listening — speak your query, sir
              </div>
            )}

            {tts.usingElevenLabs && (
              <div className="px-4 pb-2 text-[9px] tracking-wider text-white/20">
                ElevenLabs · Daniel · British EN
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Orb ─────────────────────────────────────────────────────────────── */}
      <div className="pointer-events-auto">
        <VoiceOrb
          state={orbState}
          onClick={handleOrbClick}
          supported={speech.supported}
        />
      </div>

      {/* Keyboard hint */}
      <AnimatePresence>
        {orbState === 'idle' && !showPanel && (
          <motion.div
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 2.5, duration: 0.6 }}
            className="pointer-events-none absolute -left-28 bottom-3 whitespace-nowrap rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white/30 backdrop-blur-sm"
          >
            Space or tap 007
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

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
