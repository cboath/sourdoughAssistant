import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import { t } from '../../lib/i18n';
import { useTheme } from '../theme';
import { Divider } from './Divider';
import { ListRow } from './ListRow';
import { Sheet } from './Sheet';

/** iOS drops an alert raised while a modal is still dismissing, so actions wait for the slide-out. */
export const ACTION_DELAY_MS = 350;

export interface SheetAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** A gap and a divider above this row: destructive rows sit apart from the rest (DR2-11). */
  separatorBefore?: boolean;
}

export interface ActionSheetProps {
  /** Open while this is set. */
  title: string | null;
  actions: readonly SheetAction[];
  onClose: () => void;
}

/**
 * Overflow and long-press menus. A sheet instead of `Alert`, because Android alerts allow only
 * three buttons. The chosen action runs after the sheet has slid out, so an alert it raises (a delete
 * confirm) is not dropped by iOS.
 */
export function ActionSheet({ title, actions, onClose }: ActionSheetProps) {
  const { space } = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A pending action must not fire after the screen is gone.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Sheet visible={title !== null} onClose={onClose} title={title ?? ''}>
      <View accessibilityRole="menu">
        {actions.map((action) => (
          <View key={action.label}>
            {action.separatorBefore || action.destructive ? (
              <View style={{ paddingTop: space.md }}>
                <Divider />
              </View>
            ) : null}
            <ListRow
              variant={action.destructive ? 'destructive' : 'action'}
              title={action.label}
              disabled={action.disabled}
              onPress={() => {
                onClose();
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(action.onPress, ACTION_DELAY_MS);
              }}
              testID={`action-${action.label}`}
            />
          </View>
        ))}
        {Platform.OS === 'ios' ? (
          <View style={{ paddingTop: space.sm }}>
            <ListRow
              variant="action"
              title={t('common.cancel')}
              onPress={onClose}
              testID="action-cancel"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
