import { Stack } from 'expo-router';
import { RouteErrorBoundary } from '../../../src/ui/components/RouteErrorBoundary';
import { useStackScreenOptions } from '../../../src/ui/navigation';

export { RouteErrorBoundary as ErrorBoundary };

export default function PantryLayout() {
  const options = useStackScreenOptions();
  return <Stack screenOptions={options} />;
}
