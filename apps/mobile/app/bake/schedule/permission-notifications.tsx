import { useRouter } from 'expo-router';
import { NotificationPrimerScreen } from '../../../src/features/notifications/components/NotificationPrimerScreen';
import { routes } from '../../../src/lib/nav';
import { routeParams } from '../../../src/lib/route-params';
import { useRouteParams } from '../../../src/lib/useRouteParams';
import { NotFoundView } from '../../../src/ui/components/NotFoundView';

// `bakeId` only names the bake that was just saved; nothing is written on mount.
export default function PermissionNotificationsRoute() {
  const router = useRouter();
  const result = useRouteParams(routeParams.permissionPrimer);
  if (!result.ok) return <NotFoundView onGoHome={() => router.replace(routes.bakes)} />;
  return <NotificationPrimerScreen bakeId={result.params.bakeId} />;
}
