/**
 * MapLibre style — a custom dark vector basemap powered by Carto's free
 * "dark-matter" tiles. No API key required. If `VITE_MAPTILER_KEY` is set
 * we transparently upgrade to MapTiler's higher-fidelity dark style.
 */

import type { StyleSpecification } from 'maplibre-gl';

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

export function getBasemapStyle(showLabels: boolean): StyleSpecification | string {
  if (MAPTILER_KEY) {
    return `https://api.maptiler.com/maps/${showLabels ? 'streets-dark' : 'dataviz-dark'}/style.json?key=${MAPTILER_KEY}`;
  }

  // Carto dark — free, no key required.
  // Style names use underscores (the dash variants return 404).
  const style = showLabels ? 'dark_all' : 'dark_nolabels';
  return {
    version: 8,
    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources: {
      basemap: {
        type: 'raster',
        tiles: [
          `https://a.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png`,
          `https://b.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png`,
          `https://c.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png`,
          `https://d.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png`,
        ],
        tileSize: 256,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors · © <a href="https://carto.com/attributions">CARTO</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#05070f' } },
      { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 0.95 } },
    ],
  };
}
