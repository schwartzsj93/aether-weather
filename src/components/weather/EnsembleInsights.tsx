/**
 * EnsembleInsights — the "who's forecasting, and do they agree?" card.
 *
 * Shows:
 *   1. Each active model as a chip, color-coded by family (physics vs AI).
 *   2. A 24-hour temperature disagreement strip — the envelope between the
 *      minimum and maximum across all models, with the ensemble median drawn
 *      on top. Wider the band, less the models agree.
 *   3. A scalar "agreement" score (median confidence across temperature +
 *      precipitation + probability) surfaced as a big number.
 *
 * This is meant to live next to the AI briefing, giving the user a second
 * lens on "what's the forecast" — one narrative, one probabilistic.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, CloudCog, Layers, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { useEnsemble } from '@/hooks/useEnsemble';
import { getModel } from '@/lib/api/models';
import {
  aggregateHourly,
  confidenceScore,
  type EnsembleStats,
} from '@/lib/ensemble/aggregate';
import { formatTemperature } from '@/lib/utils/format';
import type { Location, Units } from '@/types/weather';
import { cn } from '@/lib/utils/cn';

interface Props {
  location: Location;
  units: Units;
}

const HOURS = 24;

export function EnsembleInsights({ location, units }: Props) {
  const ensemble = useEnsemble(location, units);

  const stats = useMemo(() => {
    if (!ensemble.data) return null;
    const temp = aggregateHourly(ensemble.data, 'temperature_2m');
    const precip = aggregateHourly(ensemble.data, 'precipitation');
    const prob = aggregateHourly(ensemble.data, 'precipitation_probability');
    const agreement =
      (confidenceScore(temp, 'temperature_2m') +
        confidenceScore(precip, 'precipitation') +
        confidenceScore(prob, 'precipitation_probability')) /
      3;
    return { temp, precip, prob, agreement };
  }, [ensemble.data]);

  if (ensemble.isLoading) {
    return (
      <GlassCard>
        <Heading />
        <div className="mt-4 animate-pulse text-sm text-white/45">Pulling model ensemble…</div>
      </GlassCard>
    );
  }
  if (ensemble.isError || !ensemble.data || !stats) {
    return (
      <GlassCard>
        <Heading />
        <div className="mt-4 text-sm text-white/55">Ensemble unavailable — falling back to single model.</div>
      </GlassCard>
    );
  }

  const activeModels = ensemble.data.activeModelIds
    .map((id) => getModel(id))
    .filter(Boolean);

  return (
    <GlassCard>
      <Heading />

      {/* Active model chips */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {activeModels.map((m) => (
          <ModelChip key={m!.id} family={m!.family} label={m!.label} tier={m!.tier} />
        ))}
      </div>

      {/* Agreement + 24h spread sparkband */}
      <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
        <div className="text-center">
          <div className="text-[11px] uppercase tracking-widest text-white/50">Agreement</div>
          <motion.div
            key={stats.agreement.toFixed(2)}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'mt-0.5 text-3xl font-semibold tabular-nums',
              agreementColor(stats.agreement)
            )}
          >
            {Math.round(stats.agreement * 100)}%
          </motion.div>
        </div>

        <SpreadSparkband stats={stats.temp} units={units} />
      </div>

      {/* Per-model preview of the next-6h temperature, side by side */}
      <div className="mt-4">
        <div className="mb-1.5 text-[11px] uppercase tracking-widest text-white/50">
          Next 6h · temperature
        </div>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1 text-xs tabular-nums">
          {activeModels.slice(0, 6).map((m) => {
            if (!m) return null;
            const series = ensemble.data.series[m.id].hourly.temperature_2m;
            const next6 = series.slice(0, 6);
            const avg = average(next6);
            return (
              <FragmentRow
                key={m.id}
                label={m.label}
                family={m.family}
                values={next6}
                avg={avg}
                units={units}
              />
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

function Heading() {
  return (
    <div className="flex items-center gap-2">
      <Layers className="h-4 w-4 text-sky-300/80" />
      <div className="text-sm font-medium uppercase tracking-wider text-white/80">Model Ensemble</div>
      <div className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-widest text-white/45">
        <Sparkles className="h-3 w-3" /> Live
      </div>
    </div>
  );
}

function ModelChip({
  label,
  family,
  tier,
}: {
  label: string;
  family: 'physics' | 'ai';
  tier: 'flagship' | 'regional' | 'reference';
}) {
  const isAi = family === 'ai';
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        isAi
          ? 'border-fuchsia-300/30 bg-fuchsia-500/15 text-fuchsia-100'
          : 'border-sky-300/25 bg-sky-500/12 text-sky-100',
        tier === 'regional' && 'ring-1 ring-amber-300/30'
      )}
      title={tier === 'regional' ? 'High-resolution regional model' : undefined}
    >
      {isAi ? <BrainCircuit className="h-3 w-3" /> : <CloudCog className="h-3 w-3" />}
      {label}
    </div>
  );
}

function SpreadSparkband({ stats, units }: { stats: EnsembleStats; units: Units }) {
  // Use the first 24 steps of the ensemble.
  const min = stats.min.slice(0, HOURS);
  const max = stats.max.slice(0, HOURS);
  const med = stats.median.slice(0, HOURS);

  const allVals = [...min, ...max].filter((v): v is number => v != null);
  if (allVals.length === 0) {
    return <div className="text-xs text-white/50">no data</div>;
  }

  const lo = Math.min(...allVals);
  const hi = Math.max(...allVals);
  const w = 100, h = 44;
  const pad = 3;

  const x = (i: number) => (i / (HOURS - 1)) * w;
  const y = (v: number) => h - pad - ((v - lo) / (hi - lo || 1)) * (h - pad * 2);

  const upper = max.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`));
  const lower = min.map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`));
  const bandPoints = [...upper, ...lower.reverse()].filter(Boolean).join(' L ');
  const bandPath = bandPoints ? `M ${bandPoints} Z` : '';

  const medPath = med
    .map((v, i) => (v == null ? null : `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)},${y(v).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');

  return (
    <div className="relative">
      <div className="absolute inset-x-0 -top-4 flex items-center justify-between text-[10px] uppercase tracking-widest text-white/50">
        <span>24h spread</span>
        <span className="tabular-nums text-white/40">
          {formatTemperature(lo, units)} – {formatTemperature(hi, units)}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full">
        <defs>
          <linearGradient id="spreadFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor="rgba(217,70,239,0.35)" />
            <stop offset="100%" stopColor="rgba(125,211,252,0.15)" />
          </linearGradient>
        </defs>
        {bandPath && <path d={bandPath} fill="url(#spreadFill)" />}
        {medPath  && <path d={medPath}  fill="none" stroke="rgba(186,230,253,0.95)" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

function FragmentRow({
  label,
  family,
  values,
  avg,
  units,
}: {
  label: string;
  family: 'physics' | 'ai';
  values: (number | null)[];
  avg: number;
  units: Units;
}) {
  const isAi = family === 'ai';
  return (
    <>
      <div className={cn('flex items-center gap-1.5', isAi ? 'text-fuchsia-200/90' : 'text-sky-200/90')}>
        {isAi ? <BrainCircuit className="h-3 w-3" /> : <CloudCog className="h-3 w-3" />}
        {label}
      </div>
      <div className="flex items-center gap-1 text-white/70">
        {values.map((v, i) => (
          <span key={i} className="w-8 text-right">
            {v == null ? '–' : Math.round(v)}°
          </span>
        ))}
      </div>
      <div className="text-right text-white/85">{formatTemperature(avg, units)}</div>
    </>
  );
}

function average(values: (number | null)[]): number {
  let n = 0, sum = 0;
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) { sum += v; n++; }
  return n === 0 ? 0 : sum / n;
}

function agreementColor(score: number): string {
  if (score >= 0.8) return 'text-emerald-300';
  if (score >= 0.6) return 'text-sky-300';
  if (score >= 0.4) return 'text-amber-300';
  return 'text-rose-300';
}
