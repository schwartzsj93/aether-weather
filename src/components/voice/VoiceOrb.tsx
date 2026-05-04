/**
 * VoiceOrb — the floating activation button for the Bond voice agent.
 *
 * States:
 *   idle       – glass sphere, mic icon, soft breathe pulse
 *   listening  – crimson glow, waveform bars animate
 *   processing – amber, rotating arc
 *   speaking   – sky blue, sound-wave bars
 *
 * Positioned fixed bottom-right; the parent VoiceAgent sits on top of it
 * and controls the slide-up panel.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';

export type OrbState = 'idle' | 'listening' | 'processing' | 'speaking';

interface Props {
  state: OrbState;
  onClick: () => void;
  supported: boolean;
}

// Colour themes per state
const THEMES: Record<OrbState, { bg: string; glow: string; ring: string }> = {
  idle:       { bg: 'rgba(255,255,255,0.07)', glow: 'rgba(125,211,252,0.25)', ring: 'rgba(125,211,252,0.15)' },
  listening:  { bg: 'rgba(239,68,68,0.18)',   glow: 'rgba(239,68,68,0.55)',   ring: 'rgba(239,68,68,0.4)'   },
  processing: { bg: 'rgba(251,191,36,0.15)',  glow: 'rgba(251,191,36,0.45)',  ring: 'rgba(251,191,36,0.35)' },
  speaking:   { bg: 'rgba(56,189,248,0.15)',  glow: 'rgba(56,189,248,0.45)',  ring: 'rgba(56,189,248,0.35)' },
};

// Animated waveform bars used in listening + speaking states
function WaveBars({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[0.6, 1.0, 0.7, 1.0, 0.6].map((h, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ backgroundColor: color, height: 4 }}
          animate={{ scaleY: [h, h * 2.5, h] }}
          transition={{
            duration:   0.55,
            repeat:     Infinity,
            delay:      i * 0.09,
            ease:       'easeInOut',
          }}
        />
      ))}
    </div>
  );
}

// Rotating arc for processing
function SpinningArc({ color }: { color: string }) {
  return (
    <motion.svg
      width="44"
      height="44"
      viewBox="0 0 44 44"
      animate={{ rotate: 360 }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
    >
      <circle
        cx="22" cy="22" r="18"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray="72 42"
        strokeLinecap="round"
      />
    </motion.svg>
  );
}

export function VoiceOrb({ state, onClick, supported }: Props) {
  const theme = THEMES[state];

  if (!supported) {
    return (
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full glass-strong opacity-40"
        title="Voice input not supported in this browser"
      >
        <MicOff className="h-5 w-5 text-white/50" />
      </div>
    );
  }

  return (
    <motion.button
      onClick={onClick}
      aria-label={
        state === 'idle'       ? 'Activate Bond voice agent' :
        state === 'listening'  ? 'Stop listening' :
        state === 'processing' ? 'Processing…' :
                                 'Bond is speaking — tap to interrupt'
      }
      className="relative flex h-14 w-14 items-center justify-center rounded-full"
      style={{
        background: theme.bg,
        border:     '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(20px) saturate(160%)',
        boxShadow: `0 0 28px ${theme.glow}, 0 4px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)`,
      }}
      whileTap={{ scale: 0.92 }}
      // Idle "breathe" — other states override via separate animations
      animate={state === 'idle' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
      transition={state === 'idle' ? { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
    >
      {/* Outer pulse ring — listening + speaking */}
      <AnimatePresence>
        {(state === 'listening' || state === 'speaking') && (
          <motion.span
            key="ring"
            className="absolute inset-0 rounded-full"
            style={{ border: `2px solid ${theme.ring}` }}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>

      {/* Inner content */}
      <AnimatePresence mode="wait">
        {state === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.18 }}
          >
            <Mic className="h-5 w-5 text-sky-200/85" />
          </motion.div>
        )}

        {state === 'listening' && (
          <motion.div
            key="listening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <WaveBars color="rgba(252,165,165,0.95)" />
          </motion.div>
        )}

        {state === 'processing' && (
          <motion.div
            key="processing"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <SpinningArc color="rgba(251,191,36,0.9)" />
          </motion.div>
        )}

        {state === 'speaking' && (
          <motion.div
            key="speaking"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <WaveBars color="rgba(125,211,252,0.95)" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bond "007" pip badge */}
      {state !== 'idle' && (
        <motion.span
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-white/10 px-1 text-[9px] font-bold tracking-wider text-white/70"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          007
        </motion.span>
      )}
    </motion.button>
  );
}
