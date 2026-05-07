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
 * Interactive features:
 *   • Click anywhere on the map → reverse-geocode + fetch quick forecast,
 *     shown as a floating popup anchored to the click point.
 *   • Fullscreen button → browser native fullscreen of the map container.
 *
 * Frames for the active loop are kept on the map at all times — only the
 * `raster-opacity` for the visible frame is set to `radarOpacity`, the
 * others are 0. That way scrubbing is just a paint-property update, no
 * source swap required.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import { Maximize2, Minimize2, MapPin } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useRadarManifest } from '@/hooks/useWeather';
import { buildRadarTileUrl, buildSatelliteTileUrl, type RadarFrame } from '@/lib/api/rainviewer';
import { getBasemapStyle } from './basemap';
import { LayerControl } from './LayerControl';
import { RadarTimeline } from './RadarTimeline';
import { WindOverlay } from './WindOverlay';
import { MapClickPopup, type PopupState } from './MapClickPopup';
import { reverseGeocode } from '@/lib/api/reverseGeocode';
import { fetchQuickForecast } from '@/lib/api/quickForecast';
import type { Location, Units } from '@/types/weather';

interface Props {
  location: Location;
  units: Units;
  /** When true the map fills its container edge-to-edge (no card radius).
   *  Used by the dedicated /map route. */
  fullPage?: boolean;
}

const ZOOM_TIER_LEVELS = { global: 1.6, country: 4, state: 7, local: 11 } as const;

export function WeatherMap({ location, units, fullPage = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRootRef   = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<MLMap | null>(null);
  const markerRef    = useRef<maplibregl.Marker | null>(null);

  // Mirror of mapRef used by child overlays — refs don't trigger re-renders,
  // so the child wouldn't otherwise know when the map became available.
  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);

  // Always-current units ref so the click handler closure never goes stale.
  const unitsRef = useRef<Units>(units);
  useEffect(() => { unitsRef.current = units; }, [units]);

  const layer     = useAppStore((s) => s.activeLayer);
  const tier      = useAppStore((s) => s.zoomTier);
  const opacity   = useAppStore((s) => s.radarOpacity);
  const showLabels = useAppStore((s) => s.showLabels);

  const manifest = useRadarManifest();
  const frames: RadarFrame[] = useMemo(() => {
    if (!manifest.data) return [];
    if (layer === 'satellite') return manifest.data.satellite.past;
    if (layer === 'radar')    return [...manifest.data.radar.past, ...manifest.data.radar.nowcast];
    return [];
  }, [manifest.data, layer]);
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => { setFrameIndex(Math.max(0, frames.length - 4)); }, [frames.length]);

  // ── Click popup state ─────────────────────────────────────────────────────
  const [popup, setPopup] = useState<PopupState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fullscreen state ──────────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ── Voice agent: listen for programmatic expand ───────────────────────────
  useEffect(() => {
    const onExpand = () => {
      mapRootRef.current?.requestFullscreen().catch(() => {});
    };
    document.addEventListener('aether:expandMap', onExpand);
    return () => document.removeEventListener('aether:expandMap', onExpand);
  }, []);

  // ── Initialise the map ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const m = new maplibregl.Map({
      container:         containerRef.current,
      style:             getBasemapStyle(showLabels),
      center:            [location.longitude, location.latitude],
      zoom:              ZOOM_TIER_LEVELS[tier],
      attributionControl: { compact: true },
      cooperativeGestures: false,
      maxPitch:          60,
    });
    m.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }),
      'top-right',
    );
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // Change cursor to crosshair to hint map is clickable
    m.getCanvas().style.cursor = 'crosshair';

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

  // ── Active location marker ────────────────────────────────────────────────
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
      center:   [location.longitude, location.latitude],
      zoom:     ZOOM_TIER_LEVELS[tier],
      duration: 1400,
      essential: true,
    });
  }, [location, tier]);

  // ── Sync zoom-tier presets ────────────────────────────────────────────────
  useEffect(() => {
    mapRef.current?.easeTo({ zoom: ZOOM_TIER_LEVELS[tier], duration: 900 });
  }, [tier]);

  // ── Add / refresh frame layers ────────────────────────────────────────────
  useEffect(() => {
    const m    = mapRef.current;
    const data = manifest.data;
    if (!m || !data || frames.length === 0) return;

    const ensure = () => {
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
          type:     'raster',
          tiles:    [url],
          tileSize: 512,
          // RainViewer tiles only go to zoom 6; MapLibre overzooms (scales up)
          // the z=6 tile rather than fetching a z=11 tile that returns
          // "Zoom Level Not Supported".
          maxzoom:  6,
          attribution: '© <a href="https://www.rainviewer.com/api.html">RainViewer</a>',
        });
        m.addLayer({
          id:     sourceId,
          type:   'raster',
          source: sourceId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          paint: {
            'raster-opacity':            i === frameIndex ? opacity : 0,
            'raster-opacity-transition': { duration: 250 },
            'raster-fade-duration':      0,
          } as any,
        });
      });
    };

    if (m.isStyleLoaded()) ensure();
    else m.once('load', ensure);
    // frameIndex and opacity handled in the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, layer, manifest.data]);

  // Adjust raster-opacity when the active frame or opacity slider changes
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

  // ── Map click → reverse-geocode + quick forecast popup ───────────────────
  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;

    const onClick = async (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      const { x, y }    = e.point;

      // Cancel any previous in-flight request
      abortRef.current?.abort();
      const controller  = new AbortController();
      abortRef.current  = controller;

      // Immediately show loading state at the clicked pixel
      setPopup({ screenX: x, screenY: y, loading: true, data: null });

      try {
        const locationName = await reverseGeocode(lat, lng);
        if (controller.signal.aborted) return;

        const data = await fetchQuickForecast(
          lat, lng, unitsRef.current, locationName, controller.signal,
        );
        setPopup({ screenX: x, screenY: y, loading: false, data });
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setPopup((prev) =>
          prev ? { ...prev, loading: false, error: 'Could not load forecast' } : null,
        );
      }
    };

    m.on('click', onClick);
    return () => { m.off('click', onClick); };
  }, [mapInstance]); // mapInstance signals map is ready; units read via unitsRef

  // ── Handlers ─────────────────────────────────────────────────────────────
  const closePopup = () => {
    abortRef.current?.abort();
    setPopup(null);
  };

  const enterFullscreen = () => {
    setPopup(null);
    mapRootRef.current?.requestFullscreen().catch(() => {/* user declined */});
  };

  const exitFullscreen = () => {
    document.exitFullscreen().catch(() => {});
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={mapRootRef}
      className={`relative h-full w-full overflow-hidden ${fullPage ? '' : 'rounded-[var(--radius-card)]'}`}
    >
      {/* MapLibre canvas fills the container */}
      <div ref={containerRef} className="h-full w-full" />

      {/* Vignette gradient */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/55" />

      {/* Layer control — top-left */}
      <div className="pointer-events-auto absolute left-3 top-3 z-10 w-[min(92%,360px)]">
        <LayerControl />
      </div>

      {/* Recenter + Fullscreen buttons — top-right */}
      <div className="pointer-events-auto absolute right-3 top-3 z-10 flex items-center gap-2">
        <button
          onClick={() =>
            mapRef.current?.flyTo({
              center: [location.longitude, location.latitude],
              zoom:   ZOOM_TIER_LEVELS.local,
            })
          }
          className="flex items-center gap-1.5 rounded-full glass-strong px-3 py-1.5 text-xs text-white/85 hover:text-white"
          aria-label="Recenter map"
        >
          <MapPin className="h-3.5 w-3.5 text-sky-300" />
          Recenter
        </button>

        {/* Fullscreen only makes sense on the dashboard — hidden on /map */}
        {!fullPage && (
          <button
            onClick={isFullscreen ? exitFullscreen : enterFullscreen}
            className="flex h-8 w-8 items-center justify-center rounded-full glass-strong text-white/80 hover:text-white"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen map'}
          >
            {isFullscreen
              ? <Minimize2 className="h-3.5 w-3.5" />
              : <Maximize2 className="h-3.5 w-3.5" />
            }
          </button>
        )}
      </div>

      {/* Click-point forecast popup */}
      <div className="pointer-events-none absolute inset-0 z-20">
        <MapClickPopup popup={popup} onClose={closePopup} />
      </div>

      {/* Radar / satellite timeline */}
      {(layer === 'radar' || layer === 'satellite') && frames.length > 0 && (
        <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-10">
          <RadarTimeline frames={frames} index={frameIndex} onChange={setFrameIndex} />
        </div>
      )}

      {/* Wind particle overlay */}
      <WindOverlay map={mapInstance} active={layer === 'wind'} opacity={opacity} />

      {layer === 'wind' && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-2 rounded-full glass-strong px-3 py-1.5 text-[11px] uppercase tracking-widest text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_8px_rgba(125,211,252,0.9)]" />
          Live wind · 10 m AGL
        </div>
      )}

      {/* Click-to-forecast hint (fades away after first popup appears) */}
      {!popup && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 rounded-full glass px-2.5 py-1 text-[11px] text-white/45">
          Click map for local forecast
        </div>
      )}
    </div>
  );
}
