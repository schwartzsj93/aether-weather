/**
 * Real-time lightning strike overlay powered by the Blitzortung network.
 *
 * Connects to a public Blitzortung WebSocket relay and paints each incoming
 * strike as a GeoJSON circle on the MapLibre canvas.  Strikes age out after
 * 15 minutes: brand-new ones are bright yellow (large), older ones fade to
 * pale blue (small), so the map shows a living picture of recent activity.
 *
 * The WebSocket is opened only while `active` is true and closed on teardown.
 * Multiple port fallbacks handle the occasional server rotation.
 */

import { useEffect, useRef } from 'react';
import type { Map as MLMap, GeoJSONSource } from 'maplibre-gl';

interface Strike {
  lat: number;
  lon: number;
  time: number; // ms since epoch
}

const SOURCE_ID   = 'lightning-strikes';
const LAYER_DOTS  = 'lightning-dots';
const LAYER_HALO  = 'lightning-halo';
const MAX_AGE_MS  = 15 * 60 * 1000;
const UPDATE_MS   = 4_000;

// Rotate through several relay ports — first reachable one wins.
const WS_URLS = [8084, 8085, 8086, 8087, 8088].map(
  (p) => `wss://ws.blitzortung.org:${p}/`,
);

interface Props {
  map: MLMap | null;
  active: boolean;
}

export function LightningOverlay({ map, active }: Props) {
  const strikesRef  = useRef<Strike[]>([]);
  const wsRef       = useRef<WebSocket | null>(null);
  const urlIdxRef   = useRef(0);

  // Add source + layers once the map style is ready.
  useEffect(() => {
    if (!map) return;
    const setup = () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      // Halo behind each dot (fades quickly for new strikes)
      map.addLayer({
        id: LAYER_HALO,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius':  ['case', ['get', 'isNew'], 14, 6],
          'circle-color':   '#fef08a',
          'circle-opacity': ['*', ['get', 'opacity'], ['case', ['get', 'isNew'], 0.35, 0]],
          'circle-blur':    1,
        },
        layout: { visibility: active ? 'visible' : 'none' },
      });
      // Solid dot
      map.addLayer({
        id: LAYER_DOTS,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius':         ['case', ['get', 'isNew'], 5, 3],
          'circle-color':          ['case', ['get', 'isNew'], '#fef08a', '#bae6fd'],
          'circle-opacity':        ['get', 'opacity'],
          'circle-stroke-color':   '#ffffff',
          'circle-stroke-width':   0.5,
          'circle-stroke-opacity': ['*', ['get', 'opacity'], 0.5],
        },
        layout: { visibility: active ? 'visible' : 'none' },
      });
    };
    if (map.isStyleLoaded()) setup();
    else map.once('style.load', setup);
  }, [map]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle layer visibility as active changes.
  useEffect(() => {
    if (!map) return;
    const vis = active ? 'visible' : 'none';
    if (map.getLayer(LAYER_DOTS)) map.setLayoutProperty(LAYER_DOTS, 'visibility', vis);
    if (map.getLayer(LAYER_HALO)) map.setLayoutProperty(LAYER_HALO, 'visibility', vis);
  }, [map, active]);

  // Periodic GeoJSON update — recalculate age-based opacity every UPDATE_MS.
  useEffect(() => {
    if (!map || !active) return;
    const tick = () => {
      const now = Date.now();
      strikesRef.current = strikesRef.current.filter(
        (s) => now - s.time < MAX_AGE_MS,
      );
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: 'FeatureCollection',
        features: strikesRef.current.map((s) => {
          const age = now - s.time;
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            properties: {
              opacity: Math.max(0.05, 1 - age / MAX_AGE_MS),
              isNew:   age < 30_000,
            },
          };
        }),
      });
    };
    tick();
    const id = setInterval(tick, UPDATE_MS);
    return () => clearInterval(id);
  }, [map, active]);

  // WebSocket connection — open while active, close on deactivate.
  useEffect(() => {
    if (!active) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const url = WS_URLS[urlIdxRef.current % WS_URLS.length];
      urlIdxRef.current++;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Subscribe to the global feed (some servers require this frame).
        ws.send(JSON.stringify({ west: -180, east: 180, north: 90, south: -90 }));
      };

      ws.onmessage = (evt: MessageEvent) => {
        try {
          const d = JSON.parse(evt.data as string);
          if (typeof d.lat !== 'number' || typeof d.lon !== 'number') return;

          // `time` may be nanoseconds (>1e15) or Unix seconds float (<1e12).
          let ms: number;
          if (typeof d.time === 'number') {
            ms = d.time > 1e12 ? d.time / 1e6 : d.time * 1000;
          } else {
            ms = Date.now();
          }
          strikesRef.current.push({ lat: d.lat, lon: d.lon, time: ms });
        } catch {
          // Ignore malformed frames.
        }
      };

      ws.onerror   = () => ws.close();
      ws.onclose   = () => {
        if (!unmounted) setTimeout(connect, 6_000); // reconnect after a pause
      };
    }

    connect();
    return () => {
      unmounted = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [active]);

  return null;
}
