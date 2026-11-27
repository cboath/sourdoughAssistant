import { ScrollView, View } from 'react-native';
import { Banner } from '../../../ui/components/Banner';
import { BottomActionBar } from '../../../ui/components/BottomActionBar';
import { Button } from '../../../ui/components/Button';
import { ContentColumn } from '../../../ui/components/ContentColumn';
import { Icon } from '../../../ui/components/Icon';
import { Text } from '../../../ui/components/Text';
import { useTheme } from '../../../ui/theme';

export interface PermissionPrimerProps {
  /** `perm.scheduled` banner text, when the bake was just saved. */
  scheduledMessage?: string | null;
  title: string;
  body: string;
  /** Benefit rows (PERM-NOTIF). */
  benefits?: readonly string[];
  /** One explanatory line (PERM-ALARM). */
  footnote?: string;
  allowLabel: string;
  laterLabel: string;
  onAllow: () => void;
  onLater: () => void;
  /** The system prompt is open: the primary button shows its loading state and ignores taps. */
  busy?: boolean;
  testID?: string;
}

/**
 * Shared layout for PERM-NOTIF and PERM-ALARM (screens-bake.md 5.1 and 6.1). No illustration yet
 * (open-questions E5), so nothing to hide at large text. Content scrolls; the action bar is pinned.
 */
export function PermissionPrimer({
  scheduledMessage,
  title,
  body,
  benefits,
  footnote,
  allowLabel,
  laterLabel,
  onAllow,
  onLater,
  busy = false,
  testID,
}: PermissionPrimerProps) {
  const { color, space } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: color.background }} testID={testID}>
      <ScrollView contentContainerStyle={{ paddingVertical: space.xl }}>
        <ContentColumn style={{ gap: space.lg }}>
          {scheduledMessage ? <Banner variant="success" message={scheduledMessage} /> : null}
          <Text variant="title1" heading>
            {title}
          </Text>
          <Text variant="body">{body}</Text>
          {benefits && benefits.length > 0 ? (
            <View accessibilityRole="list" style={{ gap: space.md }}>
              {benefits.map((benefit) => (
                <View
                  key={benefit}
                  accessible
                  style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}
                >
                  <Icon name="check" color="accent" />
                  <Text variant="body" style={{ flex: 1 }}>
                    {benefit}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {footnote ? (
            <Text variant="footnote" color="textSecondary">
              {footnote}
            </Text>
          ) : null}
        </ContentColumn>
      </ScrollView>
      <BottomActionBar>
        <Button label={allowLabel} size="lg" fullWidth loading={busy} onPress={onAllow} />
        <Button
          label={laterLabel}
          variant="text"
          size="lg"
          fullWidth
          disabled={busy}
          onPress={onLater}
        />
      </BottomActionBar>
    </View>
  );
}
