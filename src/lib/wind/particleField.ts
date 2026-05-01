/**
 * Wind particle field — CPU simulator that advects thousands of point
 * particles through a bilinearly-sampled wind vector field.
 *
 * Render strategy: pair each particle with its previous tick's position so the
 * UI can draw a short line segment. With ~4000 particles at slightly staggered
 * ages, the cumulative effect is a streaming flow-field — the look popularized
 * by earth.nullschool.net and Windy.
 *
 * Coordinate handling: u/v are m/s in geographic space, but particle positions
 * are lng/lat (degrees). Lng degree size shrinks with latitude, so we convert
 * meters → degrees per-particle using cos(lat). Latitudes near the poles get
 * extra protection against runaway lng motion.
 */

import type { WindGrid } from '@/lib/api/openMeteoGrid';

/** A single tracer particle. */
export interface Particle {
  lng: number;
  lat: number;
  /** Position one tick ago — used to draw the trail segment. */
  prevLng: number;
  prevLat: number;
  /** Ticks lived. Particle respawns when age >= maxAge. */
  age: number;
  maxAge: number;
  /** Cached wind speed at last sample (m/s) — used for color/opacity. */
  speed: number;
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * Bilinear-interpolate the (u, v) wind vector at an arbitrary (lng, lat).
 * Returns [0, 0] when the point falls outside the grid.
 */
export function sampleWind(grid: WindGrid, lng: number, lat: number): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = grid.bbox;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) {
    return [0, 0];
  }

  const fx = ((lng - minLng) / (maxLng - minLng)) * (grid.cols - 1);
  const fy = ((lat - minLat) / (maxLat - minLat)) * (grid.rows - 1);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, grid.cols - 1);
  const y1 = Math.min(y0 + 1, grid.rows - 1);

  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = y0 * grid.cols + x0;
  const i10 = y0 * grid.cols + x1;
  const i01 = y1 * grid.cols + x0;
  const i11 = y1 * grid.cols + x1;

  const u = lerp2d(grid.u[i00], grid.u[i10], grid.u[i01], grid.u[i11], tx, ty);
  const v = lerp2d(grid.v[i00], grid.v[i10], grid.v[i01], grid.v[i11], tx, ty);

  return [u, v];
}

function lerp2d(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number) {
  const top = v00 * (1 - tx) + v10 * tx;
  const bot = v01 * (1 - tx) + v11 * tx;
  return top * (1 - ty) + bot * ty;
}

/** Random initial age so particles don't all respawn in lockstep. */
function randomAge(maxAge: number) {
  return Math.floor(Math.random() * maxAge);
}

/** Random spawn position uniformly inside the grid bbox. */
function randomSpawn(grid: WindGrid): { lng: number; lat: number } {
  const [minLng, minLat, maxLng, maxLat] = grid.bbox;
  return {
    lng: minLng + Math.random() * (maxLng - minLng),
    lat: minLat + Math.random() * (maxLat - minLat),
  };
}

/**
 * Initialize a fresh particle pool spread uniformly across the grid.
 * Ages are randomized so the first frame already shows a steady-state field
 * rather than every particle being born at once.
 */
export function seedParticles(grid: WindGrid, count: number, maxAge = 90): Particle[] {
  const out: Particle[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const { lng, lat } = randomSpawn(grid);
    out[i] = {
      lng,
      lat,
      prevLng: lng,
      prevLat: lat,
      age: randomAge(maxAge),
      maxAge,
      speed: 0,
    };
  }
  return out;
}

/** Re-spawn one particle in place (mutates). */
function respawn(p: Particle, grid: WindGrid) {
  const { lng, lat } = randomSpawn(grid);
  p.lng = lng;
  p.lat = lat;
  p.prevLng = lng;
  p.prevLat = lat;
  p.age = 0;
  p.speed = 0;
}

/**
 * Advance every particle by one tick.
 *
 * @param speedScale  How aggressively the field flows. Roughly: 1 m/s of wind
 *                    moves the particle by `speedScale` seconds of motion per
 *                    tick. 0.6–1.2 looks good at typical zoom levels.
 */
export function stepParticles(particles: Particle[], grid: WindGrid, speedScale = 0.9): void {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];

    // Stash previous position before mutating — used by the renderer for the
    // short trail segment.
    p.prevLng = p.lng;
    p.prevLat = p.lat;

    const [u, v] = sampleWind(grid, p.lng, p.lat);
    const speed = Math.sqrt(u * u + v * v);
    p.speed = speed;

    // Convert m/s → degrees. Latitude is straightforward; longitude shrinks
    // with cos(lat). Clamp the cosine away from zero so polar particles
    // don't shoot to infinity.
    const cosLat = Math.max(0.05, Math.cos((p.lat * Math.PI) / 180));
    const dLat = (v * speedScale) / METERS_PER_DEG_LAT;
    const dLng = (u * speedScale) / (METERS_PER_DEG_LAT * cosLat);

    p.lat += dLat;
    p.lng += dLng;
    p.age += 1;

    // Respawn if expired, stalled in dead air, or drifted outside the grid.
    const [minLng, minLat, maxLng, maxLat] = grid.bbox;
    const outside = p.lng < minLng || p.lng > maxLng || p.lat < minLat || p.lat > maxLat;
    const stalled = speed < 0.05;
    if (p.age >= p.maxAge || outside || (stalled && p.age > 5)) {
      respawn(p, grid);
    }
  }
}

/**
 * Pack the live particles into the parallel arrays deck.gl's LineLayer wants
 * (sourcePositions, targetPositions, colors). One allocation per frame is
 * fine; deck.gl uploads directly to a GPU buffer.
 */
export function buildLineFrame(particles: Particle[], opacity = 0.85) {
  const n = particles.length;
  const sourcePositions = new Float32Array(n * 2);
  const targetPositions = new Float32Array(n * 2);
  const colors = new Uint8Array(n * 4);

  for (let i = 0; i < n; i++) {
    const p = particles[i];
    sourcePositions[i * 2] = p.prevLng;
    sourcePositions[i * 2 + 1] = p.prevLat;
    targetPositions[i * 2] = p.lng;
    targetPositions[i * 2 + 1] = p.lat;

    const [r, g, b] = colorForSpeed(p.speed);
    // Fade in over the first 6 ticks, then hold steady.
    const fadeIn = Math.min(1, p.age / 6);
    const a = Math.round(255 * opacity * fadeIn);
    colors[i * 4] = r;
    colors[i * 4 + 1] = g;
    colors[i * 4 + 2] = b;
    colors[i * 4 + 3] = a;
  }

  return { sourcePositions, targetPositions, colors };
}

/**
 * Simple speed → color ramp. Sub-Beaufort 4 stays cool blue; gale force
 * pushes into ember orange. The thresholds (m/s) approximate the Beaufort
 * scale band edges.
 */
function colorForSpeed(speedMs: number): [number, number, number] {
  // Anchor stops in m/s.
  const stops: [number, [number, number, number]][] = [
    [0,  [125, 211, 252]],   // calm — sky-300
    [4,  [129, 199, 255]],   // light breeze — sky
    [8,  [165, 180, 252]],   // moderate — indigo-300
    [13, [192, 132, 252]],   // strong — purple-400
    [18, [244, 114, 182]],   // gale — pink-400
    [25, [251, 146, 60]],    // storm — orange-400
  ];
  if (speedMs <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (speedMs <= stops[i][0]) {
      const [s0, c0] = stops[i - 1];
      const [s1, c1] = stops[i];
      const t = (speedMs - s0) / (s1 - s0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return stops[stops.length - 1][1];
}
