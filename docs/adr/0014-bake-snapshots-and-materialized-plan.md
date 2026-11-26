# ADR 0014: Bakes store recipe and cost snapshots and a materialized step plan

- Status: Accepted
- Date: 2026-11-26

## Context

- PRD section 7: a scheduled bake stores a snapshot of its recipe, so later edits don't change a bake in progress.
- C-6: a past bake keeps the cost it had.
- The live view, the notification reconcile, and the success metric ("90% of steps started within 15 min of their reminder") all need per-step planned and actual times.

## Decision

- **`bake_item.recipe_snapshot_json`**: a full copy of the recipe at scheduling time (`RecipeSnapshotV1`: recipe fields, ingredient lines with resolved pantry names and prices, and steps) with `snapshotVersion: 1`. The live view and recompute read **only** the snapshot, never the live recipe.
- **`bake_item.cost_snapshot_json`**: the `CostBreakdown` from `packages/core`, computed on the scaled lines at scheduling time, plus `currencyCode` and `computedAt`. It is never recomputed.
- **`bake_step` rows are the materialized plan**: one row per planned step, including per-slot oven tracks and the merged preheat. Each row has:
  - `planned_start_at` and `planned_end_at`, the current plan, updated by recompute
  - `original_planned_start_at`, the plan at scheduling time, never updated
  - `actual_start_at`, `actual_end_at`, `status`, and `folds_done`
  - `fold_times_json`, the actual fold times
- **Recompute flow:**
  1. Load the bake.
  2. Build a `BakePlan` from the rows (`mappers/bakePlan.ts`).
  3. Apply the core `recomputePlan(plan, progress, event)`.
  4. Write the changed rows in one transaction.
  5. Run the notification reconcile.
- **Bake status:** `scheduled` → `active` → `completed`.
  - **Active:** when the user starts a step, or when `bakeService.sweep(now)` finds the first planned start has passed.
  - **Completed:** when the user taps "Finish bake", or when `sweep` finds the bake 12 h past `planned_ready_at` (then `completed_at = planned_ready_at`). See architecture §9.1.
  - Step rows are never auto-started. `cancelled` can happen from either earlier state. Completed and cancelled bakes keep their rows as history. The bake log itself is v1.1.

## Options considered

- **Recompute the plan from the snapshot on every render.** Simple, but it loses the actual and original times, and notifications would need the plan rebuilt anyway.
- **Store only the plan JSON on the bake.** Harder to query (home list, next step) and harder to sync per step.

## Consequences

- RN-06 writes the snapshots and `bake_step` rows. RN-08 updates the rows through `bakeService.applyEvent`.
- Bakes stay correct if the recipe or pantry item is later deleted (soft deletes keep FKs valid, ADR 0004).
