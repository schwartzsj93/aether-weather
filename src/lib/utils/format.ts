import type { Units } from '@/types/weather';

export function formatTemperature(value: number, units: Units, opts: { withDegree?: boolean } = {}): string {
  const rounded = Math.round(value);
  const suffix = opts.withDegree === false ? '' : units === 'metric' ? '°' : '°';
  return `${rounded}${suffix}`;
}

export function formatWind(speed: number, units: Units): string {
  const unit = units === 'metric' ? 'km/h' : 'mph';
  return `${Math.round(speed)} ${unit}`;
}

export function formatDistance(km: number, units: Units): string {
  if (units === 'imperial') return `${Math.round(km * 0.621371)} mi`;
  return `${Math.round(km)} km`;
}

export function formatPressure(hpa: number, units: Units): string {
  if (units === 'imperial') return `${(hpa * 0.02953).toFixed(2)} inHg`;
  return `${Math.round(hpa)} hPa`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function bearingToCompass(deg: number): string {
  const idx = Math.round(((deg % 360) / 22.5)) % 16;
  return COMPASS[idx];
}

export function formatHour(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    timeZone: timezone,
  });
}

export function formatTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export function formatDayShort(iso: string, timezone: string): string {
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
}

export function relativeTime(ms: number): string {
  const diff = Math.round((ms - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(diff, 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86_400), 'day');
}
