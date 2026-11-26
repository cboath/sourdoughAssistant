import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback } from 'react';
import { logger } from '../src/lib/logger';
import { DbGate } from '../src/shell/DbGate';
import { AppProviders } from '../src/shell/AppProviders';
import { defaultBootstrapDeps } from '../src/shell/defaultBootstrap';
import { RouteErrorBoundary } from '../src/ui/components/RouteErrorBoundary';
import { useStackScreenOptions } from '../src/ui/navigation';

export { RouteErrorBoundary as ErrorBoundary };

// A cold start from a notification or deep link opens the tabs first, so back returns to Bakes.
export const unstable_settings = { initialRouteName: '(tabs)' };

// Keep the native splash up until the DB gate has settled (architecture section 12, step 1).
SplashScreen.preventAutoHideAsync().catch((error: unknown) =>
  logger.warn('splash.prevent_failed', { code: error ? 1 : 0 }),
);

function RootStack() {
  const options = useStackScreenOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="bake/[id]"
        options={{ headerShown: false, presentation: 'fullScreenModal' }}
      />
      <Stack.Screen name="recipe-editor" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="pantry-editor" options={{ headerShown: false, presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const hideSplash = useCallback(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);
  return (
    <AppProviders>
      <DbGate deps={defaultBootstrapDeps} onSettled={hideSplash}>
        <RootStack />
      </DbGate>
    </AppProviders>
  );
}
