/**
 * 10-day daily forecast card.
 *
 * Each row shows: day name, weather icon, precip probability, UV index dot,
 * wind max, temperature range bar, and min/max temperatures.
 *
 * Tapping a row expands an inline hourly strip so the user can see how the
 * day evolves hour-by-hour without leaving the card.
 */

import { GlassCard } from '@/components/ui/GlassCard';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import {
  formatDayShort,
  formatHour,
  formatPercent,
  formatTemperature,
} from '@/lib/utils/format';
import { getCondition, nightVariant } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Droplets, Wind } from 'lucide-react';

interface Props {
  bundle: WeatherBundle;
}

function uvDotClass(uv: number): string {
  if (uv >= 11) return 'bg-violet-400';
  if (uv >= 8)  return 'bg-rose-400';
  if (uv >= 6)  return 'bg-orange-400';
  if (uv >= 3)  return 'bg-yellow-300';
  return 'bg-emerald-400';
}

export function DailyForecast({ bundle }: Props) {
  const { daily, hourly, location, units } = bundle;
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  const span = useMemo(() => {
    const allMin = Math.min(...daily.map((d) => d.temperatureMin));
    const allMax = Math.max(...daily.map((d) => d.temperatureMax));
    return { allMin, allMax, range: Math.max(1, allMax - allMin) };
  }, [daily]);

  // Pre-bucket hourly data by date so expanded rows don't iterate the full array
  const hourlyByDate = useMemo(() => {
    const map = new Map<string, typeof hourly>();
    for (const h of hourly) {
      const date = h.time.slice(0, 10);
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(h);
    }
    return map;
  }, [hourly]);

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/55">10-Day Outlook</div>
        <div className="text-xs text-white/45">
          overall {Math.round(span.allMin)}° – {Math.round(span.allMax)}°
        </div>
      </div>

      <div className="mt-3 divide-y divide-white/5">
        {daily.map((d, i) => {
          const cond = getCondition(d.weatherCode);
          const lo   = ((d.temperatureMin - span.allMin) / span.range) * 100;
          const hi   = ((d.temperatureMax - span.allMin) / span.range) * 100;
          const isExpanded  = expandedDate === d.date;
          const dayHourly   = hourlyByDate.get(d.date) ?? [];
          const label       = i === 0 ? 'Today' : formatDayShort(d.date, location.timezone);

          return (
            <div key={d.date}>
              {/* ── Row ── */}
              <button
                onClick={() => setExpandedDate(isExpanded ? null : d.date)}
                className="grid w-full items-center gap-2 py-2.5 text-left transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]"
                style={{
                  gridTemplateColumns: '68px 26px 44px 10px 56px 1fr 58px 14px',
                }}
              >
                {/* Day label */}
                <div className="text-sm font-medium text-white/85">{label}</div>

                {/* Condition icon */}
                <WeatherIcon icon={cond.icon} className="h-5 w-5 text-sky-200/85" strokeWidth={1.6} />

                {/* Precip probability */}
                <div className="flex items-center gap-0.5 text-[11px] tabular-nums text-sky-300/80">
                  {d.precipitationProbabilityMax > 10 ? (
                    <>
                      <Droplets className="h-3 w-3 shrink-0" />
                      {formatPercent(d.precipitationProbabilityMax)}
                    </>
                  ) : (
                    <span className="text-white/20">—</span>
                  )}
                </div>

                {/* UV index dot */}
                <div
                  className={`h-2 w-2 rounded-full ${uvDotClass(d.uvIndexMax)}`}
                  title={`UV max ${d.uvIndexMax.toFixed(1)}`}
                />

                {/* Wind max */}
                <div className="flex items-center gap-0.5 text-[11px] tabular-nums text-white/45">
                  <Wind className="h-3 w-3 shrink-0" />
                  <span>
                    {Math.round(d.windSpeedMax)}{units === 'imperial' ? 'mph' : 'km/h'}
                  </span>
                </div>

                {/* Temperature range bar */}
                <div className="relative h-1.5 rounded-full bg-white/5">
                  <div
                    className="absolute h-1.5 rounded-full"
                    style={{
                      left:  `${lo}%`,
                      width: `${Math.max(2, hi - lo)}%`,
                      background:
                        'linear-gradient(90deg,#38bdf8 0%,#facc15 50%,#fb7185 100%)',
                    }}
                  />
                </div>

                {/* Min / Max */}
                <div className="text-right text-sm tabular-nums text-white/85">
                  <span className="text-white/40">
                    {formatTemperature(d.temperatureMin, units)}
                  </span>
                  <span className="mx-0.5 text-white/20">/</span>
                  <span>{formatTemperature(d.temperatureMax, units)}</span>
                </div>

                {/* Expand chevron */}
                <ChevronDown
                  className="h-3.5 w-3.5 text-white/30 transition-transform duration-200"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                />
              </button>

              {/* ── Expandable hourly strip ── */}
              <AnimatePresence initial={false}>
                {isExpanded && (
                  <motion.div
                    key="expanded-hours"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    {dayHourly.length > 0 ? (
                      <div className="-mx-1 overflow-x-auto no-scrollbar pb-3 pt-1">
                        <div className="flex gap-1 px-1">
                          {dayHourly.map((h, hi) => {
                            const hc   = getCondition(h.weatherCode);
                            const hIcon = h.isDay ? hc.icon : nightVariant(hc.icon);
                            return (
                              <div
                                key={hi}
                                className="flex w-[3.25rem] shrink-0 flex-col items-center gap-0.5 rounded-xl bg-white/[0.05] px-1 py-2 text-center"
                              >
                                <div className="text-[10px] font-medium tabular-nums text-white/80">
                                  {formatTemperature(h.temperature, units)}
                                </div>
                                <WeatherIcon
                                  icon={hIcon}
                                  className="h-4 w-4 text-sky-200/75"
                                  strokeWidth={1.5}
                                />
                                <div className="text-[9px] tabular-nums text-sky-300/65">
                                  {h.precipitationProbability > 10
                                    ? `${Math.round(h.precipitationProbability)}%`
                                    : ''}
                                </div>
                                <div className="text-[9px] tabular-nums text-white/38">
                                  {formatHour(h.time, location.timezone)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="pb-3 text-center text-[11px] text-white/30">
                        No hourly data available
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-white/28">
        <span className="flex items-center gap-0.5">
          <Droplets className="h-2.5 w-2.5 text-sky-300/40" /> precip
        </span>
        <span>● UV</span>
        <span className="flex items-center gap-0.5">
          <Wind className="h-2.5 w-2.5" /> wind max
        </span>
        <span>tap row to expand hours</span>
      </div>
    </GlassCard>
  );
}
