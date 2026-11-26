/** Maps the `haptic.*` tokens (tokens.md section 6) to expo-haptics. Failures are ignored: haptics are never essential. */
import * as Haptics from 'expo-haptics';
import type { haptic as hapticTokens } from './theme/tokens';

export type HapticKind = keyof typeof hapticTokens;

export function haptic(kind: HapticKind): void {
  try {
    let pending: Promise<void>;
    switch (kind) {
      case 'selection':
        pending = Haptics.selectionAsync();
        break;
      case 'success':
        pending = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        pending = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'impactLight':
        pending = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
    }
    // Some test and web environments return undefined.
    void Promise.resolve(pending).catch(() => undefined);
  } catch {
    // ignore
  }
}
