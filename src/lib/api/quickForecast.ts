/**
 * Minimal Open-Meteo fetch for a clicked map point.
 *
 * Returns current conditions + next 12 hours without going through the full
 * WeatherBundle pipeline — this keeps the map popup snappy.
 */

import type { Units } from '@/types/weather';

export interface QuickHour {
  time: string;
  temp: number;
  weatherCode: number;
  isDay: boolean;
  precipProb: number;
}

export interface QuickForecast {
  lat: number;
  lon: number;
  locationName: string;
  temp: number;
  feelsLike: number;
  weatherCode: number;
  isDay: boolean;
  windSpeed: number;
  humidity: number;
  units: Units;
  next12h: QuickHour[];
}

export async function fetchQuickForecast(
  lat: number,
  lon: number,
  units: Units,
  locationName: string,
  signal?: AbortSignal,
): Promise<QuickForecast> {
  const params = new URLSearchParams({
    latitude:      String(lat),
    longitude:     String(lon),
    timezone:      'auto',
    forecast_days: '2',
    current:       [
      'temperature_2m', 'apparent_temperature', 'weather_code',
      'is_day', 'wind_speed_10m', 'relative_humidity_2m',
    ].join(','),
    hourly: [
      'temperature_2m', 'weather_code', 'is_day', 'precipitation_probability',
    ].join(','),
    ...(units === 'imperial'
      ? { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' }
      : {}),
  });

  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?${params}`,
    { signal },
  );
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  const data = await res.json() as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
      is_day: number;
      wind_speed_10m: number;
      relative_humidity_2m: number;
    };
    hourly: {
      time: string[];
      temperature_2m: number[];
      weather_code: number[];
      is_day: number[];
      precipitation_probability: number[];
    };
  };

  // Align to the current hour
  const nowHour = new Date().toISOString().slice(0, 13);
  const startIdx = Math.max(
    0,
    data.hourly.time.findIndex((t) => t.startsWith(nowHour)),
  );

  const next12h: QuickHour[] = data.hourly.time
    .slice(startIdx, startIdx + 12)
    .map((t, idx) => ({
      time:        t,
      temp:        data.hourly.temperature_2m[startIdx + idx],
      weatherCode: data.hourly.weather_code[startIdx + idx],
      isDay:       data.hourly.is_day[startIdx + idx] === 1,
      precipProb:  data.hourly.precipitation_probability[startIdx + idx] ?? 0,
    }));

  return {
    lat, lon, locationName, units,
    temp:        data.current.temperature_2m,
    feelsLike:   data.current.apparent_temperature,
    weatherCode: data.current.weather_code,
    isDay:       data.current.is_day === 1,
    windSpeed:   data.current.wind_speed_10m,
    humidity:    data.current.relative_humidity_2m,
    next12h,
  };
}
