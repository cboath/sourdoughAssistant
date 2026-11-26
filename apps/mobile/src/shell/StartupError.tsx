import { View } from 'react-native';
import { DatabaseTooNewError } from '../db/errors';
import { t } from '../lib/i18n';
import { Button } from '../ui/components/Button';
import { EmptyState } from '../ui/components/EmptyState';
import { useTheme } from '../ui/theme';

/** Retry screen for a failed open/migrate/seed. Data is untouched; a too-new database cannot be retried away. */
export function StartupError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { color } = useTheme();
  const tooNew = error instanceof DatabaseTooNewError;
  return (
    <View style={{ flex: 1, backgroundColor: color.background }} testID="startup-error">
      <EmptyState
        variant="error"
        title={tooNew ? t('startup.tooNewTitle') : t('startup.title')}
        body={tooNew ? t('startup.tooNewBody') : t('startup.body')}
      />
      {tooNew ? null : (
        <View style={{ alignItems: 'center', paddingTop: 16 }}>
          <Button label={t('startup.retry')} onPress={onRetry} />
        </View>
      )}
    </View>
  );
}
