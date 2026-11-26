import { Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme/tokens';
import { t } from '../../lib/i18n';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import { Text } from './Text';

export type BannerVariant = 'info' | 'warning' | 'danger' | 'success';

export interface BannerAction {
  label: string;
  onPress: () => void;
}

export interface BannerProps {
  variant?: BannerVariant;
  message: string;
  /** Up to two text actions. */
  actions?: readonly BannerAction[];
  /** Persistent: it is only removed when resolved or dismissed by the user. */
  onDismiss?: () => void;
  /** 56 pt action targets for the live view. */
  tier?: 'standard' | 'kitchen';
  testID?: string;
}

const STYLES: Record<
  BannerVariant,
  { bg: keyof ColorTokens; fg: keyof ColorTokens; icon: IconName }
> = {
  info: { bg: 'infoContainer', fg: 'textOnInfoContainer', icon: 'info' },
  warning: { bg: 'warningContainer', fg: 'textOnWarningContainer', icon: 'warning' },
  danger: { bg: 'dangerContainer', fg: 'textOnDangerContainer', icon: 'error' },
  success: { bg: 'successContainer', fg: 'textOnSuccessContainer', icon: 'check' },
};

export function Banner({
  variant = 'info',
  message,
  actions = [],
  onDismiss,
  tier = 'standard',
  testID,
}: BannerProps) {
  const { color, space, radius, size } = useTheme();
  const style = STYLES[variant];
  const actionHeight = tier === 'kitchen' ? size.touchKitchen : size.touchMin;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: space.md,
        padding: space.lg,
        borderRadius: radius.md,
        backgroundColor: color[style.bg],
        alignItems: 'flex-start',
      }}
    >
      <Icon name={style.icon} color={style.fg} />
      <View style={{ flex: 1, gap: space.xs }}>
        <Text
          variant="callout"
          color={style.fg}
          accessibilityRole={variant === 'warning' || variant === 'danger' ? 'alert' : undefined}
        >
          {message}
        </Text>
        {actions.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {actions.slice(0, 2).map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={action.onPress}
                style={{
                  minHeight: actionHeight,
                  justifyContent: 'center',
                  paddingRight: space.md,
                }}
              >
                <Text
                  variant="headline"
                  color={style.fg}
                  style={{ textDecorationLine: 'underline' }}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      {onDismiss ? (
        <IconButton icon="close" accessibilityLabel={t('common.dismiss')} onPress={onDismiss} />
      ) : null}
    </View>
  );
}
