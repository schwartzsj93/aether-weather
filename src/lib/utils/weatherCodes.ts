/**
 * WMO weather interpretation codes — used by Open-Meteo and most ECMWF/GFS
 * derived providers. We map each code to a human label, an icon family,
 * a Tailwind gradient class, and a "mood" word the AI summarizer can use.
 *
 * Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */

export type IconKey =
  | 'sun'
  | 'moon'
  | 'partly-cloudy-day'
  | 'partly-cloudy-night'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavy-rain'
  | 'snow'
  | 'sleet'
  | 'thunder'
  | 'thunder-hail';

export interface WeatherCondition {
  label: string;
  icon: IconKey;
  /** Day gradient (CSS) — used by DynamicBackground */
  gradientDay: string;
  /** Night gradient (CSS) */
  gradientNight: string;
  mood: string;
}

const FALLBACK: WeatherCondition = {
  label: 'Unknown',
  icon: 'cloud',
  gradientDay: 'linear-gradient(160deg, #1e293b 0%, #0f172a 100%)',
  gradientNight: 'linear-gradient(160deg, #020617 0%, #050714 100%)',
  mood: 'quiet',
};

const CODES: Record<number, WeatherCondition> = {
  0: {
    label: 'Clear',
    icon: 'sun',
    gradientDay: 'linear-gradient(160deg, #1d4ed8 0%, #38bdf8 50%, #fde68a 100%)',
    gradientNight: 'linear-gradient(160deg, #020617 0%, #1e1b4b 60%, #312e81 100%)',
    mood: 'crystalline',
  },
  1: {
    label: 'Mostly Clear',
    icon: 'partly-cloudy-day',
    gradientDay: 'linear-gradient(160deg, #1e40af 0%, #38bdf8 60%, #e0f2fe 100%)',
    gradientNight: 'linear-gradient(160deg, #020617 0%, #1e293b 100%)',
    mood: 'bright',
  },
  2: {
    label: 'Partly Cloudy',
    icon: 'partly-cloudy-day',
    gradientDay: 'linear-gradient(160deg, #1e3a8a 0%, #475569 100%)',
    gradientNight: 'linear-gradient(160deg, #020617 0%, #1e293b 100%)',
    mood: 'mixed',
  },
  3: {
    label: 'Overcast',
    icon: 'cloud',
    gradientDay: 'linear-gradient(160deg, #334155 0%, #64748b 100%)',
    gradientNight: 'linear-gradient(160deg, #020617 0%, #0f172a 100%)',
    mood: 'leaden',
  },
  45: { label: 'Fog', icon: 'fog', gradientDay: 'linear-gradient(160deg,#475569,#94a3b8)', gradientNight: 'linear-gradient(160deg,#0f172a,#334155)', mood: 'shrouded' },
  48: { label: 'Rime Fog', icon: 'fog', gradientDay: 'linear-gradient(160deg,#475569,#cbd5e1)', gradientNight: 'linear-gradient(160deg,#0f172a,#334155)', mood: 'icy' },
  51: { label: 'Light Drizzle', icon: 'drizzle', gradientDay: 'linear-gradient(160deg,#1e293b,#475569)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'misty' },
  53: { label: 'Drizzle', icon: 'drizzle', gradientDay: 'linear-gradient(160deg,#1e293b,#475569)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'damp' },
  55: { label: 'Heavy Drizzle', icon: 'drizzle', gradientDay: 'linear-gradient(160deg,#0f172a,#334155)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'soaking' },
  56: { label: 'Freezing Drizzle', icon: 'sleet', gradientDay: 'linear-gradient(160deg,#1e293b,#7dd3fc)', gradientNight: 'linear-gradient(160deg,#0f172a,#1e3a8a)', mood: 'glazing' },
  57: { label: 'Freezing Drizzle', icon: 'sleet', gradientDay: 'linear-gradient(160deg,#1e293b,#7dd3fc)', gradientNight: 'linear-gradient(160deg,#0f172a,#1e3a8a)', mood: 'glazing' },
  61: { label: 'Light Rain', icon: 'rain', gradientDay: 'linear-gradient(160deg,#1e3a8a,#475569)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'rainy' },
  63: { label: 'Rain', icon: 'rain', gradientDay: 'linear-gradient(160deg,#1e3a8a,#334155)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'steady rain' },
  65: { label: 'Heavy Rain', icon: 'heavy-rain', gradientDay: 'linear-gradient(160deg,#0f172a,#1e3a8a)', gradientNight: 'linear-gradient(160deg,#020617,#1e1b4b)', mood: 'pouring' },
  66: { label: 'Freezing Rain', icon: 'sleet', gradientDay: 'linear-gradient(160deg,#1e293b,#7dd3fc)', gradientNight: 'linear-gradient(160deg,#0f172a,#1e3a8a)', mood: 'glaze ice' },
  67: { label: 'Freezing Rain', icon: 'sleet', gradientDay: 'linear-gradient(160deg,#1e293b,#7dd3fc)', gradientNight: 'linear-gradient(160deg,#0f172a,#1e3a8a)', mood: 'glaze ice' },
  71: { label: 'Light Snow', icon: 'snow', gradientDay: 'linear-gradient(160deg,#475569,#cbd5e1)', gradientNight: 'linear-gradient(160deg,#0f172a,#334155)', mood: 'snowy' },
  73: { label: 'Snow', icon: 'snow', gradientDay: 'linear-gradient(160deg,#334155,#e2e8f0)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'snowy' },
  75: { label: 'Heavy Snow', icon: 'snow', gradientDay: 'linear-gradient(160deg,#1e293b,#f1f5f9)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'blizzard' },
  77: { label: 'Snow Grains', icon: 'snow', gradientDay: 'linear-gradient(160deg,#475569,#cbd5e1)', gradientNight: 'linear-gradient(160deg,#0f172a,#334155)', mood: 'flurries' },
  80: { label: 'Rain Showers', icon: 'rain', gradientDay: 'linear-gradient(160deg,#1e3a8a,#38bdf8)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'showers' },
  81: { label: 'Rain Showers', icon: 'rain', gradientDay: 'linear-gradient(160deg,#1e3a8a,#0ea5e9)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'showers' },
  82: { label: 'Violent Showers', icon: 'heavy-rain', gradientDay: 'linear-gradient(160deg,#0f172a,#1e3a8a)', gradientNight: 'linear-gradient(160deg,#020617,#1e1b4b)', mood: 'torrential' },
  85: { label: 'Snow Showers', icon: 'snow', gradientDay: 'linear-gradient(160deg,#334155,#e2e8f0)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'snowy' },
  86: { label: 'Heavy Snow Showers', icon: 'snow', gradientDay: 'linear-gradient(160deg,#1e293b,#f1f5f9)', gradientNight: 'linear-gradient(160deg,#020617,#1e293b)', mood: 'snow-heavy' },
  95: { label: 'Thunderstorm', icon: 'thunder', gradientDay: 'linear-gradient(160deg,#1e1b4b,#7c3aed)', gradientNight: 'linear-gradient(160deg,#020617,#581c87)', mood: 'electric' },
  96: { label: 'Thunder w/ Hail', icon: 'thunder-hail', gradientDay: 'linear-gradient(160deg,#1e1b4b,#a855f7)', gradientNight: 'linear-gradient(160deg,#020617,#581c87)', mood: 'violent' },
  99: { label: 'Severe Thunder', icon: 'thunder-hail', gradientDay: 'linear-gradient(160deg,#0f172a,#7c3aed)', gradientNight: 'linear-gradient(160deg,#020617,#581c87)', mood: 'severe' },
};

export function getCondition(code: number): WeatherCondition {
  return CODES[code] ?? FALLBACK;
}

export function nightVariant(icon: IconKey): IconKey {
  if (icon === 'sun') return 'moon';
  if (icon === 'partly-cloudy-day') return 'partly-cloudy-night';
  return icon;
}
