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
    const url = '/api/kalshi/trade-api/v2/markets?limit=50&status=open&category=weather';
    const res = await fetch(url, { signal });

    if (!res.ok) {
      // Graceful degradation — Kalshi key may not be configured.
      return [];
    }

    const data = (await res.json()) as KalshiMarketsResponse;
    const raw  = data.markets ?? [];

    const cutoff = Date.now() + FOURTEEN_DAYS_MS;

    return raw
      .map(mapMarket)
      .filter((m) => {
        if (!m.close_time) return false;
        const closeMs = new Date(m.close_time).getTime();
        return !isNaN(closeMs) && closeMs <= cutoff;
      });
  } catch {
    // Network error, AbortError, JSON parse failure — all silent.
    return [];
  }
}
