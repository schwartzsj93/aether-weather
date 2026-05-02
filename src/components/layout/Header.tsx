import { Search, Sun, Moon } from 'lucide-react';
import * as Switch from '@radix-ui/react-switch';
import { useAppStore } from '@/store/appStore';
import { cn } from '@/lib/utils/cn';

interface Props {
  onSearch: () => void;
}

export function Header({ onSearch }: Props) {
  const units = useAppStore((s) => s.units);
  const setUnits = useAppStore((s) => s.setUnits);

  return (
    <header className="flex items-center justify-between gap-4 px-1 py-3">
      <div className="flex items-center gap-3">
        <Logo />
        <div className="hidden flex-col leading-tight md:flex">
          <span className="text-sm font-semibold tracking-wide">Aether</span>
          <span className="text-[10px] uppercase tracking-[0.25em] text-white/45">Weather Intelligence</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSearch}
          className={cn(
            'group flex items-center gap-2 rounded-full glass-strong px-3 py-2',
            'text-sm text-white/75 hover:text-white'
          )}
        >
          <Search className="h-4 w-4 text-white/60 group-hover:text-sky-300" />
          <span className="hidden md:inline">Search any location…</span>
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/55 md:inline">⌘K</kbd>
        </button>

        <div className="flex items-center gap-2 rounded-full glass px-2.5 py-1.5 text-xs">
          <span className={cn('px-1', units === 'imperial' ? 'text-white' : 'text-white/45')}>°F</span>
          <Switch.Root
            checked={units === 'metric'}
            onCheckedChange={(v) => setUnits(v ? 'metric' : 'imperial')}
            className="relative h-4 w-7 rounded-full bg-white/15 outline-none data-[state=checked]:bg-sky-400/70"
          >
            <Switch.Thumb className="block h-3 w-3 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-3.5" />
          </Switch.Root>
          <span className={cn('px-1', units === 'metric' ? 'text-white' : 'text-white/45')}>°C</span>
        </div>

        {/* Settings placeholder — keeps the right side balanced */}
        {/* <button className="flex h-9 w-9 items-center justify-center rounded-full glass text-white/75 hover:text-white" aria-label="Settings"><Settings className="h-4 w-4" /></button> */}
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/40 via-sky-300/20 to-violet-400/30 shadow-inner">
      <Sun className="absolute h-4 w-4 -translate-x-1 -translate-y-0.5 text-amber-200" strokeWidth={2} />
      <Moon className="absolute h-3 w-3 translate-x-1.5 translate-y-1 text-sky-100" strokeWidth={2} />
    </div>
  );
}
