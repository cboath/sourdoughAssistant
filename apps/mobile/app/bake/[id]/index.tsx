import { Stack, useRouter } from 'expo-router';
import { t } from '../../../src/lib/i18n';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';
import { ScreenPlaceholder } from '../../../src/ui/components/ScreenPlaceholder';

// RN-08 builds BAKE-LIVE. `step` only focuses a step; nothing is written from params.
export default function BakeLive() {
  const router = useRouter();
  const result = useRouteParams(routeParams.bake);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return (
    <>
      <Stack.Screen options={{ title: t('placeholder.bake') }} />
      <ScreenPlaceholder title={t('placeholder.bake')} />
    </>
  );
}
