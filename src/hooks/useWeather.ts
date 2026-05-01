import { useQuery } from '@tanstack/react-query';
import type { Location, Units, WeatherBundle, AirQuality } from '@/types/weather';
import { fetchAirQuality, fetchWeather } from '@/lib/api/openMeteo';
import { fetchRadarManifest } from '@/lib/api/rainviewer';

export function useWeather(location: Location | undefined, units: Units) {
  return useQuery<WeatherBundle>({
    queryKey: ['weather', location?.id, units],
    queryFn: () => fetchWeather(location!, units),
    enabled: !!location,
    staleTime: 5 * 60 * 1000,         // 5 min
    refetchInterval: 10 * 60 * 1000,  // 10 min
    refetchOnWindowFocus: true,
  });
}

export function useAirQuality(location: Location | undefined) {
  return useQuery<AirQuality | undefined>({
    queryKey: ['air-quality', location?.id],
    queryFn: () => fetchAirQuality(location!),
    enabled: !!location,
    staleTime: 30 * 60 * 1000,
  });
}

export function useRadarManifest() {
  return useQuery({
    queryKey: ['radar-manifest'],
    queryFn: fetchRadarManifest,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
