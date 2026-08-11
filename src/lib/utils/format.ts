import type { Units } from '@/types/weather';

/**
 * Open-Meteo returns timestamps as bare ISO strings ("2026-07-15T04:00") that
 * represent the location's local time — no timezone suffix.  `new Date(str)`
 * would interpret them using the *browser's* timezone, which disagrees with
 * the location whenever they are in different zones.
 *
 * Returns true when the string is already timezone-aware (has Z or ±HH:MM)
 * and can be safely handed to `new Date()`.
 */
function hasTZSuffix(iso: string): boolean {
  return iso.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(iso);
}

/**
 * Parse a bare local ISO string (e.g. "2026-07-15T05:32") as if it
 * represents a wall-clock time in `timezone` and return ms since epoch.
 *
 * Algorithm: guess UTC = same digits, then measure the offset the Intl
 * formatter shows for that guess, and correct.  One round is enough because
 * UTC offsets are fixed-width at any given instant.
 */
export function parseLocalISO(localIso: string, timezone: string): number {
  const [date = '', time = '00:00'] = localIso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [h, min]  = time.split(':').map(Number);
  const utcGuess  = Date.UTC(y, m - 1, d, h, min);

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', hour12: false,
    })
      .formatToParts(new Date(utcGuess))
      .map(({ type, value }) => [type, value]),
  );

  const tzH   = parseInt(parts.hour   === '24' ? '0' : parts.hour);
  const tzMin  = parseInt(parts.minute);
  const tzY    = parseInt(parts.year);
  const tzM    = parseInt(parts.month);
  const tzD    = parseInt(parts.day);
  const diff   = utcGuess - Date.UTC(tzY, tzM - 1, tzD, tzH, tzMin);
  return utcGuess + diff;
}

/**
 * Return the current wall-clock time in `timezone` as a bare ISO string
 * matching Open-Meteo's format: "YYYY-MM-DDTHH:MM".
 */
export function localNowISO(timezone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  );
  const h = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`;
}

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
  if (hasTZSuffix(iso)) {
    // Fully-qualified: safe to parse normally
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', timeZone: timezone });
  }
  // Bare local ISO — extract the hour directly; no Date conversion needed
  // because the digits already represent the location's wall-clock hour.
  const h = parseInt(iso.slice(11, 13), 10);
  if (isNaN(h)) return iso;
  // Drive the 12-hour AM/PM formatter with a dummy local Date so locale rules apply.
  return new Date(1970, 0, 1, h, 0, 0).toLocaleTimeString('en-US', { hour: 'numeric' });
}

export function formatTime(iso: string, timezone: string): string {
  if (hasTZSuffix(iso)) {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
  }
  // Bare local ISO — extract HH:MM directly (same reasoning as formatHour).
  const h   = parseInt(iso.slice(11, 13), 10);
  const min = parseInt(iso.slice(14, 16), 10);
  if (isNaN(h)) return iso;
  return new Date(1970, 0, 1, h, isNaN(min) ? 0 : min, 0).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit',
  });
}

export function formatDayShort(iso: string, timezone: string): string {
  // Bare date strings (YYYY-MM-DD) parse as UTC midnight; pinning to UTC noon
  // prevents negative-offset timezones (e.g. CDT = UTC-5) from rolling the
  // date back to the previous weekday when formatted.
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
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
