/**
 * NOAA / National Weather Service alerts adapter.
 *
 * Free, keyless, life-safety official source. Coverage: US + territories.
 * https://www.weather.gov/documentation/services-web-api
 *
 * The NWS API requires a User-Agent identifying your app. Browsers block
 * setting User-Agent — but they happily accept the request without one,
 * so we just pass `Accept: application/geo+json` and rely on the standard
 * UA. (For server-side usage, set User-Agent explicitly.)
 *
 * Locations outside US/territories return an empty list — never an error.
 */

import { getJson } from './http';
import type { Coordinates, SevereAlert } from '@/types/weather';

const ENDPOINT = 'https://api.weather.gov/alerts/active';

interface NWSResponse {
  features: Array<{
    id: string;
    properties: {
      event: string;
      headline: string;
      description: string;
      severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme' | 'Unknown';
      onset?: string;
      ends?: string;
      sent: string;
      senderName?: string;
    };
  }>;
}

const SEVERITY_MAP: Record<string, SevereAlert['severity']> = {
  Minor: 'minor',
  Moderate: 'moderate',
  Severe: 'severe',
  Extreme: 'extreme',
  Unknown: 'minor',
};

export async function fetchAlerts({ latitude, longitude }: Coordinates): Promise<SevereAlert[]> {
  // NWS only covers US + territories. Skip the call entirely for points clearly outside.
  if (!isLikelyUSTerritory(latitude, longitude)) return [];

  try {
    const params = new URLSearchParams({ point: `${latitude.toFixed(4)},${longitude.toFixed(4)}` });
    const res = await getJson<NWSResponse>(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: 'application/geo+json' },
      timeoutMs: 8_000,
    });

    return res.features.map((f) => ({
      id: f.id,
      event: f.properties.event,
      severity: SEVERITY_MAP[f.properties.severity] ?? 'minor',
      headline: f.properties.headline,
      description: f.properties.description,
      start: f.properties.onset ?? f.properties.sent,
      end: f.properties.ends ?? f.properties.onset ?? f.properties.sent,
      source: f.properties.senderName ?? 'NWS',
    }));
  } catch {
    // Alerts are nice-to-have. A failed call should never block the dashboard.
    return [];
  }
}

/**
 * Cheap rectangular pre-filter so we don't waste an HTTP round trip on
 * locations the NWS clearly doesn't cover. Includes CONUS + Alaska + Hawaii
 * + Puerto Rico/USVI + Guam/CNMI + American Samoa.
 */
function isLikelyUSTerritory(lat: number, lon: number): boolean {
  // CONUS
  if (lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66) return true;
  // Alaska
  if (lat >= 51 && lat <= 72 && lon >= -180 && lon <= -129) return true;
  if (lat >= 51 && lat <= 72 && lon >= 172 && lon <= 180) return true; // Aleutian wrap
  // Hawaii
  if (lat >= 18 && lat <= 23 && lon >= -161 && lon <= -154) return true;
  // Puerto Rico + USVI
  if (lat >= 17 && lat <= 19 && lon >= -68 && lon <= -64) return true;
  // Guam + CNMI
  if (lat >= 13 && lat <= 21 && lon >= 144 && lon <= 146) return true;
  // American Samoa
  if (lat >= -15 && lat <= -10 && lon >= -171 && lon <= -168) return true;
  return false;
}
