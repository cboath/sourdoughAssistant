import { useNavigation } from 'expo-router';
import { useEffect } from 'react';
import { t } from '../../lib/i18n';
import { confirm } from '../../ui/confirm';
import { useScheduleDraft } from './store';

interface GuardNavigation {
  addListener(
    type: 'beforeRemove',
    listener: (event: { preventDefault(): void; data: { action: unknown } }) => void,
  ): () => void;
  dispatch(action: unknown): void;
  getParent?(): { setOptions?(options: { gestureEnabled: boolean }): void } | undefined;
}

/**
 * Asks before the whole schedule modal closes with a touched draft (screens-bake.md 3.6, 3.11).
 * It sits on the modal's root screen (the picker), so going back from the plan to the picker
 * never asks. The draft is read when the event fires, not captured, so clearing the draft right
 * before a programmatic close (after a successful save) lets that close through.
 */
export function useScheduleCloseGuard(): void {
  const navigation = useNavigation() as unknown as GuardNavigation;
  const touched = useScheduleDraft((s) => s.touched);

  useEffect(() => {
    let leaving = false;
    return navigation.addListener('beforeRemove', (event) => {
      if (leaving || !useScheduleDraft.getState().touched) return;
      event.preventDefault();
      void confirm({
        title: t('plan.discard.title'),
        confirmLabel: t('plan.discard.confirm'),
        cancelLabel: t('plan.discard.keep'),
        destructive: true,
      }).then((discard) => {
        if (!discard) return;
        leaving = true;
        navigation.dispatch(event.data.action);
      });
    });
  }, [navigation]);

  // iOS: block swipe-down while there is something to lose (needs a device check).
  useEffect(() => {
    const parent = navigation.getParent?.();
    parent?.setOptions?.({ gestureEnabled: !touched });
    return () => parent?.setOptions?.({ gestureEnabled: true });
  }, [touched, navigation]);
}
