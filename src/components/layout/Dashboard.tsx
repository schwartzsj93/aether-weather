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

export function Dashboard() {
  const location = useActiveLocation();
  const units = useAppStore((s) => s.units);
  const weather = useWeather(location, units);
  const airQuality = useAirQuality(location);
  const alerts = useAlerts(location);

  // Merge whatever the forecast adapter ships with (typically none) with the
  // NWS feed, de-duped by id so the same alert isn't shown twice.
  const mergedAlerts = [
    ...(weather.data?.alerts ?? []),
    ...(alerts.data ?? []).filter(
      (a) => !weather.data?.alerts?.some((x) => x.id === a.id)
    ),
  ];

  const [searchOpen, setSearchOpen] = useState(false);

  // Keyboard: ⌘K / Ctrl+K to open search
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

      <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-5 px-4 py-4 md:px-6 lg:px-10">
        <Header onSearch={() => setSearchOpen(true)} />

        <LocationStrip onSearch={() => setSearchOpen(true)} />

        {mergedAlerts.length > 0 ? <AlertsBanner alerts={mergedAlerts} /> : null}

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
                <div className="text-lg font-semibold">Couldn’t load the forecast.</div>
                <div className="text-sm text-rose-200/70">{(weather.error as Error)?.message}</div>
                <button onClick={() => weather.refetch()} className="mt-3 rounded-full bg-rose-400/20 px-4 py-1.5 text-sm hover:bg-rose-400/30">
                  Retry
                </button>
              </div>
            </motion.div>
          )}

          {weather.data && (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className="grid flex-1 grid-cols-12 gap-4 md:gap-5 lg:gap-6"
            >
              {/* Left column — primary forecast */}
              <div className="col-span-12 flex flex-col gap-4 lg:col-span-5">
                <CurrentConditions bundle={weather.data} />
                <WeatherSummary bundle={weather.data} />
                <HourlyForecast bundle={weather.data} />
              </div>

              {/* Center — the map */}
              <div className="col-span-12 lg:col-span-7">
                <div className="relative h-[520px] lg:h-full min-h-[520px]">
                  <WeatherMap location={weather.data.location} />
                </div>
              </div>

              {/* Bottom row — more cards */}
              <div className="col-span-12 grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
                <div className="col-span-12 md:col-span-6 lg:col-span-5">
                  <DailyForecast bundle={weather.data} />
                </div>
                <div className="col-span-6 md:col-span-3 lg:col-span-3">
                  <SunMoonCard bundle={weather.data} />
                </div>
                <div className="col-span-6 md:col-span-3 lg:col-span-4">
                  {airQuality.data ? (
                    <AirQualityCard aq={airQuality.data} />
                  ) : (
                    <div className="glass h-full rounded-[var(--radius-card)] p-5 text-sm text-white/50">Air quality unavailable for this region.</div>
                  )}
                </div>

                {/* Full-width ensemble / model-agreement insights */}
                <div className="col-span-12">
                  <EnsembleInsights location={weather.data.location} units={weather.data.units} />
                </div>
              </div>

              <footer className="col-span-12 pt-2 pb-6 text-center text-[11px] text-white/40">
                Data · <a className="underline decoration-white/20 hover:text-white/70" href="https://open-meteo.com">Open-Meteo</a>,
                {' '}<a className="underline decoration-white/20 hover:text-white/70" href="https://www.rainviewer.com/api.html">RainViewer</a>,
                {' '}<a className="underline decoration-white/20 hover:text-white/70" href="https://carto.com/">CARTO</a>
                &nbsp;·&nbsp; Updated {weather.data ? new Date(weather.data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}
              </footer>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <LocationSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
