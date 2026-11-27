/**
 * Deep-link allowlist (SEC-01 M2). Pure function so it is unit-tested without React.
 * Allowed: `/` and `/bake/<uuid>` with an optional single `?step=<uuid>`, plus the IO-01 spike
 * route in `__DEV__` builds only. Everything else, including extra query keys, repeated keys, other schemes and malformed ids, maps to `/`.
 */
import { uuidParam } from './route-params';

const SAFE_ROOT = '/';
/** IO-01 spike screen. Admitted only in development builds (`__DEV__`), never in release. */
const DEV_ROUTES: readonly string[] = ['/dev-notifications'];

function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export function sanitizeIncomingPath(input: string): string {
  try {
    let rest = input.trim();
    if (rest.length === 0 || rest.length > 300) return SAFE_ROOT;

    const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(rest);
    if (scheme) {
      // Web links are not part of v1 (no associated domains).
      if (/^https?$/i.test(scheme[1]!)) return SAFE_ROOT;
      rest = rest.slice(scheme[0].length);
    }
    if (rest.includes('#')) return SAFE_ROOT;

    const [pathPart = '', query, ...extra] = rest.split('?');
    if (extra.length > 0) return SAFE_ROOT;
    if (isDevBuild() && query === undefined) {
      const dev = `/${pathPart.replace(/^\/+/, '').replace(/\/$/, '')}`;
      if (DEV_ROUTES.includes(dev)) return dev;
    }
    const segments = pathPart.replace(/^\/+/, '').replace(/\/$/, '').split('/');
    if (segments.length !== 2 || segments[0] !== 'bake') return SAFE_ROOT;
    const id = uuidParam.safeParse(segments[1]);
    if (!id.success) return SAFE_ROOT;

    if (query === undefined || query === '') return `/bake/${id.data}`;

    const pairs = query.split('&');
    if (pairs.length !== 1) return SAFE_ROOT;
    const [key, value, ...more] = pairs[0]!.split('=');
    if (key !== 'step' || value === undefined || more.length > 0) return SAFE_ROOT;
    const step = uuidParam.safeParse(value);
    if (!step.success) return SAFE_ROOT;
    return `/bake/${id.data}?step=${step.data}`;
  } catch {
    return SAFE_ROOT;
  }
}
