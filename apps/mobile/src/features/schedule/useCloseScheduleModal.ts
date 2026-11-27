import { useNavigation, useRouter } from 'expo-router';
import { useCallback } from 'react';

interface ParentNavigation {
  getParent?(): { goBack(): void; canGoBack?(): boolean } | undefined;
}

/**
 * Closes the whole schedule modal from any screen in it. `router.dismissAll()` only pops to the
 * first screen of the modal's own stack, which from the plan is the picker, so Cancel would need
 * two taps (DR2-18). Going back on the parent navigator removes the modal itself, and
 * `useScheduleCloseGuard` runs once.
 */
export function useCloseScheduleModal(): () => void {
  const router = useRouter();
  const navigation = useNavigation() as unknown as ParentNavigation;
  return useCallback(() => {
    const parent = navigation.getParent?.();
    if (parent && (parent.canGoBack?.() ?? true)) parent.goBack();
    else router.dismissAll();
  }, [navigation, router]);
}
