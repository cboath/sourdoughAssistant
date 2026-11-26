# Sourdough Assistant: screen specs for scheduling, reminders and the live bake (M4, M5)

DS-03 · 2026-11-26 · ux-ui-designer
Inputs: `docs/design/flows.md`, `tokens.md`, `components.md` (DS-01) · `screens-recipes.md` (DS-02) · `docs/core-api.md` §5 · `docs/architecture.md` §4, §5, §9, §18 · `docs/data-model.md` (bake tables, settings) · ADR 0005, 0008, 0009 (PROVISIONAL), 0010, 0011, 0014 · `docs/security/threat-model.md` L3 · PRD §5
Consumers: RN-06 (schedule), RN-07 (notifications, banners), RN-08 (live, home), QA-04 / QA-05 (tests, manual scripts), DR-02 (review against this file)

Screens and components use **DS-01 names**. Values are **token names**: no raw hex, px or ms. Field names in `code` match `core-api.md` (camelCase) and `data-model.md` (snake_case columns). Domain numbers (10 min overlap window, 15 min extend, 5 min snapping) are product rules, not styling.

**Q-A3 is resolved (architecture §7.1):** bakes scale **by loaves only**. `SCHED-PLAN` shows "Uses the recipe's dough weight" (§3.2 item 1). A per-bake dough-weight target is v1.1.

---

## 0. Shared rules for every screen in this file

### 0.1 Screen ID to route

| Screen ID | Route (architecture §4) | Presentation | Params |
|---|---|---|---|
| `BAKES-HOME` | `app/(tabs)/bakes/index.tsx` | Tab root (default tab) | none |
| `SCHED-PICK` | `app/bake/schedule/index.tsx` | Root of the schedule modal stack: iOS `pageSheet` (large detent), Android full screen | none |
| `SCHED-PLAN` | `app/bake/schedule/plan.tsx` | Push inside the schedule modal | `?recipeId=<uuid>&loaves=<int 1..50>` (**new params**, §12 Q-A1). Without params it reads `useScheduleDraft` |
| `PERM-NOTIF` | `app/bake/schedule/permission-notifications.tsx` | Push inside the schedule modal | `?bakeId=<uuid>` (the bake that was just saved) |
| `PERM-ALARM` | `app/bake/schedule/permission-alarm.tsx` | Push inside the schedule modal, Android only | `?bakeId=<uuid>` |
| `BAKE-LIVE` | `app/bake/[id]/index.tsx` | `fullScreenModal` over the tabs (architecture §4) | `id`; `?step=<bakeStepId>` (focus only) |
| `BAKE-TIMELINE` | `app/bake/[id]/timeline.tsx` | Push inside the live modal stack | `id` |
| `READY-PICKER` | none: platform date/time picker (`DateTimeField`) | iOS sheet, Android chained dialogs | — |
| `TEMP-SHEET` | none: `Sheet` owned by `src/features/schedule/components` | Sheet over `SCHED-PLAN` | — |
| `RECIPE-ADD-SHEET` | none: `Sheet` reusing the `SCHED-PICK` list | Sheet over `SCHED-PLAN` (multi-recipe "Add recipe") | — |
| `STEP-ACTIONS` | none: `Sheet` owned by `src/features/live/components` | Sheet over `BAKE-LIVE` and `BAKE-TIMELINE` | `bakeStepId` prop |
| `BAKE-INGREDIENTS` | none: `Sheet` owned by `src/features/live/components` | Sheet over `BAKE-LIVE` | `bakeId` prop |
| `OTHER-BAKES-SHEET` | none: `Sheet` | Sheet over `BAKE-LIVE` (3 or more active bakes) | — |

Navigation rules specific to this file:
- **Entering `SCHED-PLAN` directly** (from `RECIPE-DETAIL` "Schedule this recipe" or the `RECIPE-LIST` context menu "Schedule"): `router.push('/bake/schedule/plan?recipeId=…&loaves=…')`. `bake/schedule/_layout.tsx` sets `unstable_settings = { initialRouteName: 'index' }`, so `SCHED-PICK` is underneath and back from the plan goes to the picker. Per architecture §4 rule 2, the params **only prefill the draft**. Nothing is written on mount.
- **After "Schedule bake"** (§3.6): the bake is written first. Then, if a primer is due, `PERM-NOTIF` (and `PERM-ALARM`) are pushed inside the modal. Finally the schedule modal is dismissed (`router.dismissAll()`), the tab switches to Bakes, and `BAKE-LIVE` for the new bake is pushed (`router.push('/bake/<id>')`). Closing `BAKE-LIVE` lands on `BAKES-HOME`.
- **`BAKE-LIVE` is a `fullScreenModal`**, which replaces DS-01's "root stack push" wording. It has no swipe-to-dismiss on iOS, so its header has an explicit close control (§8.2).
- **Notification tap:** `/bake/<bakeId>?step=<bakeStepId>` opens `BAKE-LIVE` over whatever tab is showing (architecture §4). On a cold start, `BAKES-HOME` is underneath.

### 0.2 Formatting (one table, used by every screen here)

DS-02 §0.2 still applies for weights, money and percentages. These rows add time formatting.

| Value | Source | Display rule | Example | Accessibility label |
|---|---|---|---|---|
| Clock time | `EpochMs` in the **current device zone** (ADR 0005) | `TimeText`. Locale 12/24 h (`uses24hourClock`) | `3:05 AM` / `03:05` | "3:05 AM" |
| Day + time | same | Relative day: "Today", "Tomorrow", the weekday ("Fri") when it's within 6 days, otherwise "Fri, Dec 4". Joined as `{day} {time}` | `Fri 3:05 AM` | "Friday 3:05 AM" (always the full weekday) |
| Ready time (field) | `readyAt` | `{weekday short}, {month short} {day} · {time}` with a relative hint `in {duration}` | `Sat, Nov 28 · 10:00 AM` · `in 1 d 13 h` | "Ready time, Saturday November 28, 10:00 AM, in 1 day 13 hours" |
| Day header (timeline) | first row of each local calendar day | `{weekday long}, {month long} {day}` (`Intl.DateTimeFormat` `dateStyle: 'full'` without the year, or `'long'` if the year differs from now) | `Friday, November 27` | `role="header"` |
| Duration | `Minutes` | DS-02 rule: `45 min`, `6 h`, `6 h 30 min`, `1 d 4 h` (days only from 24 h up, and then minutes are dropped) | `30 h 55 min` → `1 d 6 h` | "1 day 6 hours" |
| Span (timeline header, too soon) | `planSpanMin` / `readyAt − startAt` | Duration rule, **but keep hours up to 48 h** (`30 h 55 min`), because bakers think of a bake in hours | `30 h 55 min` | "30 hours 55 minutes" |
| Countdown, live hero | `plannedEnd − now` (or the next fold) | ≥ 24 h: `1 d 4 h`. 1 h to 24 h: `5 h 42 min` (updates each minute). Under 1 h: `42:10` (`MM:SS`, updates each second). Exactly 0: `0:00` for one tick, then overtime | `42:10` | "42 minutes 10 seconds left in Bulk ferment" (refreshes every minute, never announced, §8.8) |
| Countdown, home card | same | Minutes only: `2 h 14 min left`, `42 min left`, `Less than 1 min left` | `2 h 14 min left` | same words |
| Overtime | `now − plannedEnd` | Under 1 h: `+12:30 over`. 1 h or more: `+1 h 5 min over`. Always with the clock-alert icon and `warning` color | `+12:30 over` | "12 minutes 30 seconds over time" |
| Delta | `deltaMin` | Signed, with words: `40 min later`, `20 min earlier` | `+40 min` in tight spaces | "40 minutes later" |
| Temperature | `kitchenTempC` | Settings unit: `27 °C` / `81 °F`. Whole degrees, a no-break space before the unit | `27 °C` | "27 degrees Celsius" |
| Letter badge | item position | `A`, `B`, `C`, `D` (max 4 items per bake, §4.1) | `A` | hidden (the recipe name carries it) |
| Loaf count | `loaves` | ICU plural; ×-form only in slot headers: `A ×2` | `2 loaves` / `A ×2` | "Country loaf, 2 loaves" |

Times are always rendered from UTC instants in the **current** zone at render time. If the zone changes while a screen is open, the next tick re-renders with the new zone (architecture §12 runs the zone check and a `rebuild`).

### 0.3 Warning model (what core gives, and what the UI derives)

Warnings never block scheduling. The single exception is **too soon** (`PlanResult.status = 'tooSoon'`), along with `invalid` plans, which can't be scheduled at all.

| Warning | Source | Level | Row tag (`StatusTag`) | Summary line (§3.5) |
|---|---|---|---|---|
| Too soon | `planBake` → `status: 'tooSoon'` | **Blocking** | Ready-time field in error state | `Banner danger` (not in the summary card) |
| Invalid steps | `status: 'invalid'` | **Blocking** | — | `Banner danger` per recipe |
| Quiet hours | `quietHoursWarnings(plan, quiet, zone)` | Info | `quietHours` "Quiet hours" on the step row, and on the fold sub-row (`foldIndex`) | `plan.quiet.summary` |
| Simultaneous steps | **UI-derived** (core has no code for it): two step starts from **different items** (or an item and the bake-wide preheat) within 10 min of each other. Steps in the same oven slot are excluded, because they go in together by design | Info | `overlap` "Same time as B: Shape" on both rows | `plan.overlap.summary` |
| DST night | `dstWarnings(plan, zone)` | Info | `dst` "Clocks go back 1 h" / "Clocks go forward 1 h" | `plan.dst.summary` |
| Temperature adjusted | `DurationChoice.source = 'temperature'`, `clamped = false` | Neutral | `adjusted` "Adjusted for 27 °C, was 6 h" | none (expected behavior) |
| Temperature clamped | `temperatureClamped` | Warning | `adjusted` with the text "Capped at 8 h for 18 °C" | `plan.tempCold.summary` / `plan.tempWarm.summary` |
| Hold exceeds range | `holdExceedsRange` (multi-slot) | Warning | `overtime` icon set, text "Fridge {effective}, max {max}" | `plan.hold.summary` |
| Oven conflict | `ovenConflict` (live recompute only) | Warning | on the slot headers | `Banner warning` on `BAKE-LIVE` (§8.6) |
| Duration out of range | `durationOutOfRange` (live, after "+15 min") | Info | "Longer than the recipe's {max} max" / "Shorter than the recipe's {min} min" | none |
| iOS reminder budget | planner dry run (§3.5, §12 Q-A7) | Info | — | `plan.budget.summary` |

Each status uses an icon **and** words **and** color, never color alone (components §1.3).

### 0.4 Permission and reminder-health states (`usePermissions`, ADR 0011 §7)

| State | Detected by | `BAKES-HOME` | `BAKE-LIVE` | Schedule flow | Settings (DS-04) |
|---|---|---|---|---|---|
| Notifications not asked | `getPermissionsAsync().status = 'undetermined'` | `banner.notifOff` with [Turn on] → system prompt | same | `PERM-NOTIF` after the first save | status row |
| Notifications denied | `status = 'denied'` | `banner.notifOff` with [Turn on] → `Linking.openSettings()` | same | no primer; go to live | status row + [Open settings] |
| Exact alarms denied (Android 12+) | `getExactAlarmPermissionsAsync()` | `banner.alarmOff` [Allow] | same | `PERM-ALARM` the first time only | status row |
| Some reminders failed | `reconcile` result has failures | `banner.notifFailed` [Try again] | same | — | — |
| iOS budget exceeded (sentinel scheduled) | planner reports dropped critical intents | `banner.budget` (info, dismissible) | — | summary line (§3.5) | — |
| Battery optimization on (Android) | `expo-battery` `isBatteryOptimizationEnabledAsync()` | **not shown** (with `alarmClock` delivery it's informational only) | not shown | — | guide row (DS-04) |

Rules:
1. Reminder banners show on `BAKES-HOME` **only when there's at least one scheduled or active bake**. With no bakes, the state lives in Settings only.
2. Precedence, when several apply: notifications off, then reminders failed, then exact alarms off, then budget. At most **two** reminder banners show at once. "Notifications off" hides "exact alarms off", because exact alarms don't matter when nothing is allowed.
3. Dismissing (X) a reminder banner hides it **until the next bake is scheduled** (`usePermissions.bannerDismissedAt`; it shows again when any bake's `created_at` is later). Each affected `ActiveBakeCard` keeps a `remindersOff` tag that can't be dismissed, so the state is never invisible.
4. The status is re-checked on `AppState → active`. When it changes to granted: `reconcile({ mode: 'rebuild' })`, the banner hides, and `Snackbar` `reminders.on`.

### 0.5 Loading

v1 is local-only (flows §0.5). "Loading" means the first SQLite read, so screens show `Skeleton` and never a spinner. Plan previews are synchronous `useMemo` over core (under 16 ms, architecture §12), with no loading state. There are no network, offline or sync states.

### 0.6 Large text (each screen lists only what's specific to it)

DS-02 §0.6 applies. In addition, at `fontScale >= layout.timelineStackFontScale` (1.5):
- `TimelineRow` puts the time above the step name. The rail and marker stay.
- Day headers wrap.
- `CurrentStepPanel`: `title1` wraps fully. `timerHero` is capped at its 1.3 multiplier.
- Hero button labels wrap to 2 lines (3 at 200%). The button grows from `size.touchHero`.
- Secondary action rows on `BAKE-LIVE` stack vertically.

### 0.7 Snackbars with undo used in this file

All use `motion.snackbarDuration`, `haptic.impactLight` on Undo, and pause while a screen reader is focused on them (components §3.24). **Only the latest action can be undone.** A new action replaces the snackbar, and the earlier undo is gone.

| Action | Message key | Undo |
|---|---|---|
| Mark step done | `live.done.snack` / `live.done.snackShift` | Restores the bake rows to their state before the event, then reconcile (§12 Q-A2) |
| Fold N done | `live.fold.snack` | same |
| Start a step now (early start) | `live.startNow.snack` | same |
| +15 min | `live.extend.snack` | same |
| Hold ready time | `live.hold.snack` | same |
| Mark an alongside step done | `live.alongside.snack` | same |
| Finish bake (overflow) | `home.finished.snack` (shown on `BAKES-HOME`) | Restores status `active` and the notifications |

Cancel bake isn't undoable. It uses a native confirm instead (§8.5).

### 0.8 Haptics used in this file

| Event | Token |
|---|---|
| Bake scheduled, step done, fold done, bake complete | `haptic.success` |
| Slider snap, stepper change, segmented change, +15 min | `haptic.selection` |
| Overtime starts while `BAKE-LIVE` is visible; Schedule tapped while too soon | `haptic.warning` |
| Undo | `haptic.impactLight` |

---

## 1. `BAKES-HOME`

**Purpose.** What's happening now and next across every bake, and one way in to schedule another.
**Entry points.** App launch (default tab); closing `BAKE-LIVE`; system back from another tab (Android).

### 1.1 Data
- `qk.bakes.active()` returns bakes with `status IN ('scheduled','active')` and `deleted_at IS NULL`, each with its `bake_item`s and `bake_step`s.
- `useNow(30 s)` (architecture §5) drives the countdowns. Seconds are never shown here.
- Derived per bake (pure helper `deriveLiveState(bake, now)` in `src/features/live`, shared with `BAKE-LIVE`, §8.1):
  - `current[]`: per item, the current sequential step (§8.1 rules).
  - `phase`: `waiting` (now is before the first planned start and nothing has started), `running`, `overtime` (any current step is past its planned end), `ready` (the final step has ended and isn't marked done).
  - `next`: the next step start across the bake (sequential or alongside), with its time.
  - `progress`: `(now − startAt) / (readyAt − startAt)`, clamped to 0 to 1.
- **Sections:**
  - "Now": bakes in phase `running`, `overtime` or `ready`. Overtime first, then by the soonest current-step end.
  - "Upcoming": bakes in phase `waiting`, sorted by first planned start.
- Tab badge (flows §1.1): the number of current steps in overtime across all bakes. It's hidden at 0.

### 1.2 Layout (top to bottom)
1. **Header.**
   - iOS: large title "Bakes". No trailing button: the primary action is the pinned bar (item 5).
   - Android: top app bar "Bakes" (no actions).
2. **Reminder banners** (§0.4), only when at least one bake exists. Padding `layout.screenMargin`, `space.sm` between banners.
3. **`SectionHeader` "Now"** (hidden when empty), then one `ActiveBakeCard` per bake (`space.md` gap):
   - Variant `active` or `overtime` (components §3.18).
   - Top row: the recipe name (`title3`, 2 lines). Multi-recipe bakes show letter badges and "A Country loaf · B Whole wheat" (§4.3). Trailing tags: `overtime` "Over time", `remindersOff` "Reminders off".
   - Current step `headline`, then the countdown in `timerLarge numeric` ("2 h 14 min left") or, for overtime, "+12 min over" in `warning` with the icon.
     - Multi-recipe: the most urgent current step (overtime first, then the soonest end), plus a line `home.card.moreNow` "+1 more step now" (`subhead`).
     - Fold steps: "Stretch and folds · Fold 2 of 4", countdown to the next fold.
     - Phase `ready`: "Ready to eat" with the `success` check icon instead of a countdown. Subtitle `home.card.readyTap` "Tap to finish the bake."
   - "Next: Shape at 8:05 PM" (`subhead textSecondary`).
   - `ProgressBar`.
   - "Ready Sat 10:00 AM" (`subhead`). When the ready time has moved from the plan: "Ready Sat 10:40 AM (40 min later)".
4. **`SectionHeader` "Upcoming"** (hidden when empty), with `ActiveBakeCard upcoming` per bake:
   - Name (same rules).
   - `headline`: "Starts Fri 3:05 AM" (or "Starts in 42 min" when under 1 h).
   - `subhead textSecondary`: "First: Final starter feeding · Ready Sat 10:00 AM".
   - No progress bar.
5. **Primary action.**
   - iOS: `BottomActionBar` with `Button primary lg` "Schedule a bake".
   - Android: M3 Extended FAB "Schedule a bake" (components §3.4). It collapses to an icon on scroll, and the label stays in its accessibility label.
6. Bottom padding: bar height + `space.lg` (iOS), FAB height + `space.lg` (Android).

### 1.3 States
| State | Treatment |
|---|---|
| Loading | 2 skeleton cards (title bar 60%, a large bar 40% for the countdown, a thin progress bar) |
| Empty (no bakes) | `EmptyState firstUse` (flows §8): illustration, `home.empty.title`, `home.empty.body`, primary "Schedule a bake". iOS hides the pinned bar while the empty state's own button is showing (no duplicate primary). Android keeps the FAB hidden in this state for the same reason. No reminder banners |
| Empty, and no recipes exist | Same empty state. "Schedule a bake" opens `SCHED-PICK`, which shows its own no-recipes state (§2.3) |
| Only upcoming | The "Now" section is hidden |
| Overtime | Card variant `overtime`, tab badge, and the "Now" section sorts it first |
| Reminders off / exact alarms off | Banners (§0.4). Every card gets the `remindersOff` tag ("Reminders off", or "Reminders may be late" for exact alarms) |
| Read error | `EmptyState error`: `home.loadError` [Try again] |
| Many bakes (5 or more) | The list scrolls. No grouping beyond the two sections |
| Bake finished elsewhere (from `BAKE-LIVE`) | It's removed from the list. `Snackbar` `home.finished.snack` [Undo] shows on arrival |
| Long recipe names | 2 lines, then ellipsis. The full name is in the label |
| Large text | Countdown `timerLarge` caps at 1.6. The "Next" and "Ready" lines wrap. Tags move to their own line under the name |
| Landscape / tablet | Cards in a single column at `layout.maxContentWidth`. At 600 or more wide, a 2-column grid of cards (`space.lg` gap) |

### 1.4 Interactions
- Tap a card to open `BAKE-LIVE` for that bake.
- Long press on a card (iOS context menu, Android long-press menu; also `accessibilityActions`): "Open", "Finish bake" (only in phase `ready`), "Cancel bake" (confirm §8.5). Long press is never required, because both actions are also on `BAKE-LIVE`.
- Banner actions per §0.4.
- No pull to refresh (local data). Countdowns tick every 30 s.

### 1.5 Copy
| Key | String |
|---|---|
| `home.title` | Bakes |
| `home.schedule` | Schedule a bake |
| `home.section.now` | Now |
| `home.section.upcoming` | Upcoming |
| `home.card.left` | {duration} left |
| `home.card.lessThanMin` | Less than 1 min left |
| `home.card.over` | +{duration} over |
| `home.card.fold` | {step} · Fold {n} of {count} |
| `home.card.moreNow` | {count, plural, one {+# more step now} other {+# more steps now}} |
| `home.card.next` | Next: {step} at {time} |
| `home.card.ready` | Ready {dayTime} |
| `home.card.readyMoved` | Ready {dayTime} ({delta}) |
| `home.card.readyNow` | Ready to eat |
| `home.card.readyTap` | Tap to finish the bake. |
| `home.card.starts` | Starts {dayTime} |
| `home.card.startsIn` | Starts in {duration} |
| `home.card.first` | First: {step} · Ready {dayTime} |
| `home.tag.overtime` | Over time |
| `home.tag.remindersOff` | Reminders off |
| `home.tag.remindersLate` | Reminders may be late |
| `home.empty.title` | Plan your next loaf |
| `home.empty.body` | Pick a recipe and when you want it ready. We'll tell you when to start each step. |
| `home.loadError` | Couldn't load your bakes. |
| `home.menu.open` | Open |
| `home.menu.finish` | Finish bake |
| `home.menu.cancel` | Cancel bake |
| `home.finished.snack` | {recipe} is done. Enjoy! |
| `tab.bakes.badge` | {count, plural, one {Bakes, # step overdue} other {Bakes, # steps overdue}} |

### 1.6 Accessibility
- Each card is one stop (components §3.18), for example: "Country loaf. Bulk ferment, 2 hours 14 minutes left. Next, shape at 8:05 PM. Ready Saturday 10 AM. 45 percent through the bake. Reminders off." Hint "Opens live bake".
- Overtime: "Country loaf. Shape, 12 minutes over time. …".
- Multi: "Country loaf and Whole wheat. Country loaf: Shape, 10 minutes left. 1 more step now. …".
- Section headers have `role="header"`.
- The card label refreshes on the 30 s tick. It's never a live region.
- The context-menu actions are `accessibilityActions` on the card.

### 1.7 Platform
- iOS: large title collapses on scroll. The pinned full-width button sits above the tab bar.
- Android: Extended FAB bottom end, above the navigation bar. At 600 dp or more wide, the navigation rail replaces the bar (flows §1.1), and the FAB moves to the top of the rail per M3.

---

## 2. `SCHED-PICK`

**Purpose.** Choose what to bake: one tap for a single recipe, or a multi-select for a mixed bake.
**Entry points.** `BAKES-HOME` "Schedule a bake". It's also underneath `SCHED-PLAN` when the plan was opened from a recipe (§0.1).

### 2.1 Data
- `qk.recipes.list({ query, tags: [], favoritesOnly: false })`, plus `qk.bakes.all` for "Recent".
- **Sections:**
  - "Favorites": `favorite = 1`, A to Z.
  - "Recent": recipes from the 3 most recently created bakes (any status), most recent first, without duplicates and without recipes already in Favorites. Hidden if empty.
  - "All recipes": everything else, A to Z.
- **Schedulable:** `validateSteps(steps).ok`. Recipes that fail show as not schedulable (§2.3).
- Row subtitle: "{span} · {loaves}" with `planSpanMin` at default durations ("30 h 55 min · 1 loaf").

### 2.2 Layout (top to bottom)
1. **Header.**
   - iOS: inline title "Schedule a bake". Leading "Cancel". Trailing "Select" (switches to multi-select; in multi-select it reads "Done", which returns to single-select and clears the selection). `SearchField` in the nav bar ("Search recipes").
   - Android: top app bar with close (X), title "Schedule a bake", and a text button "Select" / "Done". M3 Search bar below the bar.
2. **List** (FlashList with section headers) of `ListRow navigation`:
   - Title: `name` (`headline`, 2 lines).
   - Subtitle: span and loaves.
   - Not schedulable: subtitle `pick.cantSchedule` in `textSecondary` with an info icon, and the title isn't dimmed (it stays readable). See §2.3.
3. **Multi-select mode** (after "Select"):
   - Rows become `ListRow selectable` (leading checkbox).
   - A selected row expands (`motion.duration.standard`; instant with reduce motion) to show a `Stepper` "Loaves" (1 to 50, default `yieldLoaves`) under the title, indented to the text.
   - The selection order is kept and becomes the item order (A, B, C, D), which ADR 0009 uses as the slot fill order.
   - A letter badge appears on each selected row in selection order.
   - Max 4 recipes. A fifth tap shows `Snackbar` `pick.max` and doesn't select.
   - `BottomActionBar`: footnote `pick.selectionSummary` ("3 loaves, 2 recipes") and `Button primary lg` "Continue". Disabled with 0 selected, with the hint `pick.selectFirst`.

### 2.3 States
| State | Treatment |
|---|---|
| Loading | 6 skeleton rows |
| No recipes | `EmptyState firstUse`: `pick.empty.title`, `pick.empty.body`, primary "New recipe" (opens `recipe-editor/new` over the modal), secondary text "Add starter recipes" (`seedService.addStarterRecipes()`, DS-02 Q-A6) |
| Search, no results | `EmptyState search`: `recipes.search.none` [Clear search] |
| Not-schedulable recipe | The row is still enabled. Tapping it shows a native alert: title `pick.cant.title`, body from the validation mapping (§3.9), buttons [Edit recipe] (opens `recipe-editor/<id>` over the modal) and [OK]. In multi-select, its checkbox is disabled with the same hint |
| Read error | `EmptyState error`: `recipes.loadError` [Try again] |
| Large text | Subtitles wrap. The selected-row stepper sits on its own line |

### 2.4 Interactions
- Single mode: tap a row to push `SCHED-PLAN` with that recipe and `loaves = yieldLoaves` (draft reset).
- Multi mode: tap toggles selection (`haptic.selection`). "Continue" pushes `SCHED-PLAN` with the selected items in order.
- Cancel / X: closes the modal. The draft is discarded without a confirm, because nothing has been planned yet.
- If the user comes back from `SCHED-PLAN` to this screen, the draft is kept: going forward again restores ready time, sliders and temperature, provided the same recipes are chosen. If the recipe set changes, the sliders for removed recipes are dropped.

### 2.5 Copy
| Key | String |
|---|---|
| `pick.title` | Schedule a bake |
| `pick.select` | Select |
| `pick.done` | Done |
| `pick.section.favorites` | Favorites |
| `pick.section.recent` | Recent |
| `pick.section.all` | All recipes |
| `pick.row.summary` | {span} · {loaves, plural, one {# loaf} other {# loaves}} |
| `pick.cantSchedule` | Can't schedule yet |
| `pick.cant.title` | {recipe} can't be scheduled yet |
| `pick.max` | You can bake up to 4 recipes together. |
| `pick.selectionSummary` | {loaves, plural, one {# loaf} other {# loaves}}, {recipes, plural, one {# recipe} other {# recipes}} |
| `pick.continue` | Continue |
| `pick.selectFirst` | Select at least one recipe. |
| `pick.empty.title` | No recipes yet |
| `pick.empty.body` | Add a recipe first, or start with a country loaf, whole wheat and an inclusion loaf. |
| `pick.newRecipe` | New recipe |
| `pick.addStarters` | Add starter recipes |
| `pick.edit` | Edit recipe |
| `common.ok` | OK |

### 2.6 Accessibility
- Single-mode rows: `role="button"`, label "Country loaf, 30 hours 55 minutes, 1 loaf", hint "Plans this bake".
- Multi-mode rows: `role="checkbox"` with `checked`. When selected, the label adds "recipe A". The loaves stepper is a separate `adjustable` stop: "Loaves for Country loaf, 2 loaves".
- Mode change announces "Select recipes to bake together" / "Single recipe".
- Not-schedulable rows add "Can't schedule yet" to the label, and the hint "Shows why".

### 2.7 Platform
- iOS: page sheet, large detent, grabber hidden (it's a task, not a picker). Swipe-down dismiss is allowed here (nothing to lose).
- Android: full-screen modal (M3 full-screen dialog pattern). System back closes it.

---

## 3. `SCHED-PLAN`

**Purpose.** Pick when the bread should be ready (or start now), adjust only what you need to, see every step's start time with warnings, and schedule. M4 target: under 60 s from app open (flows §5.1).
**Entry points.** `SCHED-PICK` (single tap or "Continue"); `RECIPE-DETAIL` "Schedule this recipe" and `RECIPE-LIST` "Schedule" (with `?recipeId&loaves`).

### 3.1 Data
**Draft** (`useScheduleDraft`, Zustand, owned by `bake/schedule/_layout.tsx`):

```ts
{
  items: { tempId; recipeId; loaves; overrides: Record<stepId, Minutes> }[];  // order = A, B, C, D
  mode: 'backward' | 'forward';
  readyLocal: LocalDateTime | null;     // what the user picked; null until defaulted
  ovenCapacity: number;                 // default settings.ovenCapacity
  kitchenTempC: number | null;          // null = not set
  touched: boolean;                     // any user change (drives the discard confirm)
}
```

**Preview** (synchronous `useMemo`, recomputed on every draft change and on the `useNow(30 s)` tick):
1. `readyAt = localToUtc(readyLocal, zone)`. Keep the `adjustment` for the DST helper (§3.4).
2. `input: PlanInput` from each recipe's **live** steps, `loaves`, `durations: { kitchenTempC, overrides }`, `ovenCapacity`, and `reheatGapMin = settings.reheatGapMin`.
3. `result = planBake(input, mode === 'backward' ? { mode, readyAt, now } : { mode: 'forward', startAt: now, now })`.
4. `warnings = [...result.plan.warnings, ...quietHoursWarnings(plan, settings.quiet, zone), ...dstWarnings(plan, zone)]`, plus the UI-derived overlaps (§0.3).
5. `choices = chooseDurations(steps, durations)` per item, for the slider and tag state.
6. Cost per item: `costBreakdown` on `scaleLines({ by: 'loaves', fromLoaves: yieldLoaves, toLoaves: loaves })` with the current pantry (the same values the snapshot will store).

**Smart default ready time** (flows §5.1): the local time of day of the most recent bake's `requested_ready_at` (else 10:00), on the earliest date where the plan fits after `now`. It's computed once when the draft is created and isn't recomputed on later changes.

### 3.2 Layout (top to bottom)
Header:
- iOS: back chevron (to `SCHED-PICK`), title "Plan bake", trailing "Cancel" (closes the whole modal, with the discard confirm when `touched`).
- Android: back arrow (to `SCHED-PICK`), title "Plan bake". Closing the whole modal is back twice, or X on `SCHED-PICK`.

Content (a FlashList whose header holds items 1 to 6, with the timeline rows as list items):

1. **Recipe block.**
   - **Single recipe:**
     - `name` in `title2` (wraps fully).
     - `Stepper` "Loaves" (1 to 50).
     - `footnote textSecondary`: `plan.doughWeightNote` ("Uses the recipe's dough weight (985 g per loaf).").
     - Cost line (`footnote`): `plan.cost` ("Cost $2.78 · $1.39 per loaf"). When incomplete: `plan.costPartial` + `StatusTag unpriced` "Cost incomplete". When nothing is priced: hidden.
   - **Multi-recipe:** see §4.2.
2. **Mode**: `SegmentedControl` "Ready at" | "Start now". Default "Ready at".
3. **When.**
   - "Ready at": a `DateTimeField` labelled "Ready", value "Sat, Nov 28 · 10:00 AM", hint "in 1 d 13 h". Under it, `footnote textSecondary`: `plan.firstStep` ("First step Fri 3:05 AM: Final starter feeding").
   - "Start now": a read-only block (no picker): "Ready" label, value `title3 numeric` "Sat 4:30 PM", with the footnote `plan.startNow.note` ("Starts as soon as you tap Schedule bake. The ready time updates with the clock.").
4. **Oven capacity** (only when total loaves > 1): `Stepper` "Loaves in the oven at once" (1 to 12, default `settings.ovenCapacity`).
   - Result line (`footnote`):
     - When everything fits: `plan.oven.together` ("All 2 loaves bake together.").
     - Otherwise: `plan.oven.slots` ("2 oven slots, back to back. The last slot comes out ready at 10:00 AM.").
   - `footnote textSecondary`: `plan.oven.default` ("Default from Settings: 2"). Changing this value here doesn't change Settings.
5. **Kitchen temperature**: `ListRow value` "Kitchen temperature" · "Not set" (or "27 °C"). Tapping opens `TEMP-SHEET` (§3.4).
   - When set, and at least one step is temperature-sensitive: `footnote` `plan.temp.effect` ("Bulk ferment 7 h 10 min (was 6 h)"). For multi-recipe: one line per affected item, with a letter badge.
   - When set, and no step is temperature-sensitive: `plan.temp.noEffect`.
6. **Blocking banners, then the warnings summary** (§3.5).
7. **`SectionHeader` "Timeline"** (trailing: `plan.span` "{span} total"), then the timeline (§3.3).
8. **`BottomActionBar`:**
   - Footnote: `plan.bar.summary` ("Starts Fri 3:05 AM · Ready Sat 10:00 AM"). In Start now mode: "Starts now · Ready Sat 4:30 PM".
   - `Button primary lg` "Schedule bake".
   - Disabled when the result is `tooSoon` or `invalid`. The hint is `plan.cantSchedule.tooSoon` or `plan.cantSchedule.invalid`. The banner shows the reason visually.

### 3.3 Timeline (`Timeline` + `TimelineRow`, components §3.20)

Rows come from `result.plan.steps` (already sorted by `startAt`, then position), followed by a `final` row.
- **Day headers:** a sticky header row (`subhead`, `textSecondary`, `surfaceSunken` band) before the first row of each local calendar day ("Friday, November 27"). Within a day, the time column shows only the clock time.
- **Sequential row:** marker (hollow), name (`headline`), meta (`subhead textSecondary`):
  - Range step: "6 h · range 5–8 h".
  - Fixed: "10 min".
  - User-set: "14 h · you chose this · range 12–24 h".
  - Fold step: "4 folds, every 30 min · 2 h". The row has a "Show folds" disclosure that reveals compact `sub` rows: "Fold 1 · 12:05 PM" … "Fold 4 · 1:35 PM". Collapsed by default.
- **Alongside row** (preheat): indented `space.xl`, with the parallel-line icon. Meta: `plan.alongside` ("Alongside Bake, covered · 30 min").
- **Tags row** per §0.3.
- **Range steps** (non-fold, `minMin < maxMin`) have a trailing "Change" text button (min hit `size.touchKitchen`). It expands a `DurationSlider` in place under the row, with `motion.duration.standard` (instant with reduce motion). Only one slider is open at a time; opening another closes the first.
  - Slider: min to max, 5-min snaps, [−15 min] / [+15 min] buttons, a "Default" tick. Under it, the text button `plan.slider.reset` ("Use default (12 h)") when the value differs from the source default.
  - The value shown in the header is the chosen value. Changes recompute live (one recompute per frame). Rows whose times change cross-fade their times (`motion.duration.fast`; instant with reduce motion). Rows never re-order with animation.
  - With a kitchen temperature set and the step temperature-sensitive, the slider starts at the adjusted value. Moving it makes it a user value. The tag changes to `plan.slider.overridesTemp` ("You chose this. Kitchen temperature isn't applied.").
- **Slot headers** (multi-loaf, §4.4): `TimelineRow slotHeader` before the first oven step of each slot.
- **Final row:** "Ready to eat", bold, success marker, with the ready time.

**Worked example (QA cross-check, PRD §5, `America/New_York`):** default template, 1 loaf, ready Sat Nov 28 10:00 AM, quiet hours 22:00 to 06:00.

| Day header | Time | Row | Meta | Tags |
|---|---|---|---|---|
| Friday, November 27 | 3:05 AM | Final starter feeding | 8 h · range 6–10 h [Change] | Quiet hours |
| | 11:05 AM | Mix and rest | 1 h · range 30 min–2 h [Change] | |
| | 12:05 PM | Stretch and folds | 4 folds, every 30 min · 2 h [Show folds] | |
| | 2:05 PM | Bulk ferment | 6 h · range 5–8 h [Change] | |
| | 8:05 PM | Shape | 10 min · range 5–15 min [Change] | |
| | 8:15 PM | Cold ferment (fridge) | 12 h · range 12–24 h [Change] | |
| Saturday, November 28 | 7:45 AM | Preheat oven and Dutch oven (alongside) | Alongside Bake, covered · 30 min | |
| | 8:15 AM | Bake, covered | 30 min · range 25–35 min [Change] | |
| | 8:45 AM | Bake, uncovered | 15 min · range 10–25 min [Change] | |
| | 9:00 AM | Cool | 1 h · range 30 min–2 h [Change] | |
| | 10:00 AM | **Ready to eat** | | |

Header trailing: "30 h 55 min total". Summary card: "1 step needs you during quiet hours (10 PM–6 AM)." With Cold ferment set to 18 h, the feeding moves to Thu 9:05 PM and the quiet-hours line disappears.

### 3.4 Sheets and pickers on this screen

**`READY-PICKER`** (`DateTimeField`, components §3.15): minimum = today, maximum = today + 90 days, 5-minute interval, the locale's 12/24 h format.
- When `localToUtc` returns `shiftedForward`: the helper under the field reads `plan.ready.gap` ("2:30 AM doesn't exist on Sun, Mar 8 because clocks spring forward. Using 3:30 AM.").
- When it returns `ambiguousEarlier`: `plan.ready.repeat` ("1:30 AM happens twice on Sun, Nov 1. Using the first one, before clocks go back.").
- Both are `info` helper text with an icon. They aren't errors.

**`TEMP-SHEET`:**
- iOS form sheet (medium detent); Android modal bottom sheet.
- Title "Kitchen temperature". `Stepper` in the Settings unit: 10 to 40 °C or 50 to 104 °F, step 1°.
- Initial value: this draft's value, else the most recent bake's `kitchen_temp_c`, else 21 °C / 70 °F.
- Body `footnote`: `temp.help` ("Warmer kitchens ferment faster. We adjust temperature-sensitive steps, like bulk ferment, and keep them within their range.").
- Live preview line (`callout`): `temp.preview` ("Bulk ferment: 7 h 10 min (recipe 6 h)"). When it would clamp: `temp.previewCapped` ("Bulk ferment: capped at 8 h (would be 10 h 5 min)").
- Buttons:
  - iOS nav bar: "Cancel" | "Set".
  - Android: `Button primary lg fullWidth` "Set temperature".
  - Both platforms: a text button "Clear" when a value is already set (back to "Not set").
- The stepper bounds make an out-of-range value impossible. The DB CHECK (10 to 40 °C) is the backstop. °F values are converted to °C with core `fahrenheitToCelsius` and stored unrounded. Display rounds to whole degrees.

**`RECIPE-ADD-SHEET`** (multi-recipe "Add recipe", §4.2): the `SCHED-PICK` single-mode list inside a `Sheet`. Recipes already in the bake are hidden. Not-schedulable recipes behave as in §2.3. Tapping one appends it as the next letter with `loaves = yieldLoaves` and closes the sheet.

### 3.5 Warnings presentation

**A. Blocking banners** (above the summary card, in this order):

1. **Too soon** (`status: 'tooSoon'`, "Ready at" mode only):
   - The ready-time field is in its error state (`danger` text and icon).
   - `Banner danger`: `plan.tooSoon` ("Too soon. This bake needs {span}. The earliest it can be ready is {dayTime}.").
   - Actions:
     - [`plan.tooSoon.use`] "Use {dayTime}": sets `readyLocal` to `earliestReadyAt`.
     - [`plan.tooSoon.shortest`] "Use shortest times": only shown when re-planning with every range slider at `minMin` fits the **requested** time (ADR 0010 §6). It sets those overrides and keeps the requested ready time.
   - The timeline below shows the plan at `earliestReadyAt` (core returns it), with a `footnote` above the timeline: `plan.tooSoon.preview` ("Showing times for the earliest ready time.").
   - Schedule is disabled. Tapping it anyway gives `haptic.warning`, and focus moves to the banner.
2. **Invalid** (`status: 'invalid'`): one `Banner danger` per failing recipe: `plan.invalid` ("{recipe} can't be scheduled: {reason}"), with [Edit recipe]. Reasons come from §3.9. For `noOvenPhase` there's a second action [`plan.invalid.capacity`] "Bake all {total} together", which sets oven capacity to the total loaf count (if it's 12 or less).

**B. Warnings summary card** (only when at least one non-blocking warning applies):
- A `Card` on `surfaceSunken` with no elevation, title `plan.warn.title` ("Worth a look"), and one line per warning type, each with its icon (same icons as the `StatusTag` variants) and text (`callout`).
- Each line is a button (min `size.touchMin`). It scrolls to the first affected row and briefly highlights it (an `accentContainer` background for `motion.duration.emphasized`; with reduce motion, no fade: the highlight stays until scroll ends). It then moves accessibility focus to that row.

| Type | Line |
|---|---|
| Quiet hours | `plan.quiet.summary` + second line `plan.quiet.hint` ("A longer cold ferment moves earlier steps earlier.") |
| Simultaneous steps | `plan.overlap.summary` |
| DST | `plan.dst.summary` |
| Temperature clamped | `plan.tempCold.summary` or `plan.tempWarm.summary` |
| Hold exceeds range | `plan.hold.summary` |
| iOS reminder budget | `plan.budget.summary` |

The card is not dismissible. It updates live as the plan changes. When the last warning resolves, it collapses (`motion.duration.standard`; instant with reduce motion) and `plan.warn.cleared` ("No more warnings.") is announced.

### 3.6 Interactions
- **Loaves / oven capacity steppers:** `haptic.selection`, instant recompute. The oven row appears or disappears when the total crosses 1 (`standard` expand).
- **Mode segmented:** `haptic.selection`. Switching to "Start now" keeps the sliders and temperature, and the ready time becomes computed. Switching back restores the last picked `readyLocal`, or the smart default if none was picked.
- **Too-soon actions:** described in §3.5. After "Use {dayTime}", the announcement is "Ready time set to Saturday 4:30 PM".
- **Schedule bake:**
  1. Re-run the preview with `now = clock.now()`. If it's now `tooSoon` (the clock passed the start while the user was reading), don't save: show the too-soon banner and give `haptic.warning`.
  2. `bakeService.create(draft, plan)` writes, in one transaction: `bake` (status `scheduled`, or `active` in Start now mode, `mode`, `requested_ready_at`, `original_ready_at`, `planned_ready_at`, `time_zone`, `kitchen_temp_c`, `oven_capacity`, `reheat_gap_min`, `heads_up_min` from settings, `currency_code`, `oven_slots_json`), `bake_item` rows with recipe and cost snapshots (ADR 0014), and the `bake_step` rows. In Start now mode, it also records `stepStarted` for the first step at the same `now`.
  3. `haptic.success`. The `Button` shows its loading state only if the write takes 300 ms or more.
  4. Reconcile notifications (`diff`).
  5. Navigate per the permission state:

| Notification permission | Android exact alarm | Next |
|---|---|---|
| undetermined | any | `PERM-NOTIF` |
| granted | denied and the primer was never shown | `PERM-ALARM` |
| granted | granted / not applicable / primer already shown | `BAKE-LIVE` |
| denied | any | `BAKE-LIVE` (banner there) |

  6. Write failure: `Snackbar` `plan.saveFailed` [Retry]. Stay on the screen, with the draft intact.
- **Cancel / close with `touched`:** iOS action sheet, Android dialog: `plan.discard.title` [`plan.discard.confirm`] (destructive) [`plan.discard.keep`].
- **Keyboard:** none on this screen (pickers and steppers only).

### 3.7 States
| State | Treatment |
|---|---|
| Loading (recipe read) | Skeleton: title bar, a segmented-control block, a field block, 6 timeline row skeletons |
| Default (fits, no warnings) | No banner, no summary card. Schedule enabled |
| Too soon | §3.5 A1 |
| Invalid | §3.5 A2 |
| Quiet hours / overlap / DST / clamped / hold / budget | Row tags + summary card (§3.5 B) |
| Start now | §3.2 item 3. The ready time ticks with `useNow(30 s)`. Too soon never applies |
| Temperature set, no sensitive steps | `plan.temp.noEffect` under the row |
| All steps fixed (no ranges) | No "Change" buttons. Nothing else changes |
| Recipe deleted while planning | On Schedule, the snapshot is built from the draft's loaded recipe. If the recipe is gone (`recipes.detail` returns not found), `Banner danger` `plan.recipeGone` [Back to recipes] and Schedule disabled |
| Clock passes the first step while open | The next 30 s tick turns the plan into `tooSoon` (Ready at mode). The banner appears with `role="alert"` |
| Long recipe names | `title2` wraps fully. Timeline rows: 2 lines + ellipsis, full name in the label |
| Very long bake (over 48 h) | Spans show as `2 d 6 h`. Day headers make the days obvious |
| Large text | Time column above the name. Steppers stack their label above the control. The summary-card lines wrap. The bar footnote wraps to 2 lines |
| Landscape / tablet | Single column at `layout.maxContentWidth`. The BottomActionBar spans the content width |

### 3.8 Copy
| Key | String |
|---|---|
| `plan.title` | Plan bake |
| `plan.loaves` | Loaves |
| `plan.doughWeightNote` | Uses the recipe's dough weight ({weight} per loaf). |
| `plan.cost` | Cost {batch} · {perLoaf} per loaf |
| `plan.costPartial` | Cost so far {batch} |
| `plan.costIncomplete` | Cost incomplete |
| `plan.mode.readyAt` | Ready at |
| `plan.mode.startNow` | Start now |
| `plan.ready` | Ready |
| `plan.ready.in` | in {duration} |
| `plan.firstStep` | First step {dayTime}: {step} |
| `plan.startNow.note` | Starts as soon as you tap Schedule bake. The ready time updates with the clock. |
| `plan.ready.gap` | {time} doesn't exist on {date} because clocks spring forward. Using {adjustedTime}. |
| `plan.ready.repeat` | {time} happens twice on {date}. Using the first one, before clocks go back. |
| `plan.oven` | Loaves in the oven at once |
| `plan.oven.together` | {loaves, plural, one {The loaf bakes on its own.} other {All # loaves bake together.}} |
| `plan.oven.slots` | {slots} oven slots, back to back. The last slot comes out ready at {time}. |
| `plan.oven.default` | Default from Settings: {capacity} |
| `plan.temp` | Kitchen temperature |
| `plan.temp.notSet` | Not set |
| `plan.temp.effect` | {step} {duration} (was {recipeDuration}) |
| `plan.temp.noEffect` | No steps in this recipe change with temperature. |
| `temp.title` | Kitchen temperature |
| `temp.help` | Warmer kitchens ferment faster. We adjust temperature-sensitive steps, like bulk ferment, and keep them within their range. |
| `temp.preview` | {step}: {duration} (recipe {recipeDuration}) |
| `temp.previewCapped` | {step}: capped at {duration} (would be {rawDuration}) |
| `temp.set` | Set |
| `temp.setAndroid` | Set temperature |
| `temp.clear` | Clear |
| `plan.timeline` | Timeline |
| `plan.span` | {span} total |
| `plan.meta.range` | {duration} · range {min}–{max} |
| `plan.meta.fixed` | {duration} |
| `plan.meta.user` | {duration} · you chose this · range {min}–{max} |
| `plan.meta.folds` | {count} folds, every {interval} · {duration} |
| `plan.showFolds` | Show folds |
| `plan.hideFolds` | Hide folds |
| `plan.fold` | Fold {n} |
| `plan.alongside` | Alongside {anchor} · {duration} |
| `plan.change` | Change |
| `plan.slider.reset` | Use default ({duration}) |
| `plan.slider.overridesTemp` | You chose this. Kitchen temperature isn't applied. |
| `plan.readyToEat` | Ready to eat |
| `tag.quietHours` | Quiet hours |
| `tag.overlap` | Same time as {letter}: {step} |
| `tag.dstBack` | Clocks go back {duration} |
| `tag.dstForward` | Clocks go forward {duration} |
| `tag.adjusted` | Adjusted for {temp}, was {duration} |
| `tag.capped` | Capped at {duration} for {temp} |
| `tag.hold` | Fridge {effective}, max {max} |
| `tag.noReminder` | No reminder |
| `plan.tooSoon` | Too soon. This bake needs {span}. The earliest it can be ready is {dayTime}. |
| `plan.tooSoon.use` | Use {dayTime} |
| `plan.tooSoon.shortest` | Use shortest times |
| `plan.tooSoon.preview` | Showing times for the earliest ready time. |
| `plan.invalid` | {recipe} can't be scheduled: {reason} |
| `plan.invalid.capacity` | Bake all {total} together |
| `plan.warn.title` | Worth a look |
| `plan.warn.cleared` | No more warnings. |
| `plan.quiet.summary` | {count, plural, one {# step needs you} other {# steps need you}} during quiet hours ({from}–{to}). |
| `plan.quiet.hint` | A longer cold ferment moves earlier steps earlier. |
| `plan.overlap.summary` | {count, plural, one {# pair of steps happens} other {# pairs of steps happen}} at the same time. |
| `plan.dst.summary` | Clocks change on {date}. The times shown already allow for it, and every step still runs its full length. |
| `plan.tempCold.summary` | Kitchen is cold: {step} capped at {duration}. Watch the dough; it may need longer. |
| `plan.tempWarm.summary` | Kitchen is warm: {step} capped at {duration}. Watch the dough; it may be ready sooner. |
| `plan.hold.summary` | Loaves in slot {slot} stay in the fridge {effective}, longer than the {max} maximum. |
| `plan.budget.summary` | With this bake you'll have more reminders than iPhone allows at once. Open the app at least once a day so later ones get set. |
| `plan.bar.summary` | Starts {dayTime} · Ready {readyDayTime} |
| `plan.bar.summaryNow` | Starts now · Ready {readyDayTime} |
| `plan.schedule` | Schedule bake |
| `plan.cantSchedule.tooSoon` | Pick a ready time that fits first. |
| `plan.cantSchedule.invalid` | Fix the recipe first. |
| `plan.saveFailed` | Couldn't save the bake. Try again. |
| `plan.recipeGone` | This recipe was deleted. |
| `plan.backToRecipes` | Back to recipes |
| `plan.discard.title` | Discard this plan? |
| `plan.discard.confirm` | Discard |
| `plan.discard.keep` | Keep planning |

### 3.9 Validation reasons (`StepValidationError` → `{reason}`)
| Code | Reason string (`plan.reason.*`) |
|---|---|
| `emptyRecipe` | It has no steps. |
| `noSequentialSteps` | It only has steps that run alongside others. |
| `rangeInvalid` | {step} has a default outside its range. |
| `foldDurationMismatch` | {step}'s folds don't add up to its length. |
| `anchorMissing` | {step} runs alongside a step that no longer exists. |
| `alongsideChain` | {step} runs alongside another alongside step. |
| `ovenPhaseNotContiguous` | Its bake steps aren't next to each other. |
| `noOvenPhase` | It needs a step of type Bake to share the oven over several rounds. |
| `overrideOutOfRange` | A chosen time is outside {step}'s range. (Can't happen from the slider; shown for corrupted drafts.) |

### 3.10 Accessibility
- Focus order: title, recipe block, mode, ready field, oven, temperature, banners, summary card, timeline, Schedule.
- Ready field: "Ready time, Saturday November 28, 10:00 AM, in 1 day 13 hours". Hint "Opens date and time picker". In error: "Ready time, error: too soon".
- Steppers and sliders are `adjustable` (components §1.4 rule 9). The slider value is "14 hours, range 12 to 24 hours, default 12 hours".
- Timeline rows are one stop each: "Friday 3:05 AM. Final starter feeding. 8 hours, range 6 to 10 hours. During quiet hours." Rows with "Change" expose the action "Change duration" and the `expanded` state. Fold rows expose "Show folds".
- After any change that moves the ready time or the first step, announce once (debounced 1 s after the last change): `plan.announce` ("First step {dayTime}. Ready {readyDayTime}.").
- The too-soon banner is `role="alert"` on first appearance. Its actions are focusable buttons.
- The summary-card lines are buttons with the hint "Shows the step".
- Day headers have `role="header"`, so heading navigation jumps day to day.

### 3.11 Platform
- Ready picker: iOS sheet with an inline calendar plus time wheels and "Done". Android M3 `DatePickerDialog` then `TimePickerDialog` (flows §5.2).
- Discard confirm: iOS action sheet from "Cancel"; Android dialog from back or X on `SCHED-PICK`.
- iOS: the modal is `isModalInPresentation` while `touched`, so swipe-to-dismiss is blocked and "Cancel" asks.
- Android: predictive back from `SCHED-PLAN` previews `SCHED-PICK` (draft kept, no confirm). From `SCHED-PICK` with a touched draft, back asks.

---

## 4. Multi-recipe presentation (S-12; used on `SCHED-PLAN`, `BAKES-HOME`, `BAKE-LIVE`, `BAKE-TIMELINE`)

ADR 0009 is **PROVISIONAL** (Chris Q8: which slot finishes at the ready time, and the reheat gap). Everything here works with either answer. Only the `plan.oven.slots` wording changes (§12 Q-C1).

### 4.1 Identity rules
- Item order = selection order. Letters A, B, C, D, with `seriesA..D` colors. **Max 4 recipes per bake**, so letters and colors never repeat within a bake.
- **Never color alone:** a letter badge always sits next to the recipe name, and every row's label names the recipe.
- Format in rows: `[A] Shape` with the meta prefixed by the recipe name in `subhead textSecondary` ("Country loaf · 10 min"). In 1-item bakes there are no badges or recipe prefixes.
- Bake-wide steps (`itemId = null`: merged preheat, reheat) get an oven icon instead of a letter and the prefix "Oven".

### 4.2 `SCHED-PLAN` recipe block (multi)
- A `SectionHeader` "Recipes" with trailing text `plan.multi.total` ("3 loaves").
- One `ListRow` per item: leading letter badge, title = recipe name, subtitle = cost line (§3.2), a `Stepper` "Loaves" on its own line under the title (the kitchen-size stepper doesn't fit beside a 2-line name on phones), overflow `IconButton` with "Move up", "Move down" (changes the letter and the slot fill order) and "Remove".
- Removing the second-to-last item turns the bake into a single-recipe plan (the badges disappear). Removing is undoable through `Snackbar` `plan.multi.removed` [Undo].
- After the last row: "Add recipe" (text-button row with a leading `add` icon). It opens `RECIPE-ADD-SHEET`, and it's hidden at 4 items.
- The dough-weight note shows once under the list: `plan.doughWeightNoteMulti` ("Each recipe uses its own dough weight.").
- Kitchen temperature applies to all items (one value per bake, `bake.kitchen_temp_c`).

### 4.3 Merged timeline
- One timeline with all items' steps sorted by `startAt` (core order).
- Rows carry the letter badge + recipe prefix (§4.1). Sliders are per item and per step.
- Overlap tags name the other item: "Same time as B: Shape".
- **Slot headers** (`TimelineRow slotHeader`, when the bake has more than one slot, or more than one item):
  - Text: `plan.slot.header` ("Oven slot 1 · A ×2, B ×1 · 8:15 AM").
  - Per-slot oven and tail steps sit under their slot header with meta `plan.slot.meta` ("Slot 2 · 1 loaf").
  - The UI composes the slot label from `slotIndex` and `loaves`. Core's `PlannedStep.name` stays the plain step name (§12 Q-A5).
- The merged preheat appears once, before slot 1, labelled "Oven · Preheat oven and Dutch oven".
- With a reheat gap (if Chris sets one): a "Reheat oven" pseudo-row between slots, with the oven icon.
- Hold-exceeds-range tags appear on the hold step of items that span slots (§0.3).

### 4.4 Single recipe with more loaves than the oven holds
Same slot headers and meta, but no letters: "Oven slot 1 · 2 loaves · 8:15 AM", "Oven slot 2 · 1 loaf · 9:00 AM". The plan view is the same code path (ADR 0009).

### 4.5 Home and live
- Home card: badges + names on the top row ("A Country loaf · B Whole wheat"). If they don't fit in 2 lines: "A Country loaf + 2 more", with the full list in the label.
- Live: one `CurrentStepPanel` per item with a current step (§8.3). Each hero button's accessible label includes the recipe: "Done, start Shape for Country loaf".

### 4.6 Copy
| Key | String |
|---|---|
| `plan.multi.recipes` | Recipes |
| `plan.multi.total` | {loaves, plural, one {# loaf} other {# loaves}} |
| `plan.multi.add` | Add recipe |
| `plan.multi.moveUp` | Move up |
| `plan.multi.moveDown` | Move down |
| `plan.multi.remove` | Remove |
| `plan.multi.removed` | {recipe} removed. |
| `plan.doughWeightNoteMulti` | Each recipe uses its own dough weight. |
| `plan.slot.header` | Oven slot {n} · {contents} · {time} |
| `plan.slot.contentsItem` | {letter} ×{loaves} |
| `plan.slot.contentsSingle` | {loaves, plural, one {# loaf} other {# loaves}} |
| `plan.slot.meta` | Slot {n} · {loaves, plural, one {# loaf} other {# loaves}} |
| `plan.oven.prefix` | Oven |
| `plan.reheat` | Reheat oven |
| `home.card.moreRecipes` | {first} + {count} more |

### 4.7 Accessibility
- Letter badges are hidden. Labels use names: "Country loaf: Shape. Starts Friday 8:05 PM. 10 minutes. Same time as Whole wheat: Mix and rest."
- Slot headers: `role="header"`, "Oven slot 1, 2 Country loaf and 1 Whole wheat, 8:15 AM".
- Item reordering announces "Whole wheat is now recipe A".

---

## 5. `PERM-NOTIF` (notification primer)

**Purpose.** Explain the value of reminders, then show the system prompt once. Shown after the bake is saved, so the bake is never lost if the user leaves here.
**Entry points.** `SCHED-PLAN` "Schedule bake" when the notification permission is `undetermined` (§3.6). Onboarding has its own primer route (DS-04) using the same `PermissionPrimer` component and copy.

### 5.1 Layout (top to bottom; `PermissionPrimer`, components §3.30)
1. Header: no back button (the bake is already saved).
   - iOS: no nav bar title, and the sheet's swipe-down acts as "Not now".
   - Android: no top app bar. System back acts as "Not now".
2. `Banner success` (compact, no actions): `perm.scheduled` ("Bake scheduled. First step {dayTime}.").
3. Illustration (decorative), `space.xxl` above and below.
4. Title `perm.notif.title` (`title1`, `role="header"`).
5. Body `perm.notif.body` (`body`).
6. Benefit list (3 rows, icon `iconMd` + `body`): `perm.notif.b1`, `perm.notif.b2`, `perm.notif.b3`.
7. `BottomActionBar`: `Button primary lg` `perm.notif.allow`, then `Button text lg` `perm.notif.later` under it (`space.sm` gap).

### 5.2 Behavior
- "Turn on reminders" calls `requestPermissionsAsync` (iOS `allowAlert`, `allowSound`; Android `POST_NOTIFICATIONS` on API 33+). Then:
  - Granted: `reconcile({ mode: 'rebuild' })`. On Android with exact alarms denied: push `PERM-ALARM`. Otherwise: dismiss the modal and open `BAKE-LIVE`, with `Snackbar` `reminders.on`.
  - Denied: dismiss and open `BAKE-LIVE`, which shows `banner.notifOff`.
- "Not now": dismiss and open `BAKE-LIVE` (banner shows). The system prompt is **never** triggered by "Not now" (components §3.30).
- Android 12 (API 31–32) has no runtime notification permission. The status is `granted`, so this screen is skipped.

### 5.3 States
| State | Treatment |
|---|---|
| Default | As above |
| Prompt in progress | The primary button shows its loading state and isn't pressable (prevents double prompts) |
| Large text | Illustration hides at `fontScale >= 1.5`. Content scrolls. The bar stays pinned |
| Landscape | Illustration hides. Single column at `layout.maxContentWidth` |

### 5.4 Copy
DS-01 flows §5.4 keys are final, plus:

| Key | String |
|---|---|
| `perm.scheduled` | Bake scheduled. First step {dayTime}. |
| `perm.notif.title` | Get a reminder for every step |
| `perm.notif.body` | Sourdough reminds you when it's time to feed, fold, shape and bake, even overnight and with the app closed. |
| `perm.notif.b1` | Feed, fold and shape reminders |
| `perm.notif.b2` | Works overnight and when the app is closed |
| `perm.notif.b3` | A heads-up a few minutes before each step |
| `perm.notif.allow` | Turn on reminders |
| `perm.notif.later` | Not now |
| `reminders.on` | Reminders on. |

### 5.5 Accessibility
- Focus starts on the success banner text, then the title.
- The benefit list is a `list`. Its icons are decorative.

---

## 6. `PERM-ALARM` (Android 12+ only)

**Purpose.** Explain why "Alarms & reminders" access matters, then open the system page for it.
**Entry points.** After `PERM-NOTIF` grants, or straight from "Schedule bake" when notifications are already granted, exact alarms are denied, and this primer has never been shown (`usePermissions.alarmPrimerShownAt` is null).

### 6.1 Layout
Same `PermissionPrimer` structure:
- `perm.scheduled` banner (only if `PERM-NOTIF` wasn't just shown).
- Illustration (an alarm clock over a loaf).
- `perm.alarm.title`, `perm.alarm.body`.
- One explanatory `footnote`: `perm.alarm.how` ("On the next screen, turn on Allow setting alarms and reminders, then come back.").
- Bar: primary `perm.alarm.allow`, text `perm.alarm.later`.

### 6.2 Behavior
- "Allow on-time reminders" calls `requestExactAlarmPermissionsAsync()`, which opens the system "Alarms & reminders" page for the app. Set `alarmPrimerShownAt`.
- On return (`AppState → active`): re-check. Granted: `reconcile({ mode: 'rebuild' })`, then `Snackbar` `reminders.onTime`. Either way, dismiss and open `BAKE-LIVE`. If still denied, `banner.alarmOff` shows there.
- "Not now": set `alarmPrimerShownAt`, then dismiss and open `BAKE-LIVE`. From now on, only the banner asks.

### 6.3 Copy
| Key | String |
|---|---|
| `perm.alarm.title` | Allow on-time reminders |
| `perm.alarm.body` | Android can delay reminders to save battery. Allowing alarms and reminders means each step alerts you within a minute. |
| `perm.alarm.how` | On the next screen, turn on Allow setting alarms and reminders, then come back. |
| `perm.alarm.allow` | Allow on-time reminders |
| `perm.alarm.later` | Not now |
| `reminders.onTime` | On-time reminders on. |

The system wording ("Alarms & reminders", "Allow setting alarms and reminders") is quoted from Android settings. Re-check it on each target API level (AN-01) and localize it to match the system's translation.

---

## 7. Reminder banners (`BAKES-HOME` and `BAKE-LIVE`)

Component: `Banner` (components §3.23). On `BAKE-LIVE`, action buttons are `size.touchKitchen`. Rules in §0.4.

| Key | Variant | Message | Actions | Action behavior |
|---|---|---|---|---|
| `banner.notifOff` | warning (`bell.slash` / `notifications_off`) | Reminders are off. You won't be alerted when a step starts. | [Turn on] [X] | Undetermined: system prompt. Denied: `Linking.openSettings()`. On return, re-check (§0.4 rule 4) |
| `banner.alarmOff` | warning (`alarm` icon) | Reminders may be late. Allow on-time reminders. | [Allow] [X] | `requestExactAlarmPermissionsAsync()`, re-check on return, `rebuild` |
| `banner.notifFailed` | warning | Some reminders couldn't be set. | [Try again] | `reconcile({ mode: 'rebuild' })`. Success: banner hides, `Snackbar` "Reminders set." Failure: banner stays, with `banner.notifFailed.again` |
| `banner.notifFailed.again` | warning | Reminders still couldn't be set. Restart your phone, then open the app again. | [Try again] | same |
| `banner.budget` | info | You have a lot of reminders coming up. Open the app at least once a day so later ones get set. | [X] | Dismiss until the next bake is created |

Copy keys:

| Key | String |
|---|---|
| `banner.notifOff.action` | Turn on |
| `banner.alarmOff.action` | Allow |
| `banner.notifFailed.action` | Try again |
| `banner.dismiss` | Dismiss |
| `reminders.set` | Reminders set. |

Accessibility: `role="alert"` only on first appearance (components §3.23). The dismiss button's label is "Dismiss reminders warning".

---

## 8. `BAKE-LIVE`

**Purpose.** A hands-free, glanceable view of the bake: what to do now, how long is left, what's next, and a single large tap to say it's done. M5 target: a full real bake with the app alone.
**Entry points.** `BAKES-HOME` card; after scheduling; notification tap (`?step=`); `OtherBakeChip`.

### 8.1 Data and derivation
- `qk.bakes.detail(id)`: `bake`, `bake_item`s (snapshots), `bake_step`s → `BakePlan` + `StepProgress[]` (`mappers/bakePlan.ts`).
- `useNow(1 s)`. Only the countdown subtree re-renders each second (architecture §12).
- **Current step per item** (`deriveLiveState`):
  1. If a sequential step has status `active`, it's current.
  2. Otherwise, the first sequential step with status `pending` whose `plannedStart ≤ now` is current, treated as started at its planned time (§12 Q-A4: whether the service writes this).
  3. Otherwise, if no step of the item has started: the item is **waiting**, and the countdown runs to its first planned start.
  4. If every sequential step is done, the item is **done**.
- **Overtime:** `now > plannedEnd` of the current step. For a fold step, overtime is measured against the next fold's time (§8.4).
- **Final step:** the item's last sequential step (Cool). When it passes its planned end, the item is **ready** (not "overtime": the bread is just ready).
- **Alongside "Also now":** alongside steps (and the bake-wide preheat) with `plannedStart ≤ now`, not done, and whose anchor step hasn't started yet.
- **Next:** the next step start after `now` across the item (sequential or alongside).
- **Ready-time change** per item: `deltaFromPlan = plannedReadyAt − reference`, where `reference = requested_ready_at` (backward) or `original_ready_at` (forward). For multi-item bakes it's computed per item from the item's final step end and its original end.
- **Hold:** `holdCapacity(plan, itemId)` (core §5.6).

### 8.2 Layout, portrait, one item in progress (top to bottom)
**Header** (it's a `fullScreenModal`, so the close control is explicit):
- iOS: leading `IconButton` `chevron.down` (label "Back to bakes", `size.touchKitchen` hit). Title = the recipe name (inline, truncates; the panel holds the full step name). Trailing: `KeepAwakeToggle` (`sun.max`), then overflow `ellipsis.circle`.
- Android: top app bar with navigation icon `arrow_back` ("Back to bakes"), title = recipe name, actions: keep-awake toggle (`light_mode`), overflow (`more_vert`). System back and predictive back close the view.
- Header icons use `size.iconLg` in a `size.touchKitchen` hit area.

**Content** (a scroll view; `layout.screenMargin` side padding, `space.lg` between blocks):
1. **`OtherBakeChip`** (only when another bake is active or upcoming within 1 h): "Other bake: Whole wheat · Shape in 42 min". With 2 or more other bakes: "2 other bakes · next: Shape in 42 min", which opens `OTHER-BAKES-SHEET`.
2. **Reminder banners** (§7).
3. **Ready-time card** (§8.6), when `|deltaFromPlan| ≥ 5 min` and not dismissed for this value.
4. **Oven conflict banner** (§8.6), when the recompute returned `ovenConflict`.
5. **`CurrentStepPanel`** (components §3.19):
   - "Now" `caption` with an icon, and the step position `caption textSecondary`: `live.stepOf` ("Step 4 of 10").
   - Step name `title1` (wraps fully, never truncated).
   - Countdown `timerHero numeric` (§0.2). Overtime: "+12:30 over" in `warning` with the clock-alert icon, and the panel border becomes `size.focusRingWidth` `warning`.
   - `body textSecondary`: `live.until` ("until Shape · 8:05 PM").
   - Tags: temperature adjusted ("Adjusted for 27 °C"), duration out of range, quiet hours (if the *next* start is in quiet hours: "Next step during quiet hours").
   - In overtime of 15 min or more: `Button text lg` `live.finishedEarlier` ("Finished earlier? Set the time"). It opens `STEP-ACTIONS` focused on "Finished at" (§9.3).
6. **Secondary actions row** (`space.sm` gap, each `Button outline lg`; they stack at large text):
   - "+15 min" (not shown for fold steps or the final step).
   - "Ingredients" (opens `BAKE-INGREDIENTS`). For `feed` and `mix` steps it comes first, as `tonal`, because that's when you weigh.
7. **"Also now"** (`SectionHeader`, only when non-empty). One row per alongside step: name, "{n} min left" / "Ends at 8:15 AM", and a trailing `Button tonal lg` "Done" (min `size.touchKitchen`, checkbox-style with a `check` icon after it's tapped).
8. **"Coming up"** (`SectionHeader`): the next 3 rows from the timeline (`TimelineRow` compact, clock times, quiet-hours tags), then a `ListRow navigation` "Full timeline" → `BAKE-TIMELINE`.
9. Bottom padding = pinned bar height + `space.lg`.

**Pinned primary (single item in progress):** a `BottomActionBar` with `Button primary hero fullWidth` (components §3.2):
- Running: `live.done` ("Done, start {next}"). For the final step: `live.doneFinal` ("Done, finish bake").
- Folds: §8.4.
- Waiting: `Button tonal lg fullWidth` `live.startNow` ("Start {step} now"). Not hero size, so an early start is a deliberate tap.
- Ready (final step ended): `Button primary hero` `live.finish` ("Finish bake").
- Complete: `Button primary lg` "Back to bakes".
- The undo `Snackbar` sits **above** the bar, never over it.
- The hero is pinned for a single item so the Done target is always in the same place, at every text size.

### 8.3 Layout, more than one item in progress (multi-recipe)
- One `CurrentStepPanel` per item that is running, waiting or ready, in **stable item order (A, B, C, D)**. They never re-sort while the view is open, so a button can't move under a finger.
- With 2 or more panels, each uses the `compact` density: step name `title2`, countdown `timerLarge` (`timerHero` is for a single panel), the letter badge + recipe name above the step name.
- Each panel is followed directly by **its own** `Button primary hero fullWidth` (inline, not pinned), whose visible label includes the letter ("A · Done, start Shape") and whose accessible label includes the recipe name (§4.5). There's `space.xxl` between one item's button and the next panel, so two hero buttons are never adjacent.
- "+15 min" and "Ingredients" sit in each panel's secondary row (scoped to that item).
- "Also now" and "Coming up" are merged across items, with letter badges.
- Items that are done collapse to one row: "B · Whole wheat: done 9:40 AM" with a `success` check.

### 8.4 Folds
For a current step with `folds` (`foldsDone` = completed folds, `n = foldsDone + 1`):
- Panel line under the name: `live.fold.progress` ("Fold 2 of 4 · next at 12:35 PM").
- Countdown to fold n's time (`plannedStart + (n − 1) × interval`, re-anchored after each `foldDone`, ADR 0010 §7). At or after fold n's time: the countdown shows "Fold now" in `title2`. Overtime styling starts 5 min after the fold time.
- Hero: `live.fold.done` ("Fold {n} of {count} done") → `foldDone { key, foldIndex: n, at: now }`. Snackbar `live.fold.snack` ("Fold 2 done. Next fold at 1:05 PM.") [Undo].
- After the last fold ("Fold 4 of 4 done"), the step continues for one interval (the rest), and the hero becomes `live.done` ("Done, start Bulk ferment") with the countdown to the step end.
- During folds, a secondary `Button text lg` `live.fold.skipToNext` ("Start {next} now") sends `stepDone` on the folds step, ending it early (ADR 0010 §7). Remaining folds are dropped. Undo is available.
- "+15 min" is hidden for fold steps (the interval is fixed).

### 8.5 Overflow menu
| Item | Behavior |
|---|---|
| Full timeline | Push `BAKE-TIMELINE` |
| Ingredients and cost | Open `BAKE-INGREDIENTS` |
| Keep screen on (toggle row, same state as the header icon) | Discoverability fallback (components §3.31) |
| Finish bake | Native confirm: `live.finishConfirm.title` / body, [Finish] [Keep baking]. Completes the bake, cancels its notifications, closes to `BAKES-HOME` with `home.finished.snack` [Undo] |
| Cancel bake (destructive, last, separated) | Native confirm: `live.cancel.title`, `live.cancel.body`, [Cancel bake] (destructive) [Keep baking]. Sets `cancelled`, cancels notifications, closes to `BAKES-HOME`, and shows `Snackbar` `live.cancelled` (no undo) |

### 8.6 Ready-time card, Hold ready time, oven conflict
**Ready-time card** (`Banner info`, or `warning` when the change is 60 min or more):
- Message: `live.readyMoved.later` ("Ready time is now 10:40 AM, 40 min later than planned.") or `live.readyMoved.earlier`.
- Then a second line, from `holdCapacity(plan, itemId)`:

| Case | Second line | Action |
|---|---|---|
| Later, and `canAbsorbLateMin ≥ delta` | `live.hold.shorten` ("Shorten Cold ferment to 17 h 20 min to keep 10:00 AM.") | [Hold ready time] |
| Later, and `0 < canAbsorbLateMin < delta` | `live.hold.partial` ("Cold ferment can only go down to 12 h. That gets it ready at 10:15 AM.") | [Hold ready time] (applies the maximum) |
| Later, and `canAbsorbLateMin = 0` | `live.hold.cant` ("Cold ferment is already at its shortest (12 h), so the ready time can't be held.") | none |
| Earlier, and `canAbsorbEarlyMin ≥ |delta|` | `live.hold.lengthen` ("Lengthen Cold ferment to 12 h 40 min to keep 10:00 AM.") | [Hold ready time] |
| Earlier, partial | `live.hold.partialEarly` ("Cold ferment can only go up to 24 h. That gets it ready at 9:45 AM.") | [Hold ready time] |
| `holdCapacity` is null (the hold step is active or done) | none | none |

- Plus a dismiss (X). Dismissal is stored per `(bakeId, itemId, plannedReadyAt)`, so a new change shows the card again.
- **Hold ready time** sends `extend { key: holdKey, minutes }` with `minutes = −delta`, clamped to the capacity. Snackbar `live.hold.snack` ("Ready time held at 10:00 AM. Cold ferment is now 17 h 20 min.") [Undo]. The card hides once the delta is under 5 min.
- Multi-recipe: one card per affected item, with the letter badge and the recipe name in the message (`live.readyMoved.item`).

**Worked example (QA-05):** default template, ready Sat 10:00, Bulk marked done at 8:45 PM (40 min late). Every later step shifts +40 min (LIV-01), and the card reads "Ready time is now 10:40 AM, 40 min later than planned." The cold ferment is 720 min with a 720 minimum, so the second line is `live.hold.cant`. With Cold ferment set to 18 h at scheduling, the line is `live.hold.shorten` ("Shorten Cold ferment to 17 h 20 min to keep 10:00 AM.").

**Oven conflict** (`ovenConflict` after a recompute): `Banner warning` `live.ovenConflict` ("A's bake now overlaps oven slot 2 (8:45–9:30 AM). Only {capacity} loaves fit at once."). Actions: [Hold ready time] for the shifted item when capacity allows, or [Full timeline]. Nothing moves automatically (ADR 0009 §10).

### 8.7 Interactions
- **Done (hero):** `stepDone { key, at: now }` through `bakeService.applyEvent`, then reconcile.
  - `haptic.success`.
  - Panel transition: the old step cross-fades to the new one over `motion.duration.emphasized` (`easing.standard`). With reduce motion, an instant swap.
  - Snackbar: `live.done.snack` ("Shape done.") when `|deltaMin| < 5`. Otherwise `live.done.snackShift` ("Shape done. Ready time now 10:40 AM (+40 min).") [Undo].
  - Announcement: `live.announce.step` ("Now: Cold ferment. 12 hours.") + the shift sentence when shifted.
  - Reconcile failure: `banner.notifFailed`.
  - Double-tap protection: the hero is disabled for `motion.duration.emphasized` after a tap (busy state), so one knuckle bump can't complete two steps.
- **Start now (waiting):** `stepStarted { key: firstKey, at: now }`. Pure shift earlier: the ready time moves earlier. Snackbar `live.startNow.snack` ("Started early. Ready time now 9:20 AM.") [Undo]. Bake status becomes `active`.
- **+15 min:** `extend { key: current, minutes: 15 }`. `haptic.selection`. Snackbar `live.extend.snack` ("Bulk ferment +15 min. Ready time now 10:15 AM.") [Undo]. When it goes past `maxMin`: a `durationOutOfRange` tag on the panel.
- **Also now Done:** `stepDone` on the alongside key (no shift). The row shows the check and fades out after `motion.duration.emphasized` (instant with reduce motion). Snackbar `live.alongside.snack` ("Preheat done.") [Undo].
- **Out-of-order done:** from `STEP-ACTIONS` on a later step (§9.3). Earlier sequential steps become done (`inferredDone`), and the timeline shows them as "Marked done" without a time.
- **Keep awake:**
  - Default from `settings.keep_awake_default`. Toggling writes the new default (the choice is remembered).
  - `activateKeepAwakeAsync('bake-live')` while the screen is focused and the app is in the foreground. Released on blur, on background, and on completion.
  - The first time it's used, `Snackbar` `live.keepAwake.first`.
- **Overtime begins while visible:** `haptic.warning` once, and the announcement `live.announce.overtime` ("Shape is over time.").
- **`?step=` param:** focus only. If it's the current step: nothing. If it's another item's step: scroll that item's panel into view. If it's an upcoming step: scroll "Coming up" into view and move accessibility focus to it. Unknown ids are ignored.
- **Notifications while the view is open:** shown as banners by the foreground handler (ADR 0011 §4). The view doesn't add a second alert.
- **Rotation:** layout swaps (§8.9). Keep-awake and scroll position are kept.

### 8.8 States
| State | Treatment |
|---|---|
| Loading | Panel skeleton (a name bar, a large timer block), then 3 row skeletons |
| Waiting (scheduled, first step later) | Panel: "Starts in" `caption` instead of "Now", the first step's name, countdown to its start (`1 d 4 h`, `5 h 42 min`, `42:10`), `live.startsAt` ("Starts Fri 3:05 AM"). Bar: "Start {step} now" (tonal). No +15 min |
| Running | §8.2 |
| Overtime | Countdown "+12:30 over" + icon + `warning` border; "Finished earlier?" link from 15 min over |
| Long overtime (overnight; for example "+3 h 10 min over") | Same, and the "Coming up" rows show their **re-planned** times only after Done. Until then they show the stored plan with a `footnote` `live.stale` ("Times below update when you tap Done.") |
| Fold step | §8.4 |
| Final step running (Cool) | Hero "Done, finish bake". No +15 min |
| Ready (final step ended, not tapped) | Panel: success icon, "Ready to eat", `live.readySince` ("Ready since 10:00 AM"). Hero "Finish bake". No overtime styling |
| Complete | Panel: `success` icon (`size.iconHero`), `live.complete.title` ("Ready to eat"), `live.complete.body` ("Started {dayTime} · took {span}"), and the cost line from the snapshot ("Cost {perLoaf} per loaf", or "Cost incomplete"). Bar: "Back to bakes". Keep-awake released. `haptic.success`, plus a celebratory illustration (static with reduce motion) |
| Reminders off / late / failed | Banners (§7) |
| Ready time moved | Card (§8.6) |
| Oven conflict | Banner (§8.6) |
| Multi-recipe | §8.3 |
| Bake cancelled or deleted (opened from a stale notification) | `EmptyState error`: `live.gone.cancelled` or `live.gone.missing`, [Back to bakes] |
| Bake already completed (stale notification) | Complete state, read-only |
| Read error | `EmptyState error`: `live.loadError` [Try again] |
| Step names up to 60 characters | The panel name wraps fully. Rows wrap to 2 lines |
| Very large text (200%) | Panel scrolls with the content. `title1` grows up to 2.0; `timerHero` is capped at 1.3. The pinned hero's label wraps, and the bar grows. The secondary row stacks. The "Coming up" times go above the names |
| Dark mode at 3 AM | Normal dark tokens. No brightness changes (flows §6.3) |

### 8.9 Landscape and wide layouts
Used when `width > height`, or at `width ≥ layout.wideBreakpoint`:
- Two columns with a `space.huge` gap, each column with `layout.screenMargin` outer padding plus the safe-area insets (no content under the camera cutout).
- **Left column** (about 55%): `CurrentStepPanel`, vertically centered. It scrolls only if the content is taller than the column (large text).
- **Right column** (scrolls): hero button (inline at the top of the column, not pinned), secondary actions, "Also now", ready-time card and banners, "Coming up".
- Multi-recipe in landscape: the left column lists the panels (each with its own hero button, §8.3) and scrolls. The right column has the merged "Also now", cards and "Coming up".
- Tablets (600 or more wide, portrait): same two columns, centered at twice `layout.maxContentWidth` max.

### 8.10 Copy
| Key | String |
|---|---|
| `live.back` | Back to bakes |
| `live.keepAwake` | Keep screen on |
| `live.keepAwake.first` | Screen stays on while this bake is open. |
| `live.more` | More options |
| `live.now` | Now |
| `live.startsIn` | Starts in |
| `live.startsAt` | Starts {dayTime} |
| `live.stepOf` | Step {n} of {count} |
| `live.until` | until {next} · {time} |
| `live.untilReady` | until ready · {time} |
| `live.left` | {duration} left |
| `live.over` | +{duration} over |
| `live.nextInQuiet` | Next step during quiet hours |
| `live.longerThanMax` | Longer than the recipe's {max} max |
| `live.shorterThanMin` | Shorter than the recipe's {min} min |
| `live.finishedEarlier` | Finished earlier? Set the time |
| `live.extend` | +15 min |
| `live.ingredients` | Ingredients |
| `live.alsoNow` | Also now |
| `live.alsoNow.left` | {duration} left |
| `live.alsoNow.done` | Done |
| `live.comingUp` | Coming up |
| `live.fullTimeline` | Full timeline |
| `live.stale` | Times below update when you tap Done. |
| `live.done` | Done, start {next} |
| `live.doneFinal` | Done, finish bake |
| `live.done.item` | {letter} · Done, start {next} |
| `live.done.a11y` | Done, start {next} for {recipe} |
| `live.startNow` | Start {step} now |
| `live.finish` | Finish bake |
| `live.fold.progress` | Fold {n} of {count} · next at {time} |
| `live.fold.lastRest` | All folds done · rest until {time} |
| `live.fold.now` | Fold now |
| `live.fold.done` | Fold {n} of {count} done |
| `live.fold.skipToNext` | Start {next} now |
| `live.done.snack` | {step} done. |
| `live.done.snackShift` | {step} done. Ready time now {time} ({delta}). |
| `live.fold.snack` | Fold {n} done. Next fold at {time}. |
| `live.fold.snackLast` | Last fold done. {next} starts at {time}. |
| `live.startNow.snack` | Started early. Ready time now {time}. |
| `live.extend.snack` | {step} +15 min. Ready time now {time}. |
| `live.alongside.snack` | {step} done. |
| `live.readyMoved.later` | Ready time is now {time}, {duration} later than planned. |
| `live.readyMoved.earlier` | Ready time is now {time}, {duration} earlier than planned. |
| `live.readyMoved.item` | {recipe}: ready time is now {time}, {duration} {direction} than planned. |
| `live.hold.action` | Hold ready time |
| `live.hold.shorten` | Shorten {holdStep} to {duration} to keep {time}. |
| `live.hold.lengthen` | Lengthen {holdStep} to {duration} to keep {time}. |
| `live.hold.partial` | {holdStep} can only go down to {min}. That gets it ready at {time}. |
| `live.hold.partialEarly` | {holdStep} can only go up to {max}. That gets it ready at {time}. |
| `live.hold.cant` | {holdStep} is already at its shortest ({min}), so the ready time can't be held. |
| `live.hold.snack` | Ready time held at {time}. {holdStep} is now {duration}. |
| `live.ovenConflict` | {letter}'s bake now overlaps oven slot {slot} ({from}–{to}). Only {capacity, plural, one {# loaf fits} other {# loaves fit}} at once. |
| `live.readySince` | Ready since {time} |
| `live.complete.title` | Ready to eat |
| `live.complete.body` | Started {dayTime} · took {span} |
| `live.complete.cost` | Cost {perLoaf} per loaf |
| `live.complete.back` | Back to bakes |
| `live.itemDone` | {letter} · {recipe}: done {time} |
| `live.other.one` | Other bake: {recipe} · {step} in {duration} |
| `live.other.many` | {count} other bakes · next: {step} in {duration} |
| `live.finishConfirm.title` | Finish this bake? |
| `live.finishConfirm.body` | Any remaining reminders are removed. |
| `live.finishConfirm.confirm` | Finish |
| `live.cancel.title` | Cancel this bake? |
| `live.cancel.body` | Its reminders are removed. This can't be undone. |
| `live.cancel.confirm` | Cancel bake |
| `live.keepBaking` | Keep baking |
| `live.cancelled` | Bake cancelled. |
| `live.gone.cancelled` | This bake was cancelled. |
| `live.gone.missing` | This bake isn't here anymore. |
| `live.loadError` | Couldn't load this bake. |
| `live.announce.step` | Now: {step}. {duration}. |
| `live.announce.shift` | Ready time now {time}. |
| `live.announce.overtime` | {step} is over time. |
| `live.menu.timeline` | Full timeline |
| `live.menu.ingredients` | Ingredients and cost |
| `live.menu.finish` | Finish bake |
| `live.menu.cancel` | Cancel bake |

### 8.11 Accessibility
- **Panel:** one element. Its label is rebuilt each minute (not each second): "Now: Bulk ferment, step 4 of 10. 5 hours 42 minutes left, until Shape at 8:05 PM. Adjusted for 27 degrees." Overtime: "Shape, 12 minutes over time." It is **not** a live region.
- **Announcements** only for: step changes, overtime start, shift results, and snackbars (components §1.4 rule 5).
- **Hero:** `role="button"`, label = the visible label (multi: includes the recipe, §4.5). While it's in its post-tap busy window: `busy`.
- **Close:** "Back to bakes". **Keep awake:** `role="switch"`, "Keep screen on", `checked`.
- **"Also now" rows:** the row and its Done are separate stops: "Preheat oven, 22 minutes left" then "Done, Preheat oven".
- **Ready-time card:** `role="alert"` on first appearance. "Hold ready time" has the hint "Shortens Cold ferment to 17 hours 20 minutes".
- **Focus after Done:** stays on the hero (its label changes to the next step), so a screen-reader user can keep going.
- **Reduce motion:** cross-fades become instant swaps, and the complete illustration is static.
- **Switch control / keyboard:** focus order matches visual order, with the hero last in portrait (it's pinned) and first in the landscape right column. The focus ring is visible.

### 8.12 Platform
- **iOS:** `fullScreenModal` slides up; `chevron.down` closes it. Keep-awake uses `isIdleTimerDisabled` through `expo-keep-awake`. Overflow is a `UIMenu`. Confirms are `UIAlertController` alerts.
- **Android:** full-screen route with the M3 top app bar and back arrow; system and predictive back close it. Keep-awake uses `FLAG_KEEP_SCREEN_ON`. Overflow is an M3 menu. Confirms are M3 dialogs. The navigation bar is edge-to-edge, and the pinned bar pads for the gesture inset.
- **Both:** status bar style follows the theme (light content in dark mode).

---

## 9. `BAKE-TIMELINE` and `STEP-ACTIONS`

### 9.1 `BAKE-TIMELINE`
**Purpose.** The whole bake at once: what's done (with actual times), what's now, what's left, warnings, and oven slots.
**Entry.** `BAKE-LIVE` "Full timeline" (row or overflow).

**Layout:**
1. Header: standard push inside the live stack. iOS back "Live" / Android back arrow. Title "Timeline".
2. Summary block (`callout`):
   - `timeline.summary` ("Planned ready {original} · Now ready {planned}").
   - When the ready time hasn't moved: only "Ready {planned}".
3. The full `Timeline` (components §3.20), with day headers, slot headers and letter badges as in §3.3 and §4.3, and states:
   - **done:** check marker; time column shows the actual end time: "Done 3:12 AM". Fold sub-rows show actual fold times.
   - **done, inferred:** check marker in `textSecondary`, meta `timeline.inferred` ("Marked done").
   - **current:** filled marker + "Now"; meta shows the countdown in minutes.
   - **overtime:** current + `overtime` tag.
   - **upcoming:** planned start; tags (quiet hours, DST, overlap, out of range).
   - **alongside not marked:** after its anchor started, `textSecondary` meta `timeline.notMarked` ("Not marked done").
   - **moved:** when `planned_start_at ≠ original_planned_start_at` by 5 min or more, a second meta line `timeline.moved` ("Was 8:05 PM") in `textSecondary`.
4. The final row: "Ready to eat" with the planned ready time.

Tap a row to open `STEP-ACTIONS`. No sliders here (live changes go through events).

### 9.2 `BAKE-TIMELINE` copy
| Key | String |
|---|---|
| `timeline.title` | Timeline |
| `timeline.summary` | Planned ready {original} · Now ready {planned} |
| `timeline.ready` | Ready {planned} |
| `timeline.doneAt` | Done {time} |
| `timeline.inferred` | Marked done |
| `timeline.notMarked` | Not marked done |
| `timeline.moved` | Was {time} |
| `timeline.foldDone` | Fold {n} · {time} |

### 9.3 `STEP-ACTIONS` sheet
A `Sheet` titled with the step name (and the letter badge + recipe for multi). Its content depends on the step's state. Every action goes through `bakeService.applyEvent`, closes the sheet, and shows the matching §0.7 snackbar with Undo.

| Step state | Content | Event |
|---|---|---|
| Current (running/overtime) | "Started at" `DateTimeField` (time only, default = actual or planned start, max = now) | `stepStarted { key, at }` |
| | "Finished at" `DateTimeField` (time only, min = start, max = now) + [Mark done] | `stepDone { key, at }` |
| | [+15 min] (non-fold) | `extend { key, 15 }` |
| Upcoming, sequential | Body `steps.outOfOrder` ("Marking this done also marks the steps before it as done.") + [Mark done now] | `stepDone { key, at: now }` (earlier steps inferred, ADR 0010 §7) |
| Upcoming, alongside | [Mark done now] | `stepDone` (no shift) |
| Done | Read-only: planned and actual times. No actions in v1 (core never changes done steps; §12 Q-A3) | — |
| Waiting bake, first step | [Start now] | `stepStarted { key, at: now }` |

The sheet shows its consequence before the user acts: under each action, a `footnote` preview from a dry-run `recomputePlan`, for example `steps.preview` ("Ready time becomes 10:25 AM.").

| Key | String |
|---|---|
| `steps.startedAt` | Started at |
| `steps.finishedAt` | Finished at |
| `steps.markDone` | Mark done |
| `steps.markDoneNow` | Mark done now |
| `steps.outOfOrder` | Marking this done also marks the steps before it as done. |
| `steps.preview` | Ready time becomes {time}. |
| `steps.previewSame` | Ready time stays {time}. |
| `steps.doneReadOnly` | Planned {planned} · Done {actual} |
| `steps.startNow` | Start now |
| `val.time.future` | That time is in the future. |
| `val.time.beforeStart` | That's before the step started ({time}). |

Accessibility: focus moves to the sheet title. Each preview footnote is part of its button's hint.

---

## 10. `BAKE-INGREDIENTS` sheet

**Purpose.** What to weigh, for this bake, from the snapshot (ADR 0014). It doesn't change when the recipe changes later.
- iOS form sheet (medium and large detents). Android modal bottom sheet.
- Title: `ingredients.title` ("Ingredients"). Multi-recipe: a `SegmentedControl` of letters + names at the top ("A Country loaf | B Whole wheat"; with 3 or 4 items, or at `fontScale >= 1.5`, a picker row per components §3.12).
- Subtitle `footnote`: `ingredients.scaled` ("For {loaves}. Uses the recipe's dough weight.").
- Rows (non-interactive, same layout as `RECIPE-DETAIL` §10.2 item 5, without the baker's % column): name, amount (`body numeric`, `QuantityText` with its secondary display), and for levain the "{hydration}% hydration · {flour} flour + {water} water" subtitle.
- Totals band: `ingredients.total` ("Total dough {totalG}"). Bakes scale by loaves, so there's no "(target …)" form in v1 (architecture §7.1).
- Cost section (from `cost_snapshot_json`):
  - `ingredients.cost` ("Cost {batch} · {perLoaf} per loaf"), and `footnote` `ingredients.costWhen` ("Prices from {date}.").
  - Lines under 1 minor unit show "<$0.01" (DS-02 §0.2). Free lines show "Free".
  - Incomplete: `StatusTag unpriced` "Cost incomplete" with `ingredients.costPartial` ("{n} ingredients had no price when you scheduled this bake.").
  - `cost_snapshot_json` is null: the section is hidden.

| Key | String |
|---|---|
| `ingredients.title` | Ingredients |
| `ingredients.scaled` | For {loaves, plural, one {# loaf} other {# loaves}}. Uses the recipe's dough weight. |
| `ingredients.total` | Total dough {totalG} |
| `ingredients.cost` | Cost {batch} · {perLoaf} per loaf |
| `ingredients.costWhen` | Prices from {date}. |
| `ingredients.costPartial` | {n, plural, one {# ingredient} other {# ingredients}} had no price when you scheduled this bake. |

Accessibility: each row is one stop ("Bread flour, 450 grams, about 3 and three quarter cups"). The keep-awake state of `BAKE-LIVE` stays on while the sheet is open.

---

## 11. Notification content (final strings for RN-07)

ADR 0011 §4: the title is the step, and the body is the recipe plus a qualifier. Titles and bodies are **capped at 100 characters** after cleaning (control and bidi-override characters removed), with an ellipsis at the cut.

| Kind | Title | Body | Example |
|---|---|---|---|
| `start` | `notif.start.title`: {step} | `notif.start.body`: Time to start · {recipe} | "Shape" / "Time to start · Country loaf" |
| `start` (fold step, fold 1 merged) | `notif.fold.title`: {step}: fold {n} of {count} | `notif.fold.body`: {recipe} | "Stretch and folds: fold 1 of 4" / "Country loaf" |
| `fold` (2..n) | same | same | "Stretch and folds: fold 2 of 4" |
| `headsup` | `notif.headsup.title`: In {minutes} min: {step} | `notif.headsup.body`: {recipe} | "In 10 min: Shape" / "Country loaf" |
| Coalesced (same minute, same bake) | `notif.multi.title`: {count} steps now | `notif.multi.body`: {step} ({recipe}), {step2} ({recipe2}) | "2 steps now" / "Shape (Country loaf), Mix and rest (Whole wheat)" |
| `topup` sentinel | `notif.topup.title`: Keep your reminders coming | `notif.topup.body`: Open Sourdough Assistant to keep your bake reminders coming. | |

Rules:
- `{recipe}` for a single-recipe bake is the recipe name. For a multi-recipe bake it's "{recipe} ({letter})", for example "Country loaf (A)", which matches the live view.
- **Two active bakes of the same recipe:** append the ready day and time to tell them apart: "Country loaf, ready Sat 10:00 AM" (`notif.recipeDisambiguated`). This is computed when the notification is scheduled; a hash change on reschedule keeps it current.
- Bake-wide steps (merged preheat): the body is the bake's recipe list ("Country loaf, Whole wheat").
- No emoji, and no "Sourdough Assistant" prefix in titles (the OS shows the app name).
- **Lock screen (SEC-01 L3):**
  - Android channels use **PRIVATE** visibility. When the user hides sensitive content, Android shows the app name and its own "Contents hidden" text. expo-notifications doesn't expose a custom public version, so there's no app copy for this case (§12 Q-A8).
  - iOS follows the user's Show Previews setting.
- Interruption: `start` and `fold` time-sensitive (iOS) / `bake-steps-v1` (Android); `headsup` and `topup` active / their channels (ADR 0011).

**Android channel names and descriptions** (shown in system settings, so they're user-facing copy):

| Channel id | `name` | `description` |
|---|---|---|
| `bake-steps-v1` | Bake steps | Alerts when it's time to start a step or a fold. |
| `bake-headsup-v1` | Upcoming step warnings | A heads-up a few minutes before a step starts. |
| `general-v1` | General | Other messages from Sourdough Assistant. |

| Key | String |
|---|---|
| `notif.start.title` | {step} |
| `notif.start.body` | Time to start · {recipe} |
| `notif.fold.title` | {step}: fold {n} of {count} |
| `notif.fold.body` | {recipe} |
| `notif.headsup.title` | In {minutes} min: {step} |
| `notif.headsup.body` | {recipe} |
| `notif.multi.title` | {count} steps now |
| `notif.multi.body` | {list} |
| `notif.multi.item` | {step} ({recipe}) |
| `notif.recipeItem` | {recipe} ({letter}) |
| `notif.recipeDisambiguated` | {recipe}, ready {dayTime} |
| `notif.topup.title` | Keep your reminders coming |
| `notif.topup.body` | Open Sourdough Assistant to keep your bake reminders coming. |
| `channel.steps.name` | Bake steps |
| `channel.steps.desc` | Alerts when it's time to start a step or a fold. |
| `channel.headsup.name` | Upcoming step warnings |
| `channel.headsup.desc` | A heads-up a few minutes before a step starts. |
| `channel.general.name` | General |
| `channel.general.desc` | Other messages from Sourdough Assistant. |

---

## 12. Decisions made in DS-03, and open questions

### 12.1 Decisions (deltas from DS-01/DS-02, or new)
1. **The bake is saved before the permission primers**, not after (changes flows §5.2). If the user leaves the primer, the bake still exists. The primer opens with "Bake scheduled. First step …" so the success is clear.
2. **`BAKE-LIVE` is a `fullScreenModal`** (architecture §4), with an explicit close (`chevron.down` on iOS, back arrow on Android), not the "root stack push with Bakes back chevron" in flows §1.5.
3. **The single-item hero "Done" is pinned** at the bottom, so it's in the same place at every text size. In multi-recipe bakes, each item's hero sits inline under its panel, in **stable A–D order**, separated by `space.xxl`.
4. **Max 4 recipes per bake**, so letters and series colors never repeat.
5. **Warnings are summarized in one "Worth a look" card** with one line per type (each scrolls to its rows), instead of one banner per type. Banners are reserved for blocking states (too soon, invalid) and reminder health.
6. **Quiet hours use the info style** (moon icon, blue family) everywhere: row tag and summary. Warning yellow is for clamping, hold limits, overtime and reminder health.
7. **Simultaneous steps are derived in the UI** (10 min window, different items, same-slot oven steps excluded). Core has no warning code for them.
8. **DST copy says "during this step" and gives the date**, not "tonight", because a bake may be scheduled days ahead.
9. **"Use shortest times"** is offered in the too-soon banner only when it actually fits the requested time (ADR 0010 §6).
10. **Recipe block before the mode control** on `SCHED-PLAN` (flows put the mode first), so the screen starts by saying what you're planning.
11. **Day headers** in every timeline. The time column then shows only the clock time.
12. **Live "Edit step times" is scoped to what core supports:** the current step's start (`stepStarted`) and finish (`stepDone` with a past time), plus out-of-order "Mark done now". Done steps are read-only in v1. This replaces the broader flows §6.2 item.
13. **Overtime on the final step is shown as "Ready"**, not overtime. The bake needs "Finish bake" to complete.
14. **Folds:** fold n's countdown; "Fold n of N done"; "Start {next} now" as a secondary; no +15 min on fold steps.
15. **Reminder banners** show on home only when a bake exists. Dismissal lasts until the next bake is scheduled. Cards keep a non-dismissible tag. The Android battery-optimization notice lives only in Settings.
16. **Ingredients sheet on the live view**, so you can weigh during Feed and Mix without leaving the bake. It reads the snapshot and shows the snapshot cost (partial and "<$0.01" states).
17. **Notifications:** title = step, body = "Time to start · {recipe}". Same-recipe concurrent bakes add "ready {dayTime}". Multi-recipe bakes add the letter.

**Follow-up for DS-02 (not edited here, per scope):** on `RECIPE-DETAIL`, when the scale mode is "Dough weight", the `BottomActionBar` footnote should say "Bakes use the recipe's dough weight." so the switch to loaves-only isn't a surprise. Key proposal: `detail.scheduleWeightNote`.

### 12.2 Questions for the architect (AR-01)
- **Q-A1. Route params.** Add `bake/schedule/plan?recipeId=<uuid>&loaves=<int 1..50>` (prefill only) and `bake/schedule/permission-*.tsx?bakeId=<uuid>` to the route map and `route-params.ts`. Confirm `unstable_settings.initialRouteName = 'index'` in `bake/schedule/_layout.tsx`, so back from the plan goes to the picker.
- **Q-A2. Undo for live events.** Core has no inverse events. I've specified undo as "restore the bake's rows as they were before the event, then reconcile" within the 8 s window. Please confirm a `bakeService.applyEvent` return token plus `bakeService.revert(token)` (one transaction), and that only the latest event can be reverted.
- **Q-A3. Editing done steps.** Core never changes done steps. I've made done steps read-only in v1 and rely on undo plus "Finished earlier? Set the time" (`stepDone` with a past `at`). Please confirm that `stepDone` accepts an `at` earlier than now (and not before the actual or planned start), and `stepStarted` an `at` in the past.
- **Q-A4. Auto-activation.** When the first planned start passes without a tap, does a service write `status = 'active'` (and `stepStarted` at the planned time), or does the UI only derive it (my §8.1 rule 2)? The same question applies to alongside steps whose anchor has started: inferred done, or left "Not marked done" (my assumption)?
- **Q-A5. Slot step names.** ADR 0009 §6 says labels like "Bake, covered (1 of 3 loaves: slot 2)". I compose slot labels in the UI from `slotIndex` and `loaves`. Please keep `PlannedStep.name` as the plain step name (also cleaner for notifications).
- **Q-A6. Overlap warning.** OK to derive simultaneous steps in the app (10 min, different items)? Or should core add `{ code: 'overlap' }` so QA can test it in Vitest?
- **Q-A7. Budget warning at schedule time.** `plan.budget.summary` needs a dry run of `planNotifications` with the draft bake added (iOS only). Is that acceptable on every preview, or only once when the plan screen opens and when the item count changes? (My preference is the latter.)
- **Q-A8. Android lock screen.** With PRIVATE visibility, can expo-notifications set a `publicVersion` ("Bake step due")? If not, the system "Contents hidden" text is what users see. That's fine; I just want it confirmed.
- **Q-A9. Ready notification.** There's no notification at the ready time (Cool end), because the planner kinds are `start | fold | headsup | topup`. Should we add a `ready` kind ("Ready to eat · Country loaf")? It would be 1 more per bake against the iOS budget.
- **Q-A10. Stale bakes.** A bake whose final step ended but was never finished stays on home forever. Proposal: auto-complete on launch 12 h after the planned ready time (`completed_at = planned_ready_at`), with no snackbar. OK?
- **Q-A11. Keep-awake default write.** Toggling on `BAKE-LIVE` updates `settings.keep_awake_default` (remembered choice, flows §6.3). Confirm that it's fine to write settings from the live view.

### 12.3 Questions for Chris
- **Q-C1. Multi-loaf ready time (Q8, provisional ADR 0009).** When the oven can't take every loaf at once, should the ready time be when the **last** batch is cooled (current default) or the **first**? This only changes one sentence on the plan screen and the slot timing.
- **Q-C2. Up to 4 recipes in one bake.** Is that enough?
- **Q-C3. Overnight overtime.** If you sleep through a reminder, the live view shows "+3 h 10 min over" and waits for you to tap Done, with an option to set when you actually finished. Does that match how you'd want to catch up in the morning?
- **Q-C4. "Ready to eat" reminder.** Do you want a notification when the bread has finished cooling (Q-A9), or is the Cool step's own reminder enough?
- **Q-C5. Hold ready time.** With the default recipe, the cold ferment is already at its 12 h minimum, so a late bulk can't be absorbed and the ready time moves later. Do you usually plan with a longer cold ferment (for example 14 to 18 h) so there's slack? If so, should the default cold ferment in the template be longer than its minimum?
- **Q-C6. Kitchen temperature.** Do you know your kitchen temperature when you schedule? If not, should the app keep last time's value automatically instead of "Not set"? (Right now it only pre-fills the picker.)
