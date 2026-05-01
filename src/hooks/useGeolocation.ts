import { useCallback, useState } from 'react';
import { reverseGeocode } from '@/lib/api/geocoding';
import { useAppStore } from '@/store/appStore';

interface GeoState {
  loading: boolean;
  error?: string;
}

export function useGeolocation(): GeoState & { request: () => void } {
  const addLocation = useAppStore((s) => s.addLocation);
  const [state, setState] = useState<GeoState>({ loading: false });

  const request = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ loading: false, error: 'Geolocation unavailable' });
      return;
    }
    setState({ loading: true });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const loc = await reverseGeocode(latitude, longitude);
        if (loc) {
          addLocation(loc);
          setState({ loading: false });
        } else {
          // Synthesize a minimal location so the UI still works.
          addLocation({
            id: `${latitude.toFixed(2)},${longitude.toFixed(2)}`,
            name: 'Current Location',
            latitude,
            longitude,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          });
          setState({ loading: false });
        }
      },
      (err) => setState({ loading: false, error: err.message }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  }, [addLocation]);

  return { ...state, request };
}
