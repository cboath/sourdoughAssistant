# Sourdough Assistant: screen specs for recipes, pantry and cost (M3)

DS-02 · 2026-11-26 · ux-ui-designer
Inputs: `docs/design/flows.md`, `tokens.md`, `components.md` (DS-01) · `docs/core-api.md` · `docs/architecture.md` §4 to §5 · `docs/data-model.md` · ADR 0004, 0006, 0007, 0009, 0010 · PRD §4 and §6
Consumers: RN-05 (build), QA-03 (RNTL + manual M3 checklist), DR-01 (review against this file)

Screens and components use **DS-01 names**. Values are **token names**: no raw hex, px or ms. Field names in `code` match `core-api.md` (camelCase) and `data-model.md` (snake_case columns, camelCase domain).

---

## 0. Shared rules for every screen in this file

### 0.1 Screen ID to route

| Screen ID | Route (architecture §4) | Presentation | Params |
|---|---|---|---|
| `PANTRY-LIST` | `app/(tabs)/pantry/index.tsx` | Tab root | none |
| `PANTRY-DETAIL` | `app/(tabs)/pantry/[id].tsx` | Push | `id` |
| `PRICE-UPDATE` | none: a `Sheet` component owned by `src/features/pantry/components` | Sheet over `PANTRY-DETAIL`, `RECIPE-COST`, `INGR-EDIT` | `pantryItemId` prop |
| `PANTRY-EDIT` | `app/pantry-editor/[id].tsx` | Root modal | `id` = `new` or uuid; `?returnTo=ingredient`; `?name=` (prefill, **new param**, see §12) |
| `RECIPE-LIST` | `app/(tabs)/recipes/index.tsx` | Tab root | none |
| `RECIPE-DETAIL` | `app/(tabs)/recipes/[id]/index.tsx` | Push | `id`; `?loaves=` (optional initial scale) |
| `RECIPE-COST` (architecture calls it COST-BREAKDOWN) | `app/(tabs)/recipes/[id]/cost.tsx` | Push | `id`; `?loaves=` (defaults to `yieldLoaves`) |
| `RECIPE-EDIT` | `app/recipe-editor/[id].tsx` | Root modal, full screen on both platforms | `id` = `new` or uuid; `?duplicateOf=` |
| `INGR-PICK` | none: a `Sheet` component inside the recipe-editor stack | Sheet over `RECIPE-EDIT` and `INGR-EDIT` | `mode: 'add' | 'replace' | 'levainFlour'` |
| `INGR-EDIT` | `app/recipe-editor/ingredient.tsx` | Push inside the recipe-editor modal | `?lineId=` (edit) or `?pantryItemId=` / `?role=levain` (new line, **new params**, §12) |
| `STEP-EDIT` | `app/recipe-editor/step.tsx` | Push inside the recipe-editor modal | `?stepId=` (edit) or none (new step) |

Tab-crossing links (for example `PANTRY-DETAIL` "Used in" to a recipe) navigate to `/recipes/<id>`. expo-router switches to the Recipes tab and pushes the detail there. Back on Android returns to the Recipes tab root, then Bakes (`backBehavior="firstRoute"`). That's accepted.

### 0.2 Formatting (one table, used by every screen)

| Value | Source | Display rule | Example | Accessibility label |
|---|---|---|---|---|
| Weight (ingredient, totals) | `amountG`, `DoughTotals.*` | `QuantityText`. Whole grams, half up, locale grouping, unit "g". **Exception:** amounts under 10 g that aren't whole show 1 decimal (`2.5 g`), see §12 Q-A1 | `1,001 g` | "1,001 grams" |
| Secondary amount | `formatAmount(grams, { unitSystem, locale, factors })` | `footnote textSecondary`, prefixed "about" when it's a conversion | `about 3¾ cups` | "about 3 and three quarter cups" |
| Percent (hydration, baker's %, share) | `percent(num, den, 1)` (or the unrounded `pct` through the same rounding) | 1 decimal, `Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 })` applied to `value / 100` | `77.3%` (de-DE `77,3 %`) | "77.3 percent" |
| `null` percent | `hydrationPct` = null, `sharePct` = null | An en dash `–` plus a reason line where one is specified | `–` | "not available" |
| Money (totals, lines, prices) | `Cents` | `MoneyText` via `formatMoney(cents, currency, locale)`. Currency from the device locale (C-4) | `$1.39` | platform reads "$1.39" |
| Below one minor unit | `CostLine.belowOneCent = true` | `<` + `formatMoney(1, …)` | `<$0.01` | "less than $0.01" |
| Free line | `CostLine.status = 'free'` | the word "Free" (not `$0.00`) | `Free` | "Free" |
| Unit cost, per gram | `unitCostCentsPerGram(pkg)` | Currency with `maximumFractionDigits = minorDigits + 2` (USD 4, JPY 2), "per g" | `$0.0024 per g` | "$0.0024 per gram" |
| Unit cost, readable | derived: per 100 g (metric) or per lb (`us`); `each` packages: per each | Normal currency digits | `$0.24 per 100 g`, `$1.09 per lb`, `$0.50 each` | "24 cents per 100 grams" |
| Package | `packagePriceCents`, `packageSize`, `packageUnit` | `{money} for {size} {unit}`; size up to 2 decimals, trailing zeros dropped | `$4.99 for 5 lb` | "4.99 dollars for 5 pounds" |
| Date priced | `pricedAt` (`YYYY-MM-DD`, local date) | `Intl.DateTimeFormat(locale, { dateStyle: 'medium' })` | `Nov 2, 2026` | "November 2, 2026" |
| Duration | `Minutes` | `TimeText` durations: `45 min`, `6 h`, `6 h 30 min`, `1 d 4 h` | `30 h 55 min` | "30 hours 55 minutes" |
| Range | `minMin`, `maxMin` | `{min}–{max}` with an en dash; drop the repeated unit only when both are whole hours (`5–8 h`) | `30 min–2 h` | "range 30 minutes to 2 hours" |
| Count | loaves | ICU plural | `1 loaf`, `2 loaves` | same |

Numbers, money and percentages always use `Text numeric` (tabular figures). Layout uses start/end (not left/right) so RTL mirrors correctly.

### 0.3 Validation behavior (applies to all forms here)

This **refines DS-01 `flows.md` §1.5**, which said Save is disabled until the form is valid. A disabled Save hides the reason from screen reader users and doesn't say what's wrong, so in DS-02:

1. **Save / Done is enabled as soon as the form is dirty.** On a clean form it's disabled, with the hint "No changes to save."
2. **Field errors appear on blur** after the user has edited that field, and **all errors appear on Save/Done**.
3. On a failed Save/Done:
   - Every invalid field shows its error.
   - Long forms (`RECIPE-EDIT`, `PANTRY-EDIT`) also show an error summary `Banner danger` at the top.
   - Focus and scroll move to the first error.
   - `haptic.warning` fires.
   - VoiceOver and TalkBack announce "{n} things to fix".
4. Errors clear as soon as the value becomes valid (on change, not on blur).
5. Warnings (non-blocking) use `Banner warning` or helper text in `warning` with an icon. They never block saving.

### 0.4 Write failures

Every save, delete or price write that throws a `UserFacingError` shows `Snackbar` "Couldn't save. Try again." with the action [Retry], and the form keeps its values (`flows.md` §8). Reads that fail show `EmptyState error`.

### 0.5 Loading

v1 is local-only. "Loading" only means the first SQLite read (at most about 300 ms), so screens show `Skeleton` and never a spinner. There are no network, offline or sync states on any of these screens (`flows.md` §0.5).

### 0.6 Large text (applies everywhere; each screen lists only what's specific to it)

At `fontScale >= 1.5`:
- `ListRow` trailing values move under the title.
- Two-column tables (amount, %) become two lines.
- Stat tiles stack vertically.
- Side-by-side buttons stack, with the primary on top.
- `DurationField` hour and minute inputs stack.

At 200%, nothing is clipped. Pinned bars stay pinned, and the content gets matching bottom padding.

### 0.7 Snackbars with undo used on these screens

All use `motion.snackbarDuration` and `haptic.impactLight` on Undo.

| Action | Message key | Undo restores |
|---|---|---|
| Delete ingredient line / step (in the editor draft) | `edit.lineDeleted` / `edit.stepDeleted` | The draft row at its position |
| Delete recipe | `recipe.deleted` | `deleted_at = NULL` on the recipe and its children |
| Archive/delete pantry item | `pantry.archived` / `pantry.deleted` | `deleted_at = NULL` |
| Save a price | `price.saved` | Soft-deletes the new history row and re-mirrors the previous current price |
| Delete a price-history entry | `price.entryDeleted` | `deleted_at = NULL` and re-mirrors |

---

## 1. `PANTRY-LIST`

**Purpose.** See everything you buy and what it costs, and spot what still needs a price.
**Entry points.** Pantry tab; back from `PANTRY-DETAIL`.

### 1.1 Data
`qk.pantry.list()` returns the non-archived `PantryItem[]`. For each row:

| Field | Source |
|---|---|
| name | `name` |
| category (section) | `category` |
| price | `packagePriceCents`, `packageSize`, `packageUnit` |
| readable unit cost | from `unitCostCentsPerGram(pkg)` (§0.2) |
| status | Unpriced when `packagePriceCents == null`; Free when `packagePriceCents === 0`; "Needs grams per cup" when `packageGrams` returns `missingDensity` / `missingEachWeight` |

Sections follow category order, and each section's rows sort by name (case-insensitive). Empty sections are hidden.

| `category` | Section label (`pantry.cat.*`) |
|---|---|
| `flour` | Flour |
| `water` | Water |
| `salt` | Salt |
| `starter` | Starter |
| `yeast` | Yeast |
| `sweetener` | Sweeteners |
| `fat` | Fats and oils |
| `dairy` | Dairy |
| `inclusion` | Inclusions |
| `other` | Other |

### 1.2 Layout (top to bottom)
1. **Header.**
   - iOS: large title "Pantry". The `SearchField` sits in the nav bar (`headerSearchBarOptions`, placeholder "Search pantry"). The trailing nav button is "+" (SF `plus`, label "Add item").
   - Android: top app bar "Pantry". An M3 Search bar sits below it.
2. **Filter chip row** (`Chip filter`), shown only when at least one item is unpriced: "Unpriced ({count})". Padding `layout.screenMargin`, bottom `space.sm`.
3. **List** (FlashList with section headers): a `SectionHeader` per category, then `ListRow value`:
   - Title: `name` (`headline`, 2 lines max).
   - Subtitle (`subhead textSecondary`): the package, for example "$2.40 for 1 kg".
   - Trailing:
     - Priced: the readable unit cost ("$0.24 per 100 g").
     - Free: "Free".
     - Unpriced: `StatusTag unpriced` "Unpriced".
     - Conversion missing: `StatusTag unpriced` with the text "Needs grams per cup" (or "Needs weight of one").
   - iOS shows a chevron.
4. **Android only:** M3 Extended FAB "Add item" (`radius.lg`, bottom end, above the navigation bar). It collapses to an icon on scroll and keeps the label.
5. Bottom padding equals the FAB height plus `space.lg` on Android, and the tab bar inset on iOS.

### 1.3 States
| State | Treatment |
|---|---|
| Loading | 6 `Skeleton` ListRows under 2 skeleton section headers |
| Empty (no items) | `EmptyState firstUse`: title `pantry.empty.title`, body `pantry.empty.body`, primary "Add item" |
| Search, no results | `EmptyState search`: `pantry.search.none` with the query, plus [Clear search] |
| Unpriced filter on, and the last unpriced item gets a price | The filter turns off automatically and the chip hides |
| Read error | `EmptyState error`: "Couldn't load your pantry." [Try again] |
| Long names (up to 60 in the UI, 200 from import) | 2 lines, then ellipsis. The full name is in the label |
| Large text | Trailing unit cost moves under the subtitle (§0.6). Section headers wrap |

### 1.4 Interactions
- Tap a row to open `PANTRY-DETAIL`.
- "+" / FAB opens `pantry-editor/new`.
- Search filters on `name` as you type (case-insensitive, accent-insensitive). It combines with the Unpriced chip (AND).
- Long press on a row (iOS context menu / Android long-press menu) offers "Update price" (opens `PRICE-UPDATE`) and "Edit". Both are also `accessibilityActions`, and both are reachable in `PANTRY-DETAIL`, so long press is never required.

### 1.5 Copy
| Key | String |
|---|---|
| `pantry.title` | Pantry |
| `pantry.search.placeholder` | Search pantry |
| `pantry.add` | Add item |
| `pantry.filter.unpriced` | Unpriced ({count}) |
| `pantry.row.package` | {price} for {size} |
| `pantry.row.per100g` | {price} per 100 g |
| `pantry.row.perLb` | {price} per lb |
| `pantry.row.each` | {price} each |
| `pantry.row.free` | Free |
| `pantry.row.unpriced` | Unpriced |
| `pantry.row.needsDensity` | Needs grams per cup |
| `pantry.row.needsEach` | Needs weight of one |
| `pantry.empty.title` | Add what you buy |
| `pantry.empty.body` | Enter a price once and every recipe that uses it shows its cost. |
| `pantry.search.none` | Nothing in your pantry matches "{query}". |
| `common.clearSearch` | Clear search |
| `pantry.loadError` | Couldn't load your pantry. |
| `common.tryAgain` | Try again |

### 1.6 Accessibility
- Each row is one stop. Label: "Bread flour, 2 dollars 40 for 1 kilogram, 24 cents per 100 grams" (the platform reads the currency). Unpriced: "Rye flour, unpriced". Hint: "Opens item".
- Section headers have `role="header"`.
- The Unpriced chip is `role="checkbox"` with `checked`.
- The FAB label is "Add item" even when collapsed.

---

## 2. `PANTRY-DETAIL` (with price history)

**Purpose.** One item's current price, what it costs per gram, how the price has changed, and which recipes use it.
**Entry points.** `PANTRY-LIST` row; after saving a new item in `PANTRY-EDIT` (`flows.md` §3).

### 2.1 Data
- `qk.pantry.detail(id)`: the `PantryItem`.
- `qk.pantry.history(id)`: `PriceHistory[]` where `deleted_at IS NULL`, ordered `priced_at DESC, created_at DESC`. The **first row is current**, and the service keeps `pantry_item` mirrored to it (CST-21: the latest `pricedAt` wins, not the latest insert).
- "Used in": the recipe lines with `pantry_item_id = id` (index `recipe_ingredient_pantry_idx`), joined to non-deleted recipes. Each entry has `recipe.name` and the line's `amountG`. One recipe may appear twice (for example, as a flour line and as the levain's flour).

### 2.2 Layout (top to bottom)
1. **Header.**
   - iOS: standard (inline) title = `name`. Trailing "Edit".
   - Android: top app bar with the name, and an "Edit" text button.
   - Both lead to `pantry-editor/<id>`.
2. **Heading block** (`layout.screenMargin` padding):
   - `name` in `title1` (wraps fully).
   - The category label in `subhead textSecondary`.
3. **Price `Card`** (not tappable):
   - Priced:
     - `MoneyText` `title1`: `packagePriceCents`.
     - `body`: "for {size} {unit}" with the converted size in brackets when the units differ from the user's system ("for 5 lb (2.27 kg)").
     - Divider (`border`).
     - Two value lines (`callout`): "{per g}" and "{per 100 g | per lb | each}".
     - `footnote textSecondary`: "Priced {date} · {store}" (the store is omitted if null).
   - Free (price 0): `title1` "Free", body "Water and anything else you don't pay for counts as 0." The "Update price" button is still available (C-5: the user can price water).
   - Unpriced: `title2` "No price yet", body `pantry.detail.unpricedBody`, `StatusTag unpriced`.
   - Conversion missing (volume package and no `gramsPerCup`; `each` and no `gramsPerEach`): `Banner warning` inside the card: "Add grams per cup to work out the cost per gram." [Add] opens `PANTRY-EDIT` focused on that field.
   - Below the card: `Button primary md fullWidth`: "Update price" (priced/free) or "Add price" (unpriced). Opens `PRICE-UPDATE`.
4. **`SectionHeader` "Conversions"**, with `ListRow value` rows (each opens `PANTRY-EDIT` scrolled to that field):
   - "Grams per cup": `{gramsPerCup} g`, or "Not set" in `textSecondary`.
   - "Weight of one": `{gramsPerEach} g`. Shown only when set, or when `packageUnit = 'each'`.
5. **`SectionHeader` "Price history"** (trailing text: "{count} prices"). Rows are `ListRow value`, newest first, and the list shows up to 5 rows, then a "Show all ({count})" row that expands in place (`motion.duration.standard`, instant with reduce motion):
   - Title: the package ("$2.60 for 1 kg").
   - Subtitle: "{date} · {store}".
   - Trailing:
     - The change versus the next older row, as an arrow icon (`arrow_upward` / `arrow_downward`, decorative) plus words: "Up 8%", "Down 5%", "No change" (|Δ| < 0.5%), or "Was free". The change compares **cost per gram**, so package-size changes compare fairly. It's computed with the item's current `gramsPerCup`/`gramsPerEach`, and is "–" if not convertible.
     - The first row also gets a `StatusTag` styled like `done` with the text "Current". Use the `done` colors with `check` / `checkmark` icons and that text, which is a text override of the variant.
     - The oldest row has no change value.
   - Each row has an overflow `IconButton` ("More options for price on {date}") with one item: "Delete this price". It's hidden when only one row exists (an item with a price keeps at least one row).
   - If there's no history (unpriced and never priced): the text "No prices yet." (`body textSecondary`).
6. **`SectionHeader` "Used in"**, with `ListRow navigation` per line: title = recipe name, subtitle = "{amount} · {role label}" ("450 g · Flour", "100 g · Levain, flour part priced here"). Tapping goes to `/recipes/<id>`. Empty: "Not used in any recipe yet." (`body textSecondary`).
7. Bottom padding `space.xxl`. There's no pinned bar: "Update price" is the primary action, and it sits in the content near the price.

### 2.3 States
| State | Treatment |
|---|---|
| Loading | Skeleton: heading bar, a card-shaped block, then 3 ListRow skeletons |
| Not found (archived while open, or a bad id) | `EmptyState error`: "This item isn't in your pantry anymore." [Back to pantry] |
| Read error | `EmptyState error`: "Couldn't load this item." [Try again] |
| Unpriced / Free / Conversion missing | See 2.2 item 3 |
| Partial history (an entry's unit can't be converted with the current factors) | That row's trailing value shows "–"; there's no error |
| Long history (50+) | The expanded list renders inside the parent FlashList (no nested scroll) |
| Large text | The card's two unit-cost lines stack. History trailing values go under the subtitle, with the "Current" tag on its own line |

### 2.4 Interactions
- "Update price" / "Add price" opens `PRICE-UPDATE` (§3).
- Delete a history entry: no confirm. It's soft-deleted, the mirror is recomputed from the new top row, and `Snackbar` `price.entryDeleted` offers [Undo]. Invalidates `pantry.all` and `recipes.all`.
  - If the deleted row was current, the snackbar also says the new current price: "Price removed. Current price is now $2.40."
- Pull to refresh: none (local data).

### 2.5 Copy
| Key | String |
|---|---|
| `pantry.detail.edit` | Edit |
| `pantry.detail.for` | for {size} |
| `pantry.detail.perG` | {price} per g |
| `pantry.detail.priced` | Priced {date} |
| `pantry.detail.pricedAt` | Priced {date} · {store} |
| `pantry.detail.free` | Free |
| `pantry.detail.freeBody` | Anything you don't pay for counts as 0 in recipe costs. |
| `pantry.detail.noPrice` | No price yet |
| `pantry.detail.unpricedBody` | Recipes that use this item show "Cost incomplete" until you add a price. |
| `pantry.detail.needsDensity` | Add grams per cup to work out the cost per gram. |
| `pantry.detail.needsEach` | Add the weight of one to work out the cost per gram. |
| `pantry.detail.add` | Add |
| `pantry.detail.updatePrice` | Update price |
| `pantry.detail.addPrice` | Add price |
| `pantry.detail.conversions` | Conversions |
| `pantry.detail.gramsPerCup` | Grams per cup |
| `pantry.detail.weightOfOne` | Weight of one |
| `pantry.detail.notSet` | Not set |
| `pantry.detail.history` | Price history |
| `pantry.detail.historyCount` | {count, plural, one {# price} other {# prices}} |
| `pantry.detail.showAll` | Show all ({count}) |
| `pantry.detail.current` | Current |
| `pantry.detail.up` | Up {pct} |
| `pantry.detail.down` | Down {pct} |
| `pantry.detail.same` | No change |
| `pantry.detail.wasFree` | Was free |
| `pantry.detail.noHistory` | No prices yet. |
| `pantry.detail.deleteEntry` | Delete this price |
| `price.entryDeleted` | Price removed. |
| `price.entryDeletedNewCurrent` | Price removed. Current price is now {price}. |
| `pantry.detail.usedIn` | Used in |
| `pantry.detail.levainUse` | Levain, flour part priced here |
| `pantry.detail.notUsed` | Not used in any recipe yet. |
| `pantry.detail.gone` | This item isn't in your pantry anymore. |
| `pantry.detail.backToPantry` | Back to pantry |
| `pantry.detail.loadError` | Couldn't load this item. |

### 2.6 Accessibility
- The price card is one stop: "Current price 2 dollars 40 for 1 kilogram. 0.24 cents per gram, 24 cents per 100 grams. Priced November 2, 2026 at Costco."
- History rows: "2 dollars 60 for 1 kilogram, November 20, 2026, up 8 percent per gram, current price." The overflow is a separate stop, and "Delete this price" is also an `accessibilityAction` on the row.
- "Show all" has the `expanded` state.
- The up/down arrows are decorative, because the words carry the meaning.

### 2.7 Platform
- iOS: "Edit" is a plain nav-bar button. The overflow uses `ellipsis.circle` and a `UIMenu`.
- Android: "Edit" is a top-app-bar text button. The overflow uses `more_vert` and an M3 menu. Predictive back works.

---

## 3. `PRICE-UPDATE` (sheet)

**Purpose.** Record a new price. Every save writes one `price_history` row (append-only, C-6), so history is never overwritten.
**Entry points.**
- `PANTRY-DETAIL` "Update price" / "Add price".
- `PANTRY-LIST` row menu.
- `RECIPE-COST` "Add price" on an unpriced line.
- `INGR-EDIT` "Add a price" link.

### 3.1 Fields (prefilled from the current price, or empty when unpriced)
| Field | Component | Maps to | Rules |
|---|---|---|---|
| Package price | `TextField money` (currency symbol prefix from the locale) | `price_history.package_price_cents` via `parseMoneyInput` | Required. 0 is allowed (Free) |
| Package size | `AmountField`, with the unit picker showing all 13 package units grouped Weight / Volume / Count | `package_size`, `package_unit` | Required, > 0 |
| Grams per cup | `TextField number` with the suffix "g" | `pantry_item.grams_per_cup` | Shown only when the chosen unit is volume and the item has none; then required |
| Weight of one | `TextField number` with the suffix "g" | `pantry_item.grams_per_each` | Shown only when the unit is `each` and the item has none; then required |
| Store | `TextField text` (optional), prefilled with the current store | `store` | Up to 60 characters |
| Date priced | `DateTimeField`, **date-only mode** (new mode, §12) | `priced_at` (local `YYYY-MM-DD`) | Defaults to today; can't be in the future |

The **preview line** below the fields (`callout`, updates live) reads: "{per 100 g | per lb} · was {old} ({Up 8%})". When unpriced: "{per 100 g}". When it can't be converted: no preview.

### 3.2 Layout
- iOS: native form sheet, medium and large detents, grabber. The nav bar has "Cancel" (leading) and "Save" (trailing, semibold), with the title "Update price" or "Add price".
- Android: M3 modal bottom sheet with a drag handle, the title `title2`, then the fields, then `Button primary lg fullWidth` "Save price". Back, a scrim tap or a drag down closes it.
- Fields are in a vertical stack with a `space.lg` gap.

### 3.3 Behavior
- **Save:**
  1. Writes the history row in one transaction.
  2. If `pricedAt` is on or after the current row's date, it also updates the `pantry_item` mirror. Densities are written to `pantry_item` in the same transaction.
  3. Invalidates `pantry.all` and `recipes.all`.
  4. Closes the sheet. `Snackbar` `price.saved` [Undo]. Focus returns to the opener.
- **Older date:** when the date is earlier than the current price's date, `Banner info` inside the sheet says `price.olderInfo` before saving. It's not blocking: the row is added to history, and the current price stays.
- **Dirty dismiss:** if the sheet is dirty, closing it shows the discard confirm (`components.md` §3.26): "Discard this price?" [Discard] [Keep editing].
- The keyboard opens on the price field when the sheet opens. On iOS, number fields get the "Done" accessory bar.
- Scheduled bakes are unaffected (they hold `cost_snapshot_json`). A footnote under the fields says so (`price.snapshotNote`).

### 3.4 Validation messages
| Condition | Field | Key | String |
|---|---|---|---|
| Empty price | Price | `val.price.empty` | Enter a price, or 0 if it's free. |
| `notANumber` | Price | `val.price.nan` | Enter a price like {example}. (`example` = `formatMoney(240)`) |
| `negative` | Price | `val.price.negative` | Price can't be negative. |
| `tooManyDecimals` with `maxDecimals > 0` | Price | `val.price.decimals` | Use at most {maxDecimals, plural, one {# decimal place} other {# decimal places}}. |
| `tooManyDecimals` with `maxDecimals = 0` | Price | `val.price.whole` | Enter a whole amount. |
| Price over 1,000,000 major units | Price | `val.price.max` | That price looks too high. Check it and try again. |
| Size empty or 0 | Size | `val.size.positive` | Enter a size above 0. |
| Size over 1,000 kg equivalent | Size | `val.size.max` | That package looks too big. Check the size and unit. |
| Volume unit without density | Grams per cup | `val.density.required` | Enter grams per cup so this price can be used in grams. |
| Density not in 1 to 1,000 | Grams per cup | `val.density.range` | Enter between 1 and 1,000 g. |
| `each` without weight | Weight of one | `val.each.required` | Enter what one weighs, in grams. |
| Each weight not in 0.1 to 10,000 | Weight of one | `val.each.range` | Enter between 0.1 and 10,000 g. |
| Date in the future | Date | `val.date.future` | The date can't be in the future. |

### 3.5 Copy
| Key | String |
|---|---|
| `price.titleUpdate` | Update price |
| `price.titleAdd` | Add price |
| `price.field.price` | Package price |
| `price.field.size` | Package size |
| `price.field.gramsPerCup` | Grams per cup |
| `price.field.gramsPerCup.help` | 1 cup of bread flour is about 120 g. |
| `price.field.each` | Weight of one |
| `price.field.store` | Store (optional) |
| `price.field.date` | Date priced |
| `price.preview` | {unitCost} · was {old} ({change}) |
| `price.olderInfo` | This price is older than the current one ({date}). It's added to history, and the current price stays. |
| `price.snapshotNote` | Recipe costs update right away. Bakes you've already scheduled keep their cost. |
| `price.save` | Save |
| `price.saveAndroid` | Save price |
| `price.cancel` | Cancel |
| `price.saved` | Price saved. Recipe costs updated. |
| `price.discard.title` | Discard this price? |
| `price.discard.confirm` | Discard |
| `price.discard.keep` | Keep editing |

### 3.6 Accessibility
- Focus moves to the sheet title on open and returns to the opener on close.
- The money field label is "Package price, in {currency name}". The suffix and prefix symbols are part of the label, not separate stops.
- The preview line is a polite live region, throttled to once per 1 s after typing stops, so it doesn't chatter.

---

## 4. `PANTRY-EDIT` (modal)

**Purpose.** Create an item, or edit its identity and conversions.
**Entry points.**
- `PANTRY-LIST` "+" / FAB.
- `PANTRY-DETAIL` "Edit".
- `INGR-PICK` "Add '{query}' to pantry" (`?returnTo=ingredient&name=`).
- `PANTRY-DETAIL` "Add grams per cup" (focus param).

**Decision (refines `flows.md` §3):** prices are entered **inline only when creating** an item. In edit mode the price section is read-only with an "Update price" button that opens `PRICE-UPDATE`. That gives one path that writes history, and editing an item can't accidentally rewrite or add a price.

### 4.1 Fields and layout (top to bottom)
Header:
- iOS: "Cancel" | "New item" / "Edit item" | "Save".
- Android: close (X) | title | "Save" text button.
- Dirty rules follow `flows.md` §1.5.

1. Error summary `Banner danger`, shown only after a failed save.
2. **Name**: `TextField text`, required, max 60 characters (counter shown from 50). Maps to `name`. Prefilled from `?name=`.
   - Duplicate check: case-insensitive against non-archived items, on blur. Non-blocking warning under the field: `pantryEdit.dup` [View it]. If dirty, [View it] asks to discard first.
3. **Category**: `ListRow value` "Category · Flour" that opens a `Sheet` with 10 `ListRow selectable` (radio) options in the §1.1 order.
   - Default `other`. When `?name=` is given, the default is guessed from keywords: "flour" → Flour, "salt" → Salt, "water" → Water, "starter" or "levain" → Starter, "yeast" → Yeast, "sugar" or "honey" → Sweeteners, "butter" or "oil" → Fats and oils, "milk" or "cheese" → Dairy. The guess is just a default the user can change.
   - Helper: `pantryEdit.category.help`.
4. **Price section** (`SectionHeader` "Price"):
   - **New item:**
     - Package price (`TextField money`, optional).
     - Package size (`AmountField`, all 13 units).
     - Store (optional).
     - Date priced (date-only `DateTimeField`, default today).
     - Helper under the section: `pantryEdit.price.help`.
     - **All-or-none** (DB CHECK): if price or size is filled, both are required.
     - Category Water with an empty price prefills price 0 and size 1 l (C-5) and shows the helper `pantryEdit.water.help`.
   - **Edit mode:** a read-only `ListRow value` "Current price · $2.40 for 1 kg" (or "Unpriced"), then `Button tonal md` "Update price" / "Add price", which opens `PRICE-UPDATE` over the modal.
5. **Conversions section** (`SectionHeader` "Conversions"), with progressive disclosure:
   - **Grams per cup** (`TextField number`, suffix "g"). It's expanded when the package unit is volume, when the value exists, or when focused from a param. Otherwise it's a text button row "Add grams per cup".
     - Prefilled from the known-density table when the name matches (RN keeps a small table in `src/features/pantry/densities.ts`: bread flour 120, all-purpose flour 125, whole wheat flour 113, rye flour 102, fine salt 292, sugar 200, honey 340, water 236.59, olive oil 216, milk 245, butter 227).
     - Helper: "Typical for {name}: {value} g" when prefilled; otherwise `price.field.gramsPerCup.help`.
     - Required when the package unit is volume.
   - **Weight of one** (`TextField number`, suffix "g"). It's expanded when the package unit is `each` or the value exists; otherwise a text button row "Add weight of one". Required when the package unit is `each`. Helper: "For things you count, like jalapeños or eggs."
6. **Archive / delete** (edit mode only): `Button destructive` text style, centered, `space.xxl` above. The label depends on use (see 4.3).

### 4.2 Validation messages
Price, size, density, each-weight and date messages reuse §3.4. Additional:

| Condition | Key | String |
|---|---|---|
| Name empty | `val.name.empty` | Enter a name. |
| Name over 60 | `val.name.long` | Use 60 characters or fewer. |
| Price without size | `val.size.needed` | Enter the package size too. |
| Size without price | `val.price.needed` | Enter the price too, or clear the size. |
| Summary (banner) | `val.summary` | {count, plural, one {Fix # thing to save.} other {Fix # things to save.}} |

### 4.3 Archive and delete (aligns with ADR 0004)
Archiving sets `deleted_at`. Recipe lines that use the item keep pricing from it and are labelled "(archived)". This **replaces** the DS-01 "blocked when in use" rule, which conflicted with ADR 0004.

| Item | Button | Confirm (native alert) | After |
|---|---|---|---|
| Not used in any recipe | "Delete item" | Title "Delete {name}?" Body "Its price history is removed too." [Delete] (destructive) [Keep] | The modal closes, the stack pops to `PANTRY-LIST`, and `Snackbar` "{name} deleted." [Undo] |
| Used in 1+ recipes | "Archive item" | Title "Archive {name}?" Body "It's used in {count, plural, one {# recipe} other {# recipes}}. Those recipes keep using its price, and it's hidden from your pantry and the ingredient list." [Archive] (destructive) [Keep] | Same, with "{name} archived." [Undo] |

### 4.4 Save
- **New item:** writes the `pantry_item` row and, if priced, the first `price_history` row in one transaction.
  - With `returnTo=ingredient`: the modal closes and `INGR-EDIT` gets the new item selected.
  - Otherwise: the modal closes and `PANTRY-DETAIL` of the new item opens.
- **Edit:** updates `pantry_item` only. Changing the category doesn't change the roles of existing recipe lines.
- Write failure: §0.4.

### 4.5 States
| State | Treatment |
|---|---|
| Loading (edit) | Field skeletons, at most about 300 ms |
| Item archived while open | Snackbar on save: "This item was archived. Changes weren't saved." The modal closes |
| Large text | AmountField's unit button moves under the number input. The category row value moves under the label |
| Landscape | Single column, max width `layout.maxContentWidth`, scrolls. iOS's keyboard "Done" accessory stays |

### 4.6 Copy
| Key | String |
|---|---|
| `pantryEdit.titleNew` | New item |
| `pantryEdit.titleEdit` | Edit item |
| `pantryEdit.name` | Name |
| `pantryEdit.dup` | You already have {name}. |
| `pantryEdit.dup.view` | View it |
| `pantryEdit.category` | Category |
| `pantryEdit.category.help` | Sets the usual role when you add it to a recipe. |
| `pantryEdit.price` | Price |
| `pantryEdit.price.help` | Leave the price empty if you don't know it yet. Recipes will show "Cost incomplete". |
| `pantryEdit.water.help` | Water is free by default. Change it if you pay for it. |
| `pantryEdit.currentPrice` | Current price |
| `pantryEdit.conversions` | Conversions |
| `pantryEdit.addDensity` | Add grams per cup |
| `pantryEdit.densityTypical` | Typical for {name}: {value} g |
| `pantryEdit.addEach` | Add weight of one |
| `pantryEdit.each.help` | For things you count, like jalapeños or eggs. |
| `pantryEdit.delete` | Delete item |
| `pantryEdit.archive` | Archive item |
| `pantryEdit.delete.title` | Delete {name}? |
| `pantryEdit.delete.body` | Its price history is removed too. |
| `pantryEdit.archive.title` | Archive {name}? |
| `pantryEdit.archive.body` | It's used in {count, plural, one {# recipe} other {# recipes}}. Those recipes keep using its price, and it's hidden from your pantry and the ingredient list. |
| `common.delete` | Delete |
| `common.archive` | Archive |
| `common.keep` | Keep |
| `pantry.deleted` | {name} deleted. |
| `pantry.archived` | {name} archived. |
| `common.undo` | Undo |
| `common.save` | Save |
| `common.cancel` | Cancel |
| `common.discard.title` | Discard changes? |
| `common.discard.confirm` | Discard changes |
| `common.discard.keep` | Keep editing |
| `common.saveFailed` | Couldn't save. Try again. |
| `common.retry` | Retry |

### 4.7 Accessibility
- Focus moves to the title on open.
- Errors are appended to the field labels ("Package size, error: Enter a size above 0").
- The collapsed "Add grams per cup" row is `role="button"` with `expanded=false`.
- The category sheet is a radiogroup.

---

## 5. `RECIPE-LIST`

**Purpose.** Find a recipe quickly: search, tag filter, favorites first.
**Entry points.** Recipes tab; back from detail.

### 5.1 Data
`qk.recipes.list(filter)` with `RecipeFilter = { query: string; tags: string[]; favoritesOnly: boolean }`.
- Sort: `favorite DESC`, then `name` (case-insensitive, matching the index).
- Rows need `hydrationPct` and the per-loaf cost, so the list hook loads the recipe aggregates (lines) plus `pantry.list` and computes them in a `useMemo` with `hydrationPct(lines)` and `costBreakdown(...)`. v1 volumes are small (fewer than 200 recipes). If profiling shows this is slow on Chris's Android, drop the cost from the subtitle first.
- The tag universe is the distinct tags across non-deleted recipes, sorted by use count descending, then A to Z.

### 5.2 Layout (top to bottom)
1. **Header.**
   - iOS: large title "Recipes". `SearchField` in the nav bar ("Search recipes"). Trailing nav buttons are "+" (label "New recipe") and, from M6 (flag), an overflow with "Import recipe".
   - Android: top app bar "Recipes" with an overflow (Import, M6), an M3 Search bar below it, and an Extended FAB "New recipe".
2. **Filter chip row**, horizontally scrollable, `space.sm` gap, `layout.screenMargin` side padding:
   - The first chip is "Favorites" (`Chip filter` with a star icon). Then one `Chip filter` per tag.
   - Multiple tags combine with **AND**. Favorites, tags and search all combine with AND.
   - When any filter is on, a trailing `Chip assist` "Clear" appears.
   - The row is hidden when there are no tags and no favorites.
3. **List** (FlashList) of `ListRow navigation`:
   - Title: `name` (`headline`, 2 lines).
   - Subtitle (`subhead textSecondary`, 2 lines): "{hydration} hydration · {loaves} · {cost} per loaf", for example "77.3% hydration · 1 loaf · $1.39 per loaf".
     - Cost incomplete: the cost part is replaced by `StatusTag unpriced` with the text "Cost incomplete" on a third line.
     - Hydration null: "No flour yet".
   - Trailing: favorite `IconButton toggle` (star outline / filled star; `iconMd`, hit area `touchMin`). It's separate from the row's tap target.
4. Bottom padding for the FAB (Android).

### 5.3 "New recipe" chooser
Tapping "+" / FAB opens a `Sheet` titled "New recipe" with:
- `ListRow navigation` "Blank recipe". Subtitle: "Starts with the default steps." Opens `recipe-editor/new`.
- `ListRow navigation` "Copy a recipe". Subtitle: "Start from one you already have." It replaces the sheet content with a searchable recipe list (same rows, without subtitles). Tapping one opens `recipe-editor/new?duplicateOf=<id>`.

The sheet is skipped and "Blank recipe" opens directly when there are no recipes.

### 5.4 States
| State | Treatment |
|---|---|
| Loading | 6 Skeleton rows (title 60%, subtitle 40%) |
| Empty (no recipes) | `EmptyState firstUse`: `recipes.empty.title`, `recipes.empty.body`, primary "New recipe", secondary text button "Add starter recipes" (re-runs the seed for R-9 `seed_key`s the user deleted; per data-model §5 that needs a service flag that ignores tombstones, see §12) |
| Search, no results | `EmptyState search`: `recipes.search.none` [Clear search] |
| Filters, no results | `EmptyState search`: `recipes.filter.none` [Clear filters] |
| Favorites only, none | `EmptyState search` (star icon): `recipes.fav.none` |
| Read error | `EmptyState error`: "Couldn't load your recipes." [Try again] |
| Partial data (no steps, unlinked lines) | Normal row. The subtitle gets `StatusTag unpriced` "Cost incomplete" if lines are unlinked. No-steps recipes show "No steps yet" in place of the loaves count |
| Long names (UI max 80) | 2 lines, then ellipsis |
| Large text | The subtitle wraps (no cap at 200%). The star stays trailing, top-aligned. The chip row keeps scrolling horizontally |

### 5.5 Interactions
- Tap a row to open `RECIPE-DETAIL`.
- Star toggle: an instant write (`favorite`), `haptic.selection`, and the row re-sorts after `motion.duration.standard` (instant with reduce motion). No snackbar, because the toggle is its own undo.
- Search matches `name` and tags (case-insensitive, accent-insensitive), as you type.
- Long press (context menu, also as `accessibilityActions`): "Schedule" (opens `SCHED-PLAN` with this recipe), "Duplicate", "Add to favorites" / "Remove from favorites", "Delete" (confirm per §6.9). Every one of these is also on `RECIPE-DETAIL`.

### 5.6 Copy
| Key | String |
|---|---|
| `recipes.title` | Recipes |
| `recipes.search.placeholder` | Search recipes |
| `recipes.new` | New recipe |
| `recipes.import` | Import recipe |
| `recipes.filter.favorites` | Favorites |
| `recipes.filter.clear` | Clear |
| `recipes.row.summary` | {hydration} hydration · {loaves, plural, one {# loaf} other {# loaves}} · {cost} per loaf |
| `recipes.row.summaryNoCost` | {hydration} hydration · {loaves, plural, one {# loaf} other {# loaves}} |
| `recipes.row.costIncomplete` | Cost incomplete |
| `recipes.row.noFlour` | No flour yet |
| `recipes.row.noSteps` | No steps yet |
| `recipes.fav.add` | Add to favorites |
| `recipes.fav.remove` | Remove from favorites |
| `recipes.new.title` | New recipe |
| `recipes.new.blank` | Blank recipe |
| `recipes.new.blankSub` | Starts with the default steps. |
| `recipes.new.copy` | Copy a recipe |
| `recipes.new.copySub` | Start from one you already have. |
| `recipes.empty.title` | No recipes yet |
| `recipes.empty.body` | Make your own, or start with a country loaf, whole wheat and an inclusion loaf. |
| `recipes.empty.seed` | Add starter recipes |
| `recipes.search.none` | No recipes match "{query}". |
| `recipes.filter.none` | No recipes have all of these tags. |
| `recipes.filter.clearAll` | Clear filters |
| `recipes.fav.none` | No favorites yet. Tap the star on a recipe to keep it at the top. |
| `recipes.loadError` | Couldn't load your recipes. |
| `recipes.menu.schedule` | Schedule |
| `recipes.menu.duplicate` | Duplicate |
| `recipes.menu.delete` | Delete |

### 5.7 Accessibility
- The row is one stop: "Country loaf. 77.3 percent hydration, 1 loaf, 1 dollar 39 per loaf. Favorite." Hint "Opens recipe".
- The star is a separate stop: `role="switch"`, label "Favorite, {name}", `checked`.
- Tag chips: `role="checkbox"` with the label "Tag {tag}". The Favorites chip label is "Favorites only".
- The chip row is a group labelled "Filters".

---

## 6. `RECIPE-EDIT` (modal)

**Purpose.** Create or edit the whole recipe: name, yield, ingredients, steps, tags, notes. Save commits the aggregate in one transaction (architecture §4, `useRecipeDraft`).
**Entry points.** `RECIPE-LIST` "New recipe" (blank or copy); `RECIPE-DETAIL` "Edit" and "Duplicate"; partial-data banners ("Add steps").

### 6.1 Draft
`useRecipeDraft` holds:
- `recipe`: `{ name, yieldLoaves, doughWeightG, tags, favorite, notes }`.
- `ingredients`: `{ id, pantryItemId, position, name, role, amountG, entryAmount, entryUnit, levainHydrationPct }[]`.
- `steps`: `StepTemplate[]` with `position` and `notes`.

Starting points:
- **Blank:** the 10 default template steps from `data-model.md` §5 with new ids, no ingredients, `yieldLoaves` 1.
- **Duplicate:** a copy with new ids. Alongside anchors are remapped to the new step ids. The name is "{name} (copy)", and `favorite` is false.

### 6.2 Layout (top to bottom)
Header:
- iOS: "Cancel" | "New recipe" / "Edit recipe" | "Save".
- Android: X | title | "Save".
- Dirty and discard rules follow `flows.md` §1.5: iOS blocks swipe-to-dismiss when dirty; Android's back and X ask first.

1. **Error summary** `Banner danger` (after a failed save). It lists up to 3 messages as lines, then "+{n} more". Each line is a link that scrolls to and focuses the problem.
2. **`SectionHeader` "Basics".**
   - **Name**: `TextField text`, required, max 80 characters (counter from 70).
   - **Loaves**: `Stepper` (1 to 50). Label "Loaves this recipe makes". Maps to `yieldLoaves`.
   - **Dough weight per loaf**: `TextField number`, suffix "g", optional, integer 50 to 20,000. Maps to `doughWeightG`.
     - Helper (live): "Ingredients now make {perLoaf} per loaf. Used as the starting point when scaling by weight."
     - When the ingredients' per-loaf weight differs from the field by 1 g or more, a text button appears: "Use {perLoaf}".
3. **`SectionHeader` "Ingredients"**. A list of `ListRow` per line, in `position` order:
   - Title: `name`. A suffix " (archived)" in `textSecondary` if its pantry item is archived.
   - Subtitle: the role label plus details: "Flour", "Levain · 100% hydration", "Water", "Inclusion".
   - Trailing (`body numeric`): grams ("450 g"), with the secondary display under it from `formatAmount` (`footnote`).
   - Tags row (when needed): `StatusTag unpriced` "Unpriced" (pantry item has no price, or the line is unlinked); "Needs grams per cup" (conversion error).
   - Overflow `IconButton` with "Move up", "Move down" (disabled at the ends) and "Delete".
   - Tap the row to open `INGR-EDIT?lineId=`.
   - After the last line: a `ListRow` styled as a text button with a leading `add` icon: "Add ingredient". It opens `INGR-PICK` (mode `add`).
   - **Live summary** under the list: a `Card` (`surfaceSunken`, no elevation), `callout numeric`, updating on every draft change:
     - "Hydration {pct} (includes levain)", or "Hydration –, add a flour" when null.
     - "Flour {totalFlourG} · Water {totalWaterG} · Dough {totalDoughG}".
     - "{perLoaf} per loaf" when `yieldLoaves > 1`.
     - From `doughTotals` and `hydrationPct` on the draft lines.
4. **`SectionHeader` "Steps"** (trailing: "{span} total"). `planSpanMin` uses default durations; it's hidden while steps are invalid.
   - A `ListRow` per step in `position` order:
     - Leading: a step number (`subhead numeric`, `textSecondary`). Alongside steps instead show the parallel-lines icon and are indented by `space.xl`.
     - Title: `name`.
     - Subtitle, which varies:
       - Duration with a range: "6 h · 5–8 h".
       - Fixed: "10 min".
       - Folds: "4 folds, every 30 min · 2 h".
       - Alongside: "Alongside Bake, covered · ends when it starts".
     - Tags: `StatusTag adjusted` with the text "Temperature-sensitive" when `tempSensitive`. `StatusTag` `remindersOff` "No reminder" when `notify = false`.
     - Inline error line (`footnote danger` + icon) when `validateSteps` reports that step (see 6.6).
     - Overflow: "Move up", "Move down", "Delete".
   - Tap to open `STEP-EDIT?stepId=`.
   - Last row: "Add step" opens `STEP-EDIT` for a new step, appended at the end.
   - **Info (non-blocking):** when there's no step with `kind = 'bake'`, a footnote `edit.noBakeStep` appears in `textSecondary` with an info icon.
5. **`SectionHeader` "Tags".**
   - The existing tags as `Chip input` (each with a remove button).
   - Then a `TextField text` "Add a tag" with the iOS return key "Add" and Android IME action "done". Each submit adds a chip. A comma also adds one.
   - While typing, up to 5 matching existing tags appear as `Chip assist` suggestions under the field.
6. **Favorite**: `ListRow toggle` "Favorite" with a `Switch`. Maps to `favorite`.
7. **`SectionHeader` "Notes"**: `TextField multiline`, max 10,000 characters (counter from 9,000), min 4 lines tall, grows.
8. **Delete recipe** (edit mode only): `Button destructive` text, centered, `space.xxl` above and `space.xxxl` below.

There's no pinned bottom bar: Save lives in the header, per `flows.md` §1.5.

### 6.3 Interactions
- **Reorder:** "Move up/Down" in the overflow and as `accessibilityActions` is the **required** path. Drag handles are an optional enhancement only if RN-05 can add one without a new dependency (the architecture lists none for drag-and-drop). The moved row keeps focus. Announce: "Moved to position 3 of 5."
- **Delete line/step:** no confirm. It's removed from the draft, and `Snackbar` [Undo] restores it at its old position.
  - Deleting a step that other steps run alongside also shows: "{step} deleted. {other} needs a new anchor." [Undo]. The dependent step row shows the `anchorMissing` error until it's fixed.
- **Tags:**
  - Trimmed. Duplicates are compared case-insensitively.
  - Max 20 tags, each up to 40 characters.
  - Stored as typed (trimmed). Search and filtering compare case-insensitively.
- **Save:**
  1. Validate (6.6).
  2. Write the aggregate in one transaction.
  3. Invalidate `recipes.all`.
  4. Close the modal.
  5. New recipe: push `RECIPE-DETAIL` of the new recipe (replacing the list position on the stack). Edit: return to `RECIPE-DETAIL`.
  6. `Snackbar` "Recipe saved." (announced).
- **Delete recipe:** see 6.9.
- Recomputing the live summary and span is synchronous `useMemo`; there's no debounce.

### 6.4 States
| State | Treatment |
|---|---|
| Loading (edit/duplicate) | Skeleton for the name field, 4 ingredient rows and 6 step rows |
| New, blank | Ingredients empty: an inline `body textSecondary` line "Add your flour, water, salt and levain." above "Add ingredient". Summary shows "Hydration –, add a flour" |
| Recipe deleted elsewhere while editing | On save: alert "This recipe was deleted. Save it as a new recipe?" [Save as new] [Discard] |
| Unpriced or archived lines | Tags per 6.2. They never block saving |
| Imported unlinked lines (`pantryItemId = null`) | Subtitle "Not linked to pantry" plus `StatusTag unpriced`. `INGR-EDIT` offers "Link to pantry item" |
| Long text | Names wrap to 2 lines in rows. Step and ingredient names show in full in their editors |
| Large text | Ingredient trailing grams move under the subtitle. Step subtitles wrap. The summary card lines wrap. The stepper keeps `touchKitchen` |
| Landscape / tablet | One column at `layout.maxContentWidth`, centered |

### 6.5 Validation at save (blocking)
| Condition | Shown on | Key | String |
|---|---|---|---|
| Name empty | Name | `val.recipe.name` | Enter a recipe name. |
| Name over 80 | Name | `val.recipe.nameLong` | Use 80 characters or fewer. |
| No line with role `flour` | Ingredients section | `val.recipe.flour` | Add at least one flour ingredient. |
| No steps (`emptyRecipe`) | Steps section | `val.recipe.steps` | Add at least one step. |
| Dough weight out of range | Dough weight | `val.recipe.doughWeight` | Enter between 50 and 20,000 g, or leave it empty. |
| Tag rules | Tag field (inline, on add) | `val.tag.dup` / `val.tag.max` / `val.tag.long` | Already added. / You can add up to 20 tags. / Keep tags to 40 characters. |

### 6.6 `validateSteps` errors, mapped (blocking; shown on the step row and in the summary)
| `code` | Row message key | String |
|---|---|---|
| `rangeInvalid` | `val.step.range` | Check this step's times: the default must be between min and max. |
| `foldDurationMismatch` | `val.step.folds` | Fold timing doesn't add up. Open the step to fix it. |
| `anchorMissing` | `val.step.anchor` | Pick the step this runs alongside. |
| `alongsideChain` | `val.step.chain` | It runs alongside a step that also runs alongside. Pick a main step. |
| `noSequentialSteps` | `val.step.noSequential` (section) | At least one step must not run alongside. |
| `ovenPhaseNotContiguous` | `val.step.ovenPhase` (on each listed step) | Bake steps must come one right after another. |

`noOvenPhase` and `overrideOutOfRange` can't come from this editor; they belong to DS-03.

### 6.7 Copy
| Key | String |
|---|---|
| `edit.titleNew` | New recipe |
| `edit.titleEdit` | Edit recipe |
| `edit.copyName` | {name} (copy) |
| `edit.basics` | Basics |
| `edit.name` | Name |
| `edit.loaves` | Loaves this recipe makes |
| `edit.doughWeight` | Dough weight per loaf (optional) |
| `edit.doughWeight.help` | Ingredients now make {perLoaf} per loaf. Used as the starting point when scaling by weight. |
| `edit.doughWeight.use` | Use {perLoaf} |
| `edit.ingredients` | Ingredients |
| `edit.ingredients.emptyHint` | Add your flour, water, salt and levain. |
| `edit.addIngredient` | Add ingredient |
| `edit.archivedSuffix` | (archived) |
| `edit.notLinked` | Not linked to pantry |
| `edit.summary.hydration` | Hydration {pct} (includes levain) |
| `edit.summary.noFlour` | Hydration –, add a flour |
| `edit.summary.totals` | Flour {flour} · Water {water} · Dough {dough} |
| `edit.summary.perLoaf` | {weight} per loaf |
| `edit.steps` | Steps |
| `edit.steps.total` | {duration} total |
| `edit.addStep` | Add step |
| `edit.noBakeStep` | No Bake step. This recipe can bake in one oven load only. |
| `edit.step.alongsideSub` | Alongside {step} · {alignText} |
| `edit.step.foldsSub` | {count, plural, one {# fold} other {# folds}}, every {interval} · {total} |
| `edit.step.tempTag` | Temperature-sensitive |
| `edit.step.noReminder` | No reminder |
| `edit.tags` | Tags |
| `edit.tags.add` | Add a tag |
| `edit.favorite` | Favorite |
| `edit.notes` | Notes |
| `edit.delete` | Delete recipe |
| `edit.moveUp` | Move up |
| `edit.moveDown` | Move down |
| `edit.deleteLine` | Delete |
| `edit.moved` | Moved to position {pos} of {count}. |
| `edit.lineDeleted` | {name} removed. |
| `edit.stepDeleted` | {name} removed. |
| `edit.stepDeletedAnchor` | {name} removed. {other} needs a new anchor. |
| `edit.saved` | Recipe saved. |
| `edit.deletedElsewhere.title` | This recipe was deleted |
| `edit.deletedElsewhere.body` | Save it as a new recipe? |
| `edit.deletedElsewhere.saveNew` | Save as new |
| `edit.deletedElsewhere.discard` | Discard |
| `val.summary` | (see §4.2) |

### 6.8 Accessibility (M3 done-when: usable at the largest size with VoiceOver/TalkBack)
- Focus order: header, error summary, Basics, Ingredients (rows, then Add, then the summary), Steps, Tags, Favorite, Notes, Delete.
- Ingredient row label: "Bread flour, flour, 450 grams, about 3 and three quarter cups, unpriced." `accessibilityActions`: Move up, Move down, Delete, plus the overflow as a separate stop.
- Step row label: "Step 4, Bulk ferment, 6 hours, range 5 to 8 hours, temperature-sensitive." Alongside: "Preheat oven and Dutch oven, runs alongside Bake, covered, ends when it starts, 30 minutes."
- The live summary card is a polite live region, announced at most once every 2 s and only when hydration changes. It's labelled "Recipe summary".
- The Stepper is `role="adjustable"`: "Loaves this recipe makes, 1 loaf".
- RNTL (QA-03) asserts:
  - The roles and labels above.
  - That Save with an empty name moves focus to Name and shows `val.recipe.name`.
  - That "Move down" reorders.
  - That deleting a line shows Undo.

### 6.9 Delete recipe
- Native alert: title "Delete {name}?", body "Bakes you've already scheduled keep their copy." [Delete] (destructive) [Keep].
- Then the modal closes, the stack pops to `RECIPE-LIST`, and `Snackbar` "{name} deleted." [Undo].
- Allowed even with active bakes (snapshots, ADR 0014).

| Key | String |
|---|---|
| `recipe.delete.title` | Delete {name}? |
| `recipe.delete.body` | Bakes you've already scheduled keep their copy. |
| `recipe.deleted` | {name} deleted. |

### 6.10 Platform
- iOS: page/full-screen modal with nav bar buttons. The keyboard "Done" accessory is on number fields. Context menus use `UIMenu`.
- Android: full-screen dialog pattern (M3), X leading, "Save" trailing text button. `adjustResize` keeps the focused field visible.

---

## 7. `INGR-PICK` (sheet)

**Purpose.** Choose the pantry item for an ingredient line. Pantry-first is the only way to add a priced ingredient (R-6).
**Modes.**
- `add`: from "Add ingredient". Selecting pushes `INGR-EDIT?pantryItemId=`.
- `replace`: from `INGR-EDIT` "Change item". Selecting returns the item to `INGR-EDIT`.
- `levainFlour`: from a levain line's "Fed with". Shows only `flour` category items first, then the others under "Other items".

### 7.1 Layout
1. Sheet title (`title2`): "Add ingredient" / "Change item" / "Levain is fed with".
2. `SearchField` (in-sheet on both platforms), placeholder "Search pantry", focused when the sheet opens at the large detent.
3. **`add` mode only, pinned first row:** `ListRow navigation` with a leading levain icon. Title "Levain (starter)", subtitle "Counts its flour and water in hydration." It pushes `INGR-EDIT?role=levain`, which then asks for the flour.
4. **"Recent"** section: the last 5 pantry items used in any recipe (by recipe line `updated_at`). Hidden while searching.
5. Category sections (§1.1 order) with `ListRow` items:
   - Title: name.
   - Subtitle: the readable unit cost, "Free", or "Unpriced".
   - Trailing: "In this recipe" (`footnote textSecondary`) when the item is already used. That's informational only, since one item can legitimately appear twice (bread flour plus the levain's flour).
6. **When searching with no exact name match:** the last row is `ListRow` "Add "{query}" to pantry" (leading `add` icon). It opens `pantry-editor/new?returnTo=ingredient&name={query}`.

### 7.2 States
| State | Treatment |
|---|---|
| Empty pantry | `EmptyState firstUse` inside the sheet: "Your pantry is empty." body "Add an item to use it in this recipe." primary "Add item" (opens PANTRY-EDIT with returnTo) |
| No results | `pantry.search.none` with the query, plus the "Add to pantry" row |
| Large text | Subtitles wrap. The sheet opens at the large detent / full screen |

### 7.3 Copy
| Key | String |
|---|---|
| `pick.titleAdd` | Add ingredient |
| `pick.titleReplace` | Change item |
| `pick.titleLevain` | Levain is fed with |
| `pick.levain` | Levain (starter) |
| `pick.levainSub` | Counts its flour and water in hydration. |
| `pick.recent` | Recent |
| `pick.inRecipe` | In this recipe |
| `pick.otherItems` | Other items |
| `pick.addToPantry` | Add "{query}" to pantry |
| `pick.empty.title` | Your pantry is empty. |
| `pick.empty.body` | Add an item to use it in this recipe. |

### 7.4 Accessibility
- Rows: "Bread flour, 24 cents per 100 grams, in this recipe."
- The "Add to pantry" row: `role="button"`.
- Focus moves to the title on open and returns to "Add ingredient" (or "Change item") on close.

---

## 8. `INGR-EDIT`

**Purpose.** Amount, unit and role for one line. Levain hydration and its flour item.
**Route.** `recipe-editor/ingredient` (push inside the modal).
**Header.**
- iOS: back chevron "Recipe" + trailing "Done".
- Android: back arrow + trailing "Done" text button.

Done validates and writes to the draft. Back with unsaved changes asks: "Discard changes to this ingredient?" [Discard] [Keep editing].

### 8.1 Fields (top to bottom)
| # | Field | Component | Maps to | Notes |
|---|---|---|---|---|
| 1 | Pantry item | `ListRow navigation`: title = item name (+ " (archived)"), subtitle = readable unit cost / "Free" / `StatusTag unpriced` | `pantryItemId` | Tap opens `INGR-PICK` `replace`. The label reads "Fed with (priced as)" when role = levain, and opens `levainFlour` mode. Unlinked line: "Link to pantry item" (`StatusTag unpriced`) |
| 2 | Name in this recipe | `TextField text`, max 60 | `name` | Prefilled with the pantry name. Helper: "Shown in this recipe only." For levain: defaults to "Levain" |
| 3 | Amount | `AmountField`. Unit picker shows the R-2 units: g, kg, oz, lb, ml, cup, tbsp, tsp, each | `entryAmount`, `entryUnit`, and `amountG = toGrams(entryAmount, entryUnit, factors)` | Default unit g. Decimals: up to 1 for g, up to 2 for the other units. Below the field: the secondary line "= {grams} · {formatAmount secondary}" (for g: just the secondary) |
| 4 | Grams per cup (inline) | `TextField number`, suffix "g" | the **pantry item's** `gramsPerCup` | Shown only when the unit is volume, the item has no density, and the role isn't water (water uses 1 g per ml, AMB-12). Info row above it: `ingr.densityNeeded` |
| 5 | Weight of one (inline) | `TextField number`, suffix "g" | the pantry item's `gramsPerEach` | Shown only when the unit is `each` and the item has no weight |
| 6 | Role | `Chip filter` group, single select, radiogroup semantics: Flour, Water, Salt, Levain, Inclusion, Other | `role` | Default from the category (`flows.md` §3 mapping, extended: yeast, sweetener, fat, dairy → Other). Helper: "Flour and water count toward hydration." |
| 7 | Levain hydration | `TextField number`, suffix "%", 20 to 300, default 100 | `levainHydrationPct` | Only when role = levain. Live helper from `splitLevain`: "{amount} levain = {flour} flour + {water} water." |
| 8 | Cost preview | `footnote` line | `lineCostCents(billedG, pkg)` | "Costs {money} in this recipe" / "Costs less than {formatMoney(1)}" / "Free". Levain: "Its {flourG} of flour costs {money}". Unpriced: "No price for {item}." + text button "Add a price" (opens `PRICE-UPDATE`) |
| 9 | Delete ingredient | `Button destructive` text | | Existing lines only. Same as the row delete with undo |

### 8.2 Behavior
- **Prefill on edit:**
  - If `entryAmount`/`entryUnit` exist and `toGrams(entry)` rounds to the same whole gram as `amountG`, show the entry ("2 cups").
  - Otherwise show grams. That handles a pantry density change since entry; the stored grams always win and a recipe never changes silently.
- **Role switch to levain** sets `levainHydrationPct = 100`. Switching away clears it (DB CHECK).
- **New levain line** (`?role=levain`): field 1 shows "Pick the flour you feed it with" in the `danger` style after a failed Done (required). Then INGR-PICK opens in `levainFlour` mode right away on the first appearance.
- **Inline densities** (fields 4 and 5) are written to the pantry item **immediately on Done**, through `pantryService` in its own transaction, before the line goes into the draft. They stay even if the recipe edit is later cancelled. That's harmless, and better than asking again. Helper: "Saved to {item} for every recipe."
- **Done:** validates, writes into the draft (new line appended at the end), and pops to `RECIPE-EDIT`. Focus goes to the edited/new row.

### 8.3 Validation
| Condition | Field | Key | String |
|---|---|---|---|
| Amount empty | Amount | `val.amount.empty` | Enter an amount. |
| Amount 0 or less | Amount | `val.amount.positive` | Enter an amount above 0. |
| Over 50 kg equivalent | Amount | `val.amount.max` | That's more than 50 kg. Check the amount and unit. |
| Too many decimals | Amount | `val.amount.decimals` | Use up to {n, plural, one {# decimal place} other {# decimal places}}. |
| Volume, no density | Grams per cup | `val.density.required` | (as §3.4) |
| `each`, no weight | Weight of one | `val.each.required` | (as §3.4) |
| Levain hydration out of range | Levain hydration | `val.levain.range` | Enter a hydration between 20% and 300%. |
| Levain without a flour item | Pantry item | `val.levain.flour` | Pick the flour you feed it with. |
| Name empty | Name | `val.name.empty` | Enter a name. |

### 8.4 Copy
| Key | String |
|---|---|
| `ingr.titleNew` | Add ingredient |
| `ingr.titleEdit` | Edit ingredient |
| `ingr.item` | Pantry item |
| `ingr.itemLevain` | Fed with (priced as) |
| `ingr.linkToPantry` | Link to pantry item |
| `ingr.pickFlour` | Pick the flour you feed it with |
| `ingr.name` | Name in this recipe |
| `ingr.name.help` | Shown in this recipe only. |
| `ingr.amount` | Amount |
| `ingr.amount.equals` | = {grams} · {secondary} |
| `ingr.densityNeeded` | Add grams per cup for {item} to use cups and spoons. |
| `ingr.savedToItem` | Saved to {item} for every recipe. |
| `ingr.each` | Weight of one {item} |
| `ingr.role` | Role |
| `ingr.role.help` | Flour and water count toward hydration. |
| `ingr.role.flour` | Flour |
| `ingr.role.water` | Water |
| `ingr.role.salt` | Salt |
| `ingr.role.levain` | Levain |
| `ingr.role.inclusion` | Inclusion |
| `ingr.role.other` | Other |
| `ingr.levainHydration` | Levain hydration |
| `ingr.levainSplit` | {amount} levain = {flour} flour + {water} water. |
| `ingr.cost` | Costs {money} in this recipe |
| `ingr.costBelow` | Costs less than {money} in this recipe |
| `ingr.costLevain` | Its {flour} of flour costs {money} |
| `ingr.costFree` | Free |
| `ingr.unpriced` | No price for {item}. |
| `ingr.addPrice` | Add a price |
| `ingr.delete` | Delete ingredient |
| `ingr.discard.title` | Discard changes to this ingredient? |
| `common.done` | Done |

### 8.5 Accessibility
- The role chips are a radiogroup labelled "Role". Each chip is `role="radio"`.
- The amount field label includes the unit: "Amount, grams". The unit button: "Unit, grams", hint "Opens unit list".
- The secondary "= 450 g · about 3¾ cups" is part of the amount field's hint.
- The levain split helper is a polite live region.

---

## 9. `STEP-EDIT`

**Purpose.** One process step: name, type, duration and range, or folds; temperature sensitivity; alongside anchor; reminder.
**Route.** `recipe-editor/step` (push inside the modal). The header pattern matches `INGR-EDIT`: back + "Done", with the dirty confirm "Discard changes to this step?".

### 9.1 Fields (top to bottom)
| # | Field | Component | Maps to (`StepTemplate`) | Rules |
|---|---|---|---|---|
| 1 | Name | `TextField text`, required, max 60 | `name` | |
| 2 | Step type | `ListRow value` → `Sheet` radio list | `kind` | Labels: Feed starter (`feed`), Mix (`mix`), Stretch and folds (`fold`), Bulk ferment (`bulk`), Shape (`shape`), Proof (`proof`), Cold proof (`coldProof`), Preheat (`preheat`), Bake (`bake`), Cool (`cool`), Other (`other`). Helper: "Bake steps set the oven time when loaves bake in batches." |
| 3 | Timing | `SegmentedControl` with 2 options: "Duration", "Stretch and folds" | `folds` null vs set | Choosing the type Stretch and folds switches this to "Stretch and folds" (the user can switch back) |
| 4a | **Duration mode:** `RangeField` | default, min, max as `DurationField` (h + min) | `durationMin`, `minMin`, `maxMin` | Includes the "No range" toggle. When on, min and max are hidden and saved as equal to the default. The default is shown first, min and max below it side by side (stacked at large text). Helper: "When you schedule, you can pick any time in the range." |
| 4b | **Folds mode:** Fold count | `Stepper`, 1 to 12, default 4 | `folds.count` | |
| | Every | `DurationField`, minutes only, 5 to 180, default 30 | `folds.intervalMin` | |
| | Total (read-only) | `body numeric` | `durationMin = minMin = maxMin = count × intervalMin` (ADR 0010 §3) | "Total: 2 h (4 folds × 30 min). The next step starts one interval after the last fold." |
| 5 | Temperature-sensitive | `ListRow toggle` + `Switch` | `tempSensitive` | Helper: "Kitchen temperature can shorten or lengthen this step, within its range." **Disabled** in folds mode and when "No range" is on, with the reason as visible helper text (`step.temp.disabledFolds` / `step.temp.disabledNoRange`). The stored value is kept but has no effect |
| 6 | Runs alongside | `ListRow toggle` + `Switch` | `anchor.type` | Helper: "Alongside steps happen at the same time as another step and don't add time." **Disabled** (with the reason as helper) when another step runs alongside this one (`step.alongside.isAnchor`), or when this is the only main step (`step.alongside.onlyMain`) |
| 6a | Alongside step | `ListRow value` → `Sheet` radio list of the recipe's **sequential** steps (excluding itself), labelled "{n}. {name}" | `anchor.stepId` | Required when on |
| 6b | Timing | `ListRow selectable` radio group with 3 rows | `anchor.align` | "Ends when {step} starts" (`endsAtStart`, default), "Starts when {step} starts" (`startsAtStart`), "Ends when {step} ends" (`endsAtEnd`) |
| 6c | Offset (optional) | `DurationField` minutes + `SegmentedControl` "Earlier" / "Later" | `anchor.offsetMin` (negative = earlier) | 0 to 1,440 min. Default 0 |
| 6d | Preview | `callout` sentence | | For example "Preheat oven ends 10 min before Bake, covered starts." |
| 7 | Remind me | `ListRow toggle` + `Switch`, default on | `notify` | Helper: "Get a notification when this step starts." |
| 8 | Notes | `TextField multiline`, max 2,000 | `notes` | Optional, for example "Fridge at 38 °F" |
| 9 | Delete step | `Button destructive` text | | Existing steps only |

Alongside steps still need their own positive duration (ADR 0010 §4). Their timing in field 4 is the length of the alongside activity (for example a 30-minute preheat).

### 9.2 Behavior
- **Duration entry:** `DurationField` normalizes on blur (90 min becomes 1 h 30 min). Whole minutes only.
- **No range toggle on** copies the default into min and max. **Off** pre-fills min = default and max = default for the user to widen, and focuses the min field.
- **Changing the default** while min/max are set doesn't move them. Out-of-range is an error (below), never auto-clamped.
- **Switching to folds mode** keeps the duration-mode values in memory until Done, so switching back restores them.
- **Done:** validates the step on its own plus `validateSteps` on the whole draft with this step applied. Only errors for this step block Done. Errors elsewhere show in `RECIPE-EDIT`.

### 9.3 Validation
| Condition | Field | Key | String |
|---|---|---|---|
| Name empty | Name | `val.name.empty` | Enter a name. |
| Default 0 | Default | `val.duration.zero` | Enter a time above 0. |
| Over 7 days (10,080 min) | any duration | `val.duration.max` | Keep steps to 7 days or less. |
| min > max | Min | `val.range.minMax` | Minimum can't be more than maximum. |
| default outside [min, max] (`rangeInvalid`) | Default | `val.range.default` | Default must be between min and max. |
| Fold interval outside 5 to 180 | Every | `val.folds.interval` | Use 5 to 180 minutes between folds. |
| Alongside on, no step | Alongside step | `val.step.anchor` | Pick the step this runs alongside. |
| Offset over 24 h | Offset | `val.offset.max` | Keep the offset to 24 hours or less. |

### 9.4 Copy
| Key | String |
|---|---|
| `step.titleNew` | Add step |
| `step.titleEdit` | Edit step |
| `step.name` | Name |
| `step.type` | Step type |
| `step.type.help` | Bake steps set the oven time when loaves bake in batches. |
| `step.kind.feed` | Feed starter |
| `step.kind.mix` | Mix |
| `step.kind.fold` | Stretch and folds |
| `step.kind.bulk` | Bulk ferment |
| `step.kind.shape` | Shape |
| `step.kind.proof` | Proof |
| `step.kind.coldProof` | Cold proof |
| `step.kind.preheat` | Preheat |
| `step.kind.bake` | Bake |
| `step.kind.cool` | Cool |
| `step.kind.other` | Other |
| `step.timing` | Timing |
| `step.timing.duration` | Duration |
| `step.timing.folds` | Stretch and folds |
| `step.default` | Default |
| `step.min` | Shortest |
| `step.max` | Longest |
| `step.noRange` | No range |
| `step.range.help` | When you schedule, you can pick any time in the range. |
| `step.folds.count` | Number of folds |
| `step.folds.every` | Every |
| `step.folds.total` | Total: {total} ({count} folds × {interval}). The next step starts one interval after the last fold. |
| `step.temp` | Temperature-sensitive |
| `step.temp.help` | Kitchen temperature can shorten or lengthen this step, within its range. |
| `step.temp.disabledFolds` | Fold steps have a fixed length. |
| `step.temp.disabledNoRange` | Add a range so temperature can adjust this step. |
| `step.alongside` | Runs alongside another step |
| `step.alongside.help` | Alongside steps happen at the same time as another step and don't add time. |
| `step.alongside.isAnchor` | {other} runs alongside this step, so this one can't run alongside another. |
| `step.alongside.onlyMain` | At least one step must not run alongside. |
| `step.alongside.step` | Alongside step |
| `step.align.endsAtStart` | Ends when {step} starts |
| `step.align.startsAtStart` | Starts when {step} starts |
| `step.align.endsAtEnd` | Ends when {step} ends |
| `step.offset` | Offset (optional) |
| `step.offset.earlier` | Earlier |
| `step.offset.later` | Later |
| `step.preview.endsAtStart` | {name} ends {offset} {when} {step} starts. |
| `step.preview.startsAtStart` | {name} starts {offset} {when} {step} starts. |
| `step.preview.endsAtEnd` | {name} ends {offset} {when} {step} ends. |
| `step.preview.offsetNone` | (with offset 0, the sentence reads "{name} ends when {step} starts.") |
| `step.preview.before` / `.after` | before / after |
| `step.notify` | Remind me |
| `step.notify.help` | Get a notification when this step starts. |
| `step.notes` | Notes |
| `step.delete` | Delete step |
| `step.discard.title` | Discard changes to this step? |

Since `{offset} {when}` word order doesn't localize well, translators get three full sentence keys per alignment (`.none`, `.before`, `.after`), for nine sentences in total. RN implements them as ICU `select` on `when`.

### 9.5 Accessibility
- The RangeField sub-fields are labelled "Default, hours", "Default, minutes", "Shortest, hours", and so on.
- The fold Stepper: `role="adjustable"`, "Number of folds, 4".
- A disabled toggle row still reads its reason: the helper text is part of the row label, plus `disabled`.
- The alignment radio group is labelled "Timing".
- The preview sentence is read after the radio group (focus order).

---

## 10. `RECIPE-DETAIL`

**Purpose.** Understand the recipe at a glance (baker's %, hydration, cost), scale it, and schedule it.
**Entry points.** `RECIPE-LIST`, `PANTRY-DETAIL` "Used in", after save from `RECIPE-EDIT`, after import (M6).

### 10.1 Data
- `qk.recipes.detail(id)` returns `{ recipe, ingredients, steps }`. `useRecipeCost` combines it with `pantry.list`.
- Session state (not saved): `scale = { by: 'loaves' | 'doughWeight', loaves, perLoafG }`. Initial value: `loaves = ?loaves ?? yieldLoaves`, `perLoafG = doughWeightG ?? round(totalDoughG / yieldLoaves)`.
- Computed with `useMemo` on every scale change:
  - `scaled = scaleLines(lines, target)`, where target is:
    - `{ by: 'loaves', fromLoaves: yieldLoaves, toLoaves: loaves }`, or
    - `{ by: 'doughWeight', perLoafG, loaves }`.
  - `bp = bakersPercentages(scaled.lines)` (basis `totalFlour`).
  - `cost = costBreakdown(toCostInputs(scaled.lines), loaves)`.
  - `sell = sellPriceCents(cost.batchCents, loaves, settings.markupBps, rounding)`, where rounding is `settings.sellRoundingCents ? { mode: 'up', stepCents } : { mode: 'none' }`.
  - `span = planSpanMin(...)` at default durations.
- **At scale 1** (loaves = `yieldLoaves`, by loaves): show the stored amounts unscaled (no `scaleLines`), so decimals such as 2.5 g aren't rounded away.

### 10.2 Layout (top to bottom)
Header:
- iOS: inline title = `name` (it truncates, and the content heading holds the full name). Trailing: star `IconButton toggle` (favorite), "Edit" (opens `recipe-editor/<id>`), and overflow (`ellipsis.circle`) with Duplicate, Export (M6 flag), Delete.
- Android: top app bar with star, edit (pencil icon, label "Edit recipe"), and overflow (`more_vert`).

1. **Heading:** `name` in `title1` (wraps fully). Below it, the tags as plain `subhead textSecondary` text joined with " · ". They aren't interactive.
2. **Partial-data banners** (`Banner warning`, only when they apply, in this order):
   - No steps: `detail.noSteps` [Edit recipe].
   - No flour: `detail.noFlour` [Edit recipe].
3. **Stats row**: 3 tiles in a `Card` with `elevation.level1`, divided by `border` lines. Each tile has a value in `title2 numeric` and a label in `footnote textSecondary`:
   - Hydration "77.3%", label "Hydration, incl. levain". Null: "–", "Add a flour".
   - Dough "985 g", label "Per loaf" (= `scaled.totalG / loaves`, whole grams).
   - Total time "30 h 55 min", label "Feed to ready". Null when the steps are invalid: "–", "Fix steps".
4. **`SectionHeader` "Scale"** (trailing text when scaled: "×{factor}", with factor to 2 dp, for example "×2.03").
   - `SegmentedControl`: "Loaves" | "Dough weight".
   - Loaves mode: `Stepper` "Loaves" 1 to 50.
   - Dough weight mode:
     - `Stepper` "Loaves" 1 to 50.
     - `TextField number` "Per loaf", suffix "g", 50 to 20,000, with "−50 g" / "+50 g" tonal buttons on each side (`touchKitchen`) for floury-hand use.
   - Result line (`footnote`):
     - Loaves mode: "Total {totalG}".
     - Weight mode: "Total {totalG} (target {targetG})" (ADR 0010 §8, for example "Total 1,001 g (target 1,000 g)"). When equal: "Total {totalG}".
   - "Reset" `Button text` appears when the scale differs from the recipe.
5. **`SectionHeader` "Ingredients"**, with trailing column captions "Amount" and "Baker's %" (`caption textSecondary`, decorative, hidden from screen readers).
   - Rows (non-interactive), in `position` order. Three columns: name (flex), amount (right-aligned, `body numeric`, secondary `footnote` below), baker's % (right-aligned, `body numeric`, fixed width fitting "100.0%").
     - The name cell: `body` name; for levain, a `footnote textSecondary` subtitle "{hydration}% hydration · {flour} flour + {water} water".
     - Unpriced lines get `StatusTag unpriced` under the name (cost context belongs here too, because the M3 criteria require it on detail).
   - Totals block (`surfaceSunken` band, `callout numeric`):
     - "Total flour {totalFlourG}" with "incl. {levainFlourG} from levain" on the next line.
     - "Total water {totalWaterG}" with "incl. {levainWaterG} from levain".
     - "Hydration {pct}".
     - "Total dough {totalDoughG}".
   - Footnote: `detail.bpExplain` ("Baker's % is each weight divided by total flour ({base}), including the levain's flour.").
6. **Cost `Card`**, tappable, opens `RECIPE-COST?loaves={loaves}`. Contents:
   - Title row: "Cost" (`title3`) + chevron (iOS).
   - Main line: per loaf `MoneyText title2` + "per loaf". Second line: "{batch} for {loaves}" (`subhead`).
   - Suggested price line: "Suggested price {sell} per loaf" (`callout`). Hidden when incomplete.
   - **Top lines by share** (M3 criterion: per-line cost share): up to 4 mini rows (`subhead numeric`) sorted by `costCents` descending: "{name} · {money} · {share}". A thin share bar under each (`accent` on `surfaceSunken`, height `space.xs`, decorative). Then "+{n} more" if needed.
   - Incomplete: the main line reads "{money} per loaf, partial" with `StatusTag unpriced` "Cost incomplete", and a `footnote` "{n} ingredients have no price." No suggested price.
   - No priced lines at all: "No prices yet" + "Add prices in your pantry to see the cost."
7. **`SectionHeader` "Steps"** (trailing "{span} total"). Non-interactive rows (compact `TimelineRow` style with **relative** durations, not clock times):
   - Sequential: number, name, "8 h · 6–10 h".
   - Folds: "4 folds, every 30 min".
   - Alongside: indented with the parallel icon, "Alongside Bake, covered".
   - Tags: temperature-sensitive (`StatusTag adjusted` with the text "Temperature-sensitive"), "No reminder".
8. **`SectionHeader` "Notes"** (only if notes are non-empty): `body`, selectable text.
9. **`BottomActionBar`**: `Button primary lg` "Schedule this recipe". The footnote above it: "{loaves, plural, one {# loaf} other {# loaves}}" when scaled.
   - It opens the schedule modal at `SCHED-PLAN` with this recipe and `loaves` (DS-03).
   - Disabled when there are no steps or the steps are invalid, with the hint `detail.cantSchedule`. The banner (item 2) shows the reason visually.

### 10.3 States
| State | Treatment |
|---|---|
| Loading | Skeleton: title bar, 3-tile card, 5 ingredient rows, a cost card block |
| Not found / deleted | `EmptyState error`: "This recipe was deleted." [Back to recipes] |
| Read error | `EmptyState error`: "Couldn't load this recipe." [Try again] |
| No ingredients | Ingredients section shows "No ingredients yet." + `Button tonal` "Add ingredients" (opens the editor). Stats: hydration "–", dough "0 g". The cost card shows "No ingredients yet" |
| No steps | Banner, "–" for total time, Steps section "No steps yet.", Schedule disabled |
| Cost incomplete | Cost card as 10.2 item 6. Never shows a bare total |
| Archived pantry item on a line | The name cell shows "(archived)". The cost still uses its price (ADR 0004) |
| Scaled to tiny amounts | `scaleLines` keeps non-zero lines at 1 g or more. The baker's % then reflects the rounded grams (ADR 0010 §8) |
| Long names | The title wraps fully. Ingredient names wrap to 2 lines, with the full name in the label |
| Large text (`fontScale >= 1.5`) | Stats tiles stack into 3 rows. Each ingredient row becomes name on line 1, "{amount} · {pct}" on line 2, and the column captions hide. The −50/+50 buttons wrap under the field. The cost card's mini rows wrap |
| Landscape / tablet | Content centered at `layout.maxContentWidth`. The BottomActionBar spans the content width |

### 10.4 Interactions
- **Star:** toggles `favorite` with `haptic.selection`. Writes immediately and invalidates `recipes.all`.
- **Scale controls:** recomputing is instant. Stepper changes give `haptic.selection`. The per-loaf field commits on blur or Done; while it's invalid, the previous valid result stays and the field shows the error.
- **Overflow:**
  - Duplicate opens `recipe-editor/new?duplicateOf=<id>`.
  - Delete confirms as in §6.9.
  - Export appears from M6 behind a flag (DS-04).
- **Cost card** opens `RECIPE-COST` with the current `loaves`. Weight scaling also passes the loaves; see §12 Q-A3 for `perLoafG`.

### 10.5 Validation (scale field)
| Condition | Key | String |
|---|---|---|
| Per loaf empty or outside 50 to 20,000 | `val.scale.perLoaf` | Enter between 50 and 20,000 g. |

### 10.6 Copy
| Key | String |
|---|---|
| `detail.edit` | Edit |
| `detail.editRecipe` | Edit recipe |
| `detail.favorite` | Favorite |
| `detail.more` | More options |
| `detail.duplicate` | Duplicate |
| `detail.export` | Export recipe |
| `detail.delete` | Delete |
| `detail.noSteps` | Add steps to schedule this recipe. |
| `detail.noFlour` | Add a flour ingredient to see hydration and baker's percentages. |
| `detail.stat.hydration` | Hydration, incl. levain |
| `detail.stat.addFlour` | Add a flour |
| `detail.stat.perLoaf` | Per loaf |
| `detail.stat.time` | Feed to ready |
| `detail.stat.fixSteps` | Fix steps |
| `detail.scale` | Scale |
| `detail.scale.factor` | ×{factor} |
| `detail.scale.loaves` | Loaves |
| `detail.scale.weight` | Dough weight |
| `detail.scale.perLoaf` | Per loaf |
| `detail.scale.minus` | −50 g |
| `detail.scale.plus` | +50 g |
| `detail.scale.total` | Total {total} |
| `detail.scale.totalTarget` | Total {total} (target {target}) |
| `detail.scale.reset` | Reset |
| `detail.ingredients` | Ingredients |
| `detail.col.amount` | Amount |
| `detail.col.bp` | Baker's % |
| `detail.levainSub` | {hydration} hydration · {flour} flour + {water} water |
| `detail.totalFlour` | Total flour {weight} |
| `detail.totalWater` | Total water {weight} |
| `detail.inclLevain` | incl. {weight} from levain |
| `detail.hydration` | Hydration {pct} |
| `detail.totalDough` | Total dough {weight} |
| `detail.bpExplain` | Baker's % is each weight divided by total flour ({base}), including the levain's flour. |
| `detail.noIngredients` | No ingredients yet. |
| `detail.addIngredients` | Add ingredients |
| `detail.cost` | Cost |
| `detail.cost.perLoaf` | {money} per loaf |
| `detail.cost.perLoafPartial` | {money} per loaf, partial |
| `detail.cost.batch` | {money} for {loaves, plural, one {# loaf} other {# loaves}} |
| `detail.cost.sell` | Suggested price {money} per loaf |
| `detail.cost.incomplete` | Cost incomplete |
| `detail.cost.missing` | {count, plural, one {# ingredient has no price.} other {# ingredients have no price.}} |
| `detail.cost.more` | +{count} more |
| `detail.cost.none` | No prices yet |
| `detail.cost.noneBody` | Add prices in your pantry to see the cost. |
| `detail.steps` | Steps |
| `detail.steps.total` | {duration} total |
| `detail.steps.none` | No steps yet. |
| `detail.alongside` | Alongside {step} |
| `detail.notes` | Notes |
| `detail.schedule` | Schedule this recipe |
| `detail.cantSchedule` | Add or fix steps first. |
| `detail.gone` | This recipe was deleted. |
| `detail.backToRecipes` | Back to recipes |
| `detail.loadError` | Couldn't load this recipe. |

### 10.7 Accessibility
- Heading role on the name and on each SectionHeader.
- The stats card: each tile is one stop, "Hydration including levain, 77.3 percent."
- The scale SegmentedControl is a radiogroup.
- The per-loaf −/+ buttons: "Decrease per-loaf weight by 50 grams" / "Increase …".
- The result line is a polite live region (announced after changes settle, 1 s): "Total 1,001 grams, target 1,000 grams."
- Ingredient row: "Bread flour, 450 grams, about 3 and three quarter cups, baker's percentage 81.8 percent." Levain row: "Levain, 100 grams, 100 percent hydration, 50 grams flour and 50 grams water, baker's percentage 18.2 percent."
- The totals block is one stop.
- The cost card is one stop, `role="button"`, label: "Cost. 1 dollar 39 per loaf, 1 dollar 39 for 1 loaf. Suggested price 4 dollars 17. Biggest costs: Bread flour 1 dollar 08, 77.7 percent; …". Hint "Opens cost breakdown".
- Share bars are decorative.
- The disabled Schedule button has the hint `detail.cantSchedule`.

### 10.8 Platform
- iOS: three trailing nav items is the maximum. If space is tight at large text, the star moves into the overflow menu as "Add to favorites" (the native header handles this when using `headerRight` with a menu).
- Android: the M3 top app bar shows up to 3 action icons, and the rest go into the overflow. The BottomActionBar stays a pinned full-width button on this screen (the Extended FAB is only for create actions on list roots).

---

## 11. `RECIPE-COST` (cost breakdown)

**Purpose.** A line-by-line cost you can trust: what each ingredient costs and its share, batch and per-loaf totals, and a suggested sell price. It's honest about anything missing.
**Entry points.** `RECIPE-DETAIL` cost card.
**Route.** `recipes/[id]/cost?loaves=`.

### 11.1 Data
- Same sources as §10.1. `loaves` comes from the param, defaulting to `yieldLoaves`. Scaling here is **by loaves only**: `scaleLines(lines, { by: 'loaves', fromLoaves: yieldLoaves, toLoaves: loaves })`, then `costBreakdown(inputs, loaves)`. At `loaves = yieldLoaves`, the stored amounts are used unscaled.
- `CostLineInput.pantry`:
  - The linked item's `{ priceCents: packagePriceCents, size: packageSize, unit: packageUnit, gramsPerCup, gramsPerEach }`.
  - `null` when the line is unlinked or the item has no price.
  - Archived items still provide their price.
- Settings: `markupBps`, `sellRoundingCents`.
- Currency: the device locale (C-4).

### 11.2 Layout (top to bottom)
Header: title "Cost". The recipe name is in the content (iOS standard title; Android top app bar).

1. **Context line** (`subhead textSecondary`): "{recipe name} · for {loaves}".
2. **Loaves `Stepper`** (1 to 50), label "Loaves". Changing it recomputes everything. A `footnote` "Recipe makes {yieldLoaves}" when it differs.
3. **Incomplete `Banner warning`**, shown when `complete = false`:
   - Message: `cost.incomplete.banner` naming up to 3 lines from `incompleteLineIds` ("Rye flour and Seeds have no price. Totals leave them out.").
   - Separate sentences for conversion errors: `cost.convert.banner` ("Rye flour is measured in cups but has no grams per cup.").
   - Action: when exactly one line is affected, "Add price" (opens `PRICE-UPDATE`) or "Add grams per cup" (opens `PANTRY-EDIT` focused on that field). With more than one, the actions are on the rows.
4. **Totals `Card`** (`elevation.level1`, padding `space.lg`):
   - "Per loaf" (`footnote textSecondary`), then `MoneyText` in `title1` = `perLoafCents`. When incomplete, the label becomes "Per loaf, partial" and `StatusTag unpriced` "Cost incomplete" appears beside it (under it at large text).
   - Divider.
   - "Batch ({loaves})" value `batchCents` (`body numeric`, ListRow-style value line).
   - The footnote `cost.rounding` (shown only when `loaves > 1`): "Per loaf is the batch total divided by {loaves}, rounded to the nearest cent." Localized to "nearest {minor unit}" through a generic phrase: "rounded to the nearest {formatMoney(1)}".
5. **Suggested price `Card`**:
   - Label "Suggested price per loaf", value `MoneyText title2` = `sell`.
   - Footnote: "Ingredient cost + {markup} markup" (markup = `markupBps / 100` as a percent, 0 dp unless fractional, for example "200%"). When rounding is set: "…, rounded up to the next {formatMoney(step)}".
   - `Button text` "Change markup" opens `settings/cost` (Settings tab).
   - **Incomplete:** the value is replaced by `cost.sell.incomplete` ("Add the missing prices to see a suggested price."). There's no number, because a price built on a partial cost would undercharge.
   - **Batch cost 0** (every line free): "–" with the footnote "Nothing in this recipe has a cost yet."
6. **`SectionHeader` "By ingredient"**: one row per `CostLine`, in recipe `position` order (it matches the recipe and the editor, so a line is easy to find). Each row:
   - Line 1: name (`body`, 2 lines max) · trailing cost (`body numeric`, right-aligned):
     - `priced`: `formatMoney(costCents)`, or `<$0.01` if `belowOneCent`.
     - `free`: "Free".
     - `unpriced`: `StatusTag unpriced` "Unpriced".
     - `conversionError`: `StatusTag unpriced` with the text "Can't convert".
   - Line 2 (`footnote textSecondary`):
     - Priced/free: "{billedG} at {per 100 g | per lb | each}". Levain: "{billedG} flour from {amountG} levain, priced as {pantry name}".
     - Unpriced and linked: "No price for {pantry name}". Unlinked: "Not linked to a pantry item".
     - Trailing on line 2: share "{sharePct}" (1 dp) or "–" when null.
   - Line 3: a share bar (`accent` on `surfaceSunken`, height `space.xs`, `radius.full`, width = share %). Decorative. Omitted for unpriced lines.
   - Row action (separate stop, `Button text md`) for unpriced or conversion-error lines:
     - "Add price" opens `PRICE-UPDATE`.
     - "Add grams per cup" / "Add weight of one" opens `PANTRY-EDIT` focused.
     - Unlinked: "Link in recipe" opens `recipe-editor/<id>` (then the line).
   - Priced rows are tappable and open `PANTRY-DETAIL` of the item (`role="button"`, hint "Opens pantry item"). Free rows too (to price water, C-5).
7. **Total row** (`headline`): "Batch total" · `batchCents`. The footnote `cost.sharesNote` appears only when the displayed shares don't sum to exactly 100.0%.
8. **Footnotes** (`footnote textSecondary`, `space.xl` above):
   - `cost.scopeNote` ("Ingredients only. Starter upkeep, energy and packaging aren't included.").
   - `cost.snapshotNote` ("Uses your current prices. Bakes you've already scheduled keep the cost from when you scheduled them.").

There's no pinned bar: this is a read screen, and the primary actions are inline.

### 11.3 Worked example (QA-03 manual check; PRD §6 at 1 loaf, R-COST)
| Row | Line 2 | Cost | Share |
|---|---|---|---|
| Bread flour | 450 g at $0.24 per 100 g | $1.08 | 77.7% |
| Whole wheat flour | 50 g at $0.35 per 100 g | $0.18 | 12.9% |
| Salt | 10 g at $0.10 per 100 g | $0.01 | 0.7% |
| Levain | 50 g flour from 100 g levain, priced as Bread flour | $0.12 | 8.6% |
| Water | 375 g · Free | Free | 0.0% |
| **Batch total** | | **$1.39** | |

Per loaf $1.39. Suggested at 200% markup: $4.17. At 2 loaves: lines $2.16, $0.35, $0.02, $0.24, Free; batch $2.77; per loaf $1.39 (138.5 rounds half up); the rounding footnote is shown. The water row's line 2 reads "375 g · Free" (special case of the template: `cost.line.free`).

### 11.4 States
| State | Treatment |
|---|---|
| Loading | Skeleton: a totals card block, 5 rows |
| Not found / read error | Same as §10.3 |
| Complete | As laid out |
| Incomplete (`complete = false`) | Banner + "partial" labels + no suggested price + row actions. The totals sum the priced lines only, and that's said in the banner |
| All lines unpriced | Totals show `formatMoney(0)` labelled "partial", and the banner names the first 3 lines + "and {n} more". Suggested price hidden |
| `belowOneCent` lines | Shown as `<$0.01`. They count as 0 in the batch (ADR 0006 §4), so the footnote `cost.belowNote` explains: "Lines under {formatMoney(1)} round to 0 in the total." |
| Zero-decimal currency (JPY) | `formatMoney` handles it. "<¥1" for below one unit |
| Price changed elsewhere (back from PRICE-UPDATE) | Query invalidation recomputes. The changed row's cost crossfades (`motion.duration.fast`) |
| Long names | Wrap to 2 lines. The trailing cost stays top-aligned |
| Large text | Each row becomes: name / cost / "{grams} at {unit cost}" / share, all stacked and start-aligned. The totals card values go under their labels |
| Landscape / tablet | Centered at max width. The two cards can sit side by side when the window is 600 wide or more and `fontScale < 1.5` |

### 11.5 Copy
| Key | String |
|---|---|
| `cost.title` | Cost |
| `cost.context` | {name} · for {loaves, plural, one {# loaf} other {# loaves}} |
| `cost.loaves` | Loaves |
| `cost.recipeMakes` | Recipe makes {loaves, plural, one {# loaf} other {# loaves}} |
| `cost.incomplete.banner` | {names} {count, plural, one {has} other {have}} no price. Totals leave {count, plural, one {it} other {them}} out. |
| `cost.incomplete.more` | {names} and {count} more |
| `cost.convert.banner` | {name} is measured in {unit} but has no {need}. |
| `cost.need.density` | grams per cup |
| `cost.need.each` | weight for one |
| `cost.addPrice` | Add price |
| `cost.addDensity` | Add grams per cup |
| `cost.addEach` | Add weight of one |
| `cost.linkInRecipe` | Link in recipe |
| `cost.perLoaf` | Per loaf |
| `cost.perLoafPartial` | Per loaf, partial |
| `cost.incompleteTag` | Cost incomplete |
| `cost.batch` | Batch ({loaves, plural, one {# loaf} other {# loaves}}) |
| `cost.rounding` | Per loaf is the batch total divided by {loaves}, rounded to the nearest {unit}. |
| `cost.sell` | Suggested price per loaf |
| `cost.sell.basis` | Ingredient cost + {markup} markup |
| `cost.sell.basisRounded` | Ingredient cost + {markup} markup, rounded up to the next {step} |
| `cost.sell.change` | Change markup |
| `cost.sell.incomplete` | Add the missing prices to see a suggested price. |
| `cost.sell.zero` | Nothing in this recipe has a cost yet. |
| `cost.byIngredient` | By ingredient |
| `cost.line.priced` | {grams} at {unitCost} |
| `cost.line.free` | {grams} · Free |
| `cost.line.levain` | {flour} flour from {amount} levain, priced as {item} |
| `cost.line.unpriced` | No price for {item} |
| `cost.line.unlinked` | Not linked to a pantry item |
| `cost.line.below` | <{money} |
| `cost.line.free.value` | Free |
| `cost.line.unpricedTag` | Unpriced |
| `cost.line.convertTag` | Can't convert |
| `cost.total` | Batch total |
| `cost.sharesNote` | Each line is rounded to the cent, so shares may not add up to exactly 100%. |
| `cost.belowNote` | Lines under {money} round to 0 in the total. |
| `cost.scopeNote` | Ingredients only. Starter upkeep, energy and packaging aren't included. |
| `cost.snapshotNote` | Uses your current prices. Bakes you've already scheduled keep the cost from when you scheduled them. |

(`cost.sharesNote` says "cent". For non-cent currencies RN substitutes `cost.sharesNoteGeneric`: "Each line is rounded on its own, so shares may not add up to exactly 100%." Use the generic one if `currencyMinorDigits !== 2`.)

### 11.6 Accessibility
- The totals card is one stop: "Per loaf, 1 dollar 39. Batch for 1 loaf, 1 dollar 39." Partial: "Per loaf, partial, 1 dollar 27, cost incomplete."
- The banner is `role="alert"` on first appearance only.
- Cost rows are one stop each: "Bread flour, 1 dollar 08, 77.7 percent of the batch, 450 grams at 24 cents per 100 grams." Below one cent: "Salt, less than 1 cent." Unpriced: "Rye flour, unpriced, no price for Rye flour." The row action is a separate stop labelled with the item: "Add price for Rye flour".
- The Stepper is `role="adjustable"`: "Loaves, 1 loaf".
- Share bars are hidden from screen readers.
- Money is always read from the formatted string with its currency symbol (`components.md` §1.4.4).

### 11.7 Platform
- iOS: pushed in the Recipes stack, back reads "{recipe name}" (truncated by the system). `PRICE-UPDATE` is a form sheet.
- Android: back arrow; `PRICE-UPDATE` is an M3 modal bottom sheet. "Change markup" switches to the Settings tab (`/settings/cost`). Back from there returns to the Bakes tab per `backBehavior` (accepted; that's the documented tab behavior).

---

## 12. Decisions made in DS-02, and open questions

### 12.1 Decisions (deltas from DS-01 or new)
1. **Validation:** Save/Done is enabled when dirty and validates on tap. This replaces "disabled until valid" in `flows.md` §1.5, for accessibility (§0.3).
2. **Pantry delete is an archive (ADR 0004).** Used items can be archived (with undo). Recipes keep pricing from them and label them "(archived)". This replaces the DS-01 "blocked when used" rule.
3. **Prices are only changed through `PRICE-UPDATE`** after creation. `PANTRY-EDIT` edit mode shows the price read-only. That's one path that writes history.
4. **Price-history entries can be deleted** (soft, with undo, never the last remaining one) to fix typos. The current price re-mirrors from the latest `pricedAt`.
5. **Pantry categories follow `data-model.md` (10 values)**, not the 6 in `flows.md` §3. Yeast, sweetener, fat and dairy default to role `other`.
6. **Levain is added through a pinned "Levain (starter)" row** in `INGR-PICK`, which asks for the flour it's fed with (ADR 0007: the pantry link is the flour). Picking a Starter-category item still defaults to role levain.
7. **Scaling is a view-only session state** on `RECIPE-DETAIL`. It's not saved to the recipe. `RECIPE-COST` scales by loaves only.
8. **Suggested sell price is hidden when cost is incomplete.**
9. **Cost lines are listed in recipe order.** The detail card shows the top 4 by cost to satisfy the M3 "per-line share on detail" criterion.
10. **Readable unit cost** is per 100 g (metric) or per lb (US), with per g shown on `PANTRY-DETAIL`. Per-g-only values with 4 decimals are hard to compare.
11. **Primary create actions on list roots:** Android uses an Extended FAB ("New recipe", "Add item"), iOS a "+" nav-bar button. This extends the DS-01 FAB rule from `BAKES-HOME` to all list roots that have a create action.
12. **Required reorder path** is Move up / Move down (menu and accessibility actions). Drag handles are optional, so no new dependency is needed.
13. **New component modes needed by RN-04:** a `DateTimeField` date-only mode; a `StatusTag` text override (used for "Cost incomplete", "Needs grams per cup", "Current", "Temperature-sensitive", "No reminder", "Can't convert"); and a `UnitPicker` sheet with grouped units (referenced by `AmountField`).

### 12.2 Questions for the architect (AR-01 owner)
- **Q-A1. Small-amount display.** data-model says "display rounds to whole grams", but 2.5 g of yeast showing as "3 g" misleads. I've specified 1 decimal under 10 g when the value isn't whole. OK? It needs a `formatAmount` option in core, or the app formats grams itself.
- **Q-A2. Route params.** I've added `pantry-editor/[id]?name=` (prefill), `recipe-editor/ingredient?pantryItemId=` and `?role=levain` (new lines), `recipes/[id]?loaves=`, and `recipes/[id]/cost?loaves=`. Please add them to the route map, and decide that `INGR-PICK` and `PRICE-UPDATE` are component sheets, not routes (my assumption).
- **Q-A3. Scheduling a weight-scaled recipe.** `bake_item.scale_factor` is documented as `loaves / yieldLoaves`, but the snapshot ingredients are "already scaled". Can a bake carry a dough-weight scale (factor = target / base)? If not, "Schedule this recipe" passes `loaves` only and DS-03 shows "Uses the recipe's dough weight". I need to know before DS-03.
- **Q-A4. Price-history delete** (decision 4) needs `pantryService.deletePrice(id)` with a re-mirror, plus `pantryService.savePrice` mirroring only when `pricedAt >= current`. Please confirm and add them to the service list for RN-05.
- **Q-A5. Archived items** must stay readable for costing and labels (repositories filter `deleted_at IS NULL` by default). The "Used in" list and cost hooks need a lookup that includes tombstoned pantry items. Is there any restore path for archived items in v1? I've specified only the 8 s undo.
- **Q-A6. "Add starter recipes"** in the empty state needs a seed mode that recreates tombstoned seed rows, which data-model §5 forbids by default. Keep the button (user-initiated, so recreating is intended) or drop it?
- **Q-A7. Entry unit after a density change.** I've specified that stored grams always win, and `INGR-EDIT` shows the entered cups only when they still convert to the same gram. Please confirm.

### 12.3 Questions for Chris
- **Q-C1. Markup default.** A 200% markup gives $4.17 on a $1.39 loaf. Does that match your existing calculator, and should the sell price round up to a step (for example $0.25)?
- **Q-C2. Unit-cost display.** Is "per 100 g" (metric) / "per lb" (US) how you think about flour prices, or would you rather see "per kg"?
- **Q-C3. Water.** OK that water is "Free" by default and only costs something if you price it, and that levain water is always free (ADR 0007)?
