import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActiveLocation, useAppStore } from '@/store/appStore';
import { useAirQuality, useWeather } from '@/hooks/useWeather';
import { useAlerts } from '@/hooks/useAlerts';
import { Header } from './Header';
import { LocationStrip } from './LocationStrip';
import { LocationSearch } from '@/components/ui/LocationSearch';
import { DynamicBackground } from '@/components/effects/DynamicBackground';
import { ParticleLayer } from '@/components/effects/ParticleLayer';
import { CurrentConditions } from '@/components/weather/CurrentConditions';
import { WeatherSummary } from '@/components/weather/WeatherSummary';
import { HourlyForecast } from '@/components/weather/HourlyForecast';
import { DailyForecast } from '@/components/weather/DailyForecast';
import { AirQualityCard } from '@/components/weather/AirQualityCard';
import { SunMoonCard } from '@/components/weather/SunMoonCard';
import { AlertsBanner } from '@/components/weather/AlertsBanner';
import { EnsembleInsights } from '@/components/weather/EnsembleInsights';
import { WeatherMap } from '@/components/map/WeatherMap';
import { VoiceAgent } from '@/components/voice/VoiceAgent';

/** Staggered fade-up reveal wrapper used for every card below the hero map. */
function CardReveal({ delay = 0, className = '', children }: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className={className || 'h-full'}
    >
      {children}
    </motion.div>
  );
}

export function Dashboard() {
  const location = useActiveLocation();
  const units = useAppStore((s) => s.units);
  const weather = useWeather(location, units);
  const airQuality = useAirQuality(location);
  const alerts = useAlerts(location);

  // Merge forecast-adapter alerts with NWS feed, de-duped by id.
  const mergedAlerts = [
    ...(weather.data?.alerts ?? []),
    ...(alerts.data ?? []).filter(
      (a) => !weather.data?.alerts?.some((x) => x.id === a.id)
    ),
  ];

  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const current = weather.data?.current;

  return (
    <div className="relative min-h-dvh w-full overflow-hidden">
      <DynamicBackground weatherCode={current?.weatherCode ?? 0} isDay={current?.isDay ?? true} />
      {current && <ParticleLayer weatherCode={current.weatherCode} />}

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1600px] flex-col px-4 py-4 md:px-6 lg:px-10">
        <Header onSearch={() => setSearchOpen(true)} />
        <LocationStrip onSearch={() => setSearchOpen(true)} />

        {mergedAlerts.length > 0 && (
          <div className="mt-4">
            <AlertsBanner alerts={mergedAlerts} />
          </div>
        )}

        <AnimatePresence mode="wait">
          {weather.isLoading && (
            <motion.div key="skeleton" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="grid flex-1 place-items-center text-white/50">
              <div className="animate-pulse-soft text-sm uppercase tracking-widest">Loading forecast…</div>
            </motion.div>
          )}

          {weather.isError && (
            <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="grid flex-1 place-items-center text-center text-rose-200">
              <div>
                <div className="text-lg font-semibold">Couldn't load the forecast.</div>
                <div className="text-sm text-rose-200/70">{(weather.error as Error)?.message}</div>
                <button onClick={() => weather.refetch()}
                  className="mt-3 rounded-full bg-rose-400/20 px-4 py-1.5 text-sm hover:bg-rose-400/30">
                  Retry
                </button>
              </div>
            </motion.div>
          )}

          {weather.data && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="mt-5 flex flex-1 flex-col gap-5"
            >
              {/* ── HERO MAP — full-width, cinematic ──────────────────────────── */}
              {/* The map is no longer confined to a grid column. It spans the    */}
              {/* entire content width so radar/satellite/wind feel immersive.    */}
              <motion.div
                id="section-map"
                initial={{ opacity: 0, scale: 0.994 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                className="relative overflow-hidden rounded-[var(--radius-card)]"
                style={{ height: 'clamp(360px, 46vh, 580px)' }}
              >
                <WeatherMap location={weather.data.location} units={weather.data.units} />

                {/* Bottom dissolve: map fades seamlessly into the card section  */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28
                                bg-gradient-to-t from-[#05070f] via-[#05070f]/55 to-transparent" />
                {/* Side vignette keeps the rounded corners looking clean        */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-5
                                bg-gradient-to-r from-black/25 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-5
                                bg-gradient-to-l from-black/25 to-transparent" />
              </motion.div>

              {/* ── ROW 1 — current conditions + AI briefing ──────────────────── */}
              <div id="section-current" className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
                <div className="col-span-12 lg:col-span-5">
                  <CardReveal delay={0.08}>
                    <CurrentConditions bundle={weather.data} />
                  </CardReveal>
                </div>
                <div className="col-span-12 lg:col-span-7">
                  <CardReveal delay={0.16}>
                    <WeatherSummary bundle={weather.data} />
                  </CardReveal>
                </div>
              </div>

              {/* ── ROW 2 — hourly sparkline + 10-day outlook ─────────────────── */}
              <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
                <div id="section-hourly" className="col-span-12 min-w-0 lg:col-span-7">
                  <CardReveal delay={0.24}>
                    <HourlyForecast bundle={weather.data} />
                  </CardReveal>
                </div>
                <div id="section-daily" className="col-span-12 min-w-0 lg:col-span-5">
                  <CardReveal delay={0.3}>
                    <DailyForecast bundle={weather.data} />
                  </CardReveal>
                </div>
              </div>

              {/* ── ROW 3 — sun/moon · air quality · ensemble models ──────────── */}
              <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
                <div className="col-span-12 md:col-span-6 lg:col-span-3">
                  <CardReveal delay={0.36}>
                    <SunMoonCard bundle={weather.data} />
                  </CardReveal>
                </div>
                <div id="section-airquality" className="col-span-12 md:col-span-6 lg:col-span-3">
                  <CardReveal delay={0.41}>
                    {airQuality.data ? (
                      <AirQualityCard aq={airQuality.data} />
                    ) : (
                      <div className="glass h-full rounded-[var(--radius-card)] p-5 text-sm text-white/50">
                        Air quality unavailable for this region.
                      </div>
                    )}
                  </CardReveal>
                </div>
                <div className="col-span-12 lg:col-span-6">
                  <CardReveal delay={0.46}>
                    <EnsembleInsights location={weather.data.location} units={weather.data.units} />
                  </CardReveal>
                </div>
              </div>

              <footer className="pb-6 pt-2 text-center text-[11px] text-white/40">
                Data ·{' '}
                <a className="underline decoration-white/20 hover:text-white/70" href="https://open-meteo.com">Open-Meteo</a>,{' '}
                <a className="underline decoration-white/20 hover:text-white/70" href="https://www.rainviewer.com/api.html">RainViewer</a>,{' '}
                <a className="underline decoration-white/20 hover:text-white/70" href="https://carto.com/">CARTO</a>
                &nbsp;·&nbsp; Updated {weather.data
                  ? new Date(weather.data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : '—'}
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <LocationSearch open={searchOpen} onOpenChange={setSearchOpen} />

      {/* Bond voice agent — always mounted, receives bundle when ready */}
      <VoiceAgent bundle={weather.data ?? null} />
    </div>
  );
}
