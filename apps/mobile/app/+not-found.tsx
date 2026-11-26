import { useRouter } from 'expo-router';
import { NotFoundView } from '../src/ui/components/NotFoundView';

export default function NotFound() {
  const router = useRouter();
  return <NotFoundView onGoHome={() => router.replace('/bakes')} />;
}
