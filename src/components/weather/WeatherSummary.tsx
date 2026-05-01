import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown, RotateCw, Sparkles } from 'lucide-react';
import { GlassCard } from '@/components/ui/GlassCard';
import { summarize } from '@/lib/ai/summarize';
import type { BriefingTone } from '@/lib/ai/llmSummarize';
import { useWeathermanBriefing } from '@/hooks/useWeathermanBriefing';
import type { WeatherBundle } from '@/types/weather';
import { cn } from '@/lib/utils/cn';

interface Props { bundle: WeatherBundle; }

const TONES: { key: BriefingTone; label: string; sub: string }[] = [
  { key: 'briefing', label: 'Broadcast',   sub: 'Pro 3–4 sentences' },
  { key: 'quick',    label: 'Quick',       sub: 'Two-line teaser' },
  { key: 'deep',     label: 'Deep dive',   sub: 'Why behind the forecast' },
  { key: 'outdoor',  label: 'Outdoors',    sub: 'Trip-planner brief' },
  { key: 'commuter', label: 'Commuter',    sub: 'Rush-hour focused' },
];

/**
 * AI-distilled "weatherman" card.
 *
 * Architecture: structured fields (headline, highlights, advice) come from
 * the deterministic rule-based summarizer so they paint instantly. The
 * narrative paragraph is streamed from Claude when configured; otherwise
 * we fall back to the rule-based narrative.
 */
export function WeatherSummary({ bundle }: Props) {
  const story = useMemo(() => summarize(bundle), [bundle]);
  const [tone, setTone] = useState<BriefingTone>('briefing');
  const briefing = useWeathermanBriefing(bundle, tone);

  const toneMeta = TONES.find((t) => t.key === tone)!;
  const llmActive = briefing.status !== 'disabled';

  // Pick what to display in the narrative slot.
  const narrative =
    briefing.status === 'streaming' ? briefing.text :
    briefing.status === 'done'      ? briefing.text :
    briefing.status === 'error'     ? story.narrative : // fallback gracefully
    /* idle | disabled */             story.narrative;

  const showCaret = briefing.status === 'streaming';

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-white/55">
          <Sparkles className={cn('h-3.5 w-3.5', llmActive ? 'text-sky-300' : 'text-white/40')} />
          AI Forecast Briefing
          {llmActive && (
            <span className={cn(
              'ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wider',
              briefing.status === 'streaming' ? 'bg-sky-400/15 text-sky-200 animate-pulse-soft'
              : briefing.status === 'error'   ? 'bg-rose-400/15 text-rose-200'
              :                                  'bg-emerald-400/10 text-emerald-200/80'
            )}>
              {briefing.status === 'streaming' ? 'LIVE' : briefing.status === 'error' ? 'OFFLINE' : 'CLAUDE'}
            </span>
          )}
        </div>

        {llmActive && (
          <div className="flex items-center gap-1.5">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] uppercase tracking-wider text-white/75 hover:bg-white/10">
                {toneMeta.label} <ChevronDown className="h-3 w-3 opacity-70" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="z-50 min-w-[200px] glass-strong rounded-xl p-1 text-sm shadow-xl"
                >
                  {TONES.map((t) => (
                    <DropdownMenu.Item
                      key={t.key}
                      onSelect={() => setTone(t.key)}
                      className={cn(
                        'flex cursor-pointer flex-col rounded-lg px-3 py-2 outline-none',
                        t.key === tone ? 'bg-sky-400/15 text-sky-100' : 'text-white/85 hover:bg-white/8'
                      )}
                    >
                      <span className="text-sm font-medium">{t.label}</span>
                      <span className="text-[11px] text-white/50">{t.sub}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <button
              onClick={briefing.regenerate}
              disabled={briefing.status === 'streaming'}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/75 transition hover:bg-white/10 disabled:opacity-40"
              aria-label="Regenerate briefing"
              title="Regenerate"
            >
              <RotateCw className={cn('h-3.5 w-3.5', briefing.status === 'streaming' && 'animate-spin')} />
            </button>
          </div>
        )}
      </div>

      <motion.h3
        key={story.headline}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 text-2xl font-medium leading-snug text-white"
      >
        {story.headline}
      </motion.h3>

      {narrative && (
        <p className="mt-2 text-sm leading-relaxed text-white/80">
          {narrative}
          {showCaret && <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 animate-pulse bg-sky-300" />}
        </p>
      )}

      {briefing.status === 'error' && (
        <div className="mt-2 text-[11px] text-rose-300/80">
          {briefing.error} — using rule-based fallback.
        </div>
      )}

      {story.highlights.length > 0 && (
        <ul className="mt-4 space-y-2">
          {story.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 inline-flex w-24 shrink-0 rounded-full bg-sky-400/15 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-sky-200">
                {h.time}
              </span>
              <span className="text-white/80">{h.text}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5 rounded-2xl border border-sky-400/10 bg-sky-400/5 p-3 text-sm text-sky-100/85">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-sky-300">Today’s call</span>
        <div className="mt-1">{story.advice}</div>
      </div>
    </GlassCard>
  );
}
