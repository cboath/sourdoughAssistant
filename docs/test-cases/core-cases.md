# Core logic test cases (table-driven)

Task QA-01 · owner qa-test-engineer · feeds QA-02 (`packages/core/test/acceptance/*.test.ts`) and the unit tests written by CO-01, CO-02 and CO-03.

Sources: `docs/PRD.md` sections 4 to 6, `docs/plan.md` assumptions A1 to A6 and the M1 criteria, `docs/BUILD_PLAN.md` "Testing". Updated by QA-02 (2026-11-26): the ADRs (0005 to 0010) and `docs/core-api.md` now exist and resolve the ambiguity ledger. Section 14 is the authoritative status table and overrides the Status column in sections 1 to 11. Tests live in `packages/core/test/acceptance/*.test.ts`.

## 0. How to read this file

**Status column**

| Status | Meaning |
|---|---|
| READY | Expected value is fixed by the PRD or by arithmetic with no open interpretation. Write the test as-is. |
| PROPOSED | Expected value follows a plan assumption (A1 to A6) or the most natural reading, but the PRD does not pin it down. Write the test, mark it with the AMB id, and confirm with the architect or Chris before it gates CI. |
| BLOCKED | The expected value cannot be written until the named ambiguity is resolved. Property checks are listed instead. |

**Conventions for every case**

- Clock: injected, never `Date.now()`. Zone: an explicit IANA name passed in, never the host zone. CI also runs the whole core suite under `TZ=UTC`, `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata` to prove no test leans on the host zone.
- Money is integer cents (minor units). Tests compare integers, never floats. Display strings are tested separately (section 11).
- Grams are compared with an exact value when the input is whole grams, and with a stated tolerance of 1e-9 when a conversion factor is involved.
- Times are written as local wall time plus zone abbreviation, with the UTC instant in the DST section. Tests assert the UTC instant, then assert the local string.
- Schedule base: the PRD default template (section 5), all steps at their default duration, `tempSensitive` off unless stated.

**Default template durations (minutes) used throughout**

| Step | Min | Range | Anchor |
|---|---|---|---|
| Final starter feeding | 480 | 360 to 600 | sequential |
| Mix and rest | 60 | 30 to 120 | sequential |
| Stretch and folds | 120 | count x interval | sequential, 4 sets every 30 min |
| Bulk ferment | 360 | 300 to 480 | sequential, tempSensitive |
| Shape | 10 | 5 to 15 | sequential |
| Cold ferment | 720 | 720 to 1440 | sequential |
| Preheat oven | 30 | 20 to 45 | alongside: ends when Bake, covered starts |
| Bake, covered | 30 | 25 to 35 | sequential |
| Bake, uncovered | 15 | 10 to 25 | sequential |
| Cool | 60 | 30 to 120 | sequential, ends at the ready time |

Sequential total at defaults = 480+60+120+360+10+720+30+15+60 = 1855 min = 30 h 55 min. Preheat adds nothing.

**Pantry fixtures (chosen so unit cost matches the PRD's per-gram prices exactly)**

| Fixture | Package | Unit cost |
|---|---|---|
| P-BREAD | 1200 cents for 5000 g | 0.24 cents/g ($0.0024/g) |
| P-WW | 350 cents for 1000 g | 0.35 cents/g ($0.0035/g) |
| P-SALT | 100 cents for 1000 g | 0.10 cents/g ($0.0010/g) |
| P-WATER | 0 cents for 1000 g | 0 (default, C-5) |
| P-BREAD-5LB | 544 cents for 5 lb | 544 / 2267.96185 = 0.239863 cents/g (earlier text said 0.239859, a typo) |

**Recipe fixtures**

| Fixture | Lines | Loaves |
|---|---|---|
| R-HYD | flour 500 g, water 375 g, salt 10 g, levain 100 g at 100% hydration | 1 |
| R-COST | bread flour 450 g, whole wheat 50 g, salt 10 g, levain 100 g at 100% (flour priced as P-BREAD), water 375 g | 1 |

R-COST has the same totals as R-HYD (550 g flour including levain, 425 g water including levain). The PRD cost table lists "Levain flour 50 g" and "Water 425 g", so the 425 g water line is the 375 g of added water plus the levain's 50 g. See AMB-17.

## 1. Baker's percentages and hydration (R-3, M1 criterion 1)

Hydration = (water + levain water) / (flour + levain flour). Levain flour = levain / (1 + h/100). Levain water = levain - levain flour. Do not round intermediate values.

| ID | Case | Input | Expected | Status |
|---|---|---|---|---|
| RCP-01 | PRD acceptance example | R-HYD | total flour 550 g, total water 425 g, hydration 425/550 = 77.2727...%, displayed 77.3% | READY |
| RCP-02 | Baker's % of each line, 1 dp | R-HYD | flour line 90.9%, water 68.2%, salt 1.8%, levain 18.2% (levain shown as the whole 100 g line) | PROPOSED (AMB-14) |
| RCP-03 | No levain | flour 500, water 375, salt 10 | hydration 75.0% | READY |
| RCP-04 | Stiff levain | R-HYD with levain hydration 50% | levain flour 66.6667, water 33.3333; hydration (375+33.3333)/(500+66.6667) = 72.0588%, displayed 72.1% | READY |
| RCP-05 | Wet levain | R-HYD with levain 125% | levain flour 44.4444, water 55.5556; hydration 430.5556/544.4444 = 79.0816%, displayed 79.1% | READY |
| RCP-06 | Levain hydration 0% | R-HYD, levain 0% | levain is all flour: flour 600, water 375, hydration 62.5% | READY |
| RCP-07 | Whole-wheat plus bread flour | bread 450, WW 50, water 375, levain 100 at 100%, salt 10 | flour 550, water 425, hydration 77.3% (same as RCP-01) | READY |
| RCP-08 | Inclusions excluded | R-HYD plus 100 g cheese (role inclusion) | hydration unchanged at 77.3%; cheese baker's % = 100/550 = 18.2% | PROPOSED (AMB-14) |
| RCP-09 | Role "other" with water content (milk) | R-HYD plus 50 g milk role other | milk not counted in hydration (77.3%) | PROPOSED |
| RCP-10 | Zero total flour | water 100 g only | hydration is "not defined" (null or error as `core-api.md` states), never NaN or Infinity, no throw in the UI path | READY (behaviour shape per core-api) |
| RCP-11 | Ingredient role water given in ml | water 375 ml | counted as 375 g | PROPOSED (AMB-12) |
| RCP-12 | Rounding half boundary | flour 400, water 309 | 77.25% exactly. Displayed 77.3% (half away from zero on the exact ratio). Must not be 77.2 from a float artefact | PROPOSED (AMB-01) |

## 2. Scaling (R-4, M1 criterion 1)

Scale factor k. Every amount is multiplied by k, then rounded to whole grams. Hydration is recomputed from the rounded lines; for factors of 1 or more it stays within 0.25 percentage points of the original (0.1 is too tight: 0.5 loaf drifts 0.18).

| ID | Case | Input | Expected | Status |
|---|---|---|---|---|
| SCL-01 | PRD: double to 2 loaves | R-HYD, 2 loaves | flour 1000, water 750, salt 20, levain 200; hydration 77.3% | READY |
| SCL-02 | Triple | R-HYD, 3 loaves | 1500, 1125, 30, 300 | READY |
| SCL-03 | Identity | R-HYD, 1 loaf | unchanged | READY |
| SCL-04 | Half grams round up | salt 10 g, k = 0.25 | 2.5 rounds to 3 | PROPOSED (AMB-01) |
| SCL-05 | Sub-gram result | salt 1 g, k = 0.4 | 0.4 rounds to 0 g. The ingredient must remain visible, not silently vanish | BLOCKED (AMB-13) |
| SCL-06 | Target dough weight | R-HYD base weight 985 g, target 1000 g (k = 1000/985 = 1.015228) | flour 508 (507.61), water 381 (380.71), salt 10 (10.15), levain 102 (101.52). Rounded sum 1001, not 1000. Levain 102 splits into 51 + 51 | BLOCKED (AMB-13: is the sum required to hit the target?) |
| SCL-07 | Hydration after rounding | SCL-06 output | (381 + 51) / (508 + 51) = 77.28%, displayed 77.3% | READY if SCL-06 amounts are accepted |
| SCL-08 | Scale down | R-HYD, 0.5 loaf | 250, 188 (187.5 rounds up), 5, 50 | PROPOSED (AMB-01) |
| SCL-09 | Scale by 0 or negative | k = 0, k = -1 | rejected with a typed error, no amounts produced | READY |
| SCL-10 | Large k | R-HYD, 100 loaves | 50000, 37500, 1000, 10000, no overflow, no float drift | READY |
| SCL-11 | Scaling is not cumulative | scale 1 to 2 to 3 loaves from the saved base vs directly 3 | identical results (scale from base, not from the rounded previous value) | READY |

## 3. Unit conversions (R-2, C-2)

Constants: 1 lb = 453.59237 g, 1 oz = 28.349523125 g, 1 kg = 1000 g, 1 L = 1000 ml. Cup, tbsp and tsp follow the US customary ratios inside a pantry item (1 cup = 16 tbsp = 48 tsp) with `gramsPerCup` as the density (AMB-12).

| ID | From | To | Expected | Status |
|---|---|---|---|---|
| UNT-01 | 1 kg | g | 1000 | READY |
| UNT-02 | 1 lb | g | 453.59237, display 454 | READY |
| UNT-03 | 1 oz | g | 28.349523125, display 28 | READY |
| UNT-04 | 16 oz | lb | 1 | READY |
| UNT-05 | 5 lb | g | 2267.96185 | READY |
| UNT-06 | 1000 g | oz | 35.27396195 | READY (display precision AMB-12) |
| UNT-07 | 1 cup bread flour (gramsPerCup 120) | g | 120 | READY |
| UNT-08 | 2.5 cup, gramsPerCup 120 | g | 300 | READY |
| UNT-09 | 1 tbsp, gramsPerCup 120 | g | 7.5 | PROPOSED (AMB-12) |
| UNT-10 | 1 tsp, gramsPerCup 120 | g | 2.5 | PROPOSED (AMB-12) |
| UNT-11 | 300 g | cup, gramsPerCup 120 | 2.5 | READY |
| UNT-12 | 100 g | cup, gramsPerCup missing | typed error "density required", no NaN | READY |
| UNT-13 | 250 ml | g, water | 250 (1 ml = 1 g) | PROPOSED (AMB-12) |
| UNT-14 | 1 L | ml | 1000 | READY |
| UNT-15 | 1 each | g | typed error unless the pantry item has a weight per each | READY |
| UNT-16 | volume pantry package (1 L oil) used as 30 ml, density 0.92 | cost line | 30 ml x 0.92 g/ml = 27.6 g, costed from the per-ml price | PROPOSED |
| UNT-17 | Round trip | g to oz to g, lb to g to lb, cup to g to cup | within 1e-9 | READY |
| UNT-18 | Zero and negative | 0 g, -5 g | 0 allowed, negative rejected | READY |
| UNT-19 | Package unit vs recipe unit mismatch | package in g, recipe line in ml, no density | typed error surfaced as "needs density" in the UI, not a wrong cost | READY |

## 4. Cost in integer cents (C-1 to C-7, M1 criterion 2)

Policy under test (plan A3): per-line cost = amount in package units x package cents / package size, held as an exact ratio or high-precision value, rounded half up to whole cents once per line. Batch = sum of rounded lines. Per loaf = batch / loaves.

| ID | Case | Input | Expected | Status |
|---|---|---|---|---|
| CST-01 | PRD example, per line | R-COST priced with P-BREAD, P-WW, P-SALT, P-WATER | bread flour 450 g = 108 c; whole wheat 50 g = 17.5 c, rounds to 18 c; salt 10 g = 1 c; levain flour 50 g = 12 c; water 425 g = 0 c | READY |
| CST-02 | PRD example, one loaf | CST-01 lines | 108 + 18 + 1 + 12 + 0 = 139 cents. Display $1.39 | READY |
| CST-03 | Round once, not twice | CST-01 | the unrounded sum is 138.5. Result must be 139 from the sum of rounded lines. Guards against rounding the total, or rounding per-gram cost first (0.0035 to 0.004 would give 20 c) | READY |
| CST-04 | Per-gram cost is never stored rounded | P-BREAD-5LB, 450 g | 450 x 0.239859 = 107.94, rounds to 108 c | READY |
| CST-05 | Line shares | CST-01 | shares of 139 c: bread 77.7%, WW 12.9%, salt 0.7%, levain 8.6%, water 0%. Sum within 0.1 of 100 | PROPOSED (AMB-16) |
| CST-06 | Two-loaf batch | R-COST scaled to 2 loaves | lines 216, 35, 2, 24, 0 = 277 c batch. Per loaf 138.5 c | BLOCKED (AMB-01, AMB-02): 139 under half up, 138 under half even. The 1-loaf and 2-loaf per-loaf costs differ by a cent under any policy | 
| CST-07 | Three-loaf batch | R-COST scaled to 3 | lines 324, 53 (52.5 half up), 3, 36, 0 = 416 c. Per loaf 138.67 c, rounds to 139 | PROPOSED (AMB-01) |
| CST-08 | Four-loaf batch | R-COST scaled to 4 | lines 432, 70, 4, 48 = 554 c. Per loaf 138.5 c | BLOCKED (AMB-02) |
| CST-09 | Many sub-cent lines drift | five lines of 4 g salt (0.4 c each) | each rounds to 0, batch 0 c, while exact total is 2 c | BLOCKED (AMB-02): needs a decision on per-line vs whole-recipe rounding |
| CST-10 | Water priced | water 425 g at 0.001 c/g | 0.425 c rounds to 0 c. At 0.002 c/g, 0.85 c rounds to 1 c | READY |
| CST-11 | Zero-price item | price 0 | cost 0, no division error | READY |
| CST-12 | Package size 0 | size 0 | rejected at the pantry boundary, never reaches the division | READY |
| CST-13 | Negative price | -100 c | rejected | READY |
| CST-14 | Loaves = 0 | yieldLoaves 0 | typed error, never Infinity per loaf | READY |
| CST-15 | Unpriced ingredient | one pantry item has no price | the cost result flags `incomplete` and names the line, or returns an error, never a silent 0 (success measure: "every saved recipe shows a cost per loaf") | BLOCKED (AMB-16) |
| CST-16 | Large values | 99,999,999 c package, 1 g amount | stays within safe integer range, exact | READY |
| CST-17 | Cup-based line | 2 cup bread flour (gramsPerCup 120), P-BREAD | 240 g x 0.24 c/g = 57.6, rounds to 58 c | READY |
| CST-18 | Mixed units | package 5 lb, line in oz | oz to g to cost, same as CST-04 path | READY |
| CST-19 | Price change updates recipe cost | P-BREAD raised to 1500 c for 5000 g (0.30 c/g) | CST-01 becomes bread 135, WW 18, salt 1, levain 15 = 169 c | READY |
| CST-20 | Past bake keeps cost (C-6) | bake created at 139 c, then CST-19 price change | `costSnapshot` still 139 c, the recipe now shows 169 c | READY |
| CST-21 | Price history ordering | three prices on three dates | current price = latest `pricedAt`, not latest insert | READY |
| CST-22 | Sell price, 0% markup | cost 139 c | 139 c | READY |
| CST-23 | Sell price, 100% markup | cost 139 c | 278 c | PROPOSED (AMB-03) |
| CST-24 | Sell price, 50% markup | cost 139 c | 208.5 c, 209 c if computed from the rounded per-loaf cost, 208 c if from the unrounded 138.5 | BLOCKED (AMB-02, AMB-03) |
| CST-25 | Sell price, fractional markup | cost 139 c, 33.3% | 185.287 c, 185 c | PROPOSED (AMB-03) |
| CST-26 | Negative markup | -10% | rejected or clamped, per core-api | PROPOSED |

### Money input and parsing (integer cents at the boundary)

These guard against `dollars * 100` float errors. Verified in Python: `19.99*100 = 1998.9999999999998`, `4.35*100 = 434.99999999999994`, `0.29*100 = 28.999999999999996`, `1.15*100 = 114.99999999999999`.

| ID | Input string (en-US) | Expected cents | Status |
|---|---|---|---|
| MNY-01 | "19.99" | 1999 | READY |
| MNY-02 | "4.35" | 435 | READY |
| MNY-03 | "0.29" | 29 | READY |
| MNY-04 | "1.15" | 115 | READY |
| MNY-05 | "$12" | 1200 | READY |
| MNY-06 | "1,234.50" | 123450 | READY |
| MNY-07 | "1.005" (3 decimals) | rejected, or 101 under half up. Pick one | BLOCKED (AMB-15) |
| MNY-08 | "" , "abc", "-1", "1e3" | rejected, no data change | READY |
| MNY-09 | de-DE "1.234,50" | 123450 | READY |
| MNY-10 | de-DE "1,5" | 150 | READY |
| MNY-11 | ja-JP (0 minor digits) "¥1200" | 1200 minor units, no x100 | BLOCKED (AMB-15) |

## 5. Scheduler: PRD worked examples (S-1, S-2, M1 criterion 3)

Zone `America/New_York`. Ready time Sat 2026-05-02 10:00 EDT = 2026-05-02T14:00:00Z (no DST change near this date). Verified by an independent computation (Python `zoneinfo`).

### SCH-01: default template, 12 h cold ferment (PRD section 5 table)

| Step | Local start | UTC |
|---|---|---|
| Final starter feeding | Fri 03:05 EDT | 2026-05-01T07:05Z |
| Mix and rest | Fri 11:05 | 2026-05-01T15:05Z |
| Stretch and folds | Fri 12:05 | 2026-05-01T16:05Z |
| Bulk ferment | Fri 14:05 | 2026-05-01T18:05Z |
| Shape | Fri 20:05 | 2026-05-02T00:05Z |
| Cold ferment | Fri 20:15 | 2026-05-02T00:15Z |
| Preheat oven (alongside) | Sat 07:45 | 2026-05-02T11:45Z |
| Bake, covered | Sat 08:15 | 2026-05-02T12:15Z |
| Bake, uncovered | Sat 08:45 | 2026-05-02T12:45Z |
| Cool | Sat 09:00 | 2026-05-02T13:00Z |
| Ready to eat | Sat 10:00 | 2026-05-02T14:00Z |

Status READY, with one inference: the PRD table gives the 07:45 preheat start but not the rule. The 07:45 start is only consistent with "ends when Bake, covered starts" (AMB-06).

### SCH-02: 18 h cold ferment (PRD section 5 closing paragraph)

| Step | Local start | UTC |
|---|---|---|
| Final starter feeding | Thu 21:05 EDT | 2026-05-01T01:05Z |
| Mix and rest | Fri 05:05 | 2026-05-01T09:05Z |
| Stretch and folds | Fri 06:05 | 2026-05-01T10:05Z |
| Bulk ferment | Fri 08:05 | 2026-05-01T12:05Z |
| Shape | Fri 14:05 | 2026-05-01T18:05Z |
| Cold ferment | Fri 14:15 | 2026-05-01T18:15Z |
| Preheat, Bake, Cool, Ready | unchanged from SCH-01 | |

Status READY. Everything before the cold ferment moves 6 h earlier. Checks: feeding is Thu 21:05, as the PRD says.

### Further scheduler cases

| ID | Case | Input | Expected | Status |
|---|---|---|---|---|
| SCH-03 | Step order and no overlap | SCH-01 | starts strictly increasing for sequential steps; each sequential step starts exactly when the previous one ends; Ready - first start = 30 h 55 min | READY |
| SCH-04 | Alongside adds no time | SCH-01 vs the same template with preheat removed | all other start times identical | READY |
| SCH-05 | Preheat duration change | preheat 45 min (top of range) | preheat start 07:30; no other step moves | READY |
| SCH-06 | Preheat longer than cold ferment | cold 12 h, preheat 45 min | still fine (preheat sits in the cold ferment) | READY |
| SCH-07 | Slider inside range | bulk 8 h (max) | steps before bulk start 2 h earlier; steps after unchanged; feeding Fri 01:05 | READY |
| SCH-08 | Slider at range minimums | all steps at min | total sequential 26 h 40 min; feeding starts Fri 07:20 | READY |
| SCH-09 | Value outside range | cold 25 h (max 24 h), shape 4 min | rejected with a typed error, or clamped. The core-api must state which | BLOCKED (AMB-19) |
| SCH-10 | Fold sub-reminders | SCH-01, 4 sets, 30 min | reminders at 12:05, 12:35, 13:05, 13:35 (set 4 begins at 13:35 and ends at 14:05 when bulk starts) | PROPOSED (AMB-05) |
| SCH-11 | Fold count change | 3 sets, 30 min | reminders at 12:05, 12:35, 13:05, folds step 90 min if duration follows count x interval, so every step before it moves 30 min later | BLOCKED (AMB-05) |
| SCH-12 | Heads-up notifications | headsUp 15 min | each step has a heads-up 15 min before its start; fold reminders get none unless specified | PROPOSED (AMB-07) |
| SCH-13 | Start now (S-8) | now = Fri 2026-05-01 12:00 EDT, defaults | first step (feeding) starts 12:00 Fri; ready = Sat 2026-05-02 18:55 EDT | READY |
| SCH-14 | Ready time exactly the earliest | now as SCH-13, requested ready Sat 18:55 | accepted, no "too soon" | READY |
| SCH-15 | Ready time 1 min too soon | requested ready Sat 18:54 | result is `earliestReadyAt` = Sat 18:55 EDT, no schedule produced | READY with chosen values; BLOCKED if minimum durations count (AMB-08) |
| SCH-16 | Ready time in the past | requested ready before now | same as SCH-15 | READY |
| SCH-17 | Earliest, minimum-duration policy | same as SCH-13 | 26 h 40 min instead of 30 h 55 min gives Sat 14:40 EDT. Only valid if AMB-08 picks the minimum | BLOCKED (AMB-08) |
| SCH-18 | Schedule is pure | same input twice | identical output, input objects not mutated | READY |
| SCH-19 | Zone independence (no DST) | ready Sat 2026-05-02 10:00 IST = 2026-05-02T04:30Z, `Asia/Kolkata` (UTC+5:30) | all local times identical to SCH-01 (feeding Fri 03:05 IST) | READY |
| SCH-20 | Zero-length or missing step | a step with durationMin 0 | allowed, start = next start, or rejected, per core-api | PROPOSED |
| SCH-21 | Recipe with only one step | cool only | ready - 60 min | READY |
| SCH-22 | Empty recipe | no steps | typed error | READY |

## 6. Daylight saving and time zones (S-6, M1 criterion 5)

Model under test (plan A1): durations are elapsed time. The ready time is entered in local time and stored as UTC. A 12 h cold ferment over a DST change is 12 real hours, so its local clock span reads 11 or 13 h. All values below were computed with an independent implementation (Python `zoneinfo`), not by hand.

2026 transitions: US spring forward Sun 2026-03-08 02:00 EST to 03:00 EDT (07:00Z). US fall back Sun 2026-11-01 02:00 EDT to 01:00 EST (06:00Z). UK spring forward Sun 2026-03-29 01:00 GMT to 02:00 BST (01:00Z). UK fall back Sun 2026-10-25 (02:00 BST to 01:00 GMT, 01:00Z).

### DST-01: spring forward, ready Sun 2026-03-08 10:00 EDT (2026-03-08T14:00Z), `America/New_York`

| Step | Local | UTC |
|---|---|---|
| Final starter feeding | Sat 03-07 02:05 EST | 2026-03-07T07:05Z |
| Mix and rest | Sat 10:05 EST | 2026-03-07T15:05Z |
| Stretch and folds | Sat 11:05 EST | 2026-03-07T16:05Z |
| Bulk ferment | Sat 13:05 EST | 2026-03-07T18:05Z |
| Shape | Sat 19:05 EST | 2026-03-08T00:05Z |
| Cold ferment | Sat 19:15 EST | 2026-03-08T00:15Z |
| Preheat (alongside) | Sun 07:45 EDT | 2026-03-08T11:45Z |
| Bake, covered | Sun 08:15 EDT | 2026-03-08T12:15Z |
| Bake, uncovered | Sun 08:45 EDT | 2026-03-08T12:45Z |
| Cool | Sun 09:00 EDT | 2026-03-08T13:00Z |
| Ready | Sun 10:00 EDT | 2026-03-08T14:00Z |

Assertions: cold ferment elapsed = 720 min, local clock span 19:15 to 08:15 = 13 h. Total elapsed first start to ready = 1855 min even though the wall-clock gap is 31 h 55 min. The feeding reads 02:05, not 03:05. Status PROPOSED until A1 is confirmed (AMB-04).

### DST-02: fall back, ready Sun 2026-11-01 10:00 EST (2026-11-01T15:00Z), `America/New_York`

| Step | Local | UTC |
|---|---|---|
| Final starter feeding | Sat 10-31 04:05 EDT | 2026-10-31T08:05Z |
| Mix and rest | Sat 12:05 EDT | 2026-10-31T16:05Z |
| Stretch and folds | Sat 13:05 EDT | 2026-10-31T17:05Z |
| Bulk ferment | Sat 15:05 EDT | 2026-10-31T19:05Z |
| Shape | Sat 21:05 EDT | 2026-11-01T01:05Z |
| Cold ferment | Sat 21:15 EDT | 2026-11-01T01:15Z |
| Preheat (alongside) | Sun 07:45 EST | 2026-11-01T12:45Z |
| Bake, covered | Sun 08:15 EST | 2026-11-01T13:15Z |
| Bake, uncovered | Sun 08:45 EST | 2026-11-01T13:45Z |
| Cool | Sun 09:00 EST | 2026-11-01T14:00Z |
| Ready | Sun 10:00 EST | 2026-11-01T15:00Z |

Assertions: cold ferment elapsed 720 min, local span 21:15 to 08:15 = 11 h. Total elapsed 1855 min, wall-clock gap 29 h 55 min. Status PROPOSED (AMB-04).

### DST-03 to DST-12

| ID | Case | Expected | Status |
|---|---|---|---|
| DST-03 | UK spring forward, ready Sun 2026-03-29 10:00 BST (09:00Z), `Europe/London` | feeding Sat 03-28 02:05 GMT (02:05Z); mix 10:05; folds 11:05; bulk 13:05; shape 19:05; cold ferment 19:15 GMT (19:15Z); preheat Sun 07:45 BST; bake covered 08:15 BST (07:15Z); uncovered 08:45; cool 09:00; ready 10:00 BST. Cold ferment local span 13 h | PROPOSED (AMB-04) |
| DST-04 | Instant stability | for DST-01 and DST-02, every step's UTC instant equals ready minus the cumulative elapsed minutes, regardless of host `TZ` | READY |
| DST-05 | Same schedule rendered in another zone | DST-01 instants rendered in `America/Los_Angeles` | local times are the NY times minus 3 h. Instants unchanged | READY |
| DST-06 | Device zone changes mid-bake | bake saved in `America/New_York`, device moves to `Europe/London` | stored instants do not change; local display changes; no reschedule of absolute notifications needed. Quiet-hours check then uses the new zone | PROPOSED (AMB-07) |
| DST-07 | Start-now across spring forward | now = Sat 2026-03-07 12:00 EST (17:00Z), defaults | ready = 2026-03-08T23:55Z = Sun 19:55 EDT. Elapsed 1855 min, wall-clock gap 30 h 55 min plus the skipped hour | READY |
| DST-08 | Start-now across fall back | now = Sat 2026-10-31 12:00 EDT (16:00Z), defaults | ready = 2026-11-01T22:55Z = Sun 17:55 EST. Elapsed 1855 min | READY |
| DST-09 | Non-existent ready time | user enters Sun 2026-03-08 02:30 America/New_York (skipped) | defined behaviour required: reject with a message, or normalise to 03:30 EDT. Must not throw or produce Invalid Date | BLOCKED (AMB-04) |
| DST-10 | Ambiguous ready time | user enters Sun 2026-11-01 01:30 (occurs at 05:30Z EDT and 06:30Z EST) | defined behaviour required: pick the first (EDT) or ask. Must be deterministic | BLOCKED (AMB-04) |
| DST-11 | Live recompute across DST | DST-01 with feeding finished 40 min late | every later step +40 elapsed minutes; ready Sun 10:40 EDT; cold ferment still 720 min elapsed | PROPOSED |
| DST-12 | Whole-year sweep | every day of 2026 in `America/New_York`, `Europe/London`, `Asia/Kolkata`, `Australia/Lord_Howe` (30 min DST shift) | for each ready time at 10:00 local, UTC instant of every step = ready - cumulative elapsed. Never throws, never Invalid Date, steps strictly ordered | READY as a property test |

## 7. Quiet hours (S-4, M1 criterion 4)

Quiet hours 22:00 to 06:00 local (crosses midnight) unless stated. Warning only: no step may be moved by the scheduler.

| ID | Case | Expected | Status |
|---|---|---|---|
| QH-01 | SCH-01 with 22:00 to 06:00 | exactly one warning: Final starter feeding, Fri 03:05. All start times unchanged from SCH-01 | READY |
| QH-02 | SCH-02 (18 h cold) with 22:00 to 06:00 | warning on Mix and rest at Fri 05:05. Feeding Thu 21:05 is not in quiet hours. Folds at 06:05 are not. One warning only | READY |
| QH-03 | Quiet hours disabled or empty | no warnings | READY |
| QH-04 | Same-day window 13:00 to 15:00 | CORRECTED by QA-02: warnings for fold reminders 3 (13:05) and 4 (13:35) and for Bulk at 14:05. The original text said Cold ferment 14:15, but cold ferment starts 20:15 in SCH-01. Fold reminders are checked (ADR 0010 s5). 12:05 and 20:05 do not warn | READY |
| QH-05 | Boundary: step starts exactly 22:00 | warns (window start inclusive) | PROPOSED (AMB-07) |
| QH-06 | Boundary: step starts exactly 06:00 | no warning (window end exclusive) | PROPOSED (AMB-07) |
| QH-07 | Start equals end (22:00 to 22:00) | rejected as invalid, or treated as 24 h quiet. Must not be treated as empty by accident | BLOCKED (AMB-07) |
| QH-08 | Fall-back repeated hour | steps at 2026-11-01T05:30Z (01:30 EDT) and 06:30Z (01:30 EST) both warn | READY |
| QH-09 | Spring-forward gap | step at 2026-03-08T06:59Z (01:59 EST) and 07:00Z (03:00 EDT) both warn under 22:00 to 06:00. Nothing is evaluated at the skipped 02:xx | READY |
| QH-10 | Scheduler does not move steps | compare start times with and without quiet hours | identical | READY |
| QH-11 | Fold sub-reminder and heads-up inside quiet hours | e.g. heads-up for a 06:10 step with 15 min lead lands at 05:55 | decide whether this warns | BLOCKED (AMB-07) |
| QH-12 | Warning content | each warning carries step id and the offending local time | READY |
| QH-13 | Quiet hours evaluated in the current zone | DST-06 scenario | warnings recomputed in the new zone | PROPOSED (AMB-07) |

## 8. Temperature adjustment (S-9, A6)

READY (AMB-09): the table is fixed by ADR 0008 (Accepted; open-questions B2: `1.09^(24-T)`, tuned later by Chris, which is a data change only). Exact rows are below and in `temperature.test.ts`.

| ID | Property | Status |
|---|---|---|
| TMP-01 | At the reference temperature (24 C / 75 F) every duration equals its default | READY |
| TMP-02 | Warmer than reference: bulk duration is less than or equal to default. Cooler: greater than or equal | READY |
| TMP-03 | Result is clamped to the step's `[minMin, maxMin]` for any temperature, including -10 C and 60 C | READY |
| TMP-04 | Only steps with `tempSensitive = true` change. Mix and rest, shape, bake and cool never change | READY |
| TMP-05 | Adjustment off: no change at any temperature | READY |
| TMP-06 | Monotonic: duration never increases as temperature rises | READY |
| TMP-07 | C and F inputs for the same temperature (24 C and 75.2 F) give identical durations | READY |
| TMP-08 | Total elapsed time and every start time before the adjusted step shift by exactly the sum of adjustments; steps after it are unchanged | READY |
| TMP-09 | Exact rows, bulk default 360 (range 300-480): 18 C -> 480 (clamped from 605), 21 C -> 470, 24 C -> 360, 27 C -> 300 (clamped from 275). Cold ferment is never adjusted | READY (ADR 0008, B2) |
| TMP-10 | A user slider value always wins (`source: 'user'`); temperature starts from the recipe default, never from a previous slider value | READY (ADR 0008 precedence, B2) |

## 9. Multi-recipe bake and oven slots (S-11, S-12, M1 criterion 7)

Model under test (plan A4, now ADR 0009 Accepted; open-questions B1 last batch and no reheat gap, B7 at most 4 recipes per bake, enforced by the schedule screen not by core): the last oven slot finishes cooling at the ready time. Earlier slots finish earlier. Slots run back to back with no reheat gap. A slot's length is the bake time of its recipes (covered plus uncovered = 45 min at defaults). Cooling happens after the bake and may overlap a later slot's bake. Each recipe in an earlier slot has its whole schedule offset by minus the total length of all later slots. Loaves fill slots greedily in input order, so the remainder lands in the last slot (this matches the plan's "2 loaves share slot 1, 1 loaf gets slot 2").

Fixture: three recipes A, B, C, each 1 loaf, each the default template. Ready (last slot) Sat 2026-05-02 10:00 EDT. Zone `America/New_York`.

### MUL-01: 3 loaves, capacity 2 (M1 criterion 7)

| Item | Slot | Offset | Feeding | Cold ferment starts | Bake, covered | Bake, uncovered | Cool | Ready |
|---|---|---|---|---|---|---|---|---|
| A | 1 | -45 min | Fri 02:20 | Fri 19:30 | Sat 07:30 | Sat 08:00 | Sat 08:15 | Sat 09:15 |
| B | 1 | -45 min | Fri 02:20 | Fri 19:30 | Sat 07:30 | Sat 08:00 | Sat 08:15 | Sat 09:15 |
| C | 2 | 0 | Fri 03:05 | Fri 20:15 | Sat 08:15 | Sat 08:45 | Sat 09:00 | Sat 10:00 |

A and B share slot 1, C gets slot 2. Status READY (ADR 0009 rules 2 to 5; open-questions B1: last batch, no reheat gap).

| ID | Case | Expected | Status |
|---|---|---|---|
| MUL-02 | Merged preheat | one preheat at Sat 07:00 (30 min before the first bake at 07:30). C's own 07:45 preheat is dropped, since the oven is already hot | READY (ADR 0009 r7) |
| MUL-03 | Capacity 1, three loaves | slots of 1 each; A offset -90, B offset -45, C offset 0; A bake covered Sat 06:45, B 07:30, C 08:15 | READY (ADR 0009 r2, r4; B1) |
| MUL-04 | Capacity equals loaf count (3 loaves, capacity 3) | one slot, all offsets 0, all three schedules identical to SCH-01 | READY |
| MUL-05 | Capacity exceeds loaves | same as MUL-04 | READY |
| MUL-06 | Capacity 2, four loaves | slot 1 = A, B at -45; slot 2 = C, D at 0 | READY (ADR 0009 r2; B1) |
| MUL-07 | Capacity 2, five loaves | slots of 2, 2, 1. Offsets -90, -45, 0. Slot 1 loaves ready Sat 08:30, slot 2 Sat 09:15, slot 3 Sat 10:00 | READY (ADR 0009 r2, r4; B1) |
| MUL-08 | Mixed bake lengths, capacity 1 | A default (bake 30 + 15 = 45), B with covered 25 + uncovered 10 = 35, input order [A, B]: B is the last slot with offset 0 and its feeding is Fri 03:15 (10 min shorter total). A offset -35: feeding Fri 02:30, bake covered Sat 07:40 and ends 08:25 when B starts, A ready Sat 09:25 | READY (ADR 0009 r3, r4) |
| MUL-09 | Input order changed | [B, A] gives A as the last slot | confirms order dependence is deterministic and documented | READY (ADR 0009 r2) |
| MUL-10 | Different recipes with different cold-ferment lengths (A 12 h, B 18 h) | each recipe's schedule is computed independently from its own bake slot. No step shared | READY (ADR 0009 r5) |
| MUL-11 | One recipe item at scale 2 (two loaves) with capacity 1 | yes, it splits (loaf by loaf): dough steps run once, oven and tail steps are per slot (`:s1`, `:s2`), the later loaf waits in the cold ferment, `holdExceedsRange` warns if that goes over maxMin | READY (ADR 0009 r2, r6, r8) |
| MUL-12 | Capacity 0, negative, or non-integer | rejected (throws or `invalid`) | READY (core-api) |
| MUL-13 | Merged timeline ordering | all steps of all items sorted by start instant, ties broken deterministically (slot, then item order) | READY |
| MUL-14 | Quiet hours on merged timeline (22:00 to 06:00) | MUL-01: A and B feeding at 02:20 warn; C at 03:05 warns; three warnings, no moves | READY given MUL-01 |
| MUL-15 | Ready time too soon for the earliest slot | earliest-ready result, based on the slot-1 recipes (they need the longest lead time) | READY (ADR 0009 r9, ADR 0010 s6) |
| MUL-16 | Shared oven check | no two slots overlap in bake time. Slot k bake end = slot k+1 bake start | READY |
| MUL-17 | Per-item cost snapshot | each BakeItem stores its own cost snapshot at the scale used | READY |

## 10. Live bake recompute (S-5, M1 criterion 8, M5)

Baseline: SCH-01 plan. Rule under test (plan M1 criterion 8): every remaining planned start shifts by the difference between a step's actual end and its planned end. Remaining steps keep their durations. The alongside preheat follows its anchor.

| ID | Case | Input | Expected | Status |
|---|---|---|---|---|
| LIV-01 | Step finishes 40 min late | Bulk planned end Fri 20:05, actual end Fri 20:45 | Shape 20:45, Cold ferment 20:55, Preheat Sat 08:25, Bake covered 08:55, Bake uncovered 09:25, Cool 09:40, Ready 10:40. Earlier steps unchanged | READY |
| LIV-02 | Step finishes 20 min early | Bulk actual end Fri 19:45 | Shape 19:45, Cold ferment 19:55, Preheat 07:25, Bake covered 07:55, uncovered 08:25, Cool 08:40, Ready 09:40 | PROPOSED (AMB-11) |
| LIV-03 | Step finishes on time | actual end = planned end | no change | READY |
| LIV-04 | Started late, ended on time | Bulk actual start 14:25 (+20), actual end 20:05 | no shift | PROPOSED (AMB-11) |
| LIV-05 | Started late, kept full duration | Bulk start 14:25, end 20:25 | remaining shift +20 | READY |
| LIV-06 | Late shift creates new quiet-hours warnings | SCH-01, quiet 22:00 to 06:00, Bulk actual end 8 h late (Sat 04:05) | Shape Sat 04:05 and Cold ferment Sat 04:15 now warn. Preheat 15:45, Bake covered 16:15, uncovered 16:45, Cool 17:00, Ready Sat 18:00. Warnings are only raised for steps not yet started | READY |
| LIV-07 | Late shift removes a warning | SCH-02 (Mix and rest warns at 05:05), Feeding actual end 1 h late (Fri 06:05) | Mix and rest now starts 06:05, outside quiet hours, so the warning disappears. Folds 07:05, Bulk 09:05, Shape 15:05, Cold ferment 15:15; with the 18 h cold ferment kept, Ready becomes Sat 11:00 | PROPOSED (AMB-11) |
| LIV-08 | Multiple recomputes | two consecutive late completions (+10, +15) | cumulative +25 on remaining steps | READY |
| LIV-09 | Cold-ferment-as-flex policy | a long bulk, user wants to keep the ready time | recompute shortens the cold ferment inside its 12 to 24 h range, or the ready time moves | BLOCKED (AMB-11) |
| LIV-10 | Out-of-order done | user marks Shape done before Bulk | defined behaviour (reject, or implicit-complete earlier steps) | BLOCKED (AMB-11) |
| LIV-11 | Done twice | idempotent | READY |
| LIV-12 | Recompute notification diff | LIV-01 | the set of notifications to cancel and the set to create match exactly the changed steps; unchanged steps produce no notification churn | READY |
| LIV-13 | Last step (Cool) done early | ready time becomes the actual end | PROPOSED (AMB-11) |
| LIV-14 | Recompute in multi-recipe bake | MUL-01, item C's feeding 40 min late | only C's remaining steps shift; A and B unchanged; merged timeline reordered; C's preheat dropped state unchanged | READY (ADR 0009 r10, ADR 0010 s7) |
| LIV-15 | Recompute over DST | DST-11 | covered above | PROPOSED |
| LIV-16 | Recompute never moves a step into the past | late shift onto a step whose planned start is before now | planned start >= now for every unstarted step | READY |

## 11. Formatting and display (C-4, display only)

These are component-level or small-util tests, run on the JS engine used by the app (Hermes) at least once manually, since `Intl` support differs from Node.

| ID | Input | Locale | Expected |
|---|---|---|---|
| FMT-01 | 139 cents | en-US, USD | "$1.39" |
| FMT-02 | 139 cents | de-DE, EUR | "1,39 €" (non-breaking space before the symbol; compare with the platform's output, not a hand-typed space) |
| FMT-03 | 139 minor units | ja-JP, JPY | "¥139" (JPY has no minor digit; see AMB-15) |
| FMT-04 | 0 cents | en-US | "$0.00" |
| FMT-05 | 99999999 cents | en-US | "$999,999.99" |
| FMT-06 | 77.2727 hydration | en-US | "77.3%" |
| FMT-07 | 77.2727 hydration | de-DE | "77,3 %" |
| FMT-08 | negative | any | rejected before formatting |

## 12. Traceability

| Plan criterion | PRD ref | Case ids |
|---|---|---|
| M1.1 hydration and scaling | R-3, R-4, section 4 example | RCP-01 to RCP-12, SCL-01 to SCL-11, UNT-* |
| M1.2 cost 139 cents, markup | C-1 to C-7, section 6 example | CST-01 to CST-26, MNY-*, FMT-01 to FMT-05 |
| M1.3 default template and 18 h variant | S-1, S-2, section 5 | SCH-01 to SCH-22, SCH-10 to SCH-12 |
| M1.4 quiet hours | S-4 | QH-01 to QH-13 |
| M1.5 DST | S-6, NFR | DST-01 to DST-12, SCH-19, QH-08, QH-09 |
| M1.6 too soon, start now | section 5 edge cases, S-8 | SCH-13 to SCH-17, DST-07, DST-08 |
| M1.7 multi-recipe | S-12 | MUL-01 to MUL-17 |
| M1.8 recompute late | S-5 | LIV-01 to LIV-16 |
| S-9 temperature | S-9 | TMP-01 to TMP-10 |
| M3.1 cup-based and grams | C-2 | UNT-07 to UNT-12, CST-04, CST-17, CST-18 |
| M3.3 price change, snapshot | C-6 | CST-19 to CST-21 |

## 13. Ambiguity ledger

Each item names what is unclear, which cases depend on it, and the value or behaviour assumed so far. Items marked **Blocks values** stop QA from writing a final expected number.

| ID | Question | Cases | Assumed for now | Blocks values |
|---|---|---|---|---|
| AMB-01 | Rounding rule for cents, grams, percentages: half up, or half to even? The PRD's 17.5 c WW line rounds to 18 under both. Differences appear at 52.5 c (CST-07), 138.5 c (CST-06, CST-08) and 187.5 g (SCL-08) | CST-06 to CST-08, SCL-04, SCL-08, RCP-12 | half away from zero, applied to the exact ratio, never to a float | Yes, for CST-06 and CST-08 |
| AMB-02 | Is per-loaf cost the batch of rounded lines divided by loaves, then rounded? The 1-loaf recipe gives 139 c, the same recipe at 2 or 4 loaves gives 138.5 c per loaf. Is sell price computed from the rounded per-loaf cost or the unrounded value? Does round-once-per-line (A3) apply to a batch of many sub-cent lines (CST-09)? | CST-06, CST-08, CST-09, CST-24 | per-loaf = round(batch_cents / loaves); sell price from the rounded per-loaf cost | Yes |
| AMB-03 | Markup definition: sell = cost x (1 + m), or margin (sell = cost / (1 - m))? Rounded to the cent, or to a price step (5 or 25 cents)? PRD says "the markup logic from the existing sourdough cost calculator can seed this", and that calculator is not in the repo | CST-22 to CST-26 | sell = cost x (1 + m/100), rounded half up to the cent | Yes, for any non-trivial markup |
| AMB-04 | A1 elapsed-time model needs Chris's agreement. Also: behaviour for a ready time in the spring-forward gap, and for the repeated fall-back hour | DST-01 to DST-03, DST-09, DST-10 | elapsed time; gap time rejected or normalised forward; repeated hour resolves to the first occurrence | Partly (DST-09, DST-10) |
| AMB-05 | Where do fold sub-reminders land (at step start and every interval, or after each interval)? Does the folds duration follow count x interval when the count changes? | SCH-10, SCH-11 | first set at step start, 4 sets at 0, 30, 60, 90 min; duration = count x interval | SCH-11 |
| AMB-06 | Exact meaning of "runs alongside": the PRD example (07:45 start, 30 min) is only consistent with "ends when the anchor step, Bake covered, starts". The PRD prose says "Runs alongside the end of the cold ferment" | SCH-01, SCH-05, MUL-02 | preheat ends when Bake, covered starts | No |
| AMB-07 | Quiet-hour window: inclusive start and exclusive end? Does it apply to heads-ups and fold reminders or only step starts? Evaluated in which zone after a zone change? Meaning of start = end | QH-05 to QH-07, QH-11, QH-13, SCH-12 | start inclusive, end exclusive, step starts only, current device zone | QH-07, QH-11 |
| AMB-08 | "Earliest possible ready time": is it now plus the total at the chosen durations (30 h 55 min), or at the minimum durations (26 h 40 min)? With multi-recipe, is it driven by the slot-1 recipes? | SCH-15, SCH-17, MUL-15 | chosen durations | SCH-17 |
| AMB-09 | Kitchen-temperature lookup table, reference temperature behaviour with a user-set slider value, whether cold ferment is affected | TMP-09, TMP-10 | RESOLVED by ADR 0008 (B2): `1.09^(24-T)` table, user slider wins, cold ferment never adjusted | Only if Chris retunes the table (data change) |
| AMB-10 | Multi-recipe: slot ordering and tie-break; where the remainder loaves go; whether a single item at scale 2 can split across slots; merging preheat; slot length for mixed recipes; no reheat gap (A4, Chris Q8) | MUL-01 to MUL-17, LIV-14 | RESOLVED by ADR 0009 (B1, B7): greedy fill in input order, remainder last, slot length = longest oven phase in the slot, one merged preheat, no reheat gap, last batch defines ready time, items may split across slots | Only if Chris asks for a reheat gap later (a Settings value, default 0) |
| AMB-11 | Live recompute policy: shift remaining steps by actual end minus planned end (early completions pull the ready time earlier?) or absorb into the cold-ferment range to hold the ready time? Out-of-order done | LIV-02, LIV-04, LIV-09, LIV-10, LIV-13 | pure shift, both directions | LIV-09, LIV-10 |
| AMB-12 | Unit definitions: US cup (236.588 ml) vs metric cup (250 ml); tbsp and tsp as 1/16 and 1/48 cup via gramsPerCup; 1 ml of water = 1 g by default; display precision for oz (1 dp?) and cups (nearest 1/4?) | UNT-06, UNT-09 to UNT-13, UNT-16, RCP-11 | US ratios via gramsPerCup; water 1 g/ml; oz to 1 dp | UNT-06 display only |
| AMB-13 | Scaling: is the target dough weight per loaf or per batch, and is the base weight the sum of lines or the stored `doughWeightG`? Must rounded amounts add up to the target (SCL-06 sums to 1001 g)? What happens to amounts below 0.5 g? | SCL-05, SCL-06 | not decided | Yes |
| AMB-14 | Baker's % presentation: flour line shown against total flour including levain flour (90.9%) or 100%? Levain line as whole levain weight or split into its flour and water? Decimal places | RCP-02, RCP-08 | share of total flour (550 g), whole levain line, 1 dp | RCP-02, RCP-08 |
| AMB-15 | Money: minor units for currencies without cents (JPY) or with three digits (KWD); price input with more than 2 decimals; locale-specific parsing | MNY-07, MNY-11, FMT-03 | integer minor units per ISO 4217; more than the allowed decimals rejected | MNY-07, MNY-11 |
| AMB-16 | Unpriced ingredient: partial cost with an "incomplete" flag, or a block? How to show shares that must sum to 100 after rounding | CST-05, CST-15 | `incomplete` flag with the unpriced line named; shares rounded independently to 1 dp | CST-15 |
| AMB-17 | PRD cost table (section 6) vs the hydration example (section 4): the cost table has "Levain flour 50 g" and "Water 425 g". This QA plan reads the 425 g as 375 g added water plus 50 g levain water, and reads the table as one loaf with 100 g of levain at 100%. The levain line's flour is priced as bread flour (plan A2) | CST-01, CST-02 | as stated | No, but confirm with the architect that the core models the levain this way |
| AMB-18 | PRD Settings lists `energyRate`, plan A5 drops it. No test is written for it | none | dropped | No |
| AMB-19 | Value outside a step's range: error or clamp | SCH-09, TMP-03 | clamp in temperature adjustment, error for user input | SCH-09 |

## 14. QA-02 status after the ADRs (authoritative)

Statuses: **READY** = exact value decided by an ADR or arithmetic, automated and gating. (No case is PROVISIONAL any more: Chris's answers of 2026-11-26 settled AMB-09 and AMB-10 through ADR 0008 and 0009. A later retune of the temperature table is a data change.) **MOVED** = not a core function; belongs to the repository or UI layer. **GAP** = core-api.md is silent, test written leniently or left as todo (see section 15).

Files: U = `units.test.ts`, R = `recipe.test.ts`, C = `cost.test.ts`, S = `schedule.test.ts`, D = `dst.test.ts`, Q = `quiet-hours.test.ts`, T = `temperature.test.ts`, M = `multi-recipe.test.ts` (skipped unless `RUN_CO03=1`), L = `recompute.test.ts` (same flag).

| Cases | New status | Decided by | Expected value now | File |
|---|---|---|---|---|
| RCP-02, RCP-08 (AMB-14) | READY | ADR 0007 | flour 90.9, water 68.2, salt 1.8, levain 18.2 (whole line), cheese 18.2; `addedFlour` basis 100/75/2/20 | R |
| RCP-09 | READY | ADR 0007 | milk (role other) not in hydration | R |
| RCP-10 | READY | core-api | `hydrationPct` null, baker's rows null | R |
| RCP-11, UNT-13 (AMB-12) | GAP | core-api s2 | `WATER_GRAMS_PER_ML = 1` is tested; no function applies it to a line given in ml (toGrams(250,'ml') without density is `missingDensity`) | U |
| RCP-12 (AMB-01) | READY | ADR 0006 | 77.25 exact, displays 77.3 | R, U |
| SCL-04, SCL-08 (AMB-01) | READY | ADR 0006 | 2.5 -> 3, 187.5 -> 188 | R |
| SCL-05, SCL-06 (AMB-13) | READY | ADR 0010 s8 | 0.4 g -> 1 g; 508/381/10/102, sum 1001, target 1000 | R |
| SCL-09 | READY | CO-01 | throws `CoreInvariantError` for factor 0, negative, NaN, loaves 0 | R |
| UNT-06, UNT-09, UNT-10, UNT-16 (AMB-12) | READY | core-api s2 | 35.27396195 oz; 7.5 g; 2.5 g; 27.6 g | U |
| CST-05 (AMB-16) | READY | ADR 0006 s5 | shares 77.7 / 12.9 / 0.7 / 8.6 / 0 (core returns unrounded, displayed with `percent`) | C |
| CST-06 (AMB-01, AMB-02) | READY | ADR 0006 s4 | batch 277, per loaf roundHalfUp(138.5) = 139 | C |
| CST-07 | READY | ADR 0006 | lines 324/53/3/36/0 = 416, per loaf 139 | C |
| CST-08 | READY | ADR 0006 | lines 432/70/4/48 = 554, per loaf 139 | C |
| CST-09 | READY | ADR 0006 s4 | each line 0 with `belowOneCent`, batch 0 | C |
| CST-12, CST-13, CST-14 | GAP | core-api | no error code for size 0, negative price, loaves 0; tests assert only "never a non-finite ok value" | C |
| CST-15 (AMB-16) | READY | ADR 0006 s9 | `unpriced`, `complete: false`, batch 121 when WW is unpriced | C |
| CST-20, CST-21 | MOVED | | cost snapshot and price-history ordering belong to the repository tests (ADR 0014) | |
| CST-23 to CST-25 (AMB-02, AMB-03) | READY | ADR 0006 s6 | 100% -> 278; 50% -> 209 (1 loaf); 277 c / 2 loaves at 50% -> 208 (from unrounded, not 209); 33.3% -> 185; rounding up to 25 c | C |
| CST-26 | GAP | core-api | CO-01 clamps to 0%; test accepts throw or 0% result | C |
| MNY-07, MNY-11 (AMB-15) | READY | ADR 0006 s7 | "1.005" -> `tooManyDecimals` (max 2); JPY "¥1200" -> 1200; JPY "12.5" rejected (max 0); KWD "1.234" -> 1234 | C |
| FMT-01 to FMT-05 | READY | | en-US/de-DE/ja-JP via Intl; verify once on Hermes | C |
| FMT-06, FMT-07 | MOVED | | percentage display strings are UI formatting, not in core-api | |
| SCH-01, SCH-02, SCH-19 | READY | core-api s7 | tests use Sat 2026-11-28 10:00 EST (feed Fri 03:05, preheat Sat 07:45; cold 18 h feed Thu 21:05) plus the PRD's 2026-05-02 EDT and Kolkata tables | S |
| SCH-09 (AMB-19) | READY | ADR 0010 s4 | override out of range -> `overrideOutOfRange` {stepId, minutes}; planBake returns `invalid` | S |
| SCH-10, SCH-11 (AMB-05) | READY | ADR 0010 s3 | folds at +0/30/60/90; 3 folds = 90 min, earlier steps 30 min later | S |
| SCH-12 | MOVED | ADR 0011 | heads-up notifications are the notification layer | |
| SCH-15, SCH-16, SCH-17 (AMB-08) | READY | ADR 0010 s6 | chosen durations; earliest = now + 1855 min rounded up to 5 min; minimum durations only via overrides (18:40Z case) | S |
| SCH-20 | READY | core-api | zero duration -> `rangeInvalid` | S |
| DST-01, DST-02, DST-03, DST-09, DST-10 (AMB-04) | READY | ADR 0005 | exact tables in section 6; gap 02:30 -> 03:30 EDT `shiftedForward`; repeated 01:30 -> 05:30Z `ambiguousEarlier` | D |
| DST-06 | MOVED | ADR 0011 | zone change reconcile is app-layer; core part is covered by QH-13 | Q |
| DST-11, LIV-15 | READY | ADR 0010 s7 | +40 elapsed, ready Sun 10:40 EDT, cold still 720 | L |
| QH-05, QH-06, QH-07 (AMB-07) | READY | ADR 0010 s5 | [start, end); start = end is an empty window | Q |
| QH-11 | READY | ADR 0010 s5 | heads-ups not checked | Q |
| QH-13 | READY | ADR 0010 s5 | warnings use the zone passed; London judges the same plan differently | Q |
| TMP-01 to TMP-08 | READY | ADR 0008 | properties plus exact rows | T |
| TMP-09, TMP-10 (AMB-09) | READY | ADR 0008 (B2) | 21 C -> 470 min; 27 C -> 300 (clamped from 275); 18 C -> 480 (605); user slider wins | T |
| MUL-01 to MUL-09, MUL-11, MUL-13 to MUL-16 (AMB-10) | READY | ADR 0009 (B1, B7) | tables in section 9; slot indexes 1-based, keys `:s<slot>`; needs CO-03 | M |
| MUL-04, MUL-05 | READY (single slot, cap >= loaves) | ADR 0009 r2 | one slot, identical to single-loaf plans | M |
| MUL-12 | READY | core-api | capacity 0, -1, 1.5: throws or `invalid` | M |
| MUL-17 | MOVED | ADR 0014 | per-item cost snapshot is persistence | |
| LIV-01 to LIV-05, LIV-08, LIV-10, LIV-11, LIV-13 (AMB-11) | READY (needs CO-03) | ADR 0010 s7 | pure shift both ways; done twice -> `alreadyDone`; out of order -> inferred done | L |
| LIV-06, LIV-07 | READY (needs CO-03) | ADR 0010 s5, s7 | late shift moves Shape/Cold into quiet hours; assert through `quietHoursWarnings` on the new plan | L |
| LIV-09 | READY | ADR 0010 s7 | no hidden absorb; `holdCapacity` covers the explicit button | L |
| LIV-12 | READY (needs CO-03) | | `shiftedKeys` = exactly the moved keys | L |
| LIV-14 | READY (AMB-10) | ADR 0009 r10, ADR 0010 s7 | only item C shifts | L |
| LIV-16 | GAP | core-api | `RecomputeEvent` has no `now`, so "never into the past" cannot be enforced or tested in core | |
| New: foldDone, extend, typed errors, holdCapacity | READY (needs CO-03) | ADR 0010 s7 | see L | L |

Counts after QA-02 (rows of section 14 by status, approximate by id group): READY about 123 ids (the 18 former PROVISIONAL ids are now READY: TMP-09, TMP-10, MUL-01 to MUL-09, MUL-11 to MUL-16, LIV-14), PROVISIONAL 0, MOVED 7, GAP 7. Automated: 326 tests, of which 277 run now and 49 are gated behind `RUN_CO03=1` (multi-recipe 30, recompute 19).

## 15. Contract issues found in core-api.md (QA-02)

| ID | Issue | Effect | Suggested fix |
|---|---|---|---|
| CG-1 | Section 0 lists file ownership but not which file exports `planBake`, `planSpanMin`, `earliestReadyAt`, `assignOvenSlots`, and the barrel (`src/index.ts`) is CO-03's. Tests import them from `src/schedule/backward` because that is where CO-02 put them | tests break if functions move | name the file per function in section 0 |
| CG-2 | Step keys for single-slot bakes: section 5.3 says `${itemId}:${stepId}:s${slot}` for per-slot steps. CO-02 always adds `:s1` and uses 1-based slots; the doc does not say 0 or 1-based | UI and notification ids depend on it | state "slots are 1-based; oven and tail keys always carry `:s<n>`" |
| CG-3 | `scaleLines` and `costBreakdown` signal invalid input (factor <= 0, loaves <= 0) with no documented failure mode; CO-01 throws `CoreInvariantError` for scale and clamps negative markup | UI callers must guard | document it, or return `Result` |
| CG-4 | No error code for non-positive package size or negative price (CST-12, CST-13) in `ConversionError` | pantry boundary rule is unwritten | state that validation happens at the pantry boundary, or add codes |
| CG-5 | `recomputePlan` takes no `QuietHours` or zone, but ADR 0010 s7 says every event "re-runs the quiet-hours check and returns new warnings" | quiet warnings after a late shift must be recomputed by the caller (tests do this) | clarify in the doc that the caller re-runs `quietHoursWarnings`, or add parameters |
| CG-6 | `RecomputeEvent` has no `now`, so "never move an unstarted step into the past" (LIV-16) is not expressible | possible past-dated notifications | caller clamps, or add `now` |
| CG-7 | `holdCapacity` fields `canAbsorbEarlyMin` and `canAbsorbLateMin` are not defined (shorten vs lengthen?) | test asserts the pair {0, 720} only | define direction |
| CG-8 | Kitchen temperature input range 10 to 40 C ("validation error", ADR 0008) has no `StepValidationError` code; CO-02 clamps instead | contradicts ADR text | update the ADR or add a code |
| CG-9 | `quietHoursWarnings` for fold 1 (same instant as the step start): one warning or two? | duplicate warnings possible | state that fold 1 is reported as the step start only |
| CG-10 | `WATER_GRAMS_PER_ML` has no consumer function (UNT-13, RCP-11) | ml water lines need density from the app layer | add `lineToGrams(line, factors)` or document that RN does it |
| CG-11 | `formatAmount` strings for `primary` are not specified | only `secondary` is asserted exactly | specify |
| CG-12 | `percent()` doc says `num * 10^(dp+2) / den`; `hydrationPct` returns an unrounded ratio, so displaying needs `percent(h, 100)` | easy to misuse | add a `displayPct` helper |
