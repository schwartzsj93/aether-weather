/**
 * useAlerts
 *
 * Polls NOAA / NWS for active severe-weather alerts at the given coordinates.
 * Outside US territories, the adapter returns [] cheaply (no network round trip),
 * so this hook is safe to mount globally.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAlerts } from '@/lib/api/nws';
import type { Location, SevereAlert } from '@/types/weather';

export function useAlerts(location: Location | undefined) {
  return useQuery<SevereAlert[]>({
    queryKey: ['nws-alerts', location?.id],
    queryFn: () =>
      fetchAlerts({ latitude: location!.latitude, longitude: location!.longitude }),
    enabled: !!location,
    staleTime: 2 * 60 * 1000,         // 2 min
    refetchInterval: 5 * 60 * 1000,   // 5 min — alerts can update fast
    refetchOnWindowFocus: true,
    // Never throw into the UI; alerts are nice-to-have.
    retry: 1,
  });
}
