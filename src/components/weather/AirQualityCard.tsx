import { GlassCard } from '@/components/ui/GlassCard';
import { Wind } from 'lucide-react';
import type { AirQuality } from '@/types/weather';

interface Props { aq: AirQuality; }

function aqiBucket(aqi: number): { label: string; color: string } {
  if (aqi <= 50)  return { label: 'Good',                          color: '#34d399' };
  if (aqi <= 100) return { label: 'Moderate',                      color: '#fbbf24' };
  if (aqi <= 150) return { label: 'Unhealthy for Sensitive Groups',color: '#fb923c' };
  if (aqi <= 200) return { label: 'Unhealthy',                     color: '#f87171' };
  if (aqi <= 300) return { label: 'Very Unhealthy',                color: '#a855f7' };
  return            { label: 'Hazardous',                          color: '#f43f5e' };
}

export function AirQualityCard({ aq }: Props) {
  const bucket = aqiBucket(aq.usAqi);
  const pct = Math.min(100, (aq.usAqi / 300) * 100);

  return (
    <GlassCard>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/55">
        <Wind className="h-3.5 w-3.5" /> Air Quality
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <div className="text-5xl font-light tabular-nums" style={{ color: bucket.color }}>
          {Math.round(aq.usAqi)}
        </div>
        <div className="text-sm text-white/70">{bucket.label}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: bucket.color }} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/65">
        <Pair label="PM2.5" value={`${aq.pm25.toFixed(1)} µg/m³`} />
        <Pair label="PM10"  value={`${aq.pm10.toFixed(1)} µg/m³`} />
        <Pair label="Ozone" value={`${Math.round(aq.ozone)} µg/m³`} />
        <Pair label="NO₂"   value={`${Math.round(aq.no2)} µg/m³`} />
      </div>
      {aq.pollen && (
        <div className="mt-4 grid grid-cols-3 gap-2 text-[11px] text-white/65">
          <Pollen label="Grass" value={aq.pollen.grass} />
          <Pollen label="Tree"  value={aq.pollen.tree} />
          <Pollen label="Weed"  value={aq.pollen.weed} />
        </div>
      )}
    </GlassCard>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-white/45">{label}</div>
      <div className="mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
function Pollen({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-[10px] uppercase tracking-widest text-white/45">{label}</div>
      <div className="mt-0.5 tabular-nums">{value.toFixed(1)}</div>
    </div>
  );
}
