import { logger } from '../src/lib/logger';
import { sanitizeIncomingPath } from '../src/lib/deepLinks';

/**
 * SEC-01 M2: the only incoming deep links are `/` and `/bake/<uuid>` (optional `?step=<uuid>`).
 * Everything else is rewritten to `/`. In-app `router.push` is not affected.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const safe = sanitizeIncomingPath(path);
  if (safe === '/' && path.trim() !== '/' && path.trim() !== '') {
    logger.info('deeplink.rejected');
  }
  return safe;
}
