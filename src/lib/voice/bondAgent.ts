/**
 * AETHER Voice Agent — Claude-powered Bond intelligence layer.
 *
 * Receives the user's spoken transcript + current weather context + app
 * state, and returns a structured JSON response containing:
 *   • speech  – what Bond says aloud (Pierce Brosnan delivery style)
 *   • action  – optional UI command to trigger on the dashboard
 *
 * The Bond persona is baked into the system prompt.  All knowledge of
 * current conditions, today's forecast, and rain timing comes from the
 * weather bundle passed in at call-time so responses are always grounded
 * in live data.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WeatherBundle } from '@/types/weather';
import type { MapLayer, MapZoomTier } from '@/store/appStore';

// ── Action taxonomy ──────────────────────────────────────────────────────────

export type VoiceAction =
  | { type: 'setLayer';       layer: MapLayer }
  | { type: 'setZoom';        tier: MapZoomTier }
  | { type: 'expandMap' }
  | { type: 'scrollTo';       section: 'map' | 'hourly' | 'daily' | 'current' | 'airQuality' }
  | { type: 'changeLocation'; query: string }
  | { type: 'setUnits';       units: 'imperial' | 'metric' }
  | { type: 'none' };

export interface AgentResponse {
  speech: string;
  action: VoiceAction | null;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ── System prompt (Bond persona + action schema) ─────────────────────────────

const SYSTEM = `\
You are AETHER — a classified weather intelligence system engineered by Q Branch.
You speak exclusively in the calm, suave, occasionally witty manner of Pierce Brosnan's James Bond.

Address the user as "sir" unless context indicates otherwise.  Be decisive, confident, and
concise — Bond never rambles.  A single dry quip per response is permitted; never two.

You control a live weather dashboard.  You respond ONLY with valid JSON — no markdown fences,
no commentary outside the JSON object:

{
  "speech": "<what AETHER says aloud — Bond style, ≤ 3 sentences unless detail is requested>",
  "action": null  |  one of the action objects below
}

AVAILABLE ACTIONS — pick the most relevant, or null if none needed:
{ "type": "setLayer",       "layer": "radar" | "satellite" | "wind" }
{ "type": "setZoom",        "tier": "global" | "country" | "state" | "local" }
{ "type": "expandMap" }
{ "type": "scrollTo",       "section": "map" | "hourly" | "daily" | "current" | "airQuality" }
{ "type": "changeLocation", "query": "<city or place name>" }
{ "type": "setUnits",       "units": "imperial" | "metric" }

BEHAVIOURAL RULES:
- Numbers only from the data block — never fabricate readings.
- "rain / storm / precipitation" queries → setLayer radar + mention timing.
- "wind / gusts" queries → setLayer wind.
- "satellite / clouds / cloud cover" → setLayer satellite.
- "show hourly / daily / air quality / current" → scrollTo the matching section.
- "zoom in/out / global / national / local view" → setZoom.
- "go full screen / open map / full map" → expandMap.
- "switch to metric / imperial / Celsius / Fahrenheit" → setUnits.
- "go to / change location to <place>" → changeLocation.
- Ambiguous requests: ask one elegant clarifying question; action = null.
- Output ONLY the JSON object.  Nothing before or after it.`;

// ── Weather context builder ───────────────────────────────────────────────────

function wmoLabel(code: number): string {
  if (code === 0)  return 'clear';
  if (code <= 2)   return 'partly cloudy';
  if (code === 3)  return 'overcast';
  if (code <= 49)  return 'foggy';
  if (code <= 59)  return 'drizzle';
  if (code <= 69)  return 'rain';
  if (code <= 79)  return 'snow';
  if (code <= 82)  return 'rain showers';
  if (code <= 86)  return 'snow showers';
  if (code <= 99)  return 'thunderstorm';
  return 'unknown';
}

function localTime(iso: string, tz: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('en-US', { timeZone: tz, ...opts });
}

function buildContext(
  bundle: WeatherBundle,
  appState: { activeLayer: string; zoomTier: string },
): string {
  const { current: c, daily, hourly, location: loc, units } = bundle;
  const u = units === 'imperial';
  const deg = u ? '°F' : '°C';
  const spd = u ? 'mph' : 'km/h';

  const today = daily[0];

  // Rain windows in next 24 h with > 20 % probability
  const rainWindows = hourly
    .slice(0, 24)
    .filter((h) => h.precipitationProbability > 20)
    .slice(0, 6)
    .map((h) => ({
      time: localTime(h.time, loc.timezone, { hour: 'numeric', hour12: true }),
      chance: `${Math.round(h.precipitationProbability)}%`,
      condition: wmoLabel(h.weatherCode),
    }));

  const ctx = {
    location: [loc.name, loc.admin1, loc.country].filter(Boolean).join(', '),
    localTime: localTime(new Date().toISOString(), loc.timezone, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    }),
    units,
    now: {
      temp:      `${Math.round(c.temperature)}${deg}`,
      feelsLike: `${Math.round(c.feelsLike)}${deg}`,
      condition: wmoLabel(c.weatherCode),
      wind:      `${Math.round(c.windSpeed)} ${spd}`,
      gust:      `${Math.round(c.windGust)} ${spd}`,
      humidity:  `${Math.round(c.humidity)}%`,
      uv:        c.uvIndex,
      isDay:     c.isDay,
    },
    today: today ? {
      high:        `${Math.round(today.temperatureMax)}${deg}`,
      low:         `${Math.round(today.temperatureMin)}${deg}`,
      precipChance:`${Math.round(today.precipitationProbabilityMax)}%`,
      windMax:     `${Math.round(today.windSpeedMax)} ${spd}`,
      sunrise: localTime(today.sunrise, loc.timezone, { hour: 'numeric', minute: '2-digit' }),
      sunset:  localTime(today.sunset,  loc.timezone, { hour: 'numeric', minute: '2-digit' }),
    } : null,
    next3days: daily.slice(1, 4).map((d) => ({
      day:         new Date(d.date).toLocaleDateString('en-US', { weekday: 'short', timeZone: loc.timezone }),
      condition:   wmoLabel(d.weatherCode),
      high:        `${Math.round(d.temperatureMax)}${deg}`,
      low:         `${Math.round(d.temperatureMin)}${deg}`,
      precipChance:`${Math.round(d.precipitationProbabilityMax)}%`,
    })),
    rainWindows,
    appState: { activeLayer: appState.activeLayer, zoomTier: appState.zoomTier },
  };

  return JSON.stringify(ctx);
}

// ── Anthropic client ──────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

function client(): Anthropic {
  if (_client) return _client;
  const key = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)?.trim();
  _client = new Anthropic({
    apiKey:               key ?? 'proxy',
    baseURL:              key ? undefined : `${window.location.origin}/api/anthropic`,
    dangerouslyAllowBrowser: true,
  });
  return _client;
}

// ── Main entry point ──────────────────────────────────────────────────────────

const VOICE_MODEL = 'claude-sonnet-4-5'; // fast, sharp — ideal for real-time voice

export async function askBond(
  userTranscript: string,
  bundle: WeatherBundle,
  appState: { activeLayer: string; zoomTier: string; units: string },
  history: ConversationTurn[],
  signal?: AbortSignal,
): Promise<AgentResponse> {
  const ctx = buildContext(bundle, appState);

  // Build message history for multi-turn context
  const messages: Anthropic.MessageParam[] = [
    ...history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    {
      role: 'user',
      content: `[LIVE WEATHER DATA]\n${ctx}\n\n[USER]\n${userTranscript}`,
    },
  ];

  const response = await client().messages.create(
    {
      model:      VOICE_MODEL,
      max_tokens: 350,
      system:     SYSTEM,
      messages,
    } as never,
    { signal },
  );

  const raw = (response.content.find((b) => b.type === 'text') as { type: 'text'; text: string } | undefined)?.text ?? '';

  try {
    const clean   = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
    const parsed  = JSON.parse(clean) as { speech?: string; action?: VoiceAction };
    return {
      speech: parsed.speech?.trim() || fallback(),
      action: parsed.action ?? null,
    };
  } catch {
    // If JSON parse fails, use the raw text as speech with no action
    return { speech: raw.trim() || fallback(), action: null };
  }
}

function fallback(): string {
  return "I'm afraid the intelligence network experienced a brief interruption, sir. Shall we try again?";
}
