import * as Tabs from '@radix-ui/react-tabs';
import * as Slider from '@radix-ui/react-slider';
import { Globe2, Layers, Map as MapIcon, Radar, Satellite, Wind } from 'lucide-react';
import { useAppStore, type MapLayer, type MapZoomTier } from '@/store/appStore';
import { cn } from '@/lib/utils/cn';

// Only layers actually rendered by WeatherMap. Temp / Clouds are still pending
// (deck.gl heatmap + raster shading from Open-Meteo's grid).
const LAYERS: { key: MapLayer; label: string; icon: React.ReactNode }[] = [
  { key: 'radar',     label: 'Radar',     icon: <Radar className="h-4 w-4" /> },
  { key: 'satellite', label: 'Satellite', icon: <Satellite className="h-4 w-4" /> },
  { key: 'wind',      label: 'Wind',      icon: <Wind className="h-4 w-4" /> },
];

const TIERS: { key: MapZoomTier; label: string; icon: React.ReactNode }[] = [
  { key: 'global',  label: 'Global',  icon: <Globe2 className="h-3.5 w-3.5" /> },
  { key: 'country', label: 'Country', icon: <MapIcon className="h-3.5 w-3.5" /> },
  { key: 'state',   label: 'State',   icon: <Layers className="h-3.5 w-3.5" /> },
  { key: 'local',   label: 'Local',   icon: <MapIcon className="h-3.5 w-3.5" /> },
];

export function LayerControl() {
  const layer = useAppStore((s) => s.activeLayer);
  const tier = useAppStore((s) => s.zoomTier);
  const opacity = useAppStore((s) => s.radarOpacity);
  const setLayer = useAppStore((s) => s.setActiveLayer);
  const setTier = useAppStore((s) => s.setZoomTier);
  const setOpacity = useAppStore((s) => s.setRadarOpacity);

  return (
    <div className="flex flex-col gap-3 glass-strong rounded-2xl p-3">
      <Tabs.Root value={layer} onValueChange={(v) => setLayer(v as MapLayer)}>
        <Tabs.List className="flex items-center gap-1 rounded-xl bg-black/30 p-1">
          {LAYERS.map((l) => (
            <Tabs.Trigger
              key={l.key}
              value={l.key}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/65 transition',
                'data-[state=active]:bg-sky-400/20 data-[state=active]:text-sky-100'
              )}
            >
              {l.icon}
              <span className="hidden sm:inline">{l.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </Tabs.Root>

      <div className="flex items-center gap-2">
        {TIERS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTier(t.key)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] uppercase tracking-wider transition',
              tier === t.key ? 'bg-white/12 text-white' : 'text-white/55 hover:text-white'
            )}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="px-1">
        <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-white/50">
          <span>Layer opacity</span>
          <span>{Math.round(opacity * 100)}%</span>
        </div>
        <Slider.Root
          value={[opacity]}
          min={0} max={1} step={0.01}
          onValueChange={(v) => setOpacity(v[0])}
          className="relative flex h-4 w-full touch-none items-center"
        >
          <Slider.Track className="relative h-1 w-full rounded-full bg-white/10">
            <Slider.Range className="absolute h-1 rounded-full bg-sky-400/80" />
          </Slider.Track>
          <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-sky-300 shadow ring-2 ring-sky-300/30 focus:outline-none" aria-label="Opacity" />
        </Slider.Root>
      </div>
    </div>
  );
}
