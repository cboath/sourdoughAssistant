import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { usePickedItem } from '../../src/features/pantry/pickedItem';
import { useRecipeDraft } from '../../src/features/recipes/store';
import { RouteErrorBoundary } from '../../src/ui/components/RouteErrorBoundary';
import { useStackScreenOptions } from '../../src/ui/navigation';

export { RouteErrorBoundary as ErrorBoundary };

/** Owns the draft's lifetime: it is created by the editor screen and dropped when the modal closes. */
export default function RecipeEditorLayout() {
  const options = useStackScreenOptions();
  useEffect(
    () => () => {
      useRecipeDraft.getState().reset();
      usePickedItem.getState().clear();
    },
    [],
  );
  return <Stack screenOptions={options} />;
}
