import { getCalendars } from 'expo-localization';
import { useEffect, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { setDeviceUses24Hour } from '../lib/hourCycle';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient, setupFocusManager } from '../state/query-client';
import { SnackbarHost } from '../ui/components/Snackbar';
import { ThemeProvider } from '../ui/theme';

/** Theme, safe area, TanStack Query and the snackbar host. The DB gate sits inside these. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  useEffect(() => setupFocusManager(), []);
  // Clock times follow the device's 12/24 hour setting; re-read it when the app comes back.
  useState(() => setDeviceUses24Hour(getCalendars()[0]?.uses24hourClock));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setDeviceUses24Hour(getCalendars()[0]?.uses24hourClock);
    });
    return () => subscription.remove();
  }, []);
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
