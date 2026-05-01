/**
 * Open-Meteo adapter.
 *
 * Open-Meteo is keyless, free for non-commercial use, and pulls from the
 * ECMWF, GFS, ICON, GEM, and JMA models. We request the units variant the
 * caller asks for and translate the response into our internal types.
 */

import { getJson } from './http';
import type {
  AirQuality,
  CurrentConditions,
  DailyPoint,
  HourlyPoint,
  Location,
  Units,
  WeatherBundle,
} from '@/types/weather';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

interface OMForecastResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    precipitation: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    surface_pressure: number;
    cloud_cover: number;
    visibility?: number;
    uv_index?: number;
    is_day: number;
    weather_code: number;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    precipitation: number[];
    precipitation_probability: number[];
    wind_speed_10m: number[];
    wind_direction_10m: number[];
    weather_code: number[];
    is_day: number[];
    uv_index: number[];
    visibility?: number[];
  };
  daily: {
    time: string[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
    wind_speed_10m_max: number[];
    wind_gusts_10m_max: number[];
    uv_index_max: number[];
    weather_code: number[];
    sunrise: string[];
    sunset: string[];
  };
}

interface OMAirQualityResponse {
  current: {
    time: string;
    european_aqi: number;
    us_aqi: number;
    pm10: number;
    pm2_5: number;
    ozone: number;
    nitrogen_dioxide: number;
    grass_pollen?: number;
    birch_pollen?: number;
    ragweed_pollen?: number;
  };
}

function unitParams(units: Units): Record<string, string> {
  return units === 'imperial'
    ? {
        temperature_unit: 'fahrenheit',
        wind_speed_unit: 'mph',
        precipitation_unit: 'inch',
      }
    : {
        temperature_unit: 'celsius',
        wind_speed_unit: 'kmh',
        precipitation_unit: 'mm',
      };
}

export async function fetchWeather(location: Location, units: Units): Promise<WeatherBundle> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    forecast_days: '10',
    current: [
      'temperature_2m',
      'apparent_temperature',
      'relative_humidity_2m',
      'precipitation',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'surface_pressure',
      'cloud_cover',
      'visibility',
      'uv_index',
      'is_day',
      'weather_code',
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation',
      'precipitation_probability',
      'wind_speed_10m',
      'wind_direction_10m',
      'weather_code',
      'is_day',
      'uv_index',
      'visibility',
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max',
      'wind_speed_10m_max',
      'wind_gusts_10m_max',
      'uv_index_max',
      'weather_code',
      'sunrise',
      'sunset',
    ].join(','),
    ...unitParams(units),
  });

  const res = await getJson<OMForecastResponse>(`${FORECAST_URL}?${params.toString()}`);

  const current: CurrentConditions = {
    time: res.current.time,
    temperature: res.current.temperature_2m,
    feelsLike: res.current.apparent_temperature,
    humidity: res.current.relative_humidity_2m,
    precipitation: res.current.precipitation,
    windSpeed: res.current.wind_speed_10m,
    windDirection: res.current.wind_direction_10m,
    windGust: res.current.wind_gusts_10m,
    pressure: res.current.surface_pressure,
    cloudCover: res.current.cloud_cover,
    visibility: (res.current.visibility ?? 10_000) / 1000, // meters → km
    uvIndex: res.current.uv_index ?? 0,
    isDay: res.current.is_day === 1,
    weatherCode: res.current.weather_code,
  };

  const hourly: HourlyPoint[] = res.hourly.time.map((t, i) => ({
    time: t,
    temperature: res.hourly.temperature_2m[i],
    precipitation: res.hourly.precipitation[i],
    precipitationProbability: res.hourly.precipitation_probability[i] ?? 0,
    windSpeed: res.hourly.wind_speed_10m[i],
    windDirection: res.hourly.wind_direction_10m[i],
    weatherCode: res.hourly.weather_code[i],
    isDay: res.hourly.is_day[i] === 1,
    uvIndex: res.hourly.uv_index[i] ?? 0,
  }));

  const daily: DailyPoint[] = res.daily.time.map((d, i) => ({
    date: d,
    temperatureMax: res.daily.temperature_2m_max[i],
    temperatureMin: res.daily.temperature_2m_min[i],
    precipitationSum: res.daily.precipitation_sum[i],
    precipitationProbabilityMax: res.daily.precipitation_probability_max[i] ?? 0,
    windSpeedMax: res.daily.wind_speed_10m_max[i],
    windGustMax: res.daily.wind_gusts_10m_max[i],
    uvIndexMax: res.daily.uv_index_max[i] ?? 0,
    weatherCode: res.daily.weather_code[i],
    sunrise: res.daily.sunrise[i],
    sunset: res.daily.sunset[i],
    moonPhase: estimateMoonPhase(d),
  }));

  return {
    location,
    units,
    current,
    hourly,
    daily,
    alerts: [],            // populated by warnings provider (future)
    fetchedAt: Date.now(),
  };
}

export async function fetchAirQuality(location: Location): Promise<AirQuality | undefined> {
  try {
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      timezone: location.timezone,
      current: 'european_aqi,us_aqi,pm10,pm2_5,ozone,nitrogen_dioxide,grass_pollen,birch_pollen,ragweed_pollen',
    });
    const res = await getJson<OMAirQualityResponse>(`${AIR_QUALITY_URL}?${params.toString()}`);
    return {
      time: res.current.time,
      europeanAqi: res.current.european_aqi,
      usAqi: res.current.us_aqi,
      pm10: res.current.pm10,
      pm25: res.current.pm2_5,
      ozone: res.current.ozone,
      no2: res.current.nitrogen_dioxide,
      pollen:
        res.current.grass_pollen !== undefined
          ? {
              grass: res.current.grass_pollen ?? 0,
              tree: res.current.birch_pollen ?? 0,
              weed: res.current.ragweed_pollen ?? 0,
            }
          : undefined,
    };
  } catch {
    return undefined;
  }
}

/**
 * Cheap astronomical moon-phase estimate based on the synodic month.
 * Returns 0..1 where 0 = new moon, 0.5 = full moon. Plenty good enough for UI.
 */
function estimateMoonPhase(isoDate: string): number {
  const synodic = 29.530588853;
  const ref = Date.UTC(2000, 0, 6, 18, 14); // known new moon
  const delta = (new Date(isoDate).getTime() - ref) / 86_400_000;
  return ((delta / synodic) % 1 + 1) % 1;
}
