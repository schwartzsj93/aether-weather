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

export default function App() {
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
