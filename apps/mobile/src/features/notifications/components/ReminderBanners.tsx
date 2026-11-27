import { View } from 'react-native';
import { t } from '../../../lib/i18n';
import { Banner } from '../../../ui/components/Banner';
import { useTheme } from '../../../ui/theme';
import { useReminderBanners } from '../hooks/useReminderBanners';

/**
 * The reminder health banners (notifications off, failed, alarms off, budget): at most two, in the
 * order screens-bake.md 0.4 sets. Mount on Bakes home and the live view; renders nothing when
 * everything is fine. `tier="kitchen"` gives the live view its 56 pt targets.
 */
export function ReminderBanners({ tier = 'standard' }: { tier?: 'standard' | 'kitchen' }) {
  const { space } = useTheme();
  const banners = useReminderBanners();
  if (banners.length === 0) return null;
  return (
    <View style={{ gap: space.sm }} testID="reminder-banners">
      {banners.map((b) => (
        <Banner
          key={b.kind}
          testID={`banner-${b.kind}`}
          variant={b.variant}
          tier={tier}
          announceKey={`reminder:${b.kind}`}
          dismissLabel={t('banner.dismissLabel')}
          message={b.message}
          actions={
            b.actionLabel && b.onAction ? [{ label: b.actionLabel, onPress: b.onAction }] : []
          }
          onDismiss={b.onDismiss ?? undefined}
        />
      ))}
    </View>
  );
}
