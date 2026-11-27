import { useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { routes } from '../../../lib/nav';

interface PrimerNavigation {
  addListener(
    type: 'beforeRemove',
    listener: (event: { preventDefault(): void }) => void,
  ): () => void;
}

// True while `finish` is closing the modal, so the removals it causes don't re-enter it.
let finishing = false;

/**
 * Leaves a primer: closes the schedule modal, switches to Bakes and opens the new bake, the same
 * hand-off the plan screen makes when no primer is due (screens-bake.md section 1).
 *
 * On iOS the page sheet can also be swiped down. That counts as "Not now" (screens-bake.md 5.1):
 * the removal is turned into the same hand-off, so the baker still lands on the new bake (DR2-19).
 */
export function usePrimerFinish(bakeId: string): () => void {
  const router = useRouter();
  const navigation = useNavigation() as unknown as PrimerNavigation;

  const finish = useCallback(() => {
    finishing = true;
    try {
      router.dismissAll();
      router.navigate(routes.bakes);
      router.push(routes.bake(bakeId));
    } finally {
      finishing = false;
    }
  }, [router, bakeId]);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (finishing) return;
        event.preventDefault();
        finish();
      }),
    [navigation, finish],
  );
  return finish;
}
