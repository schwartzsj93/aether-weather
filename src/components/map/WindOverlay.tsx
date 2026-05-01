/**
 * WindOverlay — animated GPU wind particles riding the MapLibre map.
 *
 * Architecture:
 *
 *   1. Hook into the host MapLibre instance and add a `MapboxOverlay` (deck.gl
 *      → MapLibre adapter) as a Map control. deck.gl renders into the same
 *      WebGL context as the basemap, so there's no extra canvas and no z-order
 *      gymnastics.
 *
 *   2. Whenever the user stops panning/zooming for a moment, fetch a wind grid
 *      from Open-Meteo for the current viewport (with a generous margin so
 *      pans don't immediately re-fetch).
 *
 *   3. Seed a particle pool against that grid and run a CPU advection loop
 *      via requestAnimationFrame. Each frame we rebuild a `LineLayer` from
 *      the particles' (prev → current) positions; the trail effect is the
 *      cumulative result of thousands of overlapping single-segment lines.
 *
 *   4. Tear everything down on unmount or when the map style is replaced
 *      (which silently destroys our control otherwise).
 */

import { useEffect, useRef } from 'react';
import type { Map as MLMap } from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { LineLayer } from '@deck.gl/layers';
import {
  buildLineFrame,
  seedParticles,
  stepParticles,
  type Particle,
} from '@/lib/wind/particleField';
import { fetchWindGrid, type WindGrid } from '@/lib/api/openMeteoGrid';

interface Props {
  map: MLMap | null;
  /** 0..1 — scales line opacity. */
  opacity?: number;
  /** Number of tracer particles. ~3000–6000 is the sweet spot. */
  particleCount?: number;
  /** True if this overlay should be rendering. When false, layers are removed
   *  but the overlay control stays mounted (so toggling is instant). */
  active: boolean;
}

const REFETCH_DEBOUNCE_MS = 700;
const VIEWPORT_MARGIN = 0.25; // 25% margin around the visible bbox

export function WindOverlay({ map, opacity = 0.9, particleCount = 4500, active }: Props) {
  const overlayRef = useRef<MapboxOverlay | null>(null);
  const gridRef = useRef<WindGrid | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const fetchTimerRef = useRef<number | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const activeRef = useRef(active);
  const opacityRef = useRef(opacity);

  // Track refs so the long-lived RAF loop sees current values without
  // re-subscribing to props.
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { opacityRef.current = opacity; }, [opacity]);

  // -------------------- Mount the deck.gl control -----------------------
  useEffect(() => {
    if (!map) return;

    const overlay = new MapboxOverlay({
      interleaved: true, // render between basemap layers (under labels)
      layers: [],
    });
    overlayRef.current = overlay;
    map.addControl(overlay);

    return () => {
      try { map.removeControl(overlay); } catch { /* map may already be torn down */ }
      overlayRef.current = null;
    };
  }, [map]);

  // -------------------- Re-fetch on viewport idle -----------------------
  useEffect(() => {
    if (!map) return;

    const scheduleFetch = () => {
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = window.setTimeout(async () => {
        const bounds = map.getBounds();
        const w = bounds.getWest();
        const e = bounds.getEast();
        const s = bounds.getSouth();
        const n = bounds.getNorth();

        // Pad the bbox so users can pan a bit without triggering a re-fetch.
        // Latitude clamps to [-85, 85] (Mercator limit).
        const dLng = (e - w) * VIEWPORT_MARGIN;
        const dLat = (n - s) * VIEWPORT_MARGIN;
        const bbox: [number, number, number, number] = [
          w - dLng,
          Math.max(-85, s - dLat),
          e + dLng,
          Math.min(85, n + dLat),
        ];

        // Cancel any in-flight fetch — we've moved on.
        fetchAbortRef.current?.abort();
        const ac = new AbortController();
        fetchAbortRef.current = ac;

        try {
          const grid = await fetchWindGrid(bbox, { signal: ac.signal });
          gridRef.current = grid;
          particlesRef.current = seedParticles(grid, particleCount);
        } catch (err) {
          if ((err as Error).name !== 'AbortError') {
            // Graceful: we just skip this frame's update — particles keep
            // riding the prior grid until the next move-end.
            console.warn('[WindOverlay] grid fetch failed', err);
          }
        }
      }, REFETCH_DEBOUNCE_MS);
    };

    // Initial seed once the map has dimensions.
    if (map.loaded()) scheduleFetch();
    else map.once('load', scheduleFetch);
    map.on('moveend', scheduleFetch);

    return () => {
      map.off('moveend', scheduleFetch);
      if (fetchTimerRef.current) window.clearTimeout(fetchTimerRef.current);
      fetchAbortRef.current?.abort();
    };
  }, [map, particleCount]);

  // -------------------- Drive the animation loop ------------------------
  useEffect(() => {
    if (!map) return;

    const tick = () => {
      const overlay = overlayRef.current;
      const grid = gridRef.current;
      const particles = particlesRef.current;

      // Inactive (different layer selected) → blank the overlay cheaply.
      if (!activeRef.current) {
        overlay?.setProps({ layers: [] });
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      if (overlay && grid && particles.length > 0) {
        stepParticles(particles, grid);
        const { sourcePositions, targetPositions, colors } = buildLineFrame(
          particles,
          opacityRef.current
        );

        const layer = new LineLayer({
          id: 'wind-particles',
          data: { length: particles.length },
          getSourcePosition: (_d: unknown, info: { index: number }) => [
            sourcePositions[info.index * 2],
            sourcePositions[info.index * 2 + 1],
          ],
          getTargetPosition: (_d: unknown, info: { index: number }) => [
            targetPositions[info.index * 2],
            targetPositions[info.index * 2 + 1],
          ],
          getColor: (_d: unknown, info: { index: number }) => [
            colors[info.index * 4],
            colors[info.index * 4 + 1],
            colors[info.index * 4 + 2],
            colors[info.index * 4 + 3],
          ],
          getWidth: 1.5,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          parameters: { depthTest: false },
          updateTriggers: {
            // Force per-frame buffer rebuild — particles moved.
            getSourcePosition: sourcePositions,
            getTargetPosition: targetPositions,
            getColor: colors,
          },
        });

        overlay.setProps({ layers: [layer] });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [map]);

  return null;
}
