import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { searchLocations } from '@/lib/api/geocoding';
import { useAppStore } from '@/store/appStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import type { Location } from '@/types/weather';
import { cn } from '@/lib/utils/cn';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LocationSearch({ open, onOpenChange }: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const addLocation = useAppStore((s) => s.addLocation);
  const geo = useGeolocation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await searchLocations(q, ctrl.signal);
        setResults(res);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { ctrl.abort(); clearTimeout(t); };
  }, [q]);

  const pick = (loc: Location) => {
    addLocation(loc);
    onOpenChange(false);
    setQ('');
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-[14%] z-50 w-[min(92vw,560px)] -translate-x-1/2',
            'glass-strong rounded-3xl p-2 shadow-2xl'
          )}
        >
          <Dialog.Title className="sr-only">Search locations</Dialog.Title>
          <div className="flex items-center gap-3 px-4 py-2">
            <Search className="h-5 w-5 text-white/60" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search any city, ZIP, or coordinates…"
              className="flex-1 bg-transparent text-base outline-none placeholder:text-white/40"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-white/60" />}
            <Dialog.Close className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="max-h-[50vh] overflow-y-auto px-2 pb-2 no-scrollbar">
            <button
              onClick={() => { geo.request(); onOpenChange(false); }}
              className="mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/8"
            >
              <MapPin className="h-4 w-4 text-sky-300" />
              <div>
                <div className="text-sm font-medium">Use current location</div>
                <div className="text-xs text-white/50">{geo.loading ? 'Locating…' : 'Detect via your device GPS'}</div>
              </div>
            </button>
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => pick(r)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-white/8"
              >
                <div>
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-xs text-white/50">
                    {[r.admin1, r.country].filter(Boolean).join(', ')}
                  </div>
                </div>
                <div className="text-xs text-white/40">{r.timezone}</div>
              </button>
            ))}
            {!loading && q && results.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-white/50">No matches.</div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
