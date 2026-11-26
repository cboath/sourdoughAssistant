import { View } from 'react-native';
import { useTheme } from '../theme';
import { EmptyState } from './EmptyState';

/** Temporary body for routes whose real screens land in later tasks (RN-05 to RN-10). */
export function ScreenPlaceholder({ title, body }: { title: string; body?: string }) {
  const { color } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: color.background }} testID="screen-placeholder">
      <EmptyState title={title} body={body} />
    </View>
  );
}
