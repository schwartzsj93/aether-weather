import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { RadarFrame } from '@/lib/api/rainviewer';
import { cn } from '@/lib/utils/cn';

interface Props {
  frames: RadarFrame[];
  /** Frame currently shown on the map */
  index: number;
  onChange: (i: number) => void;
  /** Number of past frames before nowcast/forecast begins. Defaults to all frames (no split shown). */
  pastCount?: number;
}

export function RadarTimeline({ frames, index, onChange, pastCount }: Props) {
  const [playing, setPlaying] = useState(true);
  const raf  = useRef<number | null>(null);
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

  const current   = frames[index];
  const date      = new Date(current.time * 1000);
  const isFuture  = current.time * 1000 > Date.now();
  const total     = frames.length;
  const split     = pastCount ?? total;
  const splitPct  = (split / total) * 100;
  const thumbPct  = total > 1 ? (index / (total - 1)) * 100 : 0;
  const hasFcst   = split > 0 && split < total;

  const seekAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setPlaying(false);
    onChange(Math.round(ratio * (total - 1)));
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl glass-strong px-3 py-2">
      {/* Play / Pause */}
      <button
        onClick={() => setPlaying((p) => !p)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-400/20 text-sky-100 hover:bg-sky-400/30"
        aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      {/* Custom two-tone scrubber */}
      <div
        className="relative flex-1 h-5 cursor-pointer select-none"
        role="slider"
        aria-label="Scrub radar timeline"
        aria-valuemin={0}
        aria-valuemax={total - 1}
        aria-valuenow={index}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); seekAt(e); }}
        onPointerMove={(e) => { if (e.buttons === 1) seekAt(e); }}
      >
        {/* Track (unplayed) */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full">
          <div
            className="h-full w-full"
            style={{
              background: hasFcst
                ? `linear-gradient(to right,
                    rgba(56,189,248,0.30) 0%,
                    rgba(56,189,248,0.30) ${splitPct}%,
                    rgba(251,191,36,0.30) ${splitPct}%,
                    rgba(251,191,36,0.30) 100%)`
                : 'rgba(56,189,248,0.30)',
            }}
          />
        </div>

        {/* Played portion */}
        <div
          className="pointer-events-none absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-l-full"
          style={{
            width: `${thumbPct}%`,
            background: isFuture ? 'rgba(251,191,36,0.85)' : 'rgba(56,189,248,0.85)',
          }}
        />

        {/* FCST boundary tick + label */}
        {hasFcst && (
          <div
            className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${splitPct}%` }}
          >
            <span className="text-[8px] font-bold uppercase leading-none tracking-widest text-amber-300/90">
              FCST
            </span>
            <div className="mt-0.5 h-2 w-px bg-amber-300/60" />
          </div>
        )}

        {/* Thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30"
          style={{
            left:       `${thumbPct}%`,
            background: isFuture ? '#fbbf24' : '#7dd3fc',
            boxShadow:  isFuture
              ? '0 0 8px rgba(251,191,36,0.65)'
              : '0 0 8px rgba(125,211,252,0.65)',
          }}
        />
      </div>

      {/* Timestamp */}
      <div className={cn('w-24 shrink-0 text-right text-xs tabular-nums', isFuture ? 'text-amber-200' : 'text-white/85')}>
        {isFuture ? 'NOW + ' : ''}
        {date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </div>
    </div>
  );
}
