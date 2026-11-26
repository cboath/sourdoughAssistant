import { View } from 'react-native';
import { useTheme } from '../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type EmptyStateVariant = 'firstUse' | 'search' | 'error';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  /** Max two sentences. */
  body?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  icon?: IconName;
  testID?: string;
}

export function EmptyState({
  variant = 'firstUse',
  title,
  body,
  action,
  secondaryAction,
  icon,
  testID,
}: EmptyStateProps) {
  const { space, size, layout } = useTheme();
  const glyph: IconName =
    icon ?? (variant === 'search' ? 'search' : variant === 'error' ? 'error' : 'book');
  return (
    <View
      testID={testID}
      style={{
        alignItems: 'center',
        paddingTop: space.xxxl,
        paddingHorizontal: layout.screenMargin,
        gap: space.md,
      }}
    >
      <Icon
        name={glyph}
        size={size.iconHero}
        color={variant === 'error' ? 'danger' : 'textSecondary'}
      />
      <Text variant="title2" heading style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text color="textSecondary" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: space.md }}>
          <Button label={action.label} onPress={action.onPress} />
        </View>
      ) : null}
      {secondaryAction ? (
        <Button variant="text" label={secondaryAction.label} onPress={secondaryAction.onPress} />
      ) : null}
    </View>
  );
}
