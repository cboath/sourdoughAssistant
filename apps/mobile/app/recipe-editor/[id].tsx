import { Stack, useRouter } from 'expo-router';
import { t } from '../../src/lib/i18n';
import { routeParams } from '../../src/lib/route-params';
import { useRouteParams } from '../../src/lib/useRouteParams';
import { NotFoundView } from '../../src/ui/components/NotFoundView';
import { ScreenPlaceholder } from '../../src/ui/components/ScreenPlaceholder';

// RN-05 builds this editor. Params only prefill or select; nothing is written on mount.
export default function RecipeEditorScreen() {
  const router = useRouter();
  const result = useRouteParams(routeParams.recipeEditor);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return (
    <>
      <Stack.Screen options={{ title: t('placeholder.recipeEditor') }} />
      <ScreenPlaceholder title={t('placeholder.recipeEditor')} />
    </>
  );
}
