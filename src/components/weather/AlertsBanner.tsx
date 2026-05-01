import { AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SevereAlert } from '@/types/weather';
import { cn } from '@/lib/utils/cn';

const SEVERITY: Record<SevereAlert['severity'], string> = {
  minor: 'from-amber-500/20 to-amber-500/5 border-amber-400/30 text-amber-100',
  moderate: 'from-orange-500/20 to-orange-500/5 border-orange-400/40 text-orange-100',
  severe: 'from-rose-500/25 to-rose-500/5 border-rose-400/50 text-rose-50',
  extreme: 'from-rose-600/40 to-rose-700/10 border-rose-500/60 text-white',
};

interface Props { alerts: SevereAlert[]; }

export function AlertsBanner({ alerts }: Props) {
  if (!alerts.length) return null;

  return (
    <AnimatePresence>
      {alerts.map((a) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className={cn(
            'flex items-start gap-3 rounded-2xl border bg-gradient-to-br p-4',
            SEVERITY[a.severity]
          )}
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="text-sm font-semibold uppercase tracking-wider">{a.event}</div>
            <div className="text-sm/snug">{a.headline}</div>
          </div>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
