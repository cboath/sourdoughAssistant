# ADR 0009: Oven slots for multi-recipe and multi-loaf bakes

- Status: **Accepted.** Decided by Chris on 2026-11-26 (`docs/open-questions.md` B1: the ready time is when the last batch finishes cooling, with no reheat gap; B7: at most 4 recipes per bake). Plan assumption A4; resolves QA AMB-10
- Date: 2026-11-26

## Context

S-12: a bake can contain several recipes, and the oven holds N loaves at once (`ovenCapacity`). Loaves that fit bake together, the rest get back-to-back slots, and each recipe's schedule is offset to match. The same logic applies to a single recipe with more loaves than the oven holds (M1: 3 loaves, capacity 2).

## Decision

**One code path.** Every bake, including a single recipe with one loaf, goes through `planBake(items[], ovenCapacity)`. One item with loaves ≤ capacity reduces to the plain backward pass.

1. **Oven phase.** A recipe's oven phase is its contiguous run of steps with `kind = 'bake'` (Bake covered and Bake uncovered in the template). `ovenMin(item)` is the sum of those durations. The **tail** is every sequential step after the oven phase (Cool). The **hold step** is the last sequential step before the oven phase (Cold ferment).
   - A recipe with no `bake` step can't be used in a bake that needs more than one slot (validation error `noOvenPhase`).
   - Non-contiguous `bake` steps are invalid (`ovenPhaseNotContiguous`).
2. **Slot assignment:** greedy, in the bake's item order (the order the user added recipes), loaf by loaf. Slot 1 fills to capacity, then slot 2, and so on, so the remainder goes in the last slot. Ties don't arise because the order is explicit. Example: items [A×3], capacity 2 gives slot 1 = A×2 and slot 2 = A×1.
3. **Slot length** = `max(ovenMin)` over the items in the slot. All loaves in a slot go in together. A shorter recipe comes out earlier and starts cooling earlier.
4. **Anchoring to the ready time (plan A4; open-questions B1):** the **last** slot is placed so that its latest finisher (`ovenMin + tailMin`) ends exactly at `readyAt`. So `slotStart[S] = readyAt − max(ovenMin_t + tailMin_t)` over the tracks in slot S. Earlier slots run back to back: `slotEnd[s] = slotStart[s+1] − reheatGapMin` and `slotStart[s] = slotEnd[s] − slotLength[s]`.
   - **Decided (B1):** `reheatGapMin` defaults to **0**. It stays stored in Settings and on each bake, so a gap can still be configured later without code changes.
   - **Decided (B1):** the ready time is when the **last** slot is cooled.
   - **Decided (B7):** a bake holds at most **4 items** (recipes). The schedule screen enforces this. Core doesn't, and it handles any count.
5. **Per-item schedule:** each item's pre-oven steps are scheduled backward from the start of the **first** slot that contains its loaves. Dough is mixed once per item.
6. **Items split across slots** (loaves in slot k and in later slots): the shared dough steps run once. Loaves in later slots wait longer in the **hold step**. The plan emits one oven track per (item, slot), each with its own oven and tail steps. If the hold step's effective duration then goes over its `maxMin`, the plan emits a `holdExceedsRange` warning. Nothing is moved automatically.
   - **Labels are owned by the UI** (amended after DS-03 Q-A5). `PlannedStep.name` is always the **plain** recipe step name ("Bake, covered"). The UI and the notification text compose labels like "Bake, covered · 1 of 3 loaves · slot 2" from `slotIndex` and `loaves`, using a shared helper `stepLabel(step, ctx)` in `apps/mobile/src/features/schedule/labels.ts`. Core never formats display strings.
7. **Preheat** (an alongside step anchored to the first `bake` step) is emitted **once per bake**, before slot 1 only, as a single merged step labeled "Preheat oven". Later slots get no preheat, because the oven is already hot. If `reheatGapMin > 0`, the gap shows as a "Reheat" pseudo-step between slots.
8. **Step keys:** `${itemId}:${stepId}` for shared steps, and `${itemId}:${stepId}:s${slotIndex}` for the per-slot oven and tail steps. The preheat key is `bake:preheat`. These keys are stable across recomputes and are used in notification ids (ADR 0011).
9. **Earliest possible ready time** for multi-item bakes: plan at the requested ready time, then shift the whole plan later by `now − earliestStart`, rounded up to the next 5 minutes (ADR 0010).
10. **Live recompute** shifts only the affected item's later steps (ADR 0010). If an oven slot window then overlaps another, the plan emits an `ovenConflict` warning and leaves it for the user to resolve.

## Options considered

- **Separate dough per slot** (mixing again for later loaves). Rejected: bakers mix one batch per recipe.
- **First slot finishes at the ready time.** Rejected by Chris (open-questions B1).
- **Optimal packing** (minimizing splits or total span). Not needed at 1 to 4 loaves. Greedy in user order is predictable.

## Consequences

- CO-03 implements this. QA's MUL-* expected values from rules 2 to 9 are final (B1).
- The schedule screen (DS-03, RN-06) shows the slots on the merged timeline and asks for oven capacity, defaulting to `settings.ovenCapacity`.
