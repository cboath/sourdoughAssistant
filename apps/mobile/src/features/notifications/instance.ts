/**
 * The registered service, for callers that cannot receive it by injection (the live screen's seam,
 * permission actions, banners). Every function is safe before registration: it logs and does nothing.
 */
import { logger } from '../../lib/logger';
import type { NotificationService } from './service';
import type { ReconcileMode, ReconcileResult } from './types';

let service: NotificationService | null = null;

export function setNotificationService(next: NotificationService | null): void {
  service = next;
}

export function getNotificationService(): NotificationService | null {
  return service;
}

/** Reconciles the OS queue with the database. `rebuild` after a restore, a grant or a zone change. */
export async function reconcileNotifications(options?: {
  mode?: ReconcileMode;
}): Promise<ReconcileResult | null> {
  if (!service) {
    logger.warn('notif.service_missing');
    return null;
  }
  return service.reconcile(options);
}

/**
 * RN-08 calls this after a step is done, held, extended (+15), the bake is cancelled or finished,
 * or the plan is recomputed (including undo). It is a full `diff` reconcile, so a bake that is no
 * longer `scheduled` or `active` loses its pending reminders. It never throws.
 */
export async function rescheduleBake(bakeId: string): Promise<ReconcileResult | null> {
  if (!service) {
    logger.warn('notif.service_missing');
    return null;
  }
  return service.rescheduleBake(bakeId);
}

/** Cancels every pending reminder of one bake without reading the database (cancel, finish, delete). */
export async function cancelBakeNotifications(bakeId: string): Promise<number> {
  return service ? service.cancelBake(bakeId) : 0;
}
