/**
 * The "weatherman" — a deterministic, rule-based natural-language summarizer
 * that ingests forecast data and produces concise, professional predictions.
 *
 * Design goals:
 *   • Sound like a meteorologist, not a screen reader of numbers
 *   • Surface inflection points ("rain tapers off by 7 PM") rather than averages
 *   • Cheap, offline, deterministic — but the interface is identical to what an
 *     LLM-backed implementation would return, so swapping is one-line.
 */

import type { DailyPoint, HourlyPoint, WeatherBundle } from '@/types/weather';
import { getCondition } from '@/lib/utils/weatherCodes';

export interface WeatherStory {
  /** One-sentence headline — used in the hero card */
  headline: string;
  /** 2–3 sentence narrative — the "weatherman read" */
  narrative: string;
  /** Specific bullet predictions tagged by time */
  highlights: { time: string; text: string }[];
  /** Suggested wardrobe / activity guidance */
  advice: string;
}

const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 80, 81, 82]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);
const STORM_CODES = new Set([95, 96, 99]);

function localHour(iso: string, tz: string): Date {
  // Build a Date that is "as if" the wall-clock time at the location is the
  // browser's local time. Keeps phrase generation tz-correct without a heavy lib.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '00';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`);
}

function phraseHour(d: Date): string {
  const h = d.getHours();
  if (h === 0) return 'midnight';
  if (h === 12) return 'noon';
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh} ${ampm}`;
}

interface PrecipWindow {
  start: HourlyPoint;
  end: HourlyPoint;
  type: 'rain' | 'snow' | 'storm';
  peakIntensity: number;
}

function findPrecipWindows(hours: HourlyPoint[]): PrecipWindow[] {
  const out: PrecipWindow[] = [];
  let current: PrecipWindow | null = null;
  for (const h of hours.slice(0, 24)) {
    const isStorm = STORM_CODES.has(h.weatherCode);
    const isRain = RAIN_CODES.has(h.weatherCode);
    const isSnow = SNOW_CODES.has(h.weatherCode);
    const type = isStorm ? 'storm' : isSnow ? 'snow' : isRain ? 'rain' : null;
    if (type) {
      if (!current || current.type !== type) {
        if (current) out.push(current);
        current = { start: h, end: h, type, peakIntensity: h.precipitation };
      } else {
        current.end = h;
        current.peakIntensity = Math.max(current.peakIntensity, h.precipitation);
      }
    } else if (current) {
      out.push(current);
      current = null;
    }
  }
  if (current) out.push(current);
  return out;
}

function intensityWord(mm: number, type: 'rain' | 'snow' | 'storm'): string {
  if (type === 'storm') return mm > 5 ? 'severe storms' : 'thunderstorms';
  if (type === 'snow') {
    if (mm < 1) return 'light snow';
    if (mm < 4) return 'steady snow';
    return 'heavy snow';
  }
  if (mm < 0.5) return 'light rain';
  if (mm < 2) return 'showers';
  if (mm < 5) return 'steady rain';
  return 'heavy rain';
}

export function summarize(bundle: WeatherBundle): WeatherStory {
  const { current, hourly, daily, location } = bundle;
  const tz = location.timezone;
  const condition = getCondition(current.weatherCode);

  const windows = findPrecipWindows(hourly);
  const today: DailyPoint | undefined = daily[0];
  const tomorrow: DailyPoint | undefined = daily[1];

  // ---- Headline ---------------------------------------------------------
  let headline: string;
  if (windows.length === 0 && current.windSpeed < 25) {
    headline = `${condition.label}. ${describeFeel(current.feelsLike, current.temperature, bundle.units)}`;
  } else if (windows.length > 0) {
    const w = windows[0];
    const start = phraseHour(localHour(w.start.time, tz));
    const end = phraseHour(localHour(w.end.time, tz));
    headline =
      w.start === w.end
        ? `${capitalize(intensityWord(w.peakIntensity, w.type))} around ${start}.`
        : `${capitalize(intensityWord(w.peakIntensity, w.type))} from ${start} to ${end}.`;
  } else {
    headline = `${condition.label}, breezy with winds near ${Math.round(current.windSpeed)} ${bundle.units === 'metric' ? 'km/h' : 'mph'}.`;
  }

  // ---- Narrative --------------------------------------------------------
  const sentences: string[] = [];
  if (today) {
    const range = `${Math.round(today.temperatureMin)}°–${Math.round(today.temperatureMax)}°`;
    sentences.push(`Highs near ${Math.round(today.temperatureMax)}° with overnight lows around ${Math.round(today.temperatureMin)}° (${range} day range).`);
  }
  if (windows.length === 0 && tomorrow) {
    const tCond = getCondition(tomorrow.weatherCode);
    sentences.push(`Tomorrow turns ${tCond.label.toLowerCase()} with a high of ${Math.round(tomorrow.temperatureMax)}°.`);
  }
  if (current.uvIndex >= 8) {
    sentences.push(`UV is extreme at ${Math.round(current.uvIndex)} — limit unprotected exposure.`);
  } else if (current.uvIndex >= 6) {
    sentences.push(`UV is high (${Math.round(current.uvIndex)}); sunscreen recommended.`);
  }
  if (current.windGust > 50) {
    sentences.push(`Watch for gusts to ${Math.round(current.windGust)} ${bundle.units === 'metric' ? 'km/h' : 'mph'}.`);
  }

  // ---- Highlights -------------------------------------------------------
  const highlights: WeatherStory['highlights'] = [];
  for (const w of windows.slice(0, 3)) {
    const start = phraseHour(localHour(w.start.time, tz));
    const end = phraseHour(localHour(w.end.time, tz));
    const verb = w.start === w.end ? `near ${start}` : `${start} → ${end}`;
    highlights.push({
      time: verb,
      text: `${capitalize(intensityWord(w.peakIntensity, w.type))} (peak ${w.peakIntensity.toFixed(1)} ${bundle.units === 'metric' ? 'mm' : 'in'})`,
    });
  }

  // Temperature swing alert
  if (today && tomorrow && Math.abs(tomorrow.temperatureMax - today.temperatureMax) >= 8) {
    const diff = Math.round(tomorrow.temperatureMax - today.temperatureMax);
    highlights.push({
      time: 'Tomorrow',
      text: diff > 0 ? `Warming ${diff}° vs. today` : `Cooling ${Math.abs(diff)}° vs. today`,
    });
  }

  // ---- Advice -----------------------------------------------------------
  const advice = adviseWardrobe(bundle);

  return { headline, narrative: sentences.join(' '), highlights, advice };
}

function describeFeel(feels: number, actual: number, _units: 'metric' | 'imperial'): string {
  const delta = feels - actual;
  if (Math.abs(delta) < 2) return `Feels close to actual at ${Math.round(actual)}°.`;
  if (delta < 0) return `Feels colder than actual — ${Math.round(feels)}° vs ${Math.round(actual)}°.`;
  return `Feels warmer than actual — ${Math.round(feels)}° vs ${Math.round(actual)}°.`;
}

function adviseWardrobe(b: WeatherBundle): string {
  const t = b.current.feelsLike;
  const metric = b.units === 'metric';
  const cold = metric ? t < 5 : t < 41;
  const cool = metric ? t < 15 : t < 59;
  const warm = metric ? t < 26 : t < 79;
  const hot = !warm;
  const wet = b.current.precipitation > 0 || (b.hourly.slice(0, 6).some(h => h.precipitationProbability > 50));
  const windy = b.current.windSpeed > (metric ? 30 : 18);

  if (cold) return wet ? 'Insulated waterproof shell, gloves, and a warm hat.' : 'Heavy coat and layers — bitter air outside.';
  if (cool) return wet ? 'Light jacket and an umbrella you trust.' : windy ? 'Layer up — wind makes it feel sharper than it reads.' : 'A jacket or sweater will be just right.';
  if (warm) return wet ? 'Breathable rain layer; expect on-and-off showers.' : 'Comfortable in light layers; sunglasses for the bright stretches.';
  if (hot) return 'Stay hydrated and seek shade midday — hot and exposed.';
  return 'Dress to taste — conditions are mild.';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
