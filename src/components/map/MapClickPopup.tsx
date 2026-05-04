/**
 * Floating forecast popup that appears when the user clicks the map.
 *
 * Positioned at the click's screen coordinates (relative to the map container)
 * and shows: reverse-geocoded location name, current conditions, 12-hour strip.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Wind, Droplets, Loader2 } from 'lucide-react';
import { WeatherIcon } from '@/components/ui/WeatherIcon';
import { getCondition, nightVariant } from '@/lib/utils/weatherCodes';
import type { QuickForecast } from '@/lib/api/quickForecast';
import type { Units } from '@/types/weather';

function fmtTemp(t: number, units: Units) {
  return `${Math.round(t)}°${units === 'imperial' ? 'F' : 'C'}`;
}

function fmtHour(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }).replace(' ', '').toLowerCase();
}

interface PopupState {
  screenX: number;
  screenY: number;
  loading: boolean;
  data: QuickForecast | null;
  error?: string;
}

interface Props {
  popup: PopupState | null;
  onClose: () => void;
}

export function MapClickPopup({ popup, onClose }: Props) {
  return (
    <AnimatePresence>
      {popup && (
        <motion.div
          key="popup"
          initial={{ opacity: 0, scale: 0.92, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="pointer-events-auto absolute z-30 w-72"
          style={{
            left: popup.screenX,
            top:  popup.screenY,
            // Center horizontally, sit above the pin
            transform: 'translate(-50%, calc(-100% - 14px))',
          }}
        >
          {/* Callout arrow */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full">
            <div className="h-0 w-0 border-x-8 border-t-8 border-x-transparent border-t-white/10" />
          </div>

          <div className="glass-strong rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-white/50 mb-0.5">
                  Forecast
                </div>
                <div className="truncate text-sm font-semibold text-white">
                  {popup.loading ? (
                    <span className="text-white/50">Locating…</span>
                  ) : (
                    popup.data?.locationName ?? '—'
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/8 text-white/60 hover:bg-white/15 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Body */}
            {popup.loading && !popup.data && (
              <div className="flex items-center justify-center gap-2 px-4 py-5 text-sm text-white/55">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            )}

            {popup.error && !popup.data && (
              <div className="px-4 pb-4 text-xs text-rose-300/80">{popup.error}</div>
            )}

            {popup.data && (() => {
              const d = popup.data;
              const cond = getCondition(d.weatherCode);
              const icon = d.isDay ? cond.icon : nightVariant(cond.icon);
              return (
                <>
                  {/* Current */}
                  <div className="flex items-center gap-3 px-4 pb-3">
                    <WeatherIcon icon={icon} className="h-12 w-12 text-sky-200/90" strokeWidth={1.4} />
                    <div>
                      <div className="text-3xl font-extralight leading-none text-white">
                        {fmtTemp(d.temp, d.units)}
                      </div>
                      <div className="mt-0.5 text-xs text-white/65">{cond.label}</div>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-white/55">
                        <span className="flex items-center gap-1">
                          <Wind className="h-3 w-3" />
                          {Math.round(d.windSpeed)} {d.units === 'imperial' ? 'mph' : 'km/h'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Droplets className="h-3 w-3" />
                          {Math.round(d.humidity)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 12-hour mini strip */}
                  {d.next12h.length > 0 && (
                    <div className="border-t border-white/6 px-3 py-2">
                      <div className="flex items-end gap-0.5 overflow-x-auto no-scrollbar">
                        {d.next12h.map((h, i) => {
                          const hc = getCondition(h.weatherCode);
                          const hi = h.isDay ? hc.icon : nightVariant(hc.icon);
                          return (
                            <div key={i} className="flex w-10 shrink-0 flex-col items-center gap-0.5 text-center">
                              <div className="text-[10px] tabular-nums text-white/80">{fmtTemp(h.temp, d.units)}</div>
                              <WeatherIcon icon={hi} className="h-4 w-4 text-sky-200/75" strokeWidth={1.5} />
                              <div className="text-[9px] text-sky-300/70">
                                {h.precipProb > 15 ? `${Math.round(h.precipProb)}%` : ''}
                              </div>
                              <div className="text-[9px] text-white/40">{fmtHour(h.time)}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type { PopupState };
