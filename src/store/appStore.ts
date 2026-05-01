/**
 * Zustand store — persisted to localStorage. Holds saved locations, the
 * active selection, and user preferences.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Location, Units } from '@/types/weather';

// Keep this list in lock-step with the renderers in WeatherMap.tsx — adding a
// new value here is meaningless until the map component knows how to draw it.
// Temperature + cloud overlays are still roadmap (deck.gl heatmap & raster
// shading from Open-Meteo's grid). Wind is live via WindOverlay.
export type MapLayer = 'radar' | 'satellite' | 'wind';
export type MapZoomTier = 'global' | 'country' | 'state' | 'local';

export interface AppState {
  units: Units;
  theme: 'dark' | 'auto';
  locations: Location[];
  activeLocationId: string | null;
  activeLayer: MapLayer;
  zoomTier: MapZoomTier;
  radarOpacity: number;
  showLabels: boolean;
  voiceEnabled: boolean;

  setUnits: (u: Units) => void;
  setTheme: (t: 'dark' | 'auto') => void;
  addLocation: (loc: Location) => void;
  removeLocation: (id: string) => void;
  setActiveLocation: (id: string) => void;
  setActiveLayer: (l: MapLayer) => void;
  setZoomTier: (t: MapZoomTier) => void;
  setRadarOpacity: (n: number) => void;
  toggleLabels: () => void;
  toggleVoice: () => void;
}

const DEFAULT_LOCATIONS: Location[] = [
  { id: '5128581', name: 'New York', latitude: 40.7128, longitude: -74.006, timezone: 'America/New_York', country: 'United States', countryCode: 'US', admin1: 'New York' },
  { id: '2643743', name: 'London', latitude: 51.5074, longitude: -0.1278, timezone: 'Europe/London', country: 'United Kingdom', countryCode: 'GB', admin1: 'England' },
  { id: '1850147', name: 'Tokyo', latitude: 35.6895, longitude: 139.6917, timezone: 'Asia/Tokyo', country: 'Japan', countryCode: 'JP' },
];

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      units: 'imperial',
      theme: 'dark',
      locations: DEFAULT_LOCATIONS,
      activeLocationId: DEFAULT_LOCATIONS[0].id,
      activeLayer: 'radar',
      zoomTier: 'local',
      radarOpacity: 0.75,
      showLabels: true,
      voiceEnabled: false,

      setUnits: (u) => set({ units: u }),
      setTheme: (t) => set({ theme: t }),
      addLocation: (loc) =>
        set((s) =>
          s.locations.some((l) => l.id === loc.id)
            ? { activeLocationId: loc.id }
            : { locations: [...s.locations, loc], activeLocationId: loc.id }
        ),
      removeLocation: (id) =>
        set((s) => {
          const next = s.locations.filter((l) => l.id !== id);
          return {
            locations: next,
            activeLocationId: s.activeLocationId === id ? (next[0]?.id ?? null) : s.activeLocationId,
          };
        }),
      setActiveLocation: (id) => set({ activeLocationId: id }),
      setActiveLayer: (l) => set({ activeLayer: l }),
      setZoomTier: (t) => set({ zoomTier: t }),
      setRadarOpacity: (n) => set({ radarOpacity: Math.min(1, Math.max(0, n)) }),
      toggleLabels: () => set((s) => ({ showLabels: !s.showLabels })),
      toggleVoice: () => set((s) => ({ voiceEnabled: !s.voiceEnabled })),
    }),
    {
      name: 'aether-app',
      version: 2,
      // Migrate older persisted shapes (e.g. activeLayer = 'clouds' from v1)
      // to the current narrower MapLayer union, so reloading after an upgrade
      // doesn't strand the user on an unrenderable layer.
      migrate: (persisted: unknown, _version: number) => {
        const s = (persisted ?? {}) as Partial<AppState>;
        const SUPPORTED: MapLayer[] = ['radar', 'satellite', 'wind'];
        if (s.activeLayer && !SUPPORTED.includes(s.activeLayer as MapLayer)) {
          s.activeLayer = 'radar';
        }
        return s as AppState;
      },
      partialize: (s) => ({
        units: s.units,
        theme: s.theme,
        locations: s.locations,
        activeLocationId: s.activeLocationId,
        activeLayer: s.activeLayer,
        zoomTier: s.zoomTier,
        radarOpacity: s.radarOpacity,
        showLabels: s.showLabels,
        voiceEnabled: s.voiceEnabled,
      }),
    }
  )
);

export function useActiveLocation(): Location | undefined {
  return useAppStore((s) => s.locations.find((l) => l.id === s.activeLocationId));
}
