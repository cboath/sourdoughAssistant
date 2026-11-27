/**
 * Validates a tapped notification's payload before navigating (SEC-01 M2, ADR 0011 section 4):
 * `v === 1` and UUID ids. Anything else opens `/`. Pure, so it is unit-tested without React.
 */
import { z } from 'zod';
import { uuidParam } from '../../lib/route-params';

const stepPayload = z.object({
  v: z.literal(1),
  kind: z.enum(['start', 'fold', 'headsup', 'ready']),
  bakeId: uuidParam,
  bakeStepId: uuidParam,
});

const plainPayload = z.object({ v: z.literal(1), kind: z.enum(['topup', 'test']) });

export const SAFE_ROOT = '/';

/** `/bake/<id>?step=<id>` for a valid step payload, otherwise `/`. */
export function pathForPayload(data: unknown): { path: string; valid: boolean } {
  const step = stepPayload.safeParse(data);
  if (step.success) {
    return { path: `/bake/${step.data.bakeId}?step=${step.data.bakeStepId}`, valid: true };
  }
  return { path: SAFE_ROOT, valid: plainPayload.safeParse(data).success };
}

/** Reads the `hash` of a pending request's `content.data`, or null when it is not ours. */
export function hashOf(data: unknown): string | null {
  const parsed = z.object({ v: z.literal(1), hash: z.string().min(1).max(32) }).safeParse(data);
  return parsed.success ? parsed.data.hash : null;
}
