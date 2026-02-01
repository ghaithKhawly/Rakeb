import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Children, ReactNode } from 'react'
const qc  = new QueryClient({
    defaultOptions:{
        queries:{
             retry: 2,
             refetchOnWindowFocus: false
        }
    }
});

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={qc}>
      {children}
    </QueryClientProvider>
  )
}