import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useScheduleDraft } from '../../../src/features/schedule/store';
import { RouteErrorBoundary } from '../../../src/ui/components/RouteErrorBoundary';
import { useStackScreenOptions } from '../../../src/ui/navigation';

export { RouteErrorBoundary as ErrorBoundary };

// Back from a plan that was opened from a recipe goes to the picker (screens-bake.md 0.1).
export const unstable_settings = { initialRouteName: 'index' };

/** Owns the draft's lifetime: it is dropped when the schedule modal closes. */
export default function ScheduleLayout() {
  const options = useStackScreenOptions();
  useEffect(() => () => useScheduleDraft.getState().reset(), []);
  return <Stack screenOptions={options} />;
}
