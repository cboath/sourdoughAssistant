/* eslint-disable @typescript-eslint/no-explicit-any -- acceptance tests drive the API with loosely typed fixtures */
/**
 * Entry points for planning. planBake / planSpanMin / earliestReadyAt / assignOvenSlots are exported from
 * src/schedule/backward (core-api.md section 0 does not say which file; contract gap CG-1).
 * recomputePlan / holdCapacity live in src/schedule/recompute (CO-03, not landed yet), so that module is loaded lazily:
 * the files that need it call `await loadRecompute()` inside tests that are gated off until it exists.
 */
import {
  assignOvenSlots as assign,
  earliestReadyAt as earliest,
  planBake as plan,
  planSpanMin as span,
} from '../../../src/schedule/backward';

export const planBake = plan as (input: any, request: any) => any;
export const planSpanMin = span as (input: any) => any;
export const earliestReadyAt = earliest as (input: any, now: number) => any;
export const assignOvenSlots = assign as (items: any[], cap: number) => any[];

export const backward = (input: any, readyAt: number, now: number): any =>
  planBake(input, { mode: 'backward', readyAt, now });
export const forward = (input: any, startAt: number, now = startAt): any =>
  planBake(input, { mode: 'forward', startAt, now });

type RecomputeModule = {
  recomputePlan: (plan: any, progress: any[], event: any) => any;
  holdCapacity: (plan: any, itemId: string) => any;
};

/** Lazy load so a missing CO-03 module fails only the (gated) tests that need it, not the whole file. */
export async function loadRecompute(): Promise<RecomputeModule> {
  const path = '../../../src/schedule/recompute';
  return (await import(/* @vite-ignore */ path)) as RecomputeModule;
}
export const recomputeExists = async (): Promise<boolean> => {
  try {
    await loadRecompute();
    return true;
  } catch {
    return false;
  }
};
