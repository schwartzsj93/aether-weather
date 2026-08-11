import { Plus, X, LocateFixed } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { cn } from '@/lib/utils/cn';

interface Props {
  onSearch: () => void;
}

export function LocationStrip({ onSearch }: Props) {
  const locations = useAppStore((s) => s.locations);
  const active = useAppStore((s) => s.activeLocationId);
  const setActive = useAppStore((s) => s.setActiveLocation);
  const remove = useAppStore((s) => s.removeLocation);
  const { loading: gpsLoading, request: requestGps } = useGeolocation();

  return (
    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
      {locations.map((l) => {
        const isActive = l.id === active;
        return (
          <div key={l.id} className={cn(
            'group flex items-center rounded-full border px-3 py-1.5 text-sm transition',
            isActive
              ? 'border-sky-300/50 bg-sky-300/15 text-white'
              : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
          )}>
            <button onClick={() => setActive(l.id)} className="flex items-center gap-2">
              {isActive && <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />}
              <span>{l.name}</span>
              <span className="text-xs text-white/45">{l.countryCode}</span>
            </button>
            <button
              onClick={() => remove(l.id)}
              className="ml-2 hidden rounded-full p-0.5 text-white/40 hover:bg-white/10 hover:text-white group-hover:inline-flex"
              aria-label={`Remove ${l.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        onClick={onSearch}
        className="flex items-center gap-1 rounded-full border border-dashed border-white/15 px-3 py-1.5 text-sm text-white/65 hover:border-white/30 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
      <button
        onClick={requestGps}
        disabled={gpsLoading}
        title="Use my current location"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-dashed border-white/15 text-white/65 hover:border-sky-300/50 hover:text-sky-300 disabled:opacity-40"
        aria-label="Use current location"
      >
        {gpsLoading
          ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-white/30 border-t-sky-300" />
          : <LocateFixed className="h-3.5 w-3.5" />
        }
      </button>
    </div>
  );
}
