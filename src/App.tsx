import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Dashboard } from '@/components/layout/Dashboard';
import { MapPage } from '@/pages/MapPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: 'always',
      staleTime: 60_000,
      gcTime: 30 * 60_000,
    },
  },
});

/**
 * Ensures the app always runs the latest deployed version.
 *
 * When a new service worker activates (skipWaiting + clientsClaim in
 * the workbox config), `controllerchange` fires.  We reload the page so
 * the browser fetches the fresh asset hashes instead of the cached ones.
 *
 * A `refreshing` guard prevents an infinite loop on the very first SW
 * install (which also fires controllerchange on an uncontrolled page).
 */
function usePWAUpdate() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;

    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    // Also actively poll for updates every 10 min so long-lived tabs
    // don't get stuck on an old version.
    const interval = setInterval(() => {
      navigator.serviceWorker.getRegistration().then((r) => r?.update());
    }, 10 * 60 * 1000);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      clearInterval(interval);
    };
  }, []);
}

export default function App() {
  usePWAUpdate();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/map" element={<MapPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
