import { Stack } from 'expo-router';
import { t } from '../../../src/lib/i18n';
import { ScreenPlaceholder } from '../../../src/ui/components/ScreenPlaceholder';

export default function PantryScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t('tabs.pantry') }} />
      <ScreenPlaceholder title={t('tabs.pantry')} body={t('placeholder.pantry')} />
    </>
  );
}
