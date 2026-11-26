import { Stack } from 'expo-router';
import { t } from '../../../src/lib/i18n';
import { ScreenPlaceholder } from '../../../src/ui/components/ScreenPlaceholder';

export default function RecipesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t('tabs.recipes') }} />
      <ScreenPlaceholder title={t('tabs.recipes')} body={t('placeholder.recipes')} />
    </>
  );
}
