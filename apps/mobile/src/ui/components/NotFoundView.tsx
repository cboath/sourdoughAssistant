import { View } from 'react-native';
import { t } from '../../lib/i18n';
import { useTheme } from '../theme';
import { EmptyState } from './EmptyState';

/** Shown by `+not-found` and by any screen whose params are invalid or whose id matches no row. */
export function NotFoundView({ onGoHome }: { onGoHome: () => void }) {
  const { color } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: color.background }}>
      <EmptyState
        variant="error"
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={{ label: t('notFound.action'), onPress: onGoHome }}
      />
    </View>
  );
}
