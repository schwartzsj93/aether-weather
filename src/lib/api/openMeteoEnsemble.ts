/**
 * Multi-model (ensemble) Open-Meteo client.
 *
 * Open-Meteo returns per-model fields when you pass `models=a,b,c` — each
 * variable is echoed back suffixed (`temperature_2m_ecmwf_ifs025`, etc.). We
 * fire one request that asks for every model in the requested ensemble and
 * then pivot the response into `{ [modelId]: TimeSeries }` for downstream
 * aggregation.
 *
 * One-shot request means: one network round trip, one generation call on
 * Open-Meteo's side, and native alignment of timestamps across models —
 * none of which we'd get from N parallel requests.
 */

import { getJson } from './http';
import type { Location, Units } from '@/types/weather';
import type { ModelSpec } from './models';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const HOURLY_VARS = [
  'temperature_2m',
  'precipitation',
  'precipitation_probability',
  'wind_speed_10m',
  'wind_direction_10m',
  'weather_code',
  'cloud_cover',
] as const;
type HourlyVar = typeof HOURLY_VARS[number];

const DAILY_VARS = [
  'temperature_2m_max',
  'temperature_2m_min',
  'precipitation_sum',
  'precipitation_probability_max',
  'weather_code',
] as const;
type DailyVar = typeof DAILY_VARS[number];

export interface ModelTimeSeries {
  modelId: string;
  hourly: Record<HourlyVar, (number | null)[]>;
  daily: Record<DailyVar, (number | null)[]>;
}

export interface EnsembleBundle {
  location: Location;
  units: Units;
  /** ISO8601 timestamps shared across all models. */
  hourlyTime: string[];
  /** ISO8601 dates shared across all models. */
  dailyTime: string[];
  series: Record<string, ModelTimeSeries>;
  /** Which model ids actually returned usable data. */
  activeModelIds: string[];
  fetchedAt: number;
}

function unitParams(units: Units): Record<string, string> {
  return units === 'imperial'
    ? { temperature_unit: 'fahrenheit', wind_speed_unit: 'mph', precipitation_unit: 'inch' }
    : { temperature_unit: 'celsius',    wind_speed_unit: 'kmh', precipitation_unit: 'mm' };
}

export async function fetchEnsemble(
  location: Location,
  units: Units,
  models: readonly ModelSpec[],
  opts: { signal?: AbortSignal } = {}
): Promise<EnsembleBundle> {
  if (models.length === 0) throw new Error('fetchEnsemble requires at least one model');

  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    forecast_days: '10',
    hourly: HOURLY_VARS.join(','),
    daily: DAILY_VARS.join(','),
    models: models.map((m) => m.id).join(','),
    ...unitParams(units),
  });

  const res = await getJson<{
    hourly: Record<string, unknown>;
    daily: Record<string, unknown>;
  }>(`${FORECAST_URL}?${params.toString()}`, opts.signal ? { signal: opts.signal } : {});

  const hourlyTime = (res.hourly.time ?? []) as string[];
  const dailyTime = (res.daily.time ?? []) as string[];

  const series: Record<string, ModelTimeSeries> = {};
  const activeModelIds: string[] = [];

  for (const model of models) {
    const hourly = {} as Record<HourlyVar, (number | null)[]>;
    const daily = {} as Record<DailyVar, (number | null)[]>;
    let hasAnyData = false;

    for (const v of HOURLY_VARS) {
      const key = `${v}_${model.id}`;
      const values = (res.hourly[key] as (number | null)[] | undefined) ?? [];
      hourly[v] = values;
      if (values.some((x) => x != null)) hasAnyData = true;
    }
    for (const v of DAILY_VARS) {
      const key = `${v}_${model.id}`;
      const values = (res.daily[key] as (number | null)[] | undefined) ?? [];
      daily[v] = values;
    }

    series[model.id] = { modelId: model.id, hourly, daily };
    if (hasAnyData) activeModelIds.push(model.id);
  }

  return {
    location,
    units,
    hourlyTime,
    dailyTime,
    series,
    activeModelIds,
    fetchedAt: Date.now(),
  };
}
