import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { RadarFrame } from '@/lib/api/rainviewer';
import { cn } from '@/lib/utils/cn';

interface Props {
  frames: RadarFrame[];
  /** Frame currently shown on the map */
  index: number;
  onChange: (i: number) => void;
}

/**
 * Scrubber + play control for the radar/satellite frame loop.
 * Frames are coloured by past/nowcast and labelled with relative time.
 */
export function RadarTimeline({ frames, index, onChange }: Props) {
  const [playing, setPlaying] = useState(true);
  const raf = useRef<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const tick = (now: number) => {
      if (now - last.current > 600) {
        last.current = now;
        onChange((index + 1) % frames.length);
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [playing, frames.length, index, onChange]);

  if (!frames.length) return null;
  const current = frames[index];
  const date = new Date(current.time * 1000);
  const isFuture = current.time * 1000 > Date.now();

  return (
    <div className="flex items-center gap-3 rounded-2xl glass-strong px-3 py-2">
      <button
        onClick={() => setPlaying((p) => !p)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-400/20 text-sky-100 hover:bg-sky-400/30"
        aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={index}
        onChange={(e) => { setPlaying(false); onChange(Number(e.target.value)); }}
        className="flex-1"
        aria-label="Scrub radar timeline"
      />
      <div className={cn('w-24 text-right text-xs tabular-nums', isFuture ? 'text-amber-200' : 'text-white/85')}>
        {isFuture ? 'NOW + ' : ''}
        {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}
