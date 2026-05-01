import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { getCondition } from '@/lib/utils/weatherCodes';

interface Props {
  weatherCode: number;
  isDay: boolean;
}

/**
 * Sits behind the entire dashboard. Cross-fades between gradient backdrops
 * derived from the active weather code, so the canvas itself reflects the sky.
 */
export function DynamicBackground({ weatherCode, isDay }: Props) {
  const gradient = useMemo(() => {
    const c = getCondition(weatherCode);
    return isDay ? c.gradientDay : c.gradientNight;
  }, [weatherCode, isDay]);

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={gradient}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.9 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.6, ease: 'easeInOut' }}
          className="absolute inset-0"
          style={{ background: gradient }}
        />
      </AnimatePresence>
      {/* film grain to keep gradients from banding */}
      <div className="pointer-events-none absolute inset-0 mix-blend-overlay opacity-[0.06]"
           style={{
             backgroundImage:
               "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/></svg>\")",
           }}
      />
      {/* vignette */}
      <div className="pointer-events-none absolute inset-0"
           style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)' }} />
    </div>
  );
}
