/**
 * NotificationBell
 *
 * Lets users opt into a daily morning weather briefing notification.
 * When the app is open at (or after) the chosen hour and no notification
 * has been shown yet today, a browser Notification fires with the current
 * conditions summary.
 *
 * Note: This is an "open-app" notification — it fires while the browser tab
 * is running. True background push (when the app is fully closed) would
 * require a VAPID push server. That's a potential future upgrade.
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore, useActiveLocation } from '@/store/appStore';
import { useWeather } from '@/hooks/useWeather';
import { formatTemperature } from '@/lib/utils/format';
import { getCondition } from '@/lib/utils/weatherCodes';
import { cn } from '@/lib/utils/cn';

const STORAGE_KEY = 'aether-last-notified';
const HOURS = [6, 7, 8, 9];

function todayStr() {
  return new Date().toDateString();
}

function permissionGranted() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function NotificationBell() {
  const notifyHour    = useAppStore((s) => s.notifyHour);
  const setNotifyHour = useAppStore((s) => s.setNotifyHour);
  const units         = useAppStore((s) => s.units);
  const location      = useActiveLocation();
  const weather       = useWeather(location, units);

  const [open,    setOpen]    = useState(false);
  const [granted, setGranted] = useState(permissionGranted);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Ask for permission and enable a default hour if granted.
  const enable = async (hour: number) => {
    if (!('Notification' in window)) return;
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
    }
    if (perm === 'granted') {
      setGranted(true);
      setNotifyHour(hour);
    }
  };

  const disable = () => setNotifyHour(null);

  // Fire the morning briefing if conditions are met.
  useEffect(() => {
    if (notifyHour == null || !granted || !weather.data) return;
    const now = new Date();
    if (now.getHours() < notifyHour) return;
    if (localStorage.getItem(STORAGE_KEY) === todayStr()) return;

    const { current, location: loc } = weather.data;
    const cond = getCondition(current.weatherCode);
    const temp = formatTemperature(current.temperature, units);
    const high = weather.data.daily[0]
      ? `High ${formatTemperature(weather.data.daily[0].temperatureMax, units)}°`
      : '';

    new Notification(`Aether · ${loc.name}`, {
      body: `${temp}°, ${cond.label}. ${high}`.trim(),
      icon: '/icon-192.png',
      tag:  'morning-briefing',
    });
    localStorage.setItem(STORAGE_KEY, todayStr());
  }, [notifyHour, granted, weather.data, units]);

  const isEnabled = notifyHour != null && granted;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full transition',
          isEnabled
            ? 'glass-strong text-amber-300'
            : 'glass text-white/55 hover:text-white',
        )}
        aria-label="Morning briefing notifications"
        title="Morning briefing"
      >
        {isEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        {isEnabled && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_6px_#fbbf24]" />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1428]/95 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div className="text-xs font-medium uppercase tracking-widest text-white/55">
                Morning briefing
              </div>
              <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-xs text-white/55 leading-relaxed">
                Get a quick weather snapshot at your chosen time — when the app is open.
              </p>

              {!granted && Notification.permission === 'denied' && (
                <p className="mt-2 text-xs text-rose-300/80">
                  Notifications are blocked. Enable them in your browser settings.
                </p>
              )}

              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    onClick={() => notifyHour === h ? disable() : enable(h)}
                    className={cn(
                      'flex flex-col items-center rounded-xl border py-2 text-center transition',
                      notifyHour === h && isEnabled
                        ? 'border-amber-400/40 bg-amber-400/15 text-amber-200'
                        : 'border-white/8 bg-white/5 text-white/65 hover:border-white/20 hover:text-white',
                    )}
                  >
                    <span className="text-xs font-medium">{h > 12 ? h - 12 : h}</span>
                    <span className="text-[10px] text-white/40">{h < 12 ? 'am' : 'pm'}</span>
                  </button>
                ))}
              </div>

              {isEnabled && (
                <div className="mt-3 text-center text-[11px] text-amber-300/70">
                  Briefing set for {notifyHour}:00
                </div>
              )}

              {isEnabled && (
                <button
                  onClick={disable}
                  className="mt-3 w-full rounded-xl border border-white/8 py-2 text-xs text-white/45 hover:border-white/15 hover:text-white/70 transition"
                >
                  Turn off
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
