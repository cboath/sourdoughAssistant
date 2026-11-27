# ADR 0006: Money: integer minor units, high-precision unit cost, round once per line

- Status: Accepted (plan assumptions A3, A5; markup and rounding defaults decided in `docs/open-questions.md` C1, C2)
- Date: 2026-11-26

## Context

BUILD_PLAN: money is integer cents in storage and math, and is formatted only at display. Per-gram prices are often below one cent (bread flour is about 0.24 ¢/g), so rounding the unit cost would compound errors. The PRD example must produce exactly 139 ¢ per loaf.

## Decision

1. **Storage:** every price is an `INTEGER` in the currency's **minor units**. The column names say `_cents` to match the plan's wording. For zero-decimal currencies such as JPY, "cents" means yen. No money value is ever stored as REAL.
2. **Unit cost is never stored or rounded.** A line's cost is computed in one expression, multiplying before dividing:
   `lineCents = roundHalfUp(packagePriceCents * billedGrams / packageGrams)`
   With integer price, grams and package size, the intermediate value is exact or nearly exact. `unitCostCentsPerGram()` exists for display only.
3. **Rounding rule:** `roundHalfUp(x) = Math.floor(x + 0.5 + 1e-9)` (cost values are never negative). The epsilon absorbs float noise such as 17.499999999 (the 0.35 ¢/g × 50 g whole-wheat line). Rounding happens **once per line**.
   **AMB-01:** the same half-up rule (half away from zero, applied to the exact ratio, never half-to-even) is used everywhere a number is rounded: cents, scaled grams (ADR 0007/core-api `scaleLines`), and displayed percentages. Percentages are rounded from a scaled integer division, for example `roundHalfUp(water * 1000 / flour) / 10`, so 309/400 gives 77.3 and never 77.2.
4. **Totals (AMB-02):**
   - `batchCents = Σ lineCents` (the sum of the rounded lines, so the breakdown visibly adds up).
   - `perLoafCents = roundHalfUp(batchCents / loaves)`. Example: 277 ¢ over 2 loaves = 138.5, displayed as 139.
   - Round-once-per-line (plan A3) applies even when a batch has many sub-cent lines (CST-09). A line whose exact cost is above 0 but rounds to 0 reports `costCents: 0` with `belowOneCent: true`, and the UI shows "<1¢". The total drift is at most 0.5 ¢ per line. That's accepted, because the lines visibly add up.
5. **Share % (AMB-16):** per line = `lineCents / batchCents × 100` over priced lines only. Each share is rounded independently to 1 dp, so the shares may not sum to exactly 100.0. That's accepted; there's no largest-remainder fix-up. If any line is unpriced, the breakdown is `complete: false` and names those lines. It's never blocked.
6. **Suggested sell price (C-7, AMB-02, AMB-03):**
   - The price is a **markup on cost**, not a margin: `sell = cost × (1 + markup)`.
   - It's computed from the **unrounded** per-loaf cost, so dividing and rounding happen in one step: `sellCents = applyRounding(roundHalfUp(batchCents * (10_000 + markupBps) / (10_000 * loaves)), rounding)`.
   - Markup is stored in **basis points** (`markup_bps`, where 15000 means 150%).
   - Rounding modes: `{ mode: 'none' }` (half up to the minor unit, the default) or `{ mode: 'up', stepCents }`, which rounds **up** to the next multiple, for example 25 ¢.
   - **Default (decided, open-questions C1 and C2):** markup 200% on cost (price = cost × 3), rounding `none`. Both are user-editable in Settings, Cost. Chris accepted the default and didn't supply the old calculator's logic, so nothing else needs matching.
7. **Money input (AMB-15):**
   - Minor-unit digits follow ISO 4217 through `Intl` (JPY 0, USD 2, KWD 3).
   - `parseMoneyInput(text, currency, locale)` uses the locale's decimal separator. It **rejects** input with more decimals than the currency allows (a validation error, not silent rounding), and it rejects negative values.
8. **Currency (PRD C-4, plan A5):** comes from the device locale (`expo-localization` `getLocales()[0].currencyCode`, fallback `USD`). Formatting uses `Intl.NumberFormat(locale, { style: 'currency', currency })`. Minor-unit digits come from `resolvedOptions().maximumFractionDigits`.
   - Every bake's cost snapshot stores its `currencyCode`, so old bakes still display correctly if the locale changes.
   - A `currency_override` column exists but stays unused (and has no UI) in v1.
   - **`energyRate` is dropped** because cost covers ingredients only.
9. **Unpriced data never silently becomes $0.**
   - A line whose pantry item has no price is `unpriced`.
   - A line whose units can't be converted is `conversionError`.
   - `CostBreakdown.complete = false` lists those lines, and the UI shows "partial cost".
   - Water (C-5) is seeded with price 0, so it counts as `free`, which is different from unpriced.

### PRD example check (one loaf)

| Line | Package (test fixture) | Billed g | Exact | Rounded |
|---|---|---|---|---|
| Bread flour | 240 ¢ / 1000 g | 450 | 108.0 | 108 |
| Whole wheat | 350 ¢ / 1000 g | 50 | 17.5 | 18 |
| Salt | 100 ¢ / 1000 g | 10 | 1.0 | 1 |
| Levain (100 g at 100%), flour part | bread flour, 240 ¢ / 1000 g | 50 | 12.0 | 12 |
| Water (incl. levain water) | 0 ¢ | 425 | 0 | 0 |
| **Batch = per loaf** | | | | **139** |

## Options considered

- **Decimal library (big.js, dinero.js).** Rejected as unnecessary: the values are small and there is one rounding point.
- **Round the unit cost to 1/100 ¢ and store it.** Rejected because it drifts when large packages meet small amounts.
- **Round only the batch total.** The lines wouldn't add up on screen, which hurts trust (M3 done-when: "a cost per loaf you trust").

## Consequences

- CO-01 implements `roundHalfUp`, `lineCostCents`, `costBreakdown` and `sellPrice` exactly as described here.
- QA-02 locks in the table above, plus a JPY case (0 decimals) and a 5 lb bag case (lb to g conversion).
