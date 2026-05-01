/**
 * useEnsemble — fetches Open-Meteo forecasts from every model in the
 * ensemble in one call, then caches by (location, units, model-id list).
 *
 * Light-touch defaults: pulls the flagships plus any regional model that
 * covers the active location. Callers can pass their own model list for
 * deeper "compare every model" views.
 */

import { useQuery } from '@tanstack/react-query';
import type { Location, Units } from '@/types/weather';
import { fetchEnsemble, type EnsembleBundle } from '@/lib/api/openMeteoEnsemble';
import { defaultEnsemble, getModel, type ModelSpec } from '@/lib/api/models';

export function useEnsemble(
  location: Location | undefined,
  units: Units,
  modelIds?: string[],
) {
  const models: ModelSpec[] = (() => {
    if (!location) return [];
    if (modelIds && modelIds.length > 0) {
      return modelIds
        .map((id) => getModel(id))
        .filter((m): m is ModelSpec => !!m);
    }
    return defaultEnsemble(location.latitude, location.longitude);
  })();

  const modelKey = models.map((m) => m.id).sort().join(',');

  return useQuery<EnsembleBundle>({
    queryKey: ['ensemble', location?.id, units, modelKey],
    queryFn: () => fetchEnsemble(location!, units, models),
    enabled: !!location && models.length > 0,
    staleTime: 10 * 60 * 1000, // 10 min — matches single-model cadence
    refetchOnWindowFocus: true,
  });
}
