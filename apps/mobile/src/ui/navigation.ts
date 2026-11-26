import type { NativeStackNavigationOptions } from 'expo-router';
import { useMemo } from 'react';
import { useTheme } from './theme';

/** Stack header options from tokens, shared by every Stack layout. */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { color, typography } = useTheme();
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: color.background },
      headerTintColor: color.accent,
      headerTitleStyle: { color: color.textPrimary, fontWeight: typography.headline.fontWeight },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: color.background },
    }),
    [color, typography],
  );
}
