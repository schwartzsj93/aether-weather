/**
 * useWeathermanBriefing
 *
 * Owns the lifecycle of a streaming Claude briefing:
 *  - debounces (re)starts when the bundle/tone changes
 *  - caches results in sessionStorage keyed by location + tone + hour-bucket
 *  - exposes streaming text + status + a regenerate() callback
 *  - returns `disabled` cleanly when no API key is configured (UI hides the LLM strip)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLLMEnabled, streamBriefing, type BriefingTone } from '@/lib/ai/llmSummarize';
import type { WeatherBundle } from '@/types/weather';

type Status = 'disabled' | 'idle' | 'streaming' | 'done' | 'error';

interface BriefingState {
  text: string;
  status: Status;
  error?: string;
  regenerate: () => void;
}

const CACHE_PREFIX = 'aether-briefing:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h

interface CachedEntry { text: string; createdAt: number; }

function cacheKey(bundle: WeatherBundle, tone: BriefingTone): string {
  const hourBucket = Math.floor(bundle.fetchedAt / (30 * 60 * 1000)); // 30-min granularity
  return `${CACHE_PREFIX}${bundle.location.id}:${bundle.units}:${tone}:${hourBucket}`;
}

function readCache(key: string): string | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as CachedEntry;
    if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry.text;
  } catch {
    return null;
  }
}

function writeCache(key: string, text: string): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ text, createdAt: Date.now() } satisfies CachedEntry));
  } catch { /* quota — ignore */ }
}

export function useWeathermanBriefing(
  bundle: WeatherBundle | undefined,
  tone: BriefingTone
): BriefingState {
  const enabled = isLLMEnabled();
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>(enabled ? 'idle' : 'disabled');
  const [error, setError] = useState<string | undefined>(undefined);
  const ctrlRef = useRef<AbortController | null>(null);
  const nonce = useRef(0); // forces fresh stream when user hits regenerate

  const run = useCallback((b: WeatherBundle, t: BriefingTone, bypassCache = false) => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;

    const key = cacheKey(b, t);
    if (!bypassCache) {
      const cached = readCache(key);
      if (cached) {
        setText(cached);
        setStatus('done');
        setError(undefined);
        return;
      }
    }

    setText('');
    setStatus('streaming');
    setError(undefined);

    streamBriefing(b, {
      tone: t,
      signal: ctrl.signal,
      onDelta: (_chunk, total) => {
        if (ctrl.signal.aborted) return;
        setText(total);
      },
    })
      .then((finalText) => {
        if (ctrl.signal.aborted) return;
        setText(finalText);
        setStatus('done');
        writeCache(key, finalText);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Briefing failed.');
      });
  }, []);

  // Auto-run on bundle/tone change (or after regenerate bumps `nonce`)
  useEffect(() => {
    if (!enabled || !bundle) return;
    run(bundle, tone, nonce.current > 0);
    return () => ctrlRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, bundle?.location.id, bundle?.units, bundle?.fetchedAt, tone, run]);

  const regenerate = useCallback(() => {
    if (!bundle) return;
    nonce.current += 1;
    // Clear cache for this exact key so the rerun produces fresh text
    sessionStorage.removeItem(cacheKey(bundle, tone));
    run(bundle, tone, true);
  }, [bundle, tone, run]);

  return { text, status, error, regenerate };
}
