import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface GlassCardProps extends HTMLMotionProps<'div'> {
  intense?: boolean;
  /** Explicit ReactNode override — framer-motion v12 widens children to include MotionValues */
  children?: ReactNode;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, intense, children, ...rest }, ref) => (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        intense ? 'glass-strong' : 'glass',
        'rounded-[var(--radius-card)] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.7)]',
        'relative overflow-hidden',
        className
      )}
      {...rest}
    >
      {/* top-edge sheen */}
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      {children}
    </motion.div>
  )
);
GlassCard.displayName = 'GlassCard';
