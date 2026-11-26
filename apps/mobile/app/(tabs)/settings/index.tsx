import { Stack } from 'expo-router';
import { t } from '../../../src/lib/i18n';
import { ScreenPlaceholder } from '../../../src/ui/components/ScreenPlaceholder';

export default function SettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t('tabs.settings') }} />
      <ScreenPlaceholder title={t('tabs.settings')} body={t('placeholder.settings')} />
    </>
  );
}
