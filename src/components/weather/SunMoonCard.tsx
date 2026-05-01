import { GlassCard } from '@/components/ui/GlassCard';
import { Moon, Sunrise, Sunset } from 'lucide-react';
import type { WeatherBundle } from '@/types/weather';
import { formatTime } from '@/lib/utils/format';

interface Props { bundle: WeatherBundle; }

const PHASES = [
  { name: 'New Moon',         max: 0.03 },
  { name: 'Waxing Crescent',  max: 0.22 },
  { name: 'First Quarter',    max: 0.28 },
  { name: 'Waxing Gibbous',   max: 0.47 },
  { name: 'Full Moon',        max: 0.53 },
  { name: 'Waning Gibbous',   max: 0.72 },
  { name: 'Last Quarter',     max: 0.78 },
  { name: 'Waning Crescent',  max: 0.97 },
  { name: 'New Moon',         max: 1.01 },
];

function phaseLabel(p: number): string {
  return PHASES.find((x) => p <= x.max)?.name ?? 'Full Moon';
}

export function SunMoonCard({ bundle }: Props) {
  const today = bundle.daily[0];
  if (!today) return null;
  const tz = bundle.location.timezone;

  // Sun arc progress 0..1
  const sunrise = new Date(today.sunrise).getTime();
  const sunset  = new Date(today.sunset).getTime();
  const now     = Date.now();
  const t = Math.max(0, Math.min(1, (now - sunrise) / (sunset - sunrise || 1)));
  const angle = Math.PI * t;
  const cx = 50 + 40 * -Math.cos(angle);
  const cy = 50 - 40 * Math.sin(angle);

  return (
    <GlassCard>
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/55">
        <span>Sun & Moon</span>
        <span className="text-white/40">{phaseLabel(today.moonPhase ?? 0.5)}</span>
      </div>
      <div className="mt-3">
        <svg viewBox="0 0 100 60" className="h-24 w-full">
          <defs>
            <linearGradient id="arc" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#fb923c" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#7dd3fc" />
            </linearGradient>
          </defs>
          <path d="M 10 55 A 40 40 0 0 1 90 55" fill="none" stroke="url(#arc)" strokeWidth="0.6" strokeDasharray="1.2 1.4" />
          <circle cx={cx} cy={cy} r="3.2" fill="#fde68a" />
          <circle cx={cx} cy={cy} r="6" fill="#fde68a" opacity="0.25" />
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm text-white/85">
        <div className="flex items-center gap-2"><Sunrise className="h-4 w-4 text-amber-300" /> {formatTime(today.sunrise, tz)}</div>
        <div className="flex items-center gap-2"><Sunset className="h-4 w-4 text-orange-300" /> {formatTime(today.sunset, tz)}</div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-white/55">
        <Moon className="h-3.5 w-3.5" />
        <span>Moon phase {(Math.round((today.moonPhase ?? 0) * 100))}%</span>
      </div>
    </GlassCard>
  );
}
