import { useRouter } from 'expo-router';
import { StepEditorScreen } from '../../src/features/recipes/components/StepEditorScreen';
import { routeParams } from '../../src/lib/route-params';
import { useRouteParams } from '../../src/lib/useRouteParams';
import { NotFoundView } from '../../src/ui/components/NotFoundView';

export default function StepEditorRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.stepEditor);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return <StepEditorScreen stepId={result.params.stepId} />;
}
