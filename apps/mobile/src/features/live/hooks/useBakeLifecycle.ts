/**
 * Finish and cancel a whole bake, from the live overflow menu or a home card's menu. Both ask
 * first (a native confirm). Finish can be undone from the snackbar; cancel can't (screens-bake.md
 * 0.7, 8.5).
 */
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { BakeAggregate } from '../../../db/types';
import { clock } from '../../../lib/clock';
import { t } from '../../../lib/i18n';
import { logger } from '../../../lib/logger';
import { showSnackbar } from '../../../state/snackbar';
import { confirm } from '../../../ui/confirm';
import { haptic } from '../../../ui/haptics';
import { reportRejected, showUndoSnackbar } from '../feedback';
import { useBakeService } from '../../schedule/hooks/useScheduleData';
import type { RevertToken } from '../services/liveOps';

export function useBakeLifecycle(options: { closeScreen: boolean }) {
  const service = useBakeService();
  const router = useRouter();
  const { closeScreen } = options;

  const failed = reportRejected;

  const undo = useCallback(
    (message: string, token: RevertToken) => showUndoSnackbar(service, message, token),
    [service],
  );

  const finishBake = useCallback(
    async (aggregate: BakeAggregate) => {
      const ok = await confirm({
        title: t('live.finishConfirm.title'),
        message: t('live.finishConfirm.body'),
        confirmLabel: t('live.finishConfirm.confirm'),
        cancelLabel: t('live.keepBaking'),
      });
      if (!ok) return;
      try {
        const result = await service.finish(aggregate.bake.id, clock.now());
        if (!result.ok) return failed(result.error);
        haptic('success');
        if (closeScreen) router.back();
        const recipes = aggregate.items.map((i) => i.recipeSnapshot.recipe.name).join(', ');
        undo(t('home.finished.snack', { recipe: recipes }), result.value.revertToken);
      } catch (error) {
        logger.error('live.finish_failed', error);
        showSnackbar({ message: t('live.actionFailed') });
      }
    },
    [service, failed, router, undo, closeScreen],
  );

  const cancelBake = useCallback(
    async (aggregate: BakeAggregate) => {
      const ok = await confirm({
        title: t('live.cancel.title'),
        message: t('live.cancel.body'),
        confirmLabel: t('live.cancel.confirm'),
        cancelLabel: t('live.keepBaking'),
        destructive: true,
      });
      if (!ok) return;
      try {
        const result = await service.cancel(aggregate.bake.id, clock.now());
        if (!result.ok) return failed(result.error);
        if (closeScreen) router.back();
        showSnackbar({ message: t('live.cancelled') });
      } catch (error) {
        logger.error('live.cancel_failed', error);
        showSnackbar({ message: t('live.actionFailed') });
      }
    },
    [service, failed, router, closeScreen],
  );

  return { finishBake, cancelBake };
}
