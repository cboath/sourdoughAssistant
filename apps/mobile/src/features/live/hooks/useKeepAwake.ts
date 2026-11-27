/**
 * Keeps the screen on while the live view is open (D5, screens-bake.md 8.7). Released when the
 * app goes to the background, when the bake is complete and when the screen closes. The choice is
 * remembered in `settings.keepAwakeDefault` (architecture 9.1 Q-A11).
 */
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect } from 'react';
import { AppState } from 'react-native';
import { logger } from '../../../lib/logger';
import { useSettings } from '../../../state/settings';

export const KEEP_AWAKE_TAG = 'bake-live';

export function useKeepAwakeWhile(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    let held = false;
    const hold = () => {
      if (held) return;
      held = true;
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch((error: unknown) =>
        logger.warn('live.keep_awake_failed', { code: error ? 1 : 0 }),
      );
    };
    const release = () => {
      if (!held) return;
      held = false;
      Promise.resolve(deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => undefined);
    };
    // `currentState` can be unset right at launch; only a known background state holds off.
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') hold();
    const subscription = AppState.addEventListener('change', (state) =>
      state === 'active' ? hold() : release(),
    );
    return () => {
      subscription.remove();
      release();
    };
  }, [enabled]);
}

/** The remembered default (on until the baker turns it off) and a setter that writes it back. */
export function useKeepAwakeSetting(): [boolean, (next: boolean) => void] {
  const value = useSettings((s) => s.settings?.keepAwakeDefault ?? true);
  const update = useSettings((s) => s.update);
  const set = useCallback(
    (next: boolean) => {
      update({ keepAwakeDefault: next }).catch((error: unknown) =>
        logger.error('live.keep_awake_save_failed', error),
      );
    },
    [update],
  );
  return [value, set];
}
