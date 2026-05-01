/**
 * Weather model catalog.
 *
 * Open-Meteo is a free, keyless aggregator that redistributes raw forecast
 * output from the world's major NWP centres (and, increasingly, AI emulators).
 * Every model gets a stable identifier in the query string; the response shape
 * becomes per-model when you pass `models=a,b,c` — fields come back suffixed
 * (`temperature_2m_ecmwf_ifs025`, etc.).
 *
 * We expose a curated subset here. The `tier` field drives our default
 * selection in the UI: `flagship` models are the go-to physics + AI runs,
 * `regional` models unlock higher resolution where they cover the active
 * location, and `reference` models are kept around for ensemble spread.
 *
 * Family notes:
 *   • ECMWF AIFS  — ECMWF's operational AI forecast, in the GraphCast family
 *                    (graph neural network on a lat-lon grid). Trained on ERA5.
 *   • NOAA HRRR   — 3 km convection-allowing model, CONUS only.
 *   • MeteoFrance AROME — 1.3 km convection-allowing, Western Europe only.
 *   • ICON         — DWD's icosahedral global model, excellent on precipitation.
 */

export type ModelTier = 'flagship' | 'regional' | 'reference';
export type ModelFamily = 'physics' | 'ai';

export interface ModelSpec {
  /** Open-Meteo identifier. */
  id: string;
  /** Short display name. */
  label: string;
  /** One-liner shown in tooltips. */
  description: string;
  family: ModelFamily;
  tier: ModelTier;
  /** Run provider. Drives branding. */
  provider: 'ECMWF' | 'NOAA' | 'DWD' | 'MétéoFrance' | 'UKMO' | 'JMA' | 'BOM';
  /** Grid spacing (km) — informational. */
  resolutionKm: number;
  /** Forecast horizon in days (approximate). */
  horizonDays: number;
  /** Geographic coverage bbox [W, S, E, N] or undefined = global. */
  coverage?: [number, number, number, number];
}

export const MODELS: readonly ModelSpec[] = [
  // ---------- Flagship physics + AI ----------
  {
    id: 'ecmwf_ifs025',
    label: 'ECMWF IFS',
    description: 'ECMWF Integrated Forecasting System — the global gold standard for medium-range NWP.',
    family: 'physics',
    tier: 'flagship',
    provider: 'ECMWF',
    resolutionKm: 25,
    horizonDays: 10,
  },
  {
    id: 'ecmwf_aifs025_single',
    label: 'ECMWF AIFS',
    description: 'ECMWF Artificial Intelligence Forecasting System — GraphCast-family graph-neural-network emulator trained on ERA5.',
    family: 'ai',
    tier: 'flagship',
    provider: 'ECMWF',
    resolutionKm: 25,
    horizonDays: 10,
  },
  {
    id: 'icon_seamless',
    label: 'DWD ICON',
    description: 'DWD icosahedral non-hydrostatic model, seamless global + regional nest. Very strong on precipitation.',
    family: 'physics',
    tier: 'flagship',
    provider: 'DWD',
    resolutionKm: 13,
    horizonDays: 7,
  },
  {
    id: 'gfs_seamless',
    label: 'NOAA GFS',
    description: 'NOAA Global Forecast System, including 13 km GFS and 3 km HRRR nests where available.',
    family: 'physics',
    tier: 'flagship',
    provider: 'NOAA',
    resolutionKm: 13,
    horizonDays: 16,
  },

  // ---------- Regional / high-res ----------
  {
    id: 'ncep_hrrr_conus',
    label: 'NOAA HRRR',
    description: 'NOAA High-Resolution Rapid Refresh — 3 km convection-allowing, CONUS only.',
    family: 'physics',
    tier: 'regional',
    provider: 'NOAA',
    resolutionKm: 3,
    horizonDays: 2,
    coverage: [-134, 21, -60, 52],
  },
  {
    id: 'meteofrance_arome_france_hd',
    label: 'AROME HD',
    description: 'Météo-France AROME 1.3 km convection-allowing model. Western Europe only.',
    family: 'physics',
    tier: 'regional',
    provider: 'MétéoFrance',
    resolutionKm: 1.3,
    horizonDays: 2,
    coverage: [-6, 41, 10, 51.5],
  },

  // ---------- Reference / ensemble diversity ----------
  {
    id: 'ukmo_global_deterministic_10km',
    label: 'UKMO Global',
    description: 'UK Met Office Unified Model global deterministic 10 km run.',
    family: 'physics',
    tier: 'reference',
    provider: 'UKMO',
    resolutionKm: 10,
    horizonDays: 7,
  },
  {
    id: 'jma_seamless',
    label: 'JMA',
    description: 'Japan Meteorological Agency GSM/MSM seamless blend.',
    family: 'physics',
    tier: 'reference',
    provider: 'JMA',
    resolutionKm: 10,
    horizonDays: 7,
  },
  {
    id: 'bom_access_global',
    label: 'BOM ACCESS',
    description: 'Australian BOM ACCESS-G global model.',
    family: 'physics',
    tier: 'reference',
    provider: 'BOM',
    resolutionKm: 12,
    horizonDays: 7,
  },
] as const;

const MODEL_BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelSpec | undefined {
  return MODEL_BY_ID.get(id);
}

/**
 * Returns models useful at a given location, ordered by tier. Regional models
 * are filtered by their coverage bbox so we never ask HRRR about Tokyo or
 * AROME about Melbourne.
 */
export function modelsForLocation(lat: number, lon: number): ModelSpec[] {
  return MODELS.filter((m) => {
    if (!m.coverage) return true;
    const [w, s, e, n] = m.coverage;
    return lon >= w && lon <= e && lat >= s && lat <= n;
  });
}

/** Default ensemble for a given location — flagships + any regional that covers it. */
export function defaultEnsemble(lat: number, lon: number): ModelSpec[] {
  return modelsForLocation(lat, lon).filter(
    (m) => m.tier === 'flagship' || m.tier === 'regional'
  );
}
