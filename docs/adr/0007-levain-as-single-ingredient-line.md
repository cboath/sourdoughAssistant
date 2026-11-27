# ADR 0007: Levain is one ingredient line with a hydration % and a flour pantry item

- Status: Accepted (plan assumption A2). Free water and always-free levain water were confirmed by Chris on 2026-11-26 (`docs/open-questions.md` C4)
- Date: 2026-11-26

## Context

R-3: hydration must count the flour and water inside the levain. The PRD cost example bills "levain flour" at the bread-flour price and levain water at $0. Starter upkeep costs are out of scope.

## Options considered

1. **One line with role `levain`, `amountG`, `levainHydrationPct` (default 100), and `pantryItemId` pointing at the flour used to feed the levain.** Simple to enter, and it matches how bakers write recipes ("100 g levain").
2. **A levain sub-recipe** (its own flour, water and starter lines). More accurate for mixed-flour levains, but heavier to enter and to schedule. Revisit when the starter tracker arrives (Later phase).
3. **Two lines (levain flour plus levain water).** Accurate math, but it doesn't match how bakers think, and it doubles the lines.

## Decision

**Option 1.**

- `splitLevain(amountG, hydrationPct)`: `flourG = amountG × 100 / (100 + h)`, `waterG = amountG − flourG`. At 100%, 100 g splits into 50 g + 50 g.
- **Totals:**
  - `totalFlourG = Σ flour lines + levain flour`
  - `totalWaterG = Σ water lines + levain water`
  - `hydrationPct = totalWaterG / totalFlourG × 100`
  - PRD check: (375 + 50) / (500 + 50) = 77.27%, displayed as 77.3%.
- **Baker's %** defaults to a `totalFlour` basis (the levain flour is included in the 100%). That matches R-3 and the hydration figure. A `basis: 'addedFlour'` option exists for bakers who prefer the "flour lines = 100%" convention. There's no UI toggle in v1.
- **Presentation (AMB-14):**
  - Each line's baker's % is a share of total flour including levain flour (550 g in the PRD example). That gives flour 90.9%, water 68.2%, salt 1.8%, and inclusions as a share of the same base (100 g cheese = 18.2%).
  - The levain line is shown as the **whole levain weight** (100/550 = 18.2%). It is not split into flour and water rows. The hydration figure is where the split shows up.
  - Percentages display to 1 dp, rounded half up from the exact ratio (ADR 0006).
- **AMB-17 confirmed:** the PRD cost table is one loaf with 100 g of levain at 100%. Its "Water 425 g" is 375 g of added water plus 50 g of levain water, and its "Levain flour 50 g" is the levain's flour part, priced as bread flour.
- **Cost:** a levain line is billed for its flour grams at the price of its pantry flour item. Its water part costs 0 (plan A2; open-questions C4), even if the user has priced water. If the levain line has no pantry item, it's `unpriced`.
- Only one levain line per recipe is expected, but more are allowed and summed.
- Salt, inclusions and "other" lines don't count toward flour or water. Milk and other liquids are role `other` in v1 and don't count toward hydration. Revisit in v1.1 if users ask.

## Consequences

- The `recipe_ingredient.levain_hydration_pct` column is required when role = `levain` and must be NULL otherwise (CHECK constraint).
- The recipe editor shows a hydration % field and a flour picker on levain lines (DS-02).
