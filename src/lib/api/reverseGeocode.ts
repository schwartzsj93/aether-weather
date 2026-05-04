/**
 * Lightweight reverse-geocoding via OpenStreetMap Nominatim.
 *
 * Results are cached in-memory (module scope) so repeated lookups of the
 * same area don't hammer the API.  The cache key is rounded to ~100 m
 * precision so zooming a few pixels doesn't trigger a second request.
 */

const cache = new Map<string, string>();

export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
      {
        headers: {
          'Accept-Language': 'en-US,en',
          'User-Agent': 'AetherWeather/1.0 (https://github.com/schwartzsj93/aether-weather)',
        },
        signal: AbortSignal.timeout(4000),
      }
    );
    if (!res.ok) throw new Error(res.statusText);
    const data = await res.json() as {
      display_name?: string;
      address?: {
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    };
    const a = data.address ?? {};
    const name =
      a.city ?? a.town ?? a.village ?? a.suburb ??
      a.county ?? a.state ??
      data.display_name?.split(',')[0] ??
      `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    cache.set(key, name);
    return name;
  } catch {
    const fallback = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
    cache.set(key, fallback);
    return fallback;
  }
}
