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
  showLightning: boolean;
  notifyHour: number | null;

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
  toggleLightning: () => void;
  setNotifyHour: (h: number | null) => void;
}

const DEFAULT_LOCATIONS: Location[] = [
  { id: '4888426', name: 'Highland Park', latitude: 42.1817, longitude: -87.8003, timezone: 'America/Chicago', country: 'United States', countryCode: 'US', admin1: 'Illinois' },
  { id: '4887398', name: 'Chicago', latitude: 41.8781, longitude: -87.6298, timezone: 'America/Chicago', country: 'United States', countryCode: 'US', admin1: 'Illinois' },
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
      showLightning: false,
      notifyHour: null,

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
      toggleLightning: () => set((s) => ({ showLightning: !s.showLightning })),
      setNotifyHour: (h) => set({ notifyHour: h }),
    }),
    {
      name: 'aether-app',
      version: 3,
      migrate: (persisted: unknown, fromVersion: number) => {
        const s = (persisted ?? {}) as Partial<AppState>;
        // v1→v2: fix unsupported activeLayer values
        const SUPPORTED: MapLayer[] = ['radar', 'satellite', 'wind'];
        if (s.activeLayer && !SUPPORTED.includes(s.activeLayer as MapLayer)) {
          s.activeLayer = 'radar';
        }
        // v2→v3: reset locations to Highland Park + Chicago defaults
        if (fromVersion < 3) {
          s.locations = DEFAULT_LOCATIONS;
          s.activeLocationId = DEFAULT_LOCATIONS[0].id;
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
        showLightning: s.showLightning,
        notifyHour: s.notifyHour,
      }),
    }
  )
);

export function useActiveLocation(): Location | undefined {
  return useAppStore((s) => s.locations.find((l) => l.id === s.activeLocationId));
}
