import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSnackbarStore } from '../../state/snackbar';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface SnackbarProps {
  message: string;
  spokenMessage?: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Defaults to `motion.snackbarDuration` (8 s). */
  durationMs?: number;
  /** Space reserved below it (a BottomActionBar or hero button), so it never covers them. */
  bottomOffset?: number;
  /** Test hook: treat a screen reader as on or off without asking the OS. */
  screenReader?: boolean;
}

/** Brief confirmation with Undo. The timer pauses while the user touches it. */
export function Snackbar({
  message,
  spokenMessage,
  actionLabel,
  onAction,
  onDismiss,
  durationMs,
  bottomOffset = 0,
  screenReader,
}: SnackbarProps) {
  const { color, space, radius, size, motion, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const duration = durationMs ?? motion.snackbarDuration;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  // With a screen reader on, the message stays until the user acts: swiping to "Undo" can take
  // longer than 8 s (components.md 1.5.2).
  const [reader, setReader] = useState(screenReader ?? false);
  useEffect(() => {
    if (screenReader !== undefined) return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => alive && setReader(on))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [screenReader]);
  const readerRef = useRef(reader);
  readerRef.current = reader;

  const start = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = readerRef.current ? null : setTimeout(() => dismissRef.current(), duration);
  };
  const pause = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    // Android announces through the live region below; iOS has no live regions.
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(spokenMessage ?? message);
    start();
    return pause;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only for a new message or reader change
  }, [message, duration, reader]);

  const background = isDark ? color.surfaceRaised : color.textPrimary;
  const textColor = isDark ? 'textPrimary' : 'background';
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: space.lg + insets.left,
        right: space.lg + insets.right,
        // `bottomOffset` already includes the bottom inset when something is pinned there.
        bottom: (bottomOffset > 0 ? bottomOffset : insets.bottom) + space.lg,
      }}
    >
      <View
        testID="snackbar"
        accessibilityLiveRegion="polite"
        onTouchStart={pause}
        onTouchEnd={start}
        onTouchCancel={start}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: size.touchMin,
          paddingLeft: space.lg,
          gap: space.md,
          borderRadius: Platform.OS === 'ios' ? radius.md : radius.sm,
          backgroundColor: background,
          ...(isDark ? { borderWidth: size.borderWidth, borderColor: color.border } : null),
        }}
      >
        <Text variant="callout" color={textColor} style={{ flex: 1, paddingVertical: space.md }}>
          {message}
        </Text>
        {actionLabel && onAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            onPress={() => {
              onAction();
              onDismiss();
            }}
            style={{
              minHeight: size.touchMin,
              minWidth: size.touchMin,
              paddingHorizontal: space.lg,
              justifyContent: 'center',
            }}
          >
            <Text variant="headline" color={isDark ? 'accent' : 'accentContainer'}>
              {actionLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/** Mount once in the root layout; renders whatever `showSnackbar` queued. */
export function SnackbarHost() {
  const current = useSnackbarStore((s) => s.current);
  const dismiss = useSnackbarStore((s) => s.dismiss);
  const offset = useSnackbarStore((s) =>
    Object.values(s.clearances).reduce((sum, h) => sum + h, 0),
  );
  if (!current) return null;
  return (
    <Snackbar
      key={current.id}
      message={current.message}
      spokenMessage={current.spokenMessage}
      actionLabel={current.actionLabel}
      onAction={current.onAction}
      onDismiss={() => dismiss(current.id)}
      bottomOffset={offset}
    />
  );
}
