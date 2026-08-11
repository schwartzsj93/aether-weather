/**
 * SevereWeatherSection
 *
 * A dedicated card showing NWS severe weather alerts with full detail:
 * event type, severity badge, urgency indicator, full description,
 * safety instructions, affected area, timing, and issuing office.
 *
 * Shows a compact "All Clear" state when no alerts are active.
 * Always rendered so the user always knows where to look.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  ChevronDown,
  ShieldCheck,
  Clock,
  MapPin,
  Info,
} from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { cn } from '@/lib/utils/cn';
import { isLikelyUSTerritory } from '@/lib/api/nws';
import type { SevereAlert, Location } from '@/types/weather';

// ── Severity colour tokens ────────────────────────────────────────────────────
const SEV: Record<
  SevereAlert['severity'],
  { bg: string; border: string; badge: string; text: string; icon: string; pulse: string }
> = {
  minor: {
    bg:     'bg-amber-500/8',
    border: 'border-amber-400/25',
    badge:  'bg-amber-400/20 text-amber-200',
    text:   'text-amber-100',
    icon:   'text-amber-300',
    pulse:  'bg-amber-300',
  },
  moderate: {
    bg:     'bg-orange-500/8',
    border: 'border-orange-400/30',
    badge:  'bg-orange-400/20 text-orange-200',
    text:   'text-orange-100',
    icon:   'text-orange-300',
    pulse:  'bg-orange-300',
  },
  severe: {
    bg:     'bg-rose-500/10',
    border: 'border-rose-400/40',
    badge:  'bg-rose-400/20 text-rose-200',
    text:   'text-rose-100',
    icon:   'text-rose-300',
    pulse:  'bg-rose-400',
  },
  extreme: {
    bg:     'bg-rose-700/15',
    border: 'border-rose-500/55',
    badge:  'bg-rose-600/30 text-rose-100',
    text:   'text-white',
    icon:   'text-rose-200',
    pulse:  'bg-rose-400',
  },
};

const URGENCY_BADGE: Record<string, string> = {
  Immediate: 'bg-rose-500/20 text-rose-200',
  Expected:  'bg-amber-400/20 text-amber-200',
  Future:    'bg-sky-400/15 text-sky-200',
  Past:      'bg-white/10 text-white/40',
  Unknown:   '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatAlertTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * NWS descriptions use `\n` for line breaks and `*` as bullet markers.
 * Render each non-empty line as its own block element.
 */
function NWSText({ text }: { text: string }) {
  const lines = text.replace(/\*/g, '•').split('\n');
  return (
    <>
      {lines.map((line, i) =>
        line.trim() === '' ? (
          <span key={i} className="block h-1.5" />
        ) : (
          <span key={i} className="block leading-snug">
            {line}
          </span>
        ),
      )}
    </>
  );
}

// ── Individual alert accordion row ───────────────────────────────────────────
interface AlertRowProps {
  alert: SevereAlert;
  isOpen: boolean;
  onToggle: () => void;
}

function AlertRow({ alert, isOpen, onToggle }: AlertRowProps) {
  const c = SEV[alert.severity];
  const urgencyBadge = alert.urgency ? URGENCY_BADGE[alert.urgency] : '';
  const showUrgency  = alert.urgency && alert.urgency !== 'Unknown' && urgencyBadge;

  return (
    <div className={cn('rounded-xl border transition-colors duration-200', c.bg, c.border)}>

      {/* ── Collapsed header (always visible) ───────────────────────────── */}
      <button
        onClick={onToggle}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <AlertTriangle className={cn('mt-0.5 h-4 w-4 shrink-0', c.icon)} />

        <div className="min-w-0 flex-1">
          {/* Badge row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest', c.badge)}>
              {alert.severity}
            </span>
            {showUrgency && (
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] uppercase tracking-widest', urgencyBadge)}>
                {alert.urgency}
              </span>
            )}
            {alert.severity === 'extreme' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
            )}
          </div>

          {/* Event name */}
          <div className={cn('mt-1 text-sm font-semibold', c.text)}>{alert.event}</div>

          {/* Headline — collapsed to 2 lines */}
          {!isOpen && (
            <div className={cn('mt-0.5 line-clamp-2 text-xs opacity-70', c.text)}>
              {alert.headline}
            </div>
          )}
        </div>

        <ChevronDown
          className={cn(
            'mt-1 h-4 w-4 shrink-0 transition-transform duration-200 opacity-50',
            c.text,
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* ── Expanded detail ──────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className={cn('space-y-3 px-4 pb-5', c.text)}>

              {/* Timing */}
              <div className={cn('flex flex-wrap gap-x-4 gap-y-1 border-t pt-3 text-xs opacity-60', c.border)}>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatAlertTime(alert.start)}
                </span>
                {alert.end && alert.end !== alert.start && (
                  <span>→ {formatAlertTime(alert.end)}</span>
                )}
                {alert.expires && alert.expires !== alert.end && (
                  <span className="opacity-70">Expires {formatAlertTime(alert.expires)}</span>
                )}
              </div>

              {/* Area */}
              {alert.areaDesc && (
                <div className="flex items-start gap-1.5 text-xs opacity-75">
                  <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{alert.areaDesc}</span>
                </div>
              )}

              {/* Full headline */}
              <div className="text-xs opacity-80">{alert.headline}</div>

              {/* Description */}
              {alert.description && (
                <div className="text-xs leading-relaxed opacity-75">
                  <NWSText text={alert.description} />
                </div>
              )}

              {/* Instructions callout */}
              {alert.instruction && (
                <div className={cn('rounded-lg border p-3', c.border, 'bg-white/5')}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <Info className="h-3 w-3 shrink-0 opacity-60" />
                    <span className="text-[10px] uppercase tracking-widest opacity-50">
                      What to do
                    </span>
                  </div>
                  <div className="text-xs leading-relaxed opacity-85">
                    <NWSText text={alert.instruction} />
                  </div>
                </div>
              )}

              {/* Issuing office */}
              <div className="text-[11px] opacity-40">Source: {alert.source}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main exported component ───────────────────────────────────────────────────
interface Props {
  alerts: SevereAlert[];
  location: Location;
}

export function SevereWeatherSection({ alerts, location }: Props) {
  const [expanded, setExpanded] = useState<string | null>(
    // Auto-expand when only one alert is active
    alerts.length === 1 ? (alerts[0]?.id ?? null) : null,
  );

  const locLabel = [location.name, location.admin1].filter(Boolean).join(', ');
  const isUS = isLikelyUSTerritory(location.latitude, location.longitude);

  // ── All-clear state ───────────────────────────────────────────────────────
  if (alerts.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-400/15">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white/85">
              No active weather alerts
            </div>
            <div className="mt-0.5 truncate text-xs text-white/40">
              {locLabel}
              {isUS ? ' · NWS coverage active' : ' · NWS alerts not available outside the US'}
            </div>
          </div>
          <div className="shrink-0 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-400/70">
            All Clear
          </div>
        </div>
      </GlassCard>
    );
  }

  // ── Active-alerts state ───────────────────────────────────────────────────
  return (
    <GlassCard>
      {/* Section header */}
      <div className="mb-3 flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span className="text-xs uppercase tracking-widest text-white/55">
          Severe Weather
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" />
          <span className="text-xs text-white/40">
            {alerts.length} active alert{alerts.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Alert accordion list */}
      <div className="space-y-2">
        {alerts.map((alert) => (
          <AlertRow
            key={alert.id}
            alert={alert}
            isOpen={expanded === alert.id}
            onToggle={() =>
              setExpanded((prev) => (prev === alert.id ? null : alert.id))
            }
          />
        ))}
      </div>

      {/* Footer attribution */}
      <div className="mt-3 text-[11px] text-white/30">
        NOAA / National Weather Service · Refreshed every 2 min
      </div>
    </GlassCard>
  );
}
