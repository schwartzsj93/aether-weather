/**
 * MapPage — full-viewport interactive radar/satellite/wind map.
 *
 * Mounted at /map.  The WeatherMap component is identical to the dashboard
 * version but given 100dvh with no competing cards below it.  A slim
 * frosted header sits above (52px) with a back-to-dashboard button and the
 * active location name so the user always knows where they are.
 *
 * React Query caches the weather data, so navigating here from the dashboard
 * is instant — no second network round-trip.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { useActiveLocation, useAppStore } from '@/store/appStore';
import { useWeather } from '@/hooks/useWeather';
import { WeatherMap } from '@/components/map/WeatherMap';
import { VoiceAgent } from '@/components/voice/VoiceAgent';

export function MapPage() {
  const navigate       = useNavigate();
  const activeLocation = useActiveLocation();
  const units          = useAppStore((s) => s.units);
  const weather        = useWeather(activeLocation, units);

  // Prefer the enriched location from the weather bundle (it has the
  // full timezone + admin1 set by the API adapter); fall back to the
  // store location if data isn't ready yet.
  const location = weather.data?.location ?? activeLocation;

  const locationLabel = location
    ? [location.name, location.admin1, location.countryCode].filter(Boolean).join(', ')
    : '—';

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05070f]">

      {/* ── Slim frosted header ────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-20 flex h-12 shrink-0 items-center gap-3 border-b border-white/6 px-4"
        style={{
          background:     'linear-gradient(to bottom, rgba(5,7,15,0.92), rgba(5,7,15,0.75))',
          backdropFilter: 'blur(24px) saturate(160%)',
        }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Back to dashboard"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Dashboard
        </button>

        {/* Location */}
        <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-white/50">
          <MapPin className="h-3 w-3 shrink-0 text-sky-400/70" />
          <span className="truncate">{locationLabel}</span>
        </div>

        {/* Page label — pushed to right */}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-white/25">
          Weather Map
        </span>
      </motion.header>

      {/* ── Full-height map ────────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {location ? (
          <WeatherMap
            location={location}
            units={units}
            fullPage
          />
        ) : (
          <div className="grid h-full place-items-center text-sm text-white/40">
            Loading map…
          </div>
        )}
      </div>

      {/* Voice agent — same as dashboard */}
      <VoiceAgent bundle={weather.data ?? null} />
    </div>
  );
}
