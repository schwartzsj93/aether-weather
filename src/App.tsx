import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from '@/components/layout/Dashboard';

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
      <Dashboard />
    </QueryClientProvider>
  );
}
