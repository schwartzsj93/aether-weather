/**
 * ChatButton — floating pill button that opens the WeatherChat panel.
 * Positioned bottom-left (voice orb is bottom-right).
 */

import { motion } from 'framer-motion';
import { MessageSquare } from 'lucide-react';

interface Props {
  onClick: () => void;
}

export function ChatButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
      style={{
        background:     'linear-gradient(158deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.05) 100%)',
        border:         '1px solid rgba(255,255,255,0.12)',
        backdropFilter: 'blur(20px) saturate(160%)',
        boxShadow:      '0 8px 24px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.09)',
      }}
      aria-label="Open weather chat"
    >
      {/* Pulsing icon */}
      <motion.span
        animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        className="flex items-center"
      >
        <MessageSquare className="h-4 w-4 text-sky-400" />
      </motion.span>
      <span>Ask</span>
    </button>
  );
}
