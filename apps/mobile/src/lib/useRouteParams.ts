import { useLocalSearchParams } from 'expo-router';
import type { z } from 'zod';
import { parseRouteParams, type RawParams, type RouteParamsResult } from './route-params';

/**
 * Validates the current route's params with a schema from `route-params.ts`. When `ok` is false the
 * screen renders `<NotFoundView />` (or returns early). Params only preselect, prefill or focus:
 * never write data from them on mount (SEC-01 M2).
 */
export function useRouteParams<S extends z.ZodObject>(schema: S): RouteParamsResult<z.output<S>> {
  const raw = useLocalSearchParams() as RawParams;
  return parseRouteParams(schema, raw);
}
