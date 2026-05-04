/**
 * Domain types for Aether.
 * These are intentionally provider-agnostic — adapter layers translate
 * Open-Meteo / Tomorrow.io / Visual Crossing payloads into these shapes,
 * so swapping the data source never bleeds into the UI.
 */

export type Units = 'metric' | 'imperial';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Location extends Coordinates {
  id: string;
  name: string;
  admin1?: string;
  country?: string;
  countryCode?: string;
  timezone: string;
}

export interface CurrentConditions {
  time: string;            // ISO timestamp at the location's timezone
  temperature: number;
  feelsLike: number;
  humidity: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;   // degrees
  windGust: number;
  pressure: number;        // hPa
  cloudCover: number;      // %
  visibility: number;      // km (or mi when imperial)
  uvIndex: number;
  isDay: boolean;
  weatherCode: number;     // WMO code
}

export interface HourlyPoint {
  time: string;
  temperature: number;
  feelsLike: number;
  precipitation: number;
  precipitationProbability: number;
  windSpeed: number;
  windDirection: number;
  weatherCode: number;
  isDay: boolean;
  uvIndex: number;
}

export interface DailyPoint {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitationSum: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustMax: number;
  uvIndexMax: number;
  weatherCode: number;
  sunrise: string;
  sunset: string;
  moonPhase?: number;      // 0..1
}

export interface AirQuality {
  time: string;
  europeanAqi: number;
  usAqi: number;
  pm10: number;
  pm25: number;
  ozone: number;
  no2: number;
  pollen?: {
    grass: number;
    tree: number;
    weed: number;
  };
}

export interface SevereAlert {
  id: string;
  event: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  headline: string;
  description: string;
  start: string;
  end: string;
  source: string;
}

export interface WeatherBundle {
  location: Location;
  units: Units;
  current: CurrentConditions;
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  alerts: SevereAlert[];
  airQuality?: AirQuality;
  fetchedAt: number;
}
