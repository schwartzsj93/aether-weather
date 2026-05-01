/**
 * Ensemble aggregation math.
 *
 * Given several models' time series for the same variable, compute per-step
 * summary statistics so the UI can draw a central line (median) with a
 * confidence band (min/max), and surface disagreement as a first-class signal
 * rather than something the user has to squint for.
 *
 * Why median over mean: a single runaway model (e.g. a 6°C-high temperature
 * outlier, which does occur during transitions) shouldn't drag the central
 * line with it. Median is more robust for small ensembles (3–6 members).
 *
 * Why min/max over stdev: at small N, stdev is both noisy and harder to read.
 * Min/max bands tell the user directly: "the envelope of disagreement spans
 * these two numbers." Stdev is exposed anyway for callers that want it.
 */

import type { EnsembleBundle, ModelTimeSeries } from '@/lib/api/openMeteoEnsemble';

export interface EnsembleStats {
  /** Per-timestep median across models. null if no model had a value. */
  median: (number | null)[];
  mean: (number | null)[];
  min: (number | null)[];
  max: (number | null)[];
  /** Population standard deviation per step. */
  stdev: (number | null)[];
  /** Max - min per step. Convenient proxy for "disagreement". */
  spread: (number | null)[];
  /** Number of models contributing a non-null value at each step. */
  count: number[];
}

type HourlyVar = keyof ModelTimeSeries['hourly'];
type DailyVar = keyof ModelTimeSeries['daily'];

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Aggregate a set of parallel series into per-step stats.
 *
 * All input arrays must be the same length; shorter arrays (from regional
 * models that cut off before the global horizon) are padded with nulls.
 */
export function aggregate(seriesList: (number | null)[][]): EnsembleStats {
  const steps = Math.max(0, ...seriesList.map((s) => s.length));
  const out: EnsembleStats = {
    median: new Array(steps).fill(null),
    mean:   new Array(steps).fill(null),
    min:    new Array(steps).fill(null),
    max:    new Array(steps).fill(null),
    stdev:  new Array(steps).fill(null),
    spread: new Array(steps).fill(null),
    count:  new Array(steps).fill(0),
  };

  for (let i = 0; i < steps; i++) {
    const vals: number[] = [];
    for (const s of seriesList) {
      const v = s[i];
      if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
    }
    out.count[i] = vals.length;
    if (vals.length === 0) continue;

    vals.sort((a, b) => a - b);
    const sum = vals.reduce((a, b) => a + b, 0);
    const mn = vals[0];
    const mx = vals[vals.length - 1];
    const mean = sum / vals.length;
    const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length;

    out.median[i] = median(vals);
    out.mean[i]   = mean;
    out.min[i]    = mn;
    out.max[i]    = mx;
    out.stdev[i]  = Math.sqrt(variance);
    out.spread[i] = mx - mn;
  }
  return out;
}

/** Aggregate a single hourly variable across every active model in the bundle. */
export function aggregateHourly(bundle: EnsembleBundle, variable: HourlyVar): EnsembleStats {
  const seriesList = bundle.activeModelIds.map((id) => bundle.series[id].hourly[variable]);
  return aggregate(seriesList);
}

/** Aggregate a single daily variable across every active model in the bundle. */
export function aggregateDaily(bundle: EnsembleBundle, variable: DailyVar): EnsembleStats {
  const seriesList = bundle.activeModelIds.map((id) => bundle.series[id].daily[variable]);
  return aggregate(seriesList);
}

/**
 * Scalar summary of model agreement, 0..1 where 1 means perfect agreement and
 * 0 means wide disagreement. Defined by comparing the ensemble's average
 * hourly spread against a tolerance that's reasonable for that variable.
 *
 * Intentionally shipped as a small lookup — the right tolerance is domain-
 * specific and a learned calibration would be overkill for a UI-level
 * "confidence" indicator.
 */
export function confidenceScore(stats: EnsembleStats, variable: HourlyVar): number {
  const TOLERANCE: Partial<Record<HourlyVar, number>> = {
    temperature_2m: 3,             // °F or °C — UI scale already chosen
    precipitation: 2,               // mm or in
    precipitation_probability: 25,
    wind_speed_10m: 6,
    wind_direction_10m: 40,
    weather_code: 2,
    cloud_cover: 25,
  };
  const tol = TOLERANCE[variable] ?? 10;

  let sum = 0;
  let n = 0;
  for (const s of stats.spread) {
    if (typeof s === 'number' && Number.isFinite(s)) {
      sum += s;
      n += 1;
    }
  }
  if (n === 0) return 1;
  const avgSpread = sum / n;
  // Clamp to [0, 1]. Spread == 0 → 1.0 confidence; spread >= tolerance → ramps toward 0.
  return Math.max(0, Math.min(1, 1 - avgSpread / (tol * 2)));
}
