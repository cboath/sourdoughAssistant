import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient, setupFocusManager } from '../state/query-client';
import { SnackbarHost } from '../ui/components/Snackbar';
import { ThemeProvider } from '../ui/theme';

/** Theme, safe area, TanStack Query and the snackbar host. The DB gate sits inside these. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => setupFocusManager(), []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <SnackbarHost />
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
