import { Stack } from 'expo-router';
import { t } from '../../../src/lib/i18n';
import { ScreenPlaceholder } from '../../../src/ui/components/ScreenPlaceholder';

export default function BakesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t('tabs.bakes') }} />
      <ScreenPlaceholder title={t('tabs.bakes')} body={t('placeholder.bakes')} />
    </>
  );
}
