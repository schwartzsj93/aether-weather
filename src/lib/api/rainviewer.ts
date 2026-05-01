/**
 * RainViewer adapter — free global radar tile loops with ~10 min cadence.
 * https://www.rainviewer.com/api.html
 *
 * The API returns a manifest with the latest 12 past frames + ~3 forecast
 * (nowcast) frames. We pass these to MapLibre as raster source URLs.
 */

import { getJson } from './http';

export type RadarColorScheme =
  | 0  // Black & White
  | 1  // Original (default)
  | 2  // Universal Blue
  | 3  // TITAN
  | 4  // The Weather Channel
  | 5  // Meteored
  | 6  // NEXRAD Level III
  | 7  // Rainbow @ SELEX-IS
  | 8; // Dark Sky

export interface RadarFrame {
  /** Unix seconds */
  time: number;
  /** Path fragment used to compose the tile URL */
  path: string;
}

export interface RadarManifest {
  host: string;
  past: RadarFrame[];
  nowcast: RadarFrame[];
}

interface RVResponse {
  host: string;
  radar: {
    past: RadarFrame[];
    nowcast: RadarFrame[];
  };
  satellite: {
    infrared: RadarFrame[];
  };
}

const ENDPOINT = 'https://api.rainviewer.com/public/weather-maps.json';

let cache: { data: { radar: RadarManifest; satellite: RadarManifest }; expires: number } | null = null;

export async function fetchRadarManifest(): Promise<{ radar: RadarManifest; satellite: RadarManifest }> {
  if (cache && cache.expires > Date.now()) return cache.data;
  const res = await getJson<RVResponse>(ENDPOINT);
  const data = {
    radar: { host: res.host, past: res.radar.past, nowcast: res.radar.nowcast },
    satellite: { host: res.host, past: res.satellite.infrared, nowcast: [] },
  };
  cache = { data, expires: Date.now() + 60_000 }; // refresh every minute
  return data;
}

/**
 * Build a tile URL template MapLibre can consume. RainViewer uses 256-px tiles
 * with `{z}/{x}/{y}` and a couple of style flags.
 */
export function buildRadarTileUrl(
  manifest: RadarManifest,
  frame: RadarFrame,
  opts: { size?: 256 | 512; color?: RadarColorScheme; smooth?: boolean; snow?: boolean } = {}
): string {
  const { size = 512, color = 4, smooth = true, snow = true } = opts;
  return `${manifest.host}${frame.path}/${size}/{z}/{x}/{y}/${color}/${smooth ? 1 : 0}_${snow ? 1 : 0}.png`;
}

export function buildSatelliteTileUrl(manifest: RadarManifest, frame: RadarFrame, size: 256 | 512 = 512): string {
  return `${manifest.host}${frame.path}/${size}/{z}/{x}/{y}/0/0_0.png`;
}
