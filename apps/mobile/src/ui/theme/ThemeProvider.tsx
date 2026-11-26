import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import {
  color,
  elevation,
  layout,
  motion,
  numeric,
  opacity,
  radius,
  size,
  space,
  typography,
  type ColorScheme,
  type ColorTokens,
} from './tokens';

export interface Theme {
  scheme: ColorScheme;
  isDark: boolean;
  color: ColorTokens;
  typography: typeof typography;
  numeric: typeof numeric;
  space: typeof space;
  layout: typeof layout;
  size: typeof size;
  radius: typeof radius;
  elevation: typeof elevation;
  motion: typeof motion;
  opacity: typeof opacity;
}

export function createTheme(scheme: ColorScheme): Theme {
  return {
    scheme,
    isDark: scheme === 'dark',
    color: color[scheme],
    typography,
    numeric,
    space,
    layout,
    size,
    radius,
    elevation,
    motion,
    opacity,
  };
}

const ThemeContext = createContext<Theme | null>(null);

/** Follows the system appearance (no in-app override in v1). `scheme` forces one, for tests. */
export function ThemeProvider({ scheme, children }: { scheme?: ColorScheme; children: ReactNode }) {
  const system = useColorScheme();
  const resolved: ColorScheme = scheme ?? (system === 'dark' ? 'dark' : 'light');
  const theme = useMemo(() => createTheme(resolved), [resolved]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>.');
  return theme;
}
