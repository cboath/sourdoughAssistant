import { useEffect, useRef, type ComponentRef, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  findNodeHandle,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { t } from '../../lib/i18n';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  testID?: string;
  /**
   * The control that opened the sheet. When the sheet closes, screen-reader focus returns to it
   * (components.md 1.4.7).
   */
  openerRef?: RefObject<unknown>;
}

/**
 * Bottom sheet for pickers and short tasks (INGR-PICK, PRICE-UPDATE, unit picker). A component
 * sheet, not a route (architecture section 4), so it is never deep-linkable. Built on `Modal` for
 * both platforms; iOS may later move to a native formSheet without changing this API.
 */
export function Sheet({ visible, onClose, title, children, testID, openerRef }: SheetProps) {
  const { color, space, radius, size, layout, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const titleRef = useRef<ComponentRef<typeof View>>(null);

  useEffect(() => {
    if (!visible) return undefined;
    // Move screen-reader focus to the title once the modal is mounted.
    const timer = setTimeout(() => {
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 100);
    return () => {
      clearTimeout(timer);
      // Closing: put focus back on the control that opened the sheet.
      // Read at close time on purpose: the opener is still mounted and holds the node to refocus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const opener = openerRef?.current;
      const target = opener ? findNodeHandle(opener as never) : null;
      if (target) {
        const refocus = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(target), 300);
        // Don't keep a test process (or anything else) alive for a focus nudge.
        (refocus as { unref?: () => void }).unref?.();
      }
    };
  }, [visible, openerRef]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
        testID={testID}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: color.scrim,
          }}
        />
        <View
          accessibilityViewIsModal
          style={{
            // Landscape: keep the sheet a readable width and within the height.
            maxHeight: height * 0.9,
            width: '100%',
            maxWidth: layout.maxContentWidth,
            alignSelf: 'center',
            backgroundColor: isDark ? color.surfaceRaised : color.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            paddingBottom: insets.bottom,
          }}
        >
          <View
            accessible={false}
            style={{
              alignSelf: 'center',
              width: space.xxl,
              height: space.xs,
              marginTop: space.sm,
              borderRadius: radius.full,
              backgroundColor: color.borderStrong,
              opacity: Platform.OS === 'android' ? 0.4 : 1,
            }}
          />
          <View
            ref={titleRef}
            accessible
            accessibilityRole="header"
            style={{
              paddingHorizontal: space.lg,
              paddingVertical: space.md,
              minHeight: size.touchMin,
            }}
          >
            <Text variant="title2">{title}</Text>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
