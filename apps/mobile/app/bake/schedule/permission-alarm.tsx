import { useRouter } from 'expo-router';
import { Platform } from 'react-native';
import { AlarmPrimerScreen } from '../../../src/features/notifications/components/AlarmPrimerScreen';
import { routes } from '../../../src/lib/nav';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';

// Android 12+ only. On iOS there is no such permission, so a stray link is a not-found.
export default function PermissionAlarmRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.permissionPrimer);
  if (!result.ok || Platform.OS !== 'android') {
    return <NotFoundView onGoHome={() => router.replace(routes.bakes)} />;
  }
  return <AlarmPrimerScreen bakeId={result.params.bakeId} />;
}
