/**
 * Aether weather chat — Claude Haiku streaming agent.
 *
 * Separate from the Bond voice agent: text-only, multi-turn, analyst persona.
 * Uses the same Anthropic proxy pattern as llmSummarize.ts.
 *
 * Supports multimodal messages: images are passed as vision blocks,
 * text/CSV/JSON files are appended as additional text blocks.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { WeatherBundle } from '@/types/weather';
import type { KalshiMarket } from '@/lib/api/kalshi';
import { getCondition } from '@/lib/utils/weatherCodes';

// ── Attachment types ──────────────────────────────────────────────────────────

export type AttachmentBlock =
  | {
      type: 'image';
      data: string;                         // base64, no data-URL prefix
      mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
      name: string;
    }
  | {
      type: 'text';
      text: string;
      name: string;
    };

// ── Chat message type ─────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachmentBlock[];          // user messages only
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

// ── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM = `You are Aether's weather intelligence analyst. You have access to real-time weather data and Kalshi prediction market prices.

Your role:
- Answer weather questions precisely and concisely using the data provided.
- When Kalshi market data is available, interpret the odds (e.g. "72 cents = 72% market-implied probability").
- If the [KALSHI MARKETS] block is empty, mention that no market data is currently available.
- Compare model forecasts with market-implied probabilities when both are relevant.
- If the user uploads an image, describe what you see and relate it to the weather context where relevant.
- If the user uploads a file, acknowledge its contents and incorporate them into your analysis.
- Use bullet points for lists of conditions, times, or comparisons.
- Reference specific numbers from the data — never fabricate values.
- Keep responses under ~150 words unless the user explicitly requests more detail.
- Tone: precise, data-driven, and direct. No filler phrases. No James Bond persona.`;

// ── Weather digest ────────────────────────────────────────────────────────────

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
        source: {
          type: 'base64',
          media_type: att.mediaType,
          data: att.data,
        },
      });
    } else {
      // Plain text / CSV / JSON — append as a labelled text block.
      blocks.push({
        type: 'text',
        text: `[Attached file: ${att.name}]\n${att.text}`,
      });
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

  // Current user message: weather context prepended only to the live turn.
  const contextualText = [
    '[WEATHER DATA]',
    JSON.stringify(weatherDigest),
    '',
    '[KALSHI MARKETS]',
    marketsJSON,
    '',
    userMessage || '(See attached files)',
  ].join('\n');

  // Build the full messages array for the API.
  const messages: Anthropic.MessageParam[] = [
    // History messages — preserve their attachments as content blocks.
    ...history.map((msg): Anthropic.MessageParam => ({
      role: msg.role,
      content: msg.attachments?.length
        ? buildContent(msg.content, msg.attachments)
        : msg.content,
    })),
    // Current user turn with weather context + any new attachments.
    {
      role: 'user',
      content: buildContent(contextualText, attachments),
    },
  ];

  let total = '';

  const stream = client.messages.stream(
    {
      model,
      max_tokens: 800,
      system: SYSTEM,
      messages,
    },
    { signal }
  );

  stream.on('text', (delta: string) => {
    total += delta;
    onDelta(delta, total);
  });

  const final = await stream.finalMessage();

  // Defensive: pick up text if streaming events were missed.
  if (!total) {
    for (const block of final.content) {
      if (block.type === 'text') total += block.text;
    }
    if (total) onDelta(total, total);
  }

  return total.trim();
}
