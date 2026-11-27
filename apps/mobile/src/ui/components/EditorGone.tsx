import { Stack, useRouter } from 'expo-router';
import { t } from '../../lib/i18n';
import { editorHeaderOptions } from '../editorHeader';
import { EmptyState } from './EmptyState';

/**
 * The "gone" state of an editor (deleted elsewhere, bad link): a way out in the header and in the
 * body, so the user is never stuck in a modal.
 */
export function EditorGone({
  title,
  headerTitle,
  actionLabel,
  pushed = false,
}: {
  title: string;
  headerTitle: string;
  actionLabel: string;
  pushed?: boolean;
}) {
  const router = useRouter();
  const back = () => router.back();
  return (
    <>
      <Stack.Screen
        options={{
          ...editorHeaderOptions({ title: headerTitle, onClose: back, onSave: back, pushed }),
          headerRight: () => null,
        }}
      />
      <EmptyState
        variant="error"
        title={title}
        action={{ label: actionLabel, onPress: back }}
        testID="editor-gone"
      />
    </>
  );
}

export const editorBackLabel = (key: 'recipe' | 'pantry') =>
  key === 'recipe' ? t('detail.backToRecipes') : t('pantry.detail.backToPantry');
