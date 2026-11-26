import type { ErrorBoundaryProps } from 'expo-router';
import { View } from 'react-native';
import { logger } from '../../lib/logger';
import { t } from '../../lib/i18n';
import { ThemeProvider, useTheme } from '../theme';
import { EmptyState } from './EmptyState';

function Body({ error, retry }: ErrorBoundaryProps) {
  const { color } = useTheme();
  logger.error('route.error_boundary', error);
  return (
    <View style={{ flex: 1, backgroundColor: color.background }} testID="route-error">
      <EmptyState
        variant="error"
        title={t('startup.title')}
        action={{ label: t('common.tryAgain'), onPress: () => void retry() }}
      />
    </View>
  );
}

/** Export as `ErrorBoundary` from layouts. Brings its own theme because it replaces the subtree. */
export function RouteErrorBoundary(props: ErrorBoundaryProps) {
  return (
    <ThemeProvider>
      <Body {...props} />
    </ThemeProvider>
  );
}
