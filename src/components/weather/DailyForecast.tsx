import { GlassCard } from '@/components/ui/GlassCard';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { formatDayShort, formatPercent, formatTemperature } from '@/lib/utils/format';
import { getCondition } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';
import { useMemo } from 'react';

interface Props {
  bundle: WeatherBundle;
}

export function DailyForecast({ bundle }: Props) {
  const { daily, location, units } = bundle;

  const span = useMemo(() => {
    const allMin = Math.min(...daily.map((d) => d.temperatureMin));
    const allMax = Math.max(...daily.map((d) => d.temperatureMax));
    return { allMin, allMax, range: Math.max(1, allMax - allMin) };
  }, [daily]);

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-white/55">10-Day Outlook</div>
        <div className="text-xs text-white/45">overall {Math.round(span.allMin)}° – {Math.round(span.allMax)}°</div>
      </div>
      <div className="mt-3 divide-y divide-white/5">
        {daily.map((d, i) => {
          const cond = getCondition(d.weatherCode);
          const lo = ((d.temperatureMin - span.allMin) / span.range) * 100;
          const hi = ((d.temperatureMax - span.allMin) / span.range) * 100;
          return (
            <div key={d.date} className="grid grid-cols-[80px_36px_60px_1fr_60px] items-center gap-3 py-3">
              <div className="text-sm font-medium text-white/85">
                {i === 0 ? 'Today' : formatDayShort(d.date, location.timezone)}
              </div>
              <WeatherIcon icon={cond.icon} className="h-5 w-5 text-sky-200/85" strokeWidth={1.6} />
              <div className="text-xs text-sky-200/80 tabular-nums">
                {d.precipitationProbabilityMax > 10 ? formatPercent(d.precipitationProbabilityMax) : ''}
              </div>
              <div className="relative h-2 rounded-full bg-white/5">
                <div
                  className="absolute h-2 rounded-full"
                  style={{
                    left: `${lo}%`,
                    width: `${Math.max(2, hi - lo)}%`,
                    background: 'linear-gradient(90deg,#38bdf8 0%,#facc15 50%,#fb7185 100%)',
                  }}
                />
              </div>
              <div className="text-right text-sm tabular-nums text-white/85">
                <span className="text-white/55">{formatTemperature(d.temperatureMin, units)}</span>
                <span className="mx-1 text-white/30">/</span>
                <span>{formatTemperature(d.temperatureMax, units)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}
