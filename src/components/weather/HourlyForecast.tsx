/**
 * Hourly forecast card.
 *
 * Top section: temperature sparkline with ensemble uncertainty band overlaid.
 * Bottom section: per-hour detail strip — feels-like, precipitation probability,
 * wind direction arrow + speed, UV index dot, and time label.
 */

import { GlassCard } from '@/components/ui/GlassCard';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { formatHour, formatTemperature } from '@/lib/utils/format';
import { getCondition, nightVariant } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';
import { useMemo } from 'react';
import { useEnsemble } from '@/hooks/useEnsemble';
import { aggregateHourly } from '@/lib/ensemble/aggregate';
import { ArrowUp, Droplets } from 'lucide-react';

interface Props {
  bundle: WeatherBundle;
}

function uvColor(uv: number): string {
  if (uv >= 11) return 'bg-violet-400';
  if (uv >= 8)  return 'bg-rose-400';
  if (uv >= 6)  return 'bg-orange-400';
  if (uv >= 3)  return 'bg-yellow-300';
  return 'bg-emerald-400';
}

export function HourlyForecast({ bundle }: Props) {
  const { hourly, location, units } = bundle;
  const ensemble = useEnsemble(location, units);

  // Next 24 hours starting from the closest past hour
  const slice = useMemo(() => {
    const now = Date.now();
    const startIdx = Math.max(
      0,
      hourly.findIndex((h) => new Date(h.time).getTime() >= now - 30 * 60_000),
    );
    return hourly.slice(startIdx, startIdx + 24);
  }, [hourly]);

  // Ensemble min/max band aligned to the same 24-hour window
  const band = useMemo(() => {
    if (!ensemble.data) return null;
    const stats = aggregateHourly(ensemble.data, 'temperature_2m');
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
    return minByIdx.some((v) => v != null) ? { min: minByIdx, max: maxByIdx } : null;
  }, [ensemble.data, slice]);

  // Sparkline geometry
  const { path, area, bandPath, minT, maxT } = useMemo(() => {
    const temps = slice.map((h) => h.temperature);
    const bandMin = (band?.min ?? []).filter((v): v is number => v != null);
    const bandMax = (band?.max ?? []).filter((v): v is number => v != null);
    const minT = Math.min(...temps, ...bandMin);
    const maxT = Math.max(...temps, ...bandMax);
    const W = 100, H = 100, pad = 8;
    const x = (i: number) => (i / (slice.length - 1 || 1)) * W;
    const y = (t: number) => H - pad - ((t - minT) / (maxT - minT || 1)) * (H - pad * 2);
    const pts = temps.map((t, i) => `${x(i).toFixed(2)},${y(t).toFixed(2)}`);

    let bandPath = '';
    if (band) {
      const upper = band.max.map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`));
      const lower = band.min.map((v, i) => (v == null ? null : `${x(i).toFixed(2)},${y(v).toFixed(2)}`));
      const poly = [...upper, ...lower.reverse()].filter(Boolean).join(' L ');
      if (poly) bandPath = `M ${poly} Z`;
    }

    return {
      path:     `M ${pts.join(' L ')}`,
      area:     `M ${x(0)},${H} L ${pts.join(' L ')} L ${x(temps.length - 1)},${H} Z`,
      bandPath, minT, maxT,
    };
  }, [slice, band]);

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/55">Next 24 Hours</div>
        <div className="text-xs text-white/45">
          range {Math.round(minT)}° – {Math.round(maxT)}°
        </div>
      </div>

      <div className="-mx-2 mt-3 overflow-x-auto no-scrollbar">
        <div className="inline-block min-w-full">

          {/* ── Sparkline with temp + icon overlay ── */}
          <div className="relative px-2">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-x-2 inset-y-0 h-[5.5rem] w-[calc(100%-1rem)]"
            >
              <defs>
                <linearGradient id="hf-tempFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%"   stopColor="rgba(125,211,252,0.45)" />
                  <stop offset="100%" stopColor="rgba(125,211,252,0)" />
                </linearGradient>
                <linearGradient id="hf-ensembleBand" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%"   stopColor="rgba(217,70,239,0.28)" />
                  <stop offset="100%" stopColor="rgba(125,211,252,0.10)" />
                </linearGradient>
              </defs>
              {bandPath && <path d={bandPath} fill="url(#hf-ensembleBand)" />}
              <path d={area} fill="url(#hf-tempFill)" />
              <path
                d={path}
                fill="none"
                stroke="rgba(186,230,253,0.95)"
                strokeWidth="0.7"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            {/* Temp + icon columns riding the sparkline */}
            <div className="relative flex h-[5.5rem] items-end">
              {slice.map((h, i) => {
                const cond = getCondition(h.weatherCode);
                const icon = h.isDay ? cond.icon : nightVariant(cond.icon);
                return (
                  <div
                    key={i}
                    className="flex w-14 shrink-0 flex-col items-center gap-0.5 pb-1"
                  >
                    <div className="text-[11px] font-medium tabular-nums text-white/90">
                      {formatTemperature(h.temperature, units)}
                    </div>
                    <WeatherIcon icon={icon} className="h-5 w-5 text-sky-200/85" strokeWidth={1.5} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Detail strip ── */}
          <div className="border-t border-white/6 px-2">
            <div className="flex">
              {slice.map((h, i) => (
                <div
                  key={i}
                  className="flex w-14 shrink-0 flex-col items-center gap-[3px] py-2 text-center"
                >
                  {/* Feels like */}
                  <div className="text-[10px] tabular-nums text-white/40">
                    {formatTemperature(h.feelsLike, units)}
                  </div>

                  {/* Precip probability */}
                  <div className="flex items-center gap-[2px] text-[10px] text-sky-300/75">
                    {h.precipitationProbability > 10 ? (
                      <>
                        <Droplets className="h-2.5 w-2.5 shrink-0" />
                        {Math.round(h.precipitationProbability)}%
                      </>
                    ) : (
                      <span className="text-white/15">–</span>
                    )}
                  </div>

                  {/* Wind direction arrow + speed */}
                  <div className="flex flex-col items-center gap-[1px]">
                    <ArrowUp
                      className="h-2.5 w-2.5 text-white/50"
                      style={{ transform: `rotate(${h.windDirection}deg)` }}
                    />
                    <div className="text-[10px] tabular-nums text-white/45">
                      {Math.round(h.windSpeed)}
                    </div>
                  </div>

                  {/* UV index dot (hidden at night / UV = 0) */}
                  {h.uvIndex > 0 ? (
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${uvColor(h.uvIndex)} opacity-85`}
                      title={`UV ${h.uvIndex.toFixed(1)}`}
                    />
                  ) : (
                    <div className="h-1.5" />
                  )}

                  {/* Time label */}
                  <div className="text-[10px] uppercase tracking-wider text-white/45">
                    {formatHour(h.time, location.timezone)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[10px] text-white/30">
        <span>feels like</span>
        <span className="flex items-center gap-0.5">
          <Droplets className="h-2.5 w-2.5 text-sky-300/45" /> precip
        </span>
        <span>↑ wind</span>
        <span>● UV</span>
      </div>
    </GlassCard>
  );
}
