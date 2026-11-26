/** Test helpers for components: theme + safe-area wrapper. Not imported by app code. */
import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ColorScheme } from './theme/tokens';
import { ThemeProvider } from './theme';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function Providers({
  children,
  scheme = 'light',
}: {
  children: ReactNode;
  scheme?: ColorScheme;
}) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider scheme={scheme}>{children}</ThemeProvider>
    </SafeAreaProvider>
  );
}

export function renderWithTheme(
  ui: ReactElement,
  { scheme, ...options }: { scheme?: ColorScheme } & RenderOptions = {},
) {
  return render(ui, {
    wrapper: ({ children }) => <Providers scheme={scheme}>{children}</Providers>,
    ...options,
  });
}
