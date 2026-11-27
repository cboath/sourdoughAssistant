import { useRepositories } from '../state/repositories';
import { useNotificationLifecycle } from '../features/notifications/hooks/useNotificationLifecycle';
import { useNotificationTaps } from '../features/notifications/hooks/useNotificationTaps';

/**
 * Starts the notification service and handles taps. Mount once, inside the DB gate (it needs the
 * repositories) and inside the navigator (taps navigate). Renders nothing.
 */
export function NotificationsHost() {
  const repos = useRepositories();
  useNotificationLifecycle(repos);
  useNotificationTaps();
  return null;
}
