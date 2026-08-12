/**
 * MinuteCast
 *
 * Dark-Sky-style "is it about to rain" strip: a plain-English callout
 * ("Rain starting in 20 min") plus a 15-minute-resolution precipitation
 * bar chart for the next 2 hours.
 *
 * Built on Open-Meteo's `minutely_15` model output rather than radar
 * extrapolation — RainViewer's nowcast radar frames are frequently empty
 * (0 forecast frames is common), while minutely_15 is real model data
 * and available everywhere Open-Meteo has coverage.
 */

import { useMemo } from 'react';
import { CloudRain, CloudDrizzle, Cloud } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { localNowISO } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { MinutelyPoint, Units } from '@/types/weather';

interface Props {
  minutely: MinutelyPoint[];
  timezone: string;
  units: Units;
}

// Buckets below this are treated as "not really raining" — avoids
// flagging trace/drizzle-level model noise as a rain event.
const RAIN_THRESHOLD_MM = 0.1; // ~0.004 in
const WINDOW_STEPS = 8;        // 8 × 15 min = next 2 hours

function isWet(mmOrIn: number, units: Units): boolean {
  const mm = units === 'imperial' ? mmOrIn * 25.4 : mmOrIn;
  return mm >= RAIN_THRESHOLD_MM;
}

function stepLabel(iso: string): string {
  const h = parseInt(iso.slice(11, 13), 10);
  const m = iso.slice(14, 16);
  return new Date(1970, 0, 1, h, parseInt(m, 10)).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: m === '00' ? undefined : '2-digit',
  });
}

export function MinuteCast({ minutely, timezone, units }: Props) {
  const window = useMemo(() => {
    if (!minutely.length) return [];
    const nowStr = localNowISO(timezone);
    // Snap down to the current (or next) 15-min bucket via string comparison.
    const idx = minutely.findIndex((p) => p.time >= nowStr.slice(0, 14) + '00');
    const start = idx < 0 ? 0 : idx;
    return minutely.slice(start, start + WINDOW_STEPS);
  }, [minutely, timezone]);

  if (window.length === 0) return null;

  const wet = window.map((p) => isWet(p.precipitation, units));
  const anyWet = wet.some(Boolean);
  const nowWet = wet[0];

  // Find the first transition point within the window.
  const transitionIdx = wet.findIndex((w, i) => i > 0 && w !== wet[0]);

  let headline: string;
  let Icon = Cloud;
  let tone: 'dry' | 'rain' = 'dry';

  if (!anyWet) {
    headline = 'No precipitation expected in the next 2 hours.';
    Icon = Cloud;
    tone = 'dry';
  } else if (nowWet && transitionIdx === -1) {
    headline = 'Rain continuing for the next 2 hours.';
    Icon = CloudRain;
    tone = 'rain';
  } else if (nowWet && transitionIdx > 0) {
    const mins = transitionIdx * 15;
    headline = `Rain ending in ${mins} min.`;
    Icon = CloudRain;
    tone = 'rain';
  } else if (!nowWet && transitionIdx > 0) {
    const mins = transitionIdx * 15;
    headline = `Rain starting in ${mins} min.`;
    Icon = CloudDrizzle;
    tone = 'rain';
  } else {
    headline = 'Clear for now — check back later.';
    Icon = Cloud;
    tone = 'dry';
  }

  const max = Math.max(...window.map((p) => p.precipitation), 0.1);

  return (
    <GlassCard>
      <div className="flex items-center gap-2">
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            tone === 'rain' ? 'bg-sky-400/15' : 'bg-white/8',
          )}
        >
          <Icon className={cn('h-4 w-4', tone === 'rain' ? 'text-sky-300' : 'text-white/50')} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-widest text-white/45">Next 2 Hours</div>
          <div className="text-sm font-medium text-white/90">{headline}</div>
        </div>
      </div>

      {/* 15-min precipitation bars */}
      <div className="mt-4 flex items-end gap-1.5" style={{ height: '3.25rem' }}>
        {window.map((p, i) => {
          const h = Math.max(2, (p.precipitation / max) * 100);
          const w = isWet(p.precipitation, units);
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: '100%' }}>
              <div
                className={cn(
                  'w-full rounded-t-sm transition-all',
                  w ? 'bg-sky-400/80' : 'bg-white/10',
                )}
                style={{ height: `${h}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[10px] text-white/35">
        {window.map((p, i) => (
          <div key={i} className="flex-1 text-center">
            {i % 2 === 0 ? stepLabel(p.time) : ''}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
