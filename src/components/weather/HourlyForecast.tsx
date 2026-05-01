import { GlassCard } from '@/components/ui/GlassCard';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { formatHour, formatTemperature } from '@/lib/utils/format';
import { getCondition, nightVariant } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';
import { useMemo } from 'react';
import { useEnsemble } from '@/hooks/useEnsemble';
import { aggregateHourly } from '@/lib/ensemble/aggregate';

interface Props {
  bundle: WeatherBundle;
}

export function HourlyForecast({ bundle }: Props) {
  const { hourly, location, units } = bundle;
  const ensemble = useEnsemble(location, units);

  // Show next 24 hours starting from "now-rounded-down"
  const slice = useMemo(() => {
    const now = Date.now();
    const startIdx = Math.max(0, hourly.findIndex((h) => new Date(h.time).getTime() >= now - 30 * 60_000));
    return hourly.slice(startIdx, startIdx + 24);
  }, [hourly]);

  // Ensemble min/max band — aligned to the same 24h window by matching timestamps.
  const band = useMemo(() => {
    if (!ensemble.data) return null;
    const stats = aggregateHourly(ensemble.data, 'temperature_2m');
    // Map each slice timestamp to its index in ensemble.hourlyTime. Open-Meteo
    // returns ISO without seconds — compare by timestamp equality at minute level.
    const minByIdx: (number | null)[] = [];
    const maxByIdx: (number | null)[] = [];
    const timeIdx = new Map<string, number>();
    ensemble.data.hourlyTime.forEach((t, i) => timeIdx.set(t.slice(0, 16), i));
    for (const h of slice) {
      const key = h.time.slice(0, 16);
      const i = timeIdx.get(key);
      if (i === undefined) { minByIdx.push(null); maxByIdx.push(null); continue; }
      minByIdx.push(stats.min[i]);
      maxByIdx.push(stats.max[i]);
    }
    const any = minByIdx.some((v) => v != null);
    return any ? { min: minByIdx, max: maxByIdx } : null;
  }, [ensemble.data, slice]);

  // Sparkline points for the temperature curve. When we have an ensemble band,
  // extend the visual y-range so the min/max envelope fits inside the chart.
  const { path, area, bandPath, minT, maxT } = useMemo(() => {
    const temps = slice.map((h) => h.temperature);
    const bandMin = (band?.min ?? []).filter((v): v is number => v != null);
    const bandMax = (band?.max ?? []).filter((v): v is number => v != null);
    const minT = Math.min(...temps, ...bandMin);
    const maxT = Math.max(...temps, ...bandMax);
    const w = 100, h = 100;
    const pad = 8;
    const x = (i: number) => (i / (slice.length - 1 || 1)) * w;
    const y = (t: number) => h - pad - ((t - minT) / (maxT - minT || 1)) * (h - pad * 2);
    const pts = temps.map((t, i) => `${x(i).toFixed(2)},${y(t).toFixed(2)}`);

    // Build a closed polygon for the ensemble min/max envelope (if present).
    let bandPath = '';
    if (band) {
      const upper = band.max.map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`));
      const lower = band.min.map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`));
      const poly = [...upper, ...lower.reverse()].filter(Boolean).join(' L ');
      if (poly) bandPath = `M ${poly} Z`;
    }

    return {
      path: `M ${pts.join(' L ')}`,
      area: `M ${x(0)},${h} L ${pts.join(' L ')} L ${x(temps.length - 1)},${h} Z`,
      bandPath,
      minT, maxT,
    };
  }, [slice, band]);

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/55">Next 24 Hours</div>
        <div className="text-xs text-white/45">range {Math.round(minT)}° – {Math.round(maxT)}°</div>
      </div>

      <div className="relative mt-3 -mx-2 overflow-x-auto no-scrollbar">
        <div className="relative inline-block min-w-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-24 w-full">
            <defs>
              <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="rgba(125,211,252,0.45)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0)" />
              </linearGradient>
              <linearGradient id="ensembleBand" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%"   stopColor="rgba(217,70,239,0.28)" />
                <stop offset="100%" stopColor="rgba(125,211,252,0.10)" />
              </linearGradient>
            </defs>
            {bandPath && <path d={bandPath} fill="url(#ensembleBand)" />}
            <path d={area} fill="url(#tempFill)" />
            <path d={path} fill="none" stroke="rgba(186,230,253,0.95)" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="relative flex h-24 items-end px-2">
            {slice.map((h, i) => {
              const cond = getCondition(h.weatherCode);
              const icon = h.isDay ? cond.icon : nightVariant(cond.icon);
              return (
                <div key={i} className="flex w-14 shrink-0 flex-col items-center gap-1 text-center">
                  <div className="text-xs tabular-nums text-white/85">{formatTemperature(h.temperature, units)}</div>
                  <WeatherIcon icon={icon} className="h-5 w-5 text-sky-200/85" strokeWidth={1.5} />
                  <div className="text-[10px] text-white/45">
                    {h.precipitationProbability > 10 ? `${Math.round(h.precipitationProbability)}%` : ''}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-white/55">{formatHour(h.time, location.timezone)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
