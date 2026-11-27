# ADR 0008: Kitchen-temperature adjustment by multiplier table

- Status: **Accepted.** Decided by Chris on 2026-11-26 (`docs/open-questions.md` B2: this table, tuned later; D2: display unit from the locale; B6: kitchen temperature starts as "Not set"). Plan assumption A6; resolves QA AMB-09
- Date: 2026-11-26

## Context

S-9 requires adjusting bulk and room-temperature proof durations for kitchen temperature, using a simple lookup table. Fermentation speeds up as it gets warmer. A common rule of thumb is that each 1 °C (about 2 °F) of difference changes the time by 8 to 10%.

## Decision

- **Reference:** 24 °C / 75 °F gives a multiplier of 1.00.
- **Table:** built from `1.09^(24 − T)` and rounded to 2 dp. Temperatures are stored and computed in °C. °F input is converted with `fahrenheitToCelsius` before lookup. The table is exported as `DEFAULT_TEMP_TABLE` so it can be tuned later without code changes elsewhere.

| °C | ≈ °F | Multiplier | Bulk 6 h (range 5 to 8 h) becomes |
|---|---|---|---|
| 18 or lower | 64 or lower | 1.68 | 10 h 05 m → **clamped to 8 h** |
| 19 | 66 | 1.54 | 9 h 15 m → **clamped to 8 h** |
| 20 | 68 | 1.41 | 8 h 30 m → **clamped to 8 h** |
| 21 | 70 | 1.30 | 7 h 50 m |
| 22 | 72 | 1.19 | 7 h 10 m |
| 23 | 73 | 1.09 | 6 h 30 m |
| **24** | **75** | **1.00** | **6 h** |
| 25 | 77 | 0.92 | 5 h 30 m |
| 26 | 79 | 0.84 | 5 h 00 m |
| 27 | 81 | 0.77 | 4 h 35 m → **clamped to 5 h** |
| 28 | 82 | 0.71 | 4 h 15 m → **clamped to 5 h** |
| 29 | 84 | 0.65 | 3 h 55 m → **clamped to 5 h** |
| 30 or higher | 86 or higher | 0.60 | 3 h 35 m → **clamped to 5 h** |

- **Lookup:** linear interpolation between rows. Below 18 °C or above 30 °C, the end row's multiplier applies.
- **Algorithm** for steps with `tempSensitive = true`, when a kitchen temperature is given:
  1. `raw = recipeDefaultMin × multiplier(tempC)`, starting from the recipe default, not the previous slider value.
  2. Round half up to the **nearest 5 minutes**.
  3. Clamp to `[minMin, maxMin]`. Set `clamped = true` and emit a `temperatureClamped` warning ("Kitchen is cold: bulk capped at 8 h, watch the dough").
- **Precedence:** a user slider value (`overrides[stepId]`) always wins (`source: 'user'`). If temperature changes after the user has moved a slider, the user's value is kept. If no temperature is given, the recipe default is used (`source: 'default'`).
- **Which steps:**
  - In the seed template, **only bulk ferment** is `tempSensitive`. A room-temperature final proof would be too, if a recipe has one.
  - Cold ferment (fridge) is **never** adjusted.
  - The starter feeding is off by default. The user can flag it.
- **Display unit (decided, open-questions D2):** comes from the locale (°F for `en-US`, °C otherwise), with a Settings override.
- **No carry-over (decided, open-questions B6):** each new bake starts with the kitchen temperature "Not set". The last value only pre-fills the picker.
- **Input range** (amended after QA-02 CG-8): the **schedule screen** accepts 10 to 40 °C (50 to 104 °F) and rejects anything else with an inline field error, and the `bake.kitchen_temp_c` CHECK enforces the same range. **Core doesn't validate the range.** `temperatureMultiplier` clamps any finite input to the table ends (18 and 30 °C), and the resulting durations are clamped to each step's range as usual.

## Options considered

- **Q10 exponential formula with a user-tunable coefficient.** More "scientific", but harder to explain and tune. The table can be swapped for a formula later behind the same function.
- **A per-recipe table.** Overkill for v1.

## Consequences

- CO-02 implements `temperatureMultiplier` and `chooseDurations` per `docs/core-api.md`. QA-02 writes exact, final values (TMP-09, TMP-10) from the table above (B2).
- Chris may retune the numbers after real bakes (B2: "you tune it later"). That is a data change only: an edit to `DEFAULT_TEMP_TABLE` plus updated expected values, with no new ADR needed.
