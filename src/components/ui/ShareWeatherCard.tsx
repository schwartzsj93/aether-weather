/**
 * ShareWeatherCard
 *
 * Renders the current conditions as an 800×420 canvas image and offers
 * native-share (Web Share API on mobile) or direct download (desktop).
 * No external libraries — pure 2D Canvas API.
 */

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Share2 } from 'lucide-react';
import {
  bearingToCompass,
  formatTemperature,
  formatWind,
  formatPercent,
  formatPressure,
  formatDistance,
} from '@/lib/utils/format';
import { getCondition } from '@/lib/utils/weatherCodes';
import type { WeatherBundle } from '@/types/weather';

const EMOJI_MAP: Record<string, string> = {
  sun:                  '☀️',
  moon:                 '🌙',
  'partly-cloudy-day':  '⛅',
  'partly-cloudy-night':'🌙',
  cloud:                '☁️',
  fog:                  '🌫️',
  drizzle:              '🌦️',
  rain:                 '🌧️',
  'heavy-rain':         '🌧️',
  snow:                 '❄️',
  sleet:                '🌨️',
  thunder:              '⛈️',
  'thunder-hail':       '⛈️',
};

interface Props {
  open: boolean;
  onClose: () => void;
  bundle: WeatherBundle;
}

export function ShareWeatherCard({ open, onClose, bundle }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  useEffect(() => {
    setCanShare(typeof navigator.share === 'function');
  }, []);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 800, H = 420;
    canvas.width  = W;
    canvas.height = H;

    const { current, daily, location, units } = bundle;
    const cond  = getCondition(current.weatherCode);
    const emoji = EMOJI_MAP[cond.icon] ?? '🌡️';
    const today = daily[0];

    // ── Background ─────────────────────────────────────────────────────────
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0,   '#0b1020');
    bg.addColorStop(0.6, '#0d1428');
    bg.addColorStop(1,   '#05070f');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y <= H; y += 60) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // ── Left column ────────────────────────────────────────────────────────
    // Location
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    const locLabel = location.admin1
      ? `${location.name}, ${location.admin1}`
      : location.name;
    ctx.fillText(locLabel.toUpperCase(), 48, 56);

    // Temperature — build manually so we don't get the °° double from formatTemperature
    ctx.fillStyle = '#ffffff';
    ctx.font = '200 96px system-ui, -apple-system, sans-serif';
    const tempStr = `${Math.round(current.temperature)}${units === 'metric' ? '°C' : '°F'}`;
    ctx.fillText(tempStr, 48, 170);

    // Feels like
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '400 16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Feels like ${formatTemperature(current.feelsLike, units)}`, 48, 200);

    // Condition label
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '500 22px system-ui, -apple-system, sans-serif';
    ctx.fillText(cond.label, 48, 240);

    // Emoji (right side of condition)
    ctx.font = '64px system-ui, -apple-system, sans-serif';
    ctx.fillText(emoji, 56, 330);

    // ── Divider ────────────────────────────────────────────────────────────
    const divX = 380;
    const grad = ctx.createLinearGradient(divX, 30, divX, H - 30);
    grad.addColorStop(0,   'rgba(255,255,255,0)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.1)');
    grad.addColorStop(0.7, 'rgba(255,255,255,0.1)');
    grad.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(divX, 30); ctx.lineTo(divX, H - 30); ctx.stroke();

    // ── Right column — stat grid ───────────────────────────────────────────
    const stats = [
      { label: 'Wind',     value: `${formatWind(current.windSpeed, units)} ${bearingToCompass(current.windDirection)}` },
      { label: 'Gust',     value: formatWind(current.windGust, units) },
      { label: 'Humidity', value: formatPercent(current.humidity) },
      { label: 'Pressure', value: formatPressure(current.pressure, units) },
      { label: 'UV Index',    value: Math.round(current.uvIndex).toString() },
      { label: 'Visibility', value: formatDistance(current.visibility, units) },
    ];

    const col1 = 416, col2 = 616;
    const rowH  = 76;
    const top   = 56;

    stats.forEach((s, i) => {
      const col = i % 2 === 0 ? col1 : col2;
      const row = Math.floor(i / 2);
      const y   = top + row * rowH;

      ctx.fillStyle = 'rgba(255,255,255,0.38)';
      ctx.font = '500 11px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.label.toUpperCase(), col, y);

      ctx.fillStyle = '#ffffff';
      ctx.font = '300 24px system-ui, -apple-system, sans-serif';
      ctx.fillText(s.value, col, y + 30);
    });

    // Today's range
    if (today) {
      ctx.fillStyle = 'rgba(255,255,255,0.30)';
      ctx.font = '500 11px system-ui, -apple-system, sans-serif';
      ctx.fillText('TODAY\'S RANGE', col1, top + 3 * rowH);
      ctx.fillStyle = '#7dd3fc';
      ctx.font = '400 20px system-ui, -apple-system, sans-serif';
      ctx.fillText(
        `${formatTemperature(today.temperatureMin, units)} – ${formatTemperature(today.temperatureMax, units)}`,
        col1, top + 3 * rowH + 28,
      );
    }

    // ── Branding strip ─────────────────────────────────────────────────────
    const stripY = H - 52;
    const stripGrad = ctx.createLinearGradient(0, stripY, W, stripY);
    stripGrad.addColorStop(0,   'rgba(125,211,252,0.08)');
    stripGrad.addColorStop(0.5, 'rgba(167,139,250,0.12)');
    stripGrad.addColorStop(1,   'rgba(125,211,252,0.08)');
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, stripY, W, 52);

    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '500 13px system-ui, -apple-system, sans-serif';
    ctx.fillText('AETHER WEATHER  ·  Weather Intelligence', 48, stripY + 30);

    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.font = '400 12px system-ui, -apple-system, sans-serif';
    const stamp = new Date().toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
    const tw = ctx.measureText(stamp).width;
    ctx.fillText(stamp, W - 48 - tw, stripY + 30);

    // Produce blob URL for preview and download.
    canvas.toBlob((blob) => {
      if (!blob) return;
      setBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
    }, 'image/png');
  }, [open, bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clean up blob URL on unmount.
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `aether-${bundle.location.name.toLowerCase().replace(/\s+/g, '-')}.png`;
    a.click();
  };

  const handleShare = async () => {
    if (!blobUrl || !canShare) return;
    try {
      const res  = await fetch(blobUrl);
      const blob = await res.blob();
      const file = new File([blob], 'aether-weather.png', { type: 'image/png' });
      await navigator.share({ title: `Weather in ${bundle.location.name}`, files: [file] });
    } catch {
      // User cancelled or share failed — fall back silently.
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative flex w-full max-w-3xl flex-col gap-4"
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 backdrop-blur hover:bg-white/20"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Canvas preview */}
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <canvas ref={canvasRef} className="w-full" style={{ aspectRatio: '800/420', display: 'block' }} />
            </div>

            {/* Actions */}
            <div className="flex justify-center gap-3">
              {canShare && (
                <button
                  onClick={handleShare}
                  className="flex items-center gap-2 rounded-full bg-sky-400/20 px-5 py-2.5 text-sm text-sky-200 transition hover:bg-sky-400/30"
                >
                  <Share2 className="h-4 w-4" /> Share
                </button>
              )}
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-5 py-2.5 text-sm text-white/80 transition hover:bg-white/10"
              >
                <Download className="h-4 w-4" /> Save image
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
