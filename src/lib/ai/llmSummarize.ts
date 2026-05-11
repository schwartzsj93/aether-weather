/**
 * Claude-backed weatherman briefing.
 *
 * Streams a 3-5 sentence narrative from Claude Opus 4.6 (configurable).
 * The deterministic structured fields (`headline`, `highlights`, `advice`)
 * still come from the rule-based summarizer in `summarize.ts` — this module
 * only owns the *prose*. That split gives us:
 *   • instant first paint of structured data
 *   • streamed prose that types in like a teleprompter
 *   • bulletproof fallback if the LLM call fails
 *
 * SECURITY:
 *   Dev   — set VITE_ANTHROPIC_API_KEY + VITE_LLM_PROVIDER=anthropic.
 *             SDK calls Anthropic directly with `dangerouslyAllowBrowser: true`.
 *             The key lives only in your local .env.local; Vite never ships it
 *             to git (it IS bundled into the JS, so don't publish dev builds).
 *
 *   Prod  — leave VITE_ANTHROPIC_API_KEY unset, set VITE_LLM_PROVIDER=anthropic.
 *             SDK calls /api/anthropic (CloudFront → Lambda → Anthropic).
 *             The real key never reaches the browser. The placeholder 'proxy'
 *             string is required by the SDK constructor but is never sent to
 *             Anthropic — the Lambda injects the real key server-side.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WeatherBundle } from '@/types/weather';
import { getCondition } from '@/lib/utils/weatherCodes';

export type BriefingTone = 'briefing' | 'quick' | 'deep' | 'outdoor' | 'commuter';

export interface BriefingOptions {
  tone: BriefingTone;
  signal?: AbortSignal;
  /** Called for every text delta as the response streams in. */
  onDelta?: (chunk: string, total: string) => void;
}

const TONE_GUIDE: Record<BriefingTone, string> = {
  briefing:
    'Tone: confident, professional broadcast meteorologist. 3–4 sentences. Lead with what matters most in the next 12 hours, name specific times when conditions change, and end with a one-line look-ahead to tomorrow.',
  quick:
    'Tone: concise teaser, two sentences max. The headline plus a single concrete next-12-hour detail.',
  deep:
    'Tone: detailed analysis, 5–7 sentences. Explain the *why* behind the forecast — fronts, pressure shifts, model agreement. Stay grounded in the data.',
  outdoor:
    'Tone: trip-planner for outdoor activity (hiking, cycling, running). 3–4 sentences. Call out wind, UV, gust timing, terrain-relevant temperature swings, and the best window in the next 12 hours.',
  commuter:
    'Tone: morning/evening commuter brief. 3 sentences. Focus on rush-hour windows, road impacts (rain, snow, ice, fog, gusts), visibility, and a temperature delta vs. yesterday if relevant.',
};

const SYSTEM = `You are a senior on-air meteorologist writing the live forecast briefing for an app called Aether.

Style rules — non-negotiable:
- Write in flowing prose. NO markdown, NO headers, NO bullet points, NO lists.
- Reference specific times in the user's local timezone (e.g., "by 7 PM", "around midnight"). The data is pre-converted to local time; never say "UTC" or "Z".
- Mention concrete numbers when they're load-bearing (peak gust, expected rainfall, temperature swing). Never make up numbers — only use what's in the data block.
- Surface the *story* of the day: turning points, surprises, what changes. Don't list every hour.
- One topic per sentence. No filler ("Looking ahead", "As we move into…").
- Refer to the location by its short name once, then drop it.
- If conditions are quiet, say so plainly. Don't manufacture drama.

Output: a single plain-prose paragraph, no preamble.`;

interface ForecastDigest {
  location: string;
  units: string;
  timezone: string;
  now: { time: string; temperature: number; feelsLike: number; condition: string; windKmh: number; gustKmh: number; humidity: number; uv: number; isDay: boolean };
  next24h: Array<{ time: string; t: number; condition: string; windDir: number; windSpeed: number; precipMm: number; precipPct: number }>;
  next5d: Array<{ date: string; condition: string; tMin: number; tMax: number; precipMm: number; precipPct: number; gustMax: number; sunrise: string; sunset: string }>;
}

function digest(bundle: WeatherBundle): ForecastDigest {
  return {
    location: [bundle.location.name, bundle.location.admin1, bundle.location.country].filter(Boolean).join(', '),
    units: bundle.units,
    timezone: bundle.location.timezone,
    now: {
      time: bundle.current.time,
      temperature: round(bundle.current.temperature),
      feelsLike: round(bundle.current.feelsLike),
      condition: getCondition(bundle.current.weatherCode).label,
      windKmh: round(bundle.current.windSpeed),
      gustKmh: round(bundle.current.windGust),
      humidity: round(bundle.current.humidity),
      uv: round(bundle.current.uvIndex),
      isDay: bundle.current.isDay,
    },
    // Sample every 2 hours to keep the prompt small while preserving the shape of the day.
    next24h: bundle.hourly.slice(0, 24).filter((_, i) => i % 2 === 0).map((h) => ({
      time: localLabel(h.time, bundle.location.timezone),
      t: round(h.temperature),
      condition: getCondition(h.weatherCode).label,
      windDir: round(h.windDirection),
      windSpeed: round(h.windSpeed),
      precipMm: round(h.precipitation, 1),
      precipPct: round(h.precipitationProbability),
    })),
    next5d: bundle.daily.slice(0, 5).map((d) => ({
      date: d.date,
      condition: getCondition(d.weatherCode).label,
      tMin: round(d.temperatureMin),
      tMax: round(d.temperatureMax),
      precipMm: round(d.precipitationSum, 1),
      precipPct: round(d.precipitationProbabilityMax),
      gustMax: round(d.windGustMax),
      sunrise: localLabel(d.sunrise, bundle.location.timezone),
      sunset: localLabel(d.sunset, bundle.location.timezone),
    })),
  };
}

function round(n: number, decimals = 0): number {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function localLabel(iso: string, tz: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (client) return client;

  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.trim();
  if (provider !== 'anthropic') return null;

  const apiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)?.trim();

  if (apiKey) {
    // ── Dev path: direct browser call ─────────────────────────────────────
    // Key is in .env.local — safe for local dev, never deploy these builds.
    client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  } else {
    // ── Prod path: call through our CloudFront → Lambda proxy ─────────────
    // The Lambda reads the real key from Secrets Manager and injects it.
    // We pass a placeholder — the SDK requires the field, but it's stripped
    // and replaced by the proxy before the request reaches Anthropic.
    // The SDK requires an absolute URL — a relative path like '/api/anthropic'
    // is rejected with "cannot be parsed as a URL". Prefix with origin so we
    // get https://dllow6zve33wp.cloudfront.net/api/anthropic (or localhost in dev).
    client = new Anthropic({
      apiKey: 'proxy',          // replaced server-side — never reaches Anthropic
      baseURL: `${window.location.origin}/api/anthropic`,
      dangerouslyAllowBrowser: true,
    });
  }

  return client;
}

/** True when the LLM briefing is configured.
 *  Setting VITE_LLM_PROVIDER=anthropic is the sole requirement — no key
 *  needed in prod (the Lambda proxy injects it), and in dev the call will
 *  fail gracefully to the OFFLINE state and fall back to rule-based prose. */
export function isLLMEnabled(): boolean {
  const provider = (import.meta.env.VITE_LLM_PROVIDER as string | undefined)?.trim();
  return provider === 'anthropic';
}

/**
 * Streams a Claude-generated weatherman briefing.
 * Resolves with the final text. Calls `onDelta` for each text chunk.
 */
export async function streamBriefing(bundle: WeatherBundle, opts: BriefingOptions): Promise<string> {
  const c = getClient();
  if (!c) throw new Error('LLM disabled — set VITE_ANTHROPIC_API_KEY and VITE_LLM_PROVIDER=anthropic.');

  const model = (import.meta.env.VITE_ANTHROPIC_MODEL as string | undefined) ?? 'claude-opus-4-5';
  const data = digest(bundle);
  const userMessage = [
    TONE_GUIDE[opts.tone],
    '',
    'Forecast data (all times in the location\'s local timezone):',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
    '',
    'Write the briefing now.',
  ].join('\n');

  let total = '';
  const stream = c.messages.stream(
    {
      model,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    },
    { signal: opts.signal }
  );

  stream.on('text', (delta: string) => {
    total += delta;
    opts.onDelta?.(delta, total);
  });

  const final = await stream.finalMessage();
  // Defensive: collapse any text blocks the SDK already concatenated.
  if (!total) {
    for (const block of final.content) {
      if (block.type === 'text') total += block.text;
    }
    if (total) opts.onDelta?.(total, total);
  }
  return total.trim();
}
