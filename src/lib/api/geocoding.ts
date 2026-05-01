/**
 * Open-Meteo geocoding adapter — autocompletes location names and returns
 * canonical coordinates + IANA timezone (which the forecast endpoint requires).
 */

import { getJson } from './http';
import type { Location } from '@/types/weather';

const SEARCH_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const REVERSE_URL = 'https://geocoding-api.open-meteo.com/v1/reverse';

interface GeoResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
  country?: string;
  country_code?: string;
  admin1?: string;
}

interface GeoResponse {
  results?: GeoResult[];
}

function toLocation(g: GeoResult): Location {
  return {
    id: String(g.id),
    name: g.name,
    latitude: g.latitude,
    longitude: g.longitude,
    timezone: g.timezone,
    country: g.country,
    countryCode: g.country_code,
    admin1: g.admin1,
  };
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<Location[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const params = new URLSearchParams({ name: trimmed, count: '8', language: 'en', format: 'json' });
  const res = await getJson<GeoResponse>(
    `${SEARCH_URL}?${params.toString()}`,
    signal ? { signal } : {}
  );
  return (res.results ?? []).map(toLocation);
}

export async function reverseGeocode(lat: number, lon: number): Promise<Location | undefined> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    count: '1',
    language: 'en',
    format: 'json',
  });
  try {
    const res = await getJson<GeoResponse>(`${REVERSE_URL}?${params.toString()}`);
    const first = res.results?.[0];
    return first ? toLocation(first) : undefined;
  } catch {
    return undefined;
  }
}
