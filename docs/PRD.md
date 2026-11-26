# Sourdough Assistant — Product Requirements Document

Nov 26, 2026 · Chris · Status: Draft v0.1

## 1. Overview

Sourdough Assistant is an iOS and Android app that tells a home baker exactly when to start each step so a loaf is ready at the time they choose, and what that loaf cost to make. It stores recipes and ingredient lists, schedules bakes backward from a ready time, and prices each loaf from the baker's own ingredient costs.

**Problem.** A sourdough bake runs 18 to 36 hours across several timed stages. Bakers do the backward math by hand, miss steps that land overnight, and rarely know what a loaf actually costs.

**Goals (v1)**

- Pick a ready time and get a start time for every step, with reminders.
- Store, edit and scale recipes, with baker's percentages.
- Calculate cost per loaf from the baker's own ingredient prices.
- Work fully offline on iOS and Android from one codebase.

**Non-goals (v1)**

- Web app (Phase 2).
- Social feed, recipe marketplace, or sharing beyond export.
- Smart-device integrations (proofing boxes, ovens, scales).
- Order taking or other selling features.

## 2. Target users

The primary user is a hobby baker fitting bakes around work and sleep; the cottage baker shapes the cost feature.

| Persona | Who | What they need most |
| --- | --- | --- |
| Hobby baker (primary) | Bakes 1 to 4 loaves a week at home | A schedule that fits work and sleep; reminders they can trust overnight |
| Cottage baker | Sells at markets or to friends and neighbors | True cost per loaf to set prices |
| Beginner | First starter, following one recipe | Clear steps, sensible defaults, few decisions |

## 3. Scope and phases

The MVP is a local-only mobile app built for Chris's own use; accounts and sync come next, then the web app on the same backend. An App Store and Play Store release is possible later if development goes well, so v1 is built store-ready (no hard-coded personal data, onboarding, privacy-safe defaults) without spending effort on store listings yet.

| Phase | Includes | Platforms |
| --- | --- | --- |
| MVP (v1) | Recipes, ingredient pantry, backward scheduler with notifications, live bake view, concurrent and multi-recipe bakes, cost per loaf with suggested sell price, on-device storage | iOS, Android |
| v1.1 | Account and cloud sync, bake log with notes and photos, saved schedule templates | iOS, Android |
| Phase 2 | Web app using the same backend, data and calculation logic | Web |
| Later | Recipe sharing, starter health tracker | All |

Decided: the MVP is local-only, with no accounts. Data stays on the device, and the data model keeps stable IDs and timestamps so sync can be added in v1.1 without a migration rewrite.

## 4. Feature: Recipes and ingredients

A recipe is a list of ingredients plus an ordered list of process steps: the steps feed the scheduler and the ingredients feed the cost calculator. Ingredients point at a shared Pantry, so a price is entered once and used by every recipe.

| ID | Requirement | Priority |
| --- | --- | --- |
| R-1 | Create, edit, duplicate and delete recipes: name, notes, yield (loaf count and target dough weight) | Must |
| R-2 | Ingredient lines with amount and unit (g, kg, oz, lb, ml, cup, tsp, tbsp, each); grams are primary, with cups and ounces as a secondary display, and a role: flour, water, salt, levain, inclusion, other | Must |
| R-3 | Show baker's percentages (each ingredient as a share of total flour) and hydration, counting the flour and water inside the levain | Must |
| R-4 | Scale a recipe by loaf count or target dough weight; amounts round sensibly (whole grams) | Must |
| R-5 | Ordered process steps per recipe, each with a duration or range (section 5) | Must |
| R-6 | Each ingredient links to a Pantry item; picking one from the Pantry is the default way to add an ingredient | Must |
| R-7 | Inclusions (cheese, seeds, fruit, jalapeños) supported as ingredients with their own cost | Should |
| R-8 | Tag, search and favorite recipes | Should |
| R-9 | Ship 2 to 3 starter recipes: basic country loaf, whole wheat, an inclusion loaf | Should |
| R-10 | Import and export a recipe as JSON or plain text; full backup and restore of all data (recipes, pantry, bakes, settings) to one file through the share sheet; backups are manual only, no reminders | Must |

**Acceptance example.** A recipe of 500 g flour, 375 g water, 10 g salt and 100 g levain at 100% hydration shows 77.3% total hydration (425 g water over 550 g flour) and scales to 2 loaves by doubling every line.

## 5. Feature: Bake scheduler (backward planning)

The user picks a recipe and a ready time; the app walks the recipe's steps backward, shows the clock time to start each one, and reminds the user as each arrives.

**How the calculation works**

1. Ready time means cooled and ready to eat (decided), so cooling is counted as a step.
2. From the ready time, subtract each step's duration in reverse order to get its start time.
3. Steps marked "runs alongside" (preheating the oven) are anchored to another step and add no time.
4. Steps with a range (bulk 5 to 8 h) use a chosen value: the recipe default, adjusted for kitchen temperature when that is on.
5. The result is checked against the user's quiet hours; any step starting inside them gets a warning; the app never moves steps on its own.

**Example schedule** (default template, ready 10:00 AM Saturday)

| Step | Starts |
| --- | --- |
| Final starter feeding | Fri 3:05 AM |
| Mix and rest | Fri 11:05 AM |
| Stretch and folds (4 sets) | Fri 12:05 PM |
| Bulk ferment | Fri 2:05 PM |
| Shape | Fri 8:05 PM |
| Cold ferment (fridge) | Fri 8:15 PM |
| Preheat oven (alongside) | Sat 7:45 AM |
| Bake, covered | Sat 8:15 AM |
| Bake, uncovered | Sat 8:45 AM |
| Cool | Sat 9:00 AM |
| **Ready to eat** | **Sat 10:00 AM** |

On the defaults, a 10 AM Saturday loaf needs a 3:05 AM starter feeding. With overnight quiet hours set, the app warns about it; stretching the cold ferment to 18 hours moves the feeding to 9:05 PM Thursday.

**Default step template** (editable per recipe)

| Step | Default | Range | Notes |
| --- | --- | --- | --- |
| Final starter feeding | 8 h | 6 to 10 h | Until the starter peaks |
| Mix and rest | 1 h | 30 min to 2 h | Initial ingredients mixed, then rested |
| Stretch and folds | 2 h | Set by count x interval | 4 sets, every 30 min; a reminder for each set |
| Bulk ferment | 6 h | 5 to 8 h | Starts after the last fold; most temperature-sensitive step |
| Shape | 10 min | 5 to 15 min | |
| Cold ferment (fridge) | 12 h | 12 to 24 h | The schedule's main flex |
| Preheat oven and Dutch oven | 30 min | 20 to 45 min | Runs alongside the end of the cold ferment |
| Bake, covered | 30 min | 25 to 35 min | |
| Bake, uncovered | 15 min | 10 to 25 min | |
| Cool | 1 h | 30 min to 2 h | Ends at the ready time |

Timings from Chris's own process. Every default and range is editable per recipe, and each bake can pick its own value inside a step's range.

**Requirements**

| ID | Requirement | Priority |
| --- | --- | --- |
| S-1 | Choose a recipe and a ready date and time; show the start time of every step | Must |
| S-2 | User sets each step's default duration and its min-max range per recipe; when scheduling a bake, a slider picks a value inside the range (default preselected) | Must |
| S-3 | Local notification at each step's start, plus an optional heads-up a set number of minutes before | Must |
| S-4 | User-defined quiet hours: warn when any step starts inside them. Warning only; the user adjusts the schedule | Must |
| S-5 | Live bake view: current step, countdown, mark done; when a step runs long or short, recompute the rest | Must |
| S-6 | Correct across time zone and daylight-saving changes for overnight bakes | Must |
| S-7 | Stretch-and-fold sub-reminders during bulk (count and interval) | Should |
| S-8 | "Start now" mode: compute the ready time forward from now | Should |
| S-9 | Kitchen-temperature adjustment of bulk and proof durations from a simple lookup table | Must |
| S-10 | Add the schedule to the device calendar | Could |
| S-11 | Several active bakes at once | Must |
| S-12 | Multi-recipe bake: several recipes in one bake, scheduled together and shown on one merged timeline; when scheduling, the app asks how many loaves fit in the oven at once (default from Settings); loaves that fit bake together, the rest get back-to-back bake slots, and each recipe's schedule is offset to match | Must |

**Edge cases.** A ready time too soon to fit shows the earliest possible ready time instead. If notifications are denied, the app shows an in-app banner and the live view still works. After a reboot or app update, pending notifications are rescheduled on next launch.

## 6. Feature: Cost per loaf

Every recipe is priced from the Pantry and shows its cost per batch and per loaf, with a line-by-line breakdown. The user enters what they paid for each package once; the app converts it to a cost per recipe unit.

```
cost per loaf = Σ (amount_i × unit cost_i) / loaves
unit cost     = package price / package size
```

| ID | Requirement | Priority |
| --- | --- | --- |
| C-1 | Pantry item: name, category, package price, package size and unit, store (optional), date priced | Must |
| C-2 | Unit conversion between package and recipe units: weight to weight, volume to volume, and volume to weight through a per-ingredient density (1 cup bread flour is about 120 g) | Must |
| C-3 | Recipe cost breakdown: each ingredient's cost and share of the total, plus cost per batch and per loaf | Must |
| C-4 | Currency and number format follow the device locale | Must |
| C-5 | Water defaults to zero cost; the user can price it | Must |
| C-6 | Price history per Pantry item; recipe costs update when a price changes, and a past bake keeps the cost it had | Should |
| C-7 | Suggested sell price per loaf from the ingredient cost and a user-set markup percentage | Should |

Cost covers ingredients only (decided): no starter upkeep, energy or packaging. The markup logic from the existing sourdough cost calculator can seed the sell-price suggestion.

**Acceptance example** (illustrative prices)

| Line | Amount | Unit cost | Cost |
| --- | --- | --- | --- |
| Bread flour | 450 g | $0.0024/g | $1.08 |
| Whole wheat flour | 50 g | $0.0035/g | $0.18 |
| Salt | 10 g | $0.0010/g | $0.01 |
| Levain flour | 50 g | $0.0024/g | $0.12 |
| Water | 425 g | $0 | $0.00 |
| **One loaf** | | | **$1.39** |

## 7. Data model

Six entities cover v1; a scheduled bake stores a snapshot of its recipe so later edits don't change a bake in progress.

| Entity | Key fields | Relationships |
| --- | --- | --- |
| Recipe | id, name, yieldLoaves, doughWeightG, notes, tags, favorite | Has many RecipeIngredient and Step |
| RecipeIngredient | recipeId, pantryItemId, amount, unit, role (flour, water, salt, levain, inclusion, other) | Points to one PantryItem |
| PantryItem | id, name, category, packagePrice, packageSize, packageUnit, gramsPerCup, pricedAt | Has many PriceHistory entries |
| Step | recipeId, order, name, durationMin, minMin, maxMin, tempSensitive, anchor (sequential, or alongside step X), subReminders | Belongs to Recipe |
| Bake | id, readyAt, items (recipeId, recipeSnapshot, scale, ovenSlot), kitchenTemp, status, per step: plannedStart, actualStart, actualEnd, costSnapshot | Copies one or more Recipes at scheduling time |
| Settings | quietHours, ovenCapacity (loaves at once), unit system, currency, energyRate, headsUpMinutes | One per user |

For sync (v1.1), a single DynamoDB table keyed `PK = USER#<id>` with `SK = RECIPE#<id>`, `PANTRY#<id>`, `BAKE#<id>` holds everything for one user in one partition.

## 8. Technical approach and non-functional requirements

Recommended: React Native with Expo in TypeScript, offline-first on the device, with a serverless AWS backend added for sync in v1.1 and reused by the web app in Phase 2.

| Layer | Choice | Why |
| --- | --- | --- |
| Mobile app | React Native + Expo, TypeScript | One codebase for iOS and Android; React skills carry to the web app |
| Shared logic | A pure TypeScript package for the scheduler, unit conversion and cost math | Unit-tested once, used by mobile and web |
| Local storage | SQLite on device (expo-sqlite) | All features work offline |
| Reminders | Local scheduled notifications (expo-notifications) | Fire with the app closed; no server needed |
| Backend (v1.1) | AWS SAM: Cognito, API Gateway, Lambda (Node.js), DynamoDB single table | Near-zero cost at small scale |
| Web (Phase 2) | React on S3 + CloudFront, same API and shared package | Reuses backend and logic |
| Builds | EAS Build and Submit | Store builds without a Mac build farm |

**Non-functional requirements**

- Every v1 feature works with no network connection.
- Step notifications fire within 1 minute of the scheduled time with the app closed, including on Android battery-saver settings (request exact-alarm permission where required).
- Schedule and cost calculations have unit tests covering daylight-saving changes, unit conversions and rounding.
- Live bake view can keep the screen awake; large tap targets for floury hands.
- Supports system text sizes and screen readers.
- MVP stores nothing off the device; no analytics without opt-in.

## 9. Success measures, risks and open questions

**Success measures**

- A bake scheduled in under 60 seconds from opening the app.
- 90% of steps in completed bakes started within 15 minutes of their reminder.
- Every saved recipe shows a cost per loaf (all ingredients priced).

**Risks**

| Risk | Mitigation |
| --- | --- |
| Fermentation times vary widely with starter, flour and temperature | Ranges, temperature adjustment, live recompute when a step runs long or short |
| Android battery savers delay or drop notifications | Exact-alarm permission, in-app countdown, reschedule on launch |
| Volume-to-weight conversions are inaccurate | Grams first; per-ingredient density the user can edit |
| Overnight steps break on daylight-saving nights | Store times in UTC, display local; dedicated tests |

**Open questions**

- [ ] Deferred: free or paid, if it goes to the app stores later.
