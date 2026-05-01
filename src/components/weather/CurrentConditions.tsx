import { motion } from 'framer-motion';
import { Wind, Droplets, Gauge, Eye, Sun as SunIcon } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import {
  bearingToCompass,
  formatDistance,
  formatPressure,
  formatTemperature,
  formatWind,
  formatPercent,
} from '@/lib/utils/format';
import { getCondition, nightVariant } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';

interface Props {
  bundle: WeatherBundle;
}

export function CurrentConditions({ bundle }: Props) {
  const { current, location, units } = bundle;
  const cond = getCondition(current.weatherCode);
  const icon = current.isDay ? cond.icon : nightVariant(cond.icon);

  return (
    <GlassCard intense className="p-7 lg:p-9">
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.18em] text-white/55">
            <span>{location.name}</span>
            {location.admin1 && <span className="text-white/30">·</span>}
            <span className="text-white/45">{location.admin1 ?? location.country}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <motion.div
              key={Math.round(current.temperature)}
              className="text-[7rem] font-extralight leading-none tracking-tighter md:text-[9rem]"
            >
              <AnimatedNumber value={current.temperature} suffix="°" />
            </motion.div>
            <div className="pb-4 text-lg font-medium text-white/70">
              Feels {formatTemperature(current.feelsLike, units)}
            </div>
          </div>
          <div className="mt-2 text-xl text-white/85">{cond.label}</div>
        </div>
        <motion.div
          initial={{ rotate: -8, opacity: 0 }}
          animate={{ rotate: 0, opacity: 1 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <WeatherIcon icon={icon} className="h-32 w-32 text-sky-200/90 md:h-40 md:w-40" />
        </motion.div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat icon={<Wind className="h-4 w-4" />}
              label="Wind"
              value={`${formatWind(current.windSpeed, units)} ${bearingToCompass(current.windDirection)}`}
              hint={`Gust ${formatWind(current.windGust, units)}`} />
        <Stat icon={<Droplets className="h-4 w-4" />}
              label="Humidity"
              value={formatPercent(current.humidity)}
              hint={`${current.precipitation.toFixed(1)} ${units === 'metric' ? 'mm' : 'in'} now`} />
        <Stat icon={<Gauge className="h-4 w-4" />}
              label="Pressure"
              value={formatPressure(current.pressure, units)} />
        <Stat icon={<Eye className="h-4 w-4" />}
              label="Visibility"
              value={formatDistance(current.visibility, units)}
              hint={<span className="inline-flex items-center gap-1"><SunIcon className="h-3 w-3" />UV {Math.round(current.uvIndex)}</span>} />
      </div>
    </GlassCard>
  );
}

function Stat({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/55">
        {icon} {label}
      </div>
      <div className="mt-2 text-xl font-medium tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-white/45">{hint}</div>}
    </div>
  );
}
