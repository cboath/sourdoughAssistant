/**
 * QA-04: wires the real notification service to the real bake repository and the two side-effect
 * seams the way `registerNotifications` does, over the in-memory database and a fake OS queue. The
 * seams are awaited here so a test can assert right after the write. Not imported by app code.
 */
import type { TestDb } from '../../../db/test-utils';
import { rescheduleBake, setNotificationService } from '../instance';
import { setLiveSideEffects } from '../../live/sideEffects';
import { setScheduleSideEffects } from '../../schedule/sideEffects';
import { createBakeService, type BakeService } from '../../schedule/services/bakeService';
import { createNotificationService, type NotificationService } from '../service';
import { usePermissions } from '../store';
import type { NotificationIntent } from '../types';
import { createFakeNotifier, type FakeNotifier } from './fixtures';

export interface Harness {
  db: TestDb;
  notifier: FakeNotifier;
  service: NotificationService;
  bakeService: BakeService;
  clock: { now: number; zone: string };
  /** The `sa1:` ids pending in the fake OS queue, sorted. */
  pending(bakeId?: string): string[];
  /** fire time (ms) by id for the pending `sa1:` requests. */
  fireTimes(bakeId?: string): Map<string, number>;
  intent(id: string): NotificationIntent;
  dispose(): void;
}

export function createHarness(
  db: TestDb,
  options: { platform?: 'ios' | 'android'; now: number; zone: string; readyEnabled?: boolean },
): Harness {
  usePermissions.getState().reset();
  const notifier = createFakeNotifier(options.platform ?? 'ios');
  const clock = { now: options.now, zone: options.zone };
  const service = createNotificationService({
    bakes: db.repos.bakes,
    notifier,
    now: () => clock.now,
    zone: () => clock.zone,
    locale: 'en-US',
    readyEnabled: () => options.readyEnabled ?? false,
  });
  setNotificationService(service);
  setScheduleSideEffects({
    onBakeScheduled: async () => {
      await service.reconcile({ mode: 'diff' });
    },
  });
  setLiveSideEffects({
    onBakeProgressChanged: async (bakeId) => {
      await rescheduleBake(bakeId);
    },
  });
  const bakeService = createBakeService(db.repos, () => undefined);
  const prefix = (bakeId?: string) => (bakeId ? `sa1:${bakeId}:` : 'sa1:');
  return {
    db,
    notifier,
    service,
    bakeService,
    clock,
    pending: (bakeId) => notifier.ids(prefix(bakeId)),
    fireTimes: (bakeId) =>
      new Map(notifier.ids(prefix(bakeId)).map((id) => [id, notifier.intents.get(id)!.fireAtMs])),
    intent: (id) => {
      const found = notifier.intents.get(id);
      if (!found) throw new Error(`no pending intent ${id}`);
      return found;
    },
    dispose() {
      setNotificationService(null);
      setScheduleSideEffects(null);
      setLiveSideEffects(null);
      usePermissions.getState().reset();
    },
  };
}
