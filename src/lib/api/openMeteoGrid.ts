/**
 * Open-Meteo grid sampler.
 *
 * Open-Meteo accepts comma-separated `latitude` and `longitude` query params,
 * returning the requested current/hourly fields for each point in one shot.
 * We use this to build a coarse N×M wind-vector grid covering the visible map
 * viewport, which the deck.gl particle layer then bilinearly interpolates and
 * advects against.
 *
 * Wind direction in Open-Meteo is the **meteorological "from" direction** in
 * degrees (0° = wind from north). To convert to the (u, v) cartesian vector
 * used by particle advection (u = eastward, v = northward in m/s):
 *
 *     u = -speed * sin(direction · π/180)
 *     v = -speed * cos(direction · π/180)
 *
 * The negation flips "from" → "to" — the direction the air is moving.
 */

import { getJson } from './http';

export interface WindGrid {
  /** Bounding box: [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
  cols: number;
  rows: number;
  /** Lng of column c. lngs[0] = minLng, lngs[cols-1] = maxLng */
  lngs: Float32Array;
  /** Lat of row r. lats[0] = minLat, lats[rows-1] = maxLat */
  lats: Float32Array;
  /** Eastward wind component (m/s). Row-major: idx = r * cols + c */
  u: Float32Array;
  /** Northward wind component (m/s). Row-major: idx = r * cols + c */
  v: Float32Array;
  /** Maximum |speed| in the grid — useful for color/opacity ramps */
  maxSpeed: number;
  fetchedAt: number;
}

interface OMGridResponse {
  // When you pass comma-separated coords Open-Meteo returns an array of objects,
  // one per point, each with the full `current` block at that location.
  // (Single-point requests return a bare object instead.)
  current: { wind_speed_10m: number; wind_direction_10m: number };
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Fetch wind vectors for a regular `cols × rows` grid covering `bbox`.
 *
 * Defaults to 14×10 = 140 points which fits well within Open-Meteo's request
 * budget and decodes in well under a second over a normal connection. The
 * grid is intentionally coarse — bilinear interpolation in the particle layer
 * smooths it visually.
 */
export async function fetchWindGrid(
  bbox: [number, number, number, number],
  opts: { cols?: number; rows?: number; signal?: AbortSignal } = {}
): Promise<WindGrid> {
  const cols = opts.cols ?? 14;
  const rows = opts.rows ?? 10;

  const [minLng, minLat, maxLng, maxLat] = bbox;

  const lngs = new Float32Array(cols);
  const lats = new Float32Array(rows);
  for (let c = 0; c < cols; c++) {
    lngs[c] = minLng + (c / (cols - 1)) * (maxLng - minLng);
  }
  for (let r = 0; r < rows; r++) {
    lats[r] = minLat + (r / (rows - 1)) * (maxLat - minLat);
  }

  // Flatten to per-point lat,lng lists in row-major order.
  const latList: string[] = [];
  const lngList: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      latList.push(lats[r].toFixed(3));
      lngList.push(lngs[c].toFixed(3));
    }
  }

  // Always m/s for math — the particle simulator is unit-locked to that.
  const params = new URLSearchParams({
    latitude: latList.join(','),
    longitude: lngList.join(','),
    current: 'wind_speed_10m,wind_direction_10m',
    wind_speed_unit: 'ms',
  });

  const res = await getJson<OMGridResponse[] | OMGridResponse>(
    `${FORECAST_URL}?${params.toString()}`,
    opts.signal ? { signal: opts.signal } : {}
  );

  // Normalize: a single-point response is an object, not an array.
  const points = Array.isArray(res) ? res : [res];

  const u = new Float32Array(cols * rows);
  const v = new Float32Array(cols * rows);
  let maxSpeed = 0;

  for (let i = 0; i < points.length && i < u.length; i++) {
    const speed = points[i].current?.wind_speed_10m ?? 0;
    const dirDeg = points[i].current?.wind_direction_10m ?? 0;
    const rad = (dirDeg * Math.PI) / 180;
    // Negate "from" → "to": the vector the air is travelling along.
    u[i] = -speed * Math.sin(rad);
    v[i] = -speed * Math.cos(rad);
    if (speed > maxSpeed) maxSpeed = speed;
  }

  return { bbox, cols, rows, lngs, lats, u, v, maxSpeed, fetchedAt: Date.now() };
}
