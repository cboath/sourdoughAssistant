# ADR 0010: Scheduler semantics: alongside steps, folds, quiet hours, earliest ready time, live recompute

- Status: Accepted (resolves QA AMB-05, AMB-06, AMB-07, AMB-08, AMB-11, AMB-13, AMB-19, and DS-01 section 10, "Fold N done"). The live-recompute policy and overtime handling were confirmed by Chris on 2026-11-26 (`docs/open-questions.md` B4, B9). Quiet-hours default: D3. Cold-ferment range: B5
- Date: 2026-11-26

## Context

PRD section 5 defines the backward pass loosely. QA-01's ambiguity ledger and DS-01's live-bake flow need exact rules so that expected values and UI copy are deterministic.

## Decision

### 1. Backward pass

Sequential steps (`anchor.type = 'sequential'`) form a chain in `position` order:
- `end[last] = readyAt`
- `start[i] = end[i] − duration[i]`
- `end[i−1] = start[i]`

All arithmetic is in epoch ms (ADR 0005). The forward pass ("start now", S-8) runs the same chain from `startAt`.

### 2. Alongside steps (AMB-06)

An alongside step adds no time to the chain. Its anchor is `{ type: 'alongside', stepId, align, offsetMin = 0 }`, and `align` is one of:
- `'endsAtStart'`: ends when the anchor step starts. **This is the template default**, with Preheat anchored to *Bake, covered*. It reproduces the PRD's Sat 07:45 to 08:15.
- `'startsAtStart'`: starts when the anchor step starts.
- `'endsAtEnd'`: ends when the anchor step ends.

`offsetMin` shifts the result (a negative value means earlier).

An alongside step may anchor only to a sequential step, never to another alongside step (validation error `alongsideChain`). The PRD prose ("alongside the end of the cold ferment") gives the same instant in the default template, because cold ferment ends when Bake covered starts.

### 3. Stretch and folds (AMB-05)

A step with `folds = { count, intervalMin }` has a derived duration of `count × intervalMin`. Core ignores any other stored value, and the editor shows the duration read-only. The step has no slider, because its range is the count times the interval.

- Fold `i` (1-based) is at `start + (i − 1) × intervalMin`. The template gives 12:05, 12:35, 13:05, 13:35.
- The step ends one interval after the last fold (14:05), and that's when bulk starts. "Bulk starts after the last fold" means bulk starts after the last fold's rest period.
- Fold 1's reminder is merged into the step-start notification ("Stretch and folds: set 1 of 4"). That gives `count − 1` extra fold notifications.

### 4. Duration choice and validation (AMB-19)

- **Order of precedence:** a user override (slider) beats the temperature adjustment, which beats the recipe default (ADR 0008).
- Temperature results are **clamped** to `[minMin, maxMin]` and produce a warning.
- A user override outside `[minMin, maxMin]` is a **validation error** (`overrideOutOfRange`). It is not clamped. The slider can't produce one; this only guards imports and bugs.
- Every step needs `0 < minMin ≤ durationMin ≤ maxMin` (fold steps: min = default = max = the derived value). Alongside steps also need a positive duration.

### 5. Quiet hours (AMB-07)

- `QuietHours = { enabled, startMin, endMin }` in minutes after local midnight.
- The window is `[start, end)`: start inclusive, end exclusive.
- When `start > end`, the window wraps past midnight (22:00 to 06:00).
- **Default (decided, open-questions D3):** on, 22:00 to 06:00.
- `start === end` means an **empty window** (no warnings). Use `enabled = false` to switch them off explicitly.
- Warnings are checked for **step starts (including alongside steps) and fold reminders**, because both need the baker's hands. Heads-ups are not checked.
- The check uses the **device's current zone** at evaluation time.
- Warnings never move steps.

### 6. Too soon and earliest possible ready time (AMB-08)

- The plan is computed with the **chosen durations** (defaults, the temperature adjustment, and the user's sliders), not the minimums.
- If `firstStart < now`, the result is `{ status: 'tooSoon', earliestReadyAt, plan }`:
  - `earliestReadyAt = requestedReadyAt + (now − firstStart)`, rounded **up** to the next 5-minute boundary.
  - `plan` is the full plan at `earliestReadyAt`.
- For the default template this is now + 30 h 55 m, rounded up.
- For multi-item bakes it's the same shift applied to the whole merged plan, so the item that starts first drives it.
- The UI may also offer "Use shortest times", which re-plans with every slider at `minMin`. That's a UI action using the same function with overrides; core needs nothing extra.
- `firstStart` includes alongside steps.
- Steps that start in the past count as too soon even if they're alongside.

### 7. Live recompute (AMB-11, DS-01 "Fold N done")

**Policy: pure shift, both directions** (confirmed by Chris, open-questions B4). When a step ends earlier or later than planned, every later step of **that item** (sequential, alongside, folds, and that item's later oven slots) shifts by `delta = actualEnd − plannedEnd`. The ready time moves by the same delta.

- **Hold step range (B5):** the template's cold ferment stays at **12 to 24 h** (720 to 1440 min, default 720). No template change. With the default, "Hold ready time" can absorb an early finish of up to 12 h but can't absorb a late one. Bakers who want slack set a longer cold ferment on the slider.
- **Overtime (B9):** a step that runs past its planned end without a tap shows "+N h over" and waits for Done. The live view offers "Finished earlier? Set the time" (`stepDone` with a past `at`).

Rejected alternative: silently absorbing the delta into the cold-ferment range. That changes fermentation without telling the user, and the PRD says the app "never moves steps on its own" in a hidden way. The live view shows the new ready time and offers:
- **"Hold ready time"**: lengthen the hold step (cold ferment) by `−delta` if that stays within its range. It's an explicit `extend` event on the hold step.
- **"+15 min"**: extend the current step.

Events (`RecomputeEvent`):
- `stepStarted { key, at }`: records the actual start. If it differs from the planned start, it shifts the step and every later step by `at − plannedStart`.
- `stepDone { key, at }`: records the actual end. The next sequential step's start becomes `at`, and later steps shift by the same delta. **Out-of-order done:** sequential steps before `key` that aren't done become `done` with `inferred: true` and no actual times. Alongside steps never block.
- `foldDone { key, foldIndex: n, at }`: records the fold time.
  - The remaining folds re-anchor: fold `n + j` is at `at + j × intervalMin`.
  - The step's end becomes `at + (count − n + 1) × intervalMin`, and everything after it shifts by the change in end.
  - **So yes, marking "Fold N done" reschedules the remaining fold reminders**, and DS-01's primary flow is supported.
  - The last fold's button should read "Fold 4 of 4 done". The step then ends one interval later, at which point bulk starts. "Start bulk now" is a separate `stepDone` action on the folds step.
- `extend { key, minutes }`: changes the planned end of the current or a future step by `minutes` (positive or negative) and shifts later steps. A result outside `[minMin, maxMin]` produces a `durationOutOfRange` warning but is allowed, because reality wins.

After every event, recompute re-runs the `holdExceedsRange` and `ovenConflict` checks and returns new warnings. Done steps are never changed.

**Zone-dependent warnings and the "past" clamp** (amended after QA-02 CG-5/CG-6; final as implemented by CO-03, see core-api section 5.6):
- Stale `quietHours` and `dstTransition` warnings are dropped after a shift.
- Quiet-hours warnings are re-run for **pending steps only**, and only when the caller passes `quiet` and `zone`.
- DST warnings are never re-run by recompute. The caller uses `dstWarnings`.
- When `now` is passed, unstarted steps are never shifted before `now`.
- The exact rules for already-done events, inferred-done steps, alongside and bake-wide events, preheat and reheat following, and fold re-anchoring are in core-api section 5.6.

### 8. Scaling (AMB-13), recorded here because it's core recipe math

- **Target dough weight is per loaf** (R-1 "yield: loaf count and target dough weight"). The batch target is `doughWeightG × loaves`.
- The **base** is the actual sum of the line grams, not the stored `doughWeightG` (that's a target label, which can be stale).
- `factor = target / base`. Each line is `roundHalfUp(amountG × factor)` to **whole grams**.
- **Rounded lines don't have to add up to the target.** The UI shows the actual total, for example "1001 g (target 1000 g)". The error is at most 0.5 g × the number of lines. No largest-remainder adjustment is made, so a line never moves by more than its own rounding.
- **A non-zero amount never rounds to 0.** Anything below 0.5 g becomes **1 g** (`minNonZeroG = 1`). Zero stays zero.
- Scaling by loaf count uses `factor = toLoaves / fromLoaves`.
- Hydration and baker's % shown after scaling are recomputed from the rounded lines.

## Consequences

- CO-02 and CO-03 implement these rules. `docs/core-api.md` has the signatures.
- QA can finalize SCH-10/11, SCH-12, SCH-15/17, QH-05 to QH-13, LIV-02/04/09/10/13, SCL-05/06 and SCH-09.
- DS-03 copy: the last-fold button reads "Fold 4 of 4 done", and a secondary "Start bulk now" action is added. The live view shows the new ready time after any early or late completion, with "Hold ready time" and "+15 min".
