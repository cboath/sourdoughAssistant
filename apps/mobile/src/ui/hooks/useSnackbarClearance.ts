import { useNavigation } from 'expo-router';
import { useEffect, useId } from 'react';
import { useSnackbarStore } from '../../state/snackbar';

interface FocusNavigation {
  addListener(type: 'focus' | 'blur', listener: () => void): () => void;
}

/**
 * Tells the snackbar how much of the bottom edge this screen's pinned UI covers (a tab bar, a
 * BottomActionBar, a FAB). Registered while the screen is focused, so a screen under a pushed one
 * doesn't keep the snackbar high.
 */
export function useSnackbarClearance(height: number): void {
  const owner = useId();
  const navigation = useNavigation() as unknown as FocusNavigation;
  useEffect(() => {
    const { setClearance, clearClearance } = useSnackbarStore.getState();
    const on = () => setClearance(owner, height);
    const off = () => clearClearance(owner);
    on();
    const unsubFocus = navigation.addListener?.('focus', on);
    const unsubBlur = navigation.addListener?.('blur', off);
    return () => {
      unsubFocus?.();
      unsubBlur?.();
      off();
    };
  }, [owner, height, navigation]);
}
