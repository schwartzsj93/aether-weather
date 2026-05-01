import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { useEffect } from 'react';

interface Props {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number;
  className?: string;
}

/**
 * Smoothly tween a numeric display when `value` changes.
 * Used for the hero temperature so it counts up like a digital cluster.
 */
export function AnimatedNumber({ value, decimals = 0, suffix = '', duration = 0.9, className }: Props) {
  const mv = useMotionValue(value);
  const display = useTransform(mv, (v) => v.toFixed(decimals) + suffix);

  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [value, duration, mv]);

  return <motion.span className={className}>{display}</motion.span>;
}
