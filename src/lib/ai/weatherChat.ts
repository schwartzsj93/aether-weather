/**
 * Aether weather chat — Claude Haiku streaming agent.
 *
 * Supports:
 *  • Multi-turn conversation history
 *  • Multimodal attachments (images + text files)
 *  • Tool use: get_weather lets Claude look up any location on demand
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WeatherBundle, Units } from '@/types/weather';
import type { KalshiMarket } from '@/lib/api/kalshi';
import { getCondition } from '@/lib/utils/weatherCodes';

// ── Attachment types ──────────────────────────────────────────────────────────

export type AttachmentBlock =
  | {
      type: 'image';
      data: string;
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      name: string;
    }
  | { type: 'text'; text: string; name: string };

// ── Chat message type ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentBlock[];
}

export interface ChatOptions {
  bundle: WeatherBundle;
  markets: KalshiMarket[];
  history: ChatMessage[];
  userMessage: string;
  attachments?: AttachmentBlock[];
  signal?: AbortSignal;
  onDelta: (chunk: string, total: string) => void;
}

// ── Anthropic client (singleton, lazy) ───────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)?.trim();
  _client = new Anthropic(
    apiKey
      ? { apiKey, dangerouslyAllowBrowser: true }
      : {
          apiKey: 'proxy',
          baseURL: `${window.location.origin}/api/anthropic`,
          dangerouslyAllowBrowser: true,
        }
  );
  return _client;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description:
      'Fetch current conditions and a 7-day forecast for ANY city or location. ' +
      'Use this whenever the user asks about weather somewhere other than the currently active location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        location: {
          type: 'string',
          description: 'City name, e.g. "Miami, FL", "London, UK", "Tokyo", "Paris"',
        },
      },
      required: ['location'],
    },
  },
];

// ── Tool executor: geocode → Open-Meteo weather ───────────────────────────────

interface GeoResult {
  latitude: number;
  longitude: number;
  name: string;
  admin1?: string;
  country?: string;
  timezone: string;
}

interface OpenMeteoWeather {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    weather_code: number;
    wind_speed_10m: number;
    wind_gusts_10m: number;
    relative_humidity_2m: number;
    is_day: number;
    uv_index?: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

async function runGetWeather(
  locationQuery: string,
  units: Units,
  signal?: AbortSignal,
): Promise<string> {
  const r = (n: number) => Math.round(n);

  try {
    // 1 — Geocode
    const geoUrl =
      `https://geocoding-api.open-meteo.com/v1/search` +
      `?name=${encodeURIComponent(locationQuery)}&count=1&language=en&format=json`;
    const geoRes = await fetch(geoUrl, { signal });
    const geoData = (await geoRes.json()) as { results?: GeoResult[] };

    if (!geoData.results?.length) {
      return JSON.stringify({ error: `Location not found: "${locationQuery}"` });
    }

    const { latitude, longitude, name, admin1, country, timezone } = geoData.results[0];

    // 2 — Fetch weather
    const tempUnit = units === 'imperial' ? 'fahrenheit' : 'celsius';
    const windUnit = units === 'imperial' ? 'mph' : 'kmh';
    const wxUrl =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,is_day,uv_index` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
      `&temperature_unit=${tempUnit}&wind_speed_unit=${windUnit}` +
      `&forecast_days=7&timezone=auto`;

    const wxRes = await fetch(wxUrl, { signal });
    const wx = (await wxRes.json()) as OpenMeteoWeather;

    return JSON.stringify({
      location: [name, admin1, country].filter(Boolean).join(', '),
      units,
      timezone,
      current: {
        time: wx.current.time,
        temperature: r(wx.current.temperature_2m),
        feelsLike: r(wx.current.apparent_temperature),
        condition: getCondition(wx.current.weather_code).label,
        humidity: r(wx.current.relative_humidity_2m),
        windSpeed: r(wx.current.wind_speed_10m),
        windGust: r(wx.current.wind_gusts_10m),
        uv: r(wx.current.uv_index ?? 0),
        isDay: wx.current.is_day === 1,
      },
      forecast: wx.daily.time.slice(0, 7).map((date, i) => ({
        date,
        high: r(wx.daily.temperature_2m_max[i]),
        low: r(wx.daily.temperature_2m_min[i]),
        precipChance: r(wx.daily.precipitation_probability_max[i]),
        condition: getCondition(wx.daily.weather_code[i]).label,
      })),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    return JSON.stringify({
      error: `Could not fetch weather for "${locationQuery}": ${(err as Error).message}`,
    });
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are Aether's weather intelligence analyst. You have access to real-time weather data and Kalshi prediction market prices.

Your role:
- Answer weather questions precisely and concisely using the data provided.
- The [WEATHER DATA] block contains the user's currently active location. For questions about OTHER locations, call the get_weather tool — do not say you can't look them up.
- When Kalshi market data is available, interpret the odds (e.g. "72 cents = 72% market-implied probability").
- If the [KALSHI MARKETS] block is empty, mention that no market data is currently available.
- Compare model forecasts with market-implied probabilities when both are relevant.
- If the user uploads an image, describe what you see and relate it to the weather context where relevant.
- If the user uploads a file, acknowledge its contents and incorporate them into your analysis.
- Use bullet points for lists of conditions, times, or comparisons.
- Reference specific numbers from the data — never fabricate values.
- Keep responses under ~150 words unless the user explicitly requests more detail.
- Tone: precise, data-driven, and direct. No filler phrases.`;

// ── Weather digest (active location) ─────────────────────────────────────────

function round(n: number, decimals = 0): number {
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function buildDigest(bundle: WeatherBundle) {
  const { current, hourly, daily, location, units } = bundle;
  const tz = location.timezone;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', {
      timeZone: tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

  const rainWindows = hourly
    .slice(0, 24)
    .filter((h) => h.precipitationProbability > 20)
    .map((h) => ({
      time: fmt(h.time),
      precipPct: round(h.precipitationProbability),
      precipMm: round(h.precipitation, 1),
    }));

  const today = daily[0];

  return {
    location: [location.name, location.admin1, location.country].filter(Boolean).join(', '),
    units,
    current: {
      time: fmt(current.time),
      temp: round(current.temperature),
      feelsLike: round(current.feelsLike),
      condition: getCondition(current.weatherCode).label,
      windSpeed: round(current.windSpeed),
      windGust: round(current.windGust),
      humidity: round(current.humidity),
      uv: round(current.uvIndex),
      isDay: current.isDay,
    },
    today: today
      ? {
          high: round(today.temperatureMax),
          low: round(today.temperatureMin),
          precipChance: round(today.precipitationProbabilityMax),
          condition: getCondition(today.weatherCode).label,
        }
      : null,
    next3Days: daily.slice(1, 4).map((d) => ({
      date: fmtDate(d.date),
      condition: getCondition(d.weatherCode).label,
      high: round(d.temperatureMax),
      low: round(d.temperatureMin),
      precipChance: round(d.precipitationProbabilityMax),
    })),
    rainWindows,
  };
}

// ── Content block builder ─────────────────────────────────────────────────────

type ApiContentBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

function buildContent(
  text: string,
  attachments?: AttachmentBlock[],
): string | ApiContentBlock[] {
  if (!attachments || attachments.length === 0) return text;

  const blocks: ApiContentBlock[] = [{ type: 'text', text }];

  for (const att of attachments) {
    if (att.type === 'image') {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: att.mediaType, data: att.data },
      });
    } else {
      blocks.push({ type: 'text', text: `[Attached file: ${att.name}]\n${att.text}` });
    }
  }

  return blocks;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function streamWeatherChat(opts: ChatOptions): Promise<string> {
  const { bundle, markets, history, userMessage, attachments, signal, onDelta } = opts;

  const client = getClient();
  const model  = (import.meta.env.VITE_ANTHROPIC_MODEL as string | undefined) ?? 'claude-haiku-4-5';

  const weatherDigest = buildDigest(bundle);
  const marketsJSON   = markets.length > 0 ? JSON.stringify(markets, null, 2) : '[]';

  const contextualText = [
    '[WEATHER DATA — ACTIVE LOCATION]',
    JSON.stringify(weatherDigest),
    '',
    '[KALSHI MARKETS]',
    marketsJSON,
    '',
    userMessage || '(See attached files)',
  ].join('\n');

  const messages: Anthropic.MessageParam[] = [
    ...history.map((msg): Anthropic.MessageParam => ({
      role: msg.role,
      content: msg.attachments?.length
        ? buildContent(msg.content, msg.attachments)
        : msg.content,
    })),
    { role: 'user', content: buildContent(contextualText, attachments) },
  ];

  let total = '';

  // ── First stream (Claude may answer directly or call a tool) ──────────────
  const stream1 = client.messages.stream(
    { model, max_tokens: 1024, system: SYSTEM, messages, tools: TOOLS },
    { signal },
  );

  stream1.on('text', (delta: string) => {
    total += delta;
    onDelta(delta, total);
  });

  const msg1 = await stream1.finalMessage();

  // ── Tool-use round trip ───────────────────────────────────────────────────
  if (msg1.stop_reason === 'tool_use') {
    const toolBlock = msg1.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );

    if (toolBlock?.name === 'get_weather') {
      const locationQuery = (toolBlock.input as { location: string }).location;

      // Emit a brief status line so the user isn't staring at silence.
      const status = `${total ? '\n\n' : ''}*Fetching weather for ${locationQuery}…*\n\n`;
      total += status;
      onDelta(status, total);

      const toolResult = await runGetWeather(locationQuery, bundle.units, signal);

      const messages2: Anthropic.MessageParam[] = [
        ...messages,
        { role: 'assistant', content: msg1.content },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id,
              content: toolResult,
            },
          ],
        },
      ];

      const stream2 = client.messages.stream(
        { model, max_tokens: 800, system: SYSTEM, messages: messages2, tools: TOOLS },
        { signal },
      );

      stream2.on('text', (delta: string) => {
        total += delta;
        onDelta(delta, total);
      });

      await stream2.finalMessage();
    }
  }

  // Fallback: pick up text if streaming events were missed.
  if (!total) {
    for (const block of msg1.content) {
      if (block.type === 'text') total += block.text;
    }
    if (total) onDelta(total, total);
  }

  return total.trim();
}
