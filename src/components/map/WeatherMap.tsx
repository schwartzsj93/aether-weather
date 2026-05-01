/**
 * Interactive WebGL map.
 *
 * Architecture:
 *   • MapLibre vector basemap (CARTO dark or MapTiler when keyed)
 *   • RainViewer rasters (radar / IR satellite) with pre-loaded frames so
 *     the playback is buttery-smooth and there's no flash on scrub
 *   • Open-Meteo derived overlays (temperature heatmap, wind particles)
 *     via deck.gl wired through MapLibre's IControl interface
 *
 * Frames for the active loop are kept on the map at all times — only the
 * `raster-opacity` for the visible frame is set to `radarOpacity`, the
 * others are 0. That way scrubbing is just a paint-property update, no
 * source swap required.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import { Maximize2, MapPin } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useRadarManifest } from '@/hooks/useWeather';
import { buildRadarTileUrl, buildSatelliteTileUrl, type RadarFrame } from '@/lib/api/rainviewer';
import { getBasemapStyle } from './basemap';
import { LayerControl } from './LayerControl';
import { RadarTimeline } from './RadarTimeline';
import { WindOverlay } from './WindOverlay';
import type { Location } from '@/types/weather';

interface Props {
  location: Location;
}

const ZOOM_TIER_LEVELS = { global: 1.6, country: 4, state: 7, local: 11 } as const;

export function WeatherMap({ location }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  // Mirror of mapRef used by child overlays — refs don't trigger re-renders, so
  // the child wouldn't otherwise know when the map became available.
  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);

  const layer = useAppStore((s) => s.activeLayer);
  const tier = useAppStore((s) => s.zoomTier);
  const opacity = useAppStore((s) => s.radarOpacity);
  const showLabels = useAppStore((s) => s.showLabels);

  const manifest = useRadarManifest();
  const frames: RadarFrame[] = useMemo(() => {
    if (!manifest.data) return [];
    if (layer === 'satellite') return manifest.data.satellite.past;
    if (layer === 'radar') return [...manifest.data.radar.past, ...manifest.data.radar.nowcast];
    return [];
  }, [manifest.data, layer]);
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => { setFrameIndex(Math.max(0, frames.length - 4)); }, [frames.length]);

  // -------------------- Initialise the map ------------------------------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: getBasemapStyle(showLabels),
      center: [location.longitude, location.latitude],
      zoom: ZOOM_TIER_LEVELS[tier],
      attributionControl: { compact: true },
      cooperativeGestures: false,
      maxPitch: 60,
    });
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    mapRef.current = m;
    setMapInstance(m);
    return () => {
      m.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restyle when label preference flips
  useEffect(() => {
    mapRef.current?.setStyle(getBasemapStyle(showLabels));
  }, [showLabels]);

  // -------------------- Active location marker --------------------------
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    if (markerRef.current) markerRef.current.remove();

    const el = document.createElement('div');
    el.className = 'aether-marker';
    el.innerHTML = `
      <div class="absolute -inset-3 rounded-full bg-sky-400/30 animate-ping"></div>
      <div class="relative h-3 w-3 rounded-full bg-sky-300 shadow-[0_0_18px_rgba(125,211,252,0.9)]"></div>
    `;
    el.style.position = 'relative';
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([location.longitude, location.latitude])
      .addTo(m);

    m.flyTo({
      center: [location.longitude, location.latitude],
      zoom: ZOOM_TIER_LEVELS[tier],
      duration: 1400,
      essential: true,
    });
  }, [location, tier]);

  // -------------------- Sync zoom-tier presets --------------------------
  useEffect(() => {
    mapRef.current?.easeTo({ zoom: ZOOM_TIER_LEVELS[tier], duration: 900 });
  }, [tier]);

  // -------------------- Add / refresh frame layers ----------------------
  useEffect(() => {
    const m = mapRef.current;
    const data = manifest.data;
    if (!m || !data || frames.length === 0) return;

    const ensure = () => {
      // Remove any prior frame layers/sources
      const style = m.getStyle();
      style.layers
        ?.filter((l) => l.id.startsWith('rv-frame-'))
        .forEach((l) => m.removeLayer(l.id));
      Object.keys(style.sources ?? {})
        .filter((id) => id.startsWith('rv-frame-'))
        .forEach((id) => m.removeSource(id));

      frames.forEach((f, i) => {
        const sourceId = `rv-frame-${i}`;
        const url =
          layer === 'satellite'
            ? buildSatelliteTileUrl(data.satellite, f, 512)
            : buildRadarTileUrl(data.radar, f, { size: 512, color: 4, smooth: true, snow: true });

        m.addSource(sourceId, {
          type: 'raster',
          tiles: [url],
          tileSize: 256,
          attribution: '© <a href="https://www.rainviewer.com/api.html">RainViewer</a>',
        });
        m.addLayer({
          id: sourceId,
          type: 'raster',
          source: sourceId,
          paint: {
            'raster-opacity': i === frameIndex ? opacity : 0,
            'raster-opacity-transition': { duration: 250 },
            'raster-fade-duration': 0,
          },
        });
      });
    };

    if (m.isStyleLoaded()) ensure();
    else m.once('load', ensure);
    // We intentionally exclude `frameIndex` and `opacity` — those are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, layer, manifest.data]);

  // Adjust raster-opacity when the active frame or opacity changes
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    frames.forEach((_, i) => {
      const id = `rv-frame-${i}`;
      if (m.getLayer(id)) {
        m.setPaintProperty(id, 'raster-opacity', i === frameIndex ? opacity : 0);
      }
    });
  }, [frameIndex, opacity, frames]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-[var(--radius-card)]">
      {/* MapLibre's stylesheet forces `position: relative` onto the container,
          which overrides Tailwind's `absolute inset-0` and collapses the
          element to 0×0. We anchor it explicitly with h-full / w-full instead. */}
      <div ref={containerRef} className="h-full w-full" />

      {/* layered map chrome */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/55" />

      <div className="pointer-events-auto absolute left-3 top-3 z-10 w-[min(92%,360px)]">
        <LayerControl />
      </div>

      <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-2">
        <button
          onClick={() => mapRef.current?.flyTo({ center: [location.longitude, location.latitude], zoom: ZOOM_TIER_LEVELS.local })}
          className="flex items-center gap-1.5 rounded-full glass-strong px-3 py-1.5 text-xs text-white/85 hover:text-white"
          aria-label="Recenter"
        >
          <MapPin className="h-3.5 w-3.5 text-sky-300" /> Recenter
        </button>
        <button
          onClick={() => containerRef.current?.requestFullscreen()}
          className="flex h-8 w-8 items-center justify-center rounded-full glass-strong text-white/80 hover:text-white"
          aria-label="Fullscreen map"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {(layer === 'radar' || layer === 'satellite') && frames.length > 0 && (
        <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10">
          <RadarTimeline frames={frames} index={frameIndex} onChange={setFrameIndex} />
        </div>
      )}

      {/* Wind particle overlay — mounted always, only renders when active so
          flicking back to it is instant (no re-fetch). */}
      <WindOverlay map={mapInstance} active={layer === 'wind'} opacity={opacity} />

      {layer === 'wind' && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full glass-strong px-3 py-1.5 text-[11px] uppercase tracking-widest text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]" />
          Live wind · 10 m AGL
        </div>
      )}
    </div>
  );
}
