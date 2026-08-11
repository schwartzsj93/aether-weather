/**
 * Kalshi prediction market fetcher.
 *
 * Fetches open weather prediction markets through our Lambda proxy at
 * /api/kalshi. Returns an empty array on any error so the chat panel
 * degrades gracefully when the Kalshi key is not configured.
 */

export interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle?: string;
  yes_bid: number;      // 0–1 probability
  yes_ask: number;
  last_price: number | null;
  volume: number;
  close_time: string;   // ISO
}

/** Raw market shape returned by the Kalshi REST API. */
interface KalshiRawMarket {
  ticker?: string;
  title?: string;
  subtitle?: string;
  yes_bid?: number;
  yes_ask?: number;
  last_price?: number | null;
  volume?: number;
  close_time?: string;
  // Some endpoints use different casing
  yes_ask_price?: number;
  yes_bid_price?: number;
}

interface KalshiMarketsResponse {
  markets?: KalshiRawMarket[];
}

/** Markets closing more than 14 days from now are excluded. */
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Weather-related keywords used to filter markets from the broad Kalshi feed.
 * The new api.elections.kalshi.com endpoint doesn't honour `category=weather`,
 * so we filter client-side instead.
 */
const WEATHER_RE =
  /\b(rain|snow|temp(?:erature)?|high|low|cold|hot|storm|wind|weather|flood|frost|ice|thunder|precip|hurricane|tornado|drought|heat|freeze|blizzard|sunny|cloud|fog|hail|sleet|dew)\b/i;

function isWeatherMarket(raw: KalshiRawMarket): boolean {
  return WEATHER_RE.test(raw.title ?? '') || WEATHER_RE.test(raw.ticker ?? '');
}

function mapMarket(raw: KalshiRawMarket): KalshiMarket {
  // Kalshi returns prices in cents (0–100); normalise to 0–1.
  const normalise = (v: number | undefined): number => {
    if (v === undefined || v === null) return 0;
    // If value appears to already be in 0-1 range, leave it; otherwise /100.
    return v > 1 ? v / 100 : v;
  };

  return {
    ticker:     raw.ticker     ?? '',
    title:      raw.title      ?? '',
    subtitle:   raw.subtitle,
    yes_bid:    normalise(raw.yes_bid    ?? raw.yes_bid_price),
    yes_ask:    normalise(raw.yes_ask   ?? raw.yes_ask_price),
    last_price: raw.last_price != null
      ? normalise(raw.last_price as number)
      : null,
    volume:     raw.volume    ?? 0,
    close_time: raw.close_time ?? '',
  };
}

export async function fetchWeatherMarkets(signal?: AbortSignal): Promise<KalshiMarket[]> {
  try {
    // Fetch a broad slice of open markets — the new Kalshi Elections API ignores
    // the `category=weather` param, so we filter by keyword on the client instead.
    const url = '/api/kalshi/trade-api/v2/markets?limit=200&status=open';
    const res = await fetch(url, { signal });

    if (!res.ok) return [];

    const data = (await res.json()) as KalshiMarketsResponse;
    const raw  = data.markets ?? [];

    const cutoff = Date.now() + FOURTEEN_DAYS_MS;

    return raw
      .filter(isWeatherMarket)
      .map(mapMarket)
      .filter((m) => {
        if (!m.close_time) return false;
        const closeMs = new Date(m.close_time).getTime();
        return !isNaN(closeMs) && closeMs <= cutoff;
      });
  } catch {
    return [];
  }
}
