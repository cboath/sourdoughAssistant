/** Snackbars and logging shared by the live hooks: Undo, "can't undo anymore" and rejected writes. */
import { t } from '../../lib/i18n';
import { logger } from '../../lib/logger';
import { showSnackbar } from '../../state/snackbar';
import { haptic } from '../../ui/haptics';
import {
  LIVE_ERROR_CODES,
  type LiveError,
  type LiveOps,
  type RevertToken,
} from './services/liveOps';

/** Logs which rejection it was as an index into a fixed list, never a string (SEC-M45-08). */
export function reportRejected(error: LiveError): void {
  logger.warn('live.action_rejected', { code: LIVE_ERROR_CODES.indexOf(error.code) });
  haptic('warning');
  showSnackbar({ message: t('live.actionFailed') });
}

/** "{message}" with Undo. If something else changed the bake since, Undo says so instead of doing nothing. */
export function showUndoSnackbar(
  service: Pick<LiveOps, 'revert'>,
  message: string,
  token: RevertToken,
  spokenMessage?: string,
): void {
  showSnackbar({
    message,
    ...(spokenMessage ? { spokenMessage } : {}),
    actionLabel: t('common.undo'),
    onAction: () => {
      haptic('impactLight');
      service
        .revert(token)
        .then((result) => {
          if (!result.ok) showSnackbar({ message: t('live.undoExpired') });
        })
        .catch((error: unknown) => logger.error('live.revert_failed', error));
    },
  });
}
