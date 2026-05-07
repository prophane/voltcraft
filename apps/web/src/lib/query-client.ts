import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30s before considered stale
      gcTime: 5 * 60_000,       // 5min in cache
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})
