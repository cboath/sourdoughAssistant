import type { NativeStackNavigationOptions } from 'expo-router';
import { Platform } from 'react-native';
import { t } from '../lib/i18n';
import { HeaderTextButton } from './components/HeaderTextButton';
import { IconButton } from './components/IconButton';

export interface EditorHeaderConfig {
  title: string;
  onClose: () => void;
  onSave: () => void;
  /** Disabled while the form is clean (screens-recipes.md 0.3), with the reason as a hint. */
  saveDisabled?: boolean;
  saveLabel?: string;
  closeLabel?: string;
  /** Pushed screens use a back control and "Done" instead of Cancel and Save. */
  pushed?: boolean;
}

/** Header for modal editors: iOS "Cancel | title | Save", Android "X | title | Save". */
export function editorHeaderOptions(config: EditorHeaderConfig): NativeStackNavigationOptions {
  const closeLabel = config.closeLabel ?? t('common.cancel');
  return {
    title: config.title,
    // Pushed editors keep the native back button and edge swipe; `useDiscardGuard` asks first.
    // Modal roots block swipe-to-dismiss while dirty (the root screen is handled by the guard).
    ...(config.pushed
      ? { gestureEnabled: true, headerBackTitle: t('edit.backTitle') }
      : { gestureEnabled: !!config.saveDisabled, headerBackVisible: false }),
    headerLeft: config.pushed
      ? undefined
      : () =>
          Platform.OS === 'android' ? (
            <IconButton icon="close" accessibilityLabel={closeLabel} onPress={config.onClose} />
          ) : (
            <HeaderTextButton label={closeLabel} onPress={config.onClose} />
          ),
    headerRight: () => (
      <HeaderTextButton
        label={config.saveLabel ?? t('common.save')}
        bold
        onPress={config.onSave}
        disabled={config.saveDisabled}
        accessibilityHint={config.saveDisabled ? t('common.noChanges') : undefined}
      />
    ),
  };
}
