import { useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { confirm, type ConfirmOptions } from './confirm';

/**
 * Asks before leaving a dirty editor (screens-recipes.md 0.3, flows.md 1.5): the Android back
 * button, the X and the iOS Cancel all end up here. Call `allowLeave()` right before a programmatic
 * close after a successful save.
 */
/** The slice of the navigation object used here (the generated event map does not list beforeRemove). */
interface GuardNavigation {
  addListener(
    type: 'beforeRemove',
    listener: (event: { preventDefault(): void; data: { action: unknown } }) => void,
  ): () => void;
  dispatch(action: unknown): void;
  /** The navigator that owns this screen's container (the root-stack modal for a nested editor). */
  getParent?(): { setOptions?(options: { gestureEnabled: boolean }): void } | undefined;
}

export function useDiscardGuard(
  dirty: boolean,
  options: ConfirmOptions,
  /** The screen is the root of a modal: also block the iOS swipe-down while dirty. */
  modalRoot = false,
) {
  const navigation = useNavigation() as unknown as GuardNavigation;
  const leaving = useRef(false);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (event) => {
      if (leaving.current || !dirty) return;
      event.preventDefault();
      void confirm(optionsRef.current).then((discard) => {
        if (!discard) return;
        leaving.current = true;
        navigation.dispatch(event.data.action);
      });
    });
    return unsubscribe;
  }, [dirty, navigation]);

  // iOS swipe-to-dismiss acts on the root-stack screen that holds the modal, not on the editor
  // screen inside it, and a JS listener can't cancel a native dismissal (needs a simulator check).
  useEffect(() => {
    if (!modalRoot) return undefined;
    const parent = navigation.getParent?.();
    parent?.setOptions?.({ gestureEnabled: !dirty });
    return () => parent?.setOptions?.({ gestureEnabled: true });
  }, [dirty, modalRoot, navigation]);

  const allowLeave = useCallback(() => {
    leaving.current = true;
  }, []);
  return { allowLeave };
}
