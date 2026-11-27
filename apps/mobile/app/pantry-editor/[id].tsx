import { useRouter } from 'expo-router';
import { PantryEditorScreen } from '../../src/features/pantry/components/PantryEditorScreen';
import { routeParams } from '../../src/lib/route-params';
import { useRouteParams } from '../../src/lib/useRouteParams';
import { NotFoundView } from '../../src/ui/components/NotFoundView';

// Params only prefill or focus; nothing is written on mount (SEC-01 M2).
export default function PantryEditorRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.pantryEditor);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
  return <PantryEditorScreen {...result.params} />;
}
