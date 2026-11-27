/**
 * Notification taps (ADR 0011 section 4): `useLastNotificationResponse` covers a cold start and
 * later taps. The payload is validated before navigating (SEC-01 M2); anything invalid opens `/`.
 */
import * as Notifications from 'expo-notifications';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { logger } from '../../../lib/logger';
import { href } from '../../../lib/nav';
import { pathForPayload } from '../payload';

export function useNotificationTaps(): void {
  const router = useRouter();
  const pathname = usePathname();
  // The tap handler runs once per tap; it reads the route as of that tap.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    // The hook keeps returning the last response; act on each tap once.
    const key = `${response.notification.request.identifier}|${response.notification.date}`;
    if (handled.current === key) return;
    handled.current = key;

    const { path, valid } = pathForPayload(response.notification.request.content.data);
    if (!valid) logger.warn('notif.tap_invalid');
    if (path === '/') router.navigate(href('/'));
    else if (pathnameRef.current === path.split('?')[0]) {
      // Already on that bake (a second reminder while it is open): update the step, don't stack
      // a duplicate live screen (QA04-R1).
      router.replace(href(path));
    } else router.push(href(path));
  }, [response, router]);
}
