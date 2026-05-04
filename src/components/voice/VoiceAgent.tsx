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
 * The component dispatches voice-driven actions to the Zustand store or via
 * custom DOM events (expand map, scroll to section, change location).
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

const MAX_HISTORY = 8; // keep last N turns so context stays focused

// ── Action executor ───────────────────────────────────────────────────────────

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
      const el = document.getElementById(ids[action.section]);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }

    case 'changeLocation': {
      try {
        const results = await searchLocations(action.query);
        if (results[0]) store.addLocation(results[0]);
      } catch {
        /* silently fail — Bond has already responded */
      }
      break;
    }

    case 'setUnits':
      store.setUnits(action.units);
      break;

    case 'none':
    default:
      break;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function VoiceAgent({ bundle }: Props) {
  const [orbState, setOrbState]   = useState<OrbState>('idle');
  const [history,  setHistory]    = useState<ConversationTurn[]>([]);
  const [lastUser,  setLastUser]  = useState('');
  const [lastBond,  setLastBond]  = useState('');
  const [error,    setError]      = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const tts      = useTTS();

  const activeLayer = useAppStore((s) => s.activeLayer);
  const zoomTier    = useAppStore((s) => s.zoomTier);
  const units       = useAppStore((s) => s.units);

  // ── Handle final transcript from mic ───────────────────────────────────────
  const handleFinal = useCallback(
    async (text: string) => {
      if (!bundle) return;
      if (!text.trim()) { setOrbState('idle'); return; }

      setLastUser(text);
      setLastBond('');
      setError(null);
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

        // Persist conversation turn (cap history length)
        setHistory((prev) => {
          const next: ConversationTurn[] = [
            ...prev,
            { role: 'user',      content: text },
            { role: 'assistant', content: response.speech },
          ];
          return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
        });

        setLastBond(response.speech);

        // Execute any UI action before speaking (so the user sees the map
        // change while Bond narrates it)
        if (response.action && response.action.type !== 'none') {
          await executeAction(response.action);
        }

        setOrbState('speaking');
        await tts.speak(response.speech);
        if (ctrl.signal.aborted) return;
        setOrbState('idle');
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        const msg = 'The intelligence network is temporarily unavailable, sir.';
        setError(msg);
        setLastBond(msg);
        setOrbState('idle');
        tts.speak(msg);
      }
    },
    [bundle, history, activeLayer, zoomTier, units, tts],
  );

  const speech = useSpeechInput(handleFinal);

  // ── Orb click handler ──────────────────────────────────────────────────────
  const handleOrbClick = useCallback(() => {
    if (orbState === 'idle') {
      if (!bundle) return;
      setOrbState('listening');
      setError(null);
      speech.start();
      setPanelOpen(true);
    } else {
      // Cancel whatever is happening
      abortRef.current?.abort();
      speech.stop();
      tts.stop();
      setOrbState('idle');
    }
  }, [orbState, bundle, speech, tts]);

  // Space-bar shortcut (when not focused in an input)
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

  // Sync orb state when STT session ends without us setting processing
  useEffect(() => {
    if (!speech.listening && orbState === 'listening') {
      // STT ended but we haven't transitioned — no transcript was returned
      if (!speech.transcript.trim()) setOrbState('idle');
    }
  }, [speech.listening, speech.transcript, orbState]);

  const showPanel = panelOpen && (lastUser || lastBond || error);

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
              background:    'linear-gradient(158deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)',
              border:        '1px solid rgba(255,255,255,0.10)',
              backdropFilter:'blur(28px) saturate(160%)',
              boxShadow:     '0 16px 48px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.09)',
            }}
          >
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-white/6 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-300/80">
                  007
                </span>
                <span className="text-[11px] uppercase tracking-widest text-white/40">
                  AETHER Intelligence
                </span>
              </div>
              <button
                onClick={() => { setPanelOpen(false); setLastUser(''); setLastBond(''); }}
                className="rounded-full p-1 text-white/30 hover:text-white/70 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </button>
            </div>

            <div className="space-y-3 px-4 py-3">
              {/* User transcript */}
              {lastUser && (
                <div className="flex gap-2">
                  <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-white/10 text-center text-[9px] leading-4 text-white/50">
                    You
                  </span>
                  <p className="text-[13px] italic text-white/65 leading-snug">
                    "{lastUser}"
                  </p>
                </div>
              )}

              {/* Bond response */}
              {lastBond && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold text-amber-300/70">
                    007
                  </span>
                  <p className="text-[13px] text-white/90 leading-snug">
                    {lastBond}
                  </p>
                </div>
              )}

              {/* Processing indicator */}
              {orbState === 'processing' && !lastBond && (
                <div className="flex gap-2">
                  <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold text-amber-300/70">
                    007
                  </span>
                  <div className="flex items-center gap-1.5 text-[12px] text-white/40">
                    <ThinkingDots />
                  </div>
                </div>
              )}

              {/* STT live transcript (while listening) */}
              {orbState === 'listening' && speech.transcript && (
                <div className="rounded-xl bg-red-500/10 px-3 py-2 text-[12px] italic text-white/55">
                  {speech.transcript}…
                </div>
              )}
            </div>

            {/* Listening state hint */}
            {orbState === 'listening' && (
              <div className="border-t border-white/5 px-4 py-2 text-[11px] text-white/35">
                Listening — speak your query
              </div>
            )}

            {/* TTS badge */}
            {tts.usingElevenLabs && (
              <div className="px-4 pb-2 text-[9px] text-white/20 tracking-wider">
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

      {/* Keyboard hint — idle only, fades after first use */}
      <AnimatePresence>
        {orbState === 'idle' && !showPanel && (
          <motion.div
            key="hint"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 2, duration: 0.5 }}
            className="pointer-events-none absolute -left-28 bottom-3 rounded-full bg-black/40 px-2.5 py-1 text-[10px] text-white/30 backdrop-blur-sm whitespace-nowrap"
          >
            Space or tap 007
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Thinking dots animation
function ThinkingDots() {
  return (
    <span className="flex items-center gap-1">
      {[0, 0.2, 0.4].map((d, i) => (
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-amber-300/60"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: d }}
        />
      ))}
    </span>
  );
}
