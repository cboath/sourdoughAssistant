# Sourdough Assistant: v1 Test Plan

Task QA-01 · owner qa-test-engineer · 2026-11-26 · Status: draft for review by the architect (AR-01) and Chris

Inputs: `docs/PRD.md`, `docs/BUILD_PLAN.md` ("Testing and v1 release checklist"), `docs/plan.md` (sections 3 and 5, QA task rows). Detailed core cases are in `docs/test-cases/core-cases.md`. `docs/architecture.md` and `docs/core-api.md` did not exist when this was written, so tool choices for SQLite tests and function names are provisional.

## 1. Quality goals and where the risk sits

The app is local-only, so there is no server, no auth and no network contract to test. Risk is concentrated in four places, and effort follows them.

| Rank | Risk | Why it matters | Main defence |
|---|---|---|---|
| 1 | Reminders do not fire on time with the app closed | The whole product promise; an overnight miss ruins a bake | Manual script on both phones (section 6), early native spikes AN-01 and IO-01 |
| 2 | Schedule math wrong, especially on DST nights | Wrong start times look right until the bake fails | Table-driven core tests, DST sweep (core-cases sections 5 to 7) |
| 3 | Cost and rounding wrong | Cottage baker prices sales off it; PRD fixes $1.39 | Integer-cent tests with PRD examples (core-cases section 4) |
| 4 | Data loss: restore of a bad backup, migration | Single copy of the user's recipes | Repository and migration tests, malformed-file tests, cross-platform restore |

Release bar (from plan section 1): all M0 to M6 done-when tests pass, three real bakes (one multi-recipe, one overnight), a backup restored across phones, one crash-free week in TestFlight and Play internal testing, privacy policy published.

## 2. Test strategy per layer

| Layer | Tool | Scope | Bar | Gates CI? | Written by |
|---|---|---|---|---|---|
| Core logic (`packages/core`) | Vitest, fixed clock, explicit IANA zone, run under three host `TZ` values | units, recipe math, cost, scheduler, multi-recipe, recompute, quiet hours, temperature | every exported function covered; every case in `core-cases.md` with status READY or PROPOSED implemented; line coverage at least 95% and branch coverage at least 90% for `packages/core`; DST spring-forward and fall-back nights included | Yes | CO-01 to CO-03 own unit tests; QA-02 owns `packages/core/test/acceptance/*.test.ts` |
| Property tests (core) | Vitest plus `fast-check` (small dev dependency, no cost) | schedule invariants (sum of durations, strictly ordered, UTC instant = ready - cumulative elapsed), DST sweep across zones and days, scale-then-round invariants, money round trips | no counterexample over 1,000 runs per property in CI, 100,000 nightly | Yes (low count) | QA-02 |
| Data (`apps/mobile/src/db`) | Jest against in-memory SQLite (driver chosen by AR-01: for example `better-sqlite3` behind the same interface as `expo-sqlite`) | migrations from empty DB, re-run is a no-op, create/edit/delete/reload for every entity, stable ids and timestamps, soft delete tombstones, seed idempotency, price history, snapshot independence | every entity round-trips; migration from each prior schema version once a second version exists | Yes | RN-02, RN-03; QA reviews |
| Components and screens | Jest (`jest-expo`) plus React Native Testing Library | recipe editor, pantry editor, schedule screen, live bake, backup and import flows, onboarding, notification-denied banner | key flows render, validate, save, and show correct totals; accessibility queries (`getByRole`, `getByLabelText`) used so labels are asserted, not only text | Yes | QA-03 (recipe editor), QA-04 (schedule), QA-05 (live); RN engineer for the rest |
| Notification service logic | Jest with a mocked `expo-notifications` | idempotent reschedule on launch (no duplicates), cancel and rebuild on recompute, iOS 64-cap budget selection (soonest N plus top-up), denied-permission path, restore reschedules | for a given bake state the set of scheduled (id, instant) pairs equals the expected set; running reschedule twice changes nothing | Yes | RN-07, QA-04 |
| Backup and import parsing | Jest | versioned JSON schema validation: valid, wrong version, truncated, wrong types, extra fields, oversize, duplicate ids, plain-text import; failure leaves the DB untouched (transaction rollback) | each malformed fixture rejected with a clear message and zero writes | Yes | RN-09, QA-06; security fuzz cases from SEC-02 |
| End-to-end | Maestro flows in `.maestro/` | see section 2.1 | critical paths pass on an Android emulator and an iOS simulator against a dev or preview build | Not at first (needs an emulator; run nightly or on demand). Promote to a CI job on Ubuntu with an Android emulator only if it stays under 15 minutes and under the free minutes | QA |
| Manual on-device | Scripts in `docs/test-scripts/` | notifications (section 6), accessibility, upgrade, backup across phones, real bakes | per script | Release gate | QA with Chris |
| Static | ESLint, `tsc --noEmit`, Prettier check | whole workspace | zero errors | Yes | RN-01, RE-01 |

Not planned: contract tests against `openapi.yaml` (no API in v1, plan section 2), load and performance tests beyond the checks in section 7, snapshot tests of screens (brittle with Dynamic Type; use targeted assertions).

### 2.1 Maestro: where it is worth it

Maestro cannot assert that an OS notification arrived on time while the app is closed, so it does not replace the manual notification script. It is worth the setup for flows that are tedious to repeat by hand and break easily during refactors.

| Flow | Purpose | Milestone |
|---|---|---|
| `first-run.yaml` | Fresh install: onboarding (set units, quiet hours, oven capacity), skip path, seed recipes visible, no duplicates after relaunch | M3 |
| `pantry-recipe-cost.yaml` | Add pantry item with price, build the PRD cost recipe, assert "$1.39" per loaf and 77.3% hydration on screen | M3 |
| `schedule-bake.yaml` | Pick recipe, pick ready time, see timeline with quiet-hours warning, confirm. Records elapsed time as a smoke check for the 60 second goal (informational, not a pass/fail on slow emulators) | M4 |
| `live-bake.yaml` | Start a bake, mark steps done, assert recompute, two concurrent bakes on home | M5 |
| `backup-restore.yaml` | Export backup, wipe data, restore with the confirm step, assert counts; malformed file rejected | M6 |
| `denied-notifications.yaml` | Deny permission, banner shown, schedule still works | M4 |

Support needed from the app (ask the RN engineer, cheap to add early): stable `testID`s on every interactive element, a dev-only "compressed time" switch that schedules a whole bake over about 5 minutes to smoke test notification wiring on a device, and an env flag that pins the clock and zone for E2E runs.

Detox is not used. The project has no Detox setup and Maestro is simpler for two platforms.

## 3. Determinism and test data rules

- No test reads the wall clock or host zone. The clock and zone are parameters. CI runs `packages/core` under `TZ=UTC`, `TZ=America/Los_Angeles` and `TZ=Asia/Kolkata`; results must match.
- Fixed fixtures: the PRD default template, the cost pantry fixtures and the recipe fixtures defined in `core-cases.md` section 0.
- Money is integer cents everywhere in assertions. Float comparison of money is a test failure in review.
- Expected values for DST were computed with an independent implementation (Python `zoneinfo`), not with the library under test, so the tests are not circular.
- Dates in fixtures use 2026, so the day of week for each is verified: Sat 2026-05-02, DST starts Sun 2026-03-08 and ends Sun 2026-11-01 (US), Sun 2026-03-29 and Sun 2026-10-25 (UK).
- Environment note: this QA session had no Node toolchain (`node: command not found`), so nothing in this plan has been run yet. Commands to run once RN-01 lands are in section 9.

## 4. Coverage map: plan criteria to layers

| Plan criterion | Layer | Cases or script |
|---|---|---|
| M0 install, tests, lint, typecheck, CI green; app imports from core | CI, smoke test | `npm install && npm test && npm run lint && npm run typecheck`; one app test importing a core function; manual install on both phones |
| M1.1 hydration and scaling | Vitest | RCP-*, SCL-* |
| M1.2 cost = 139 cents, markup | Vitest | CST-*, MNY-* |
| M1.3 schedule, 18 h variant | Vitest | SCH-01, SCH-02 and following |
| M1.4 quiet hours warn, no moves | Vitest | QH-* |
| M1.5 DST | Vitest | DST-*, QH-08, QH-09, SCH-19 |
| M1.6 too soon, start now | Vitest | SCH-13 to SCH-17 |
| M1.7 oven capacity | Vitest | MUL-* |
| M1.8 late recompute | Vitest | LIV-* |
| M2 migrations and repositories | Jest + SQLite | per entity round trip, seed idempotency |
| M3 pantry and cost UI | Jest + RNTL, Maestro, manual | unit conversion lines, per-line share, price change updates recipe but not past bake snapshot, large-text and screen-reader checks |
| M4 reminders within 1 minute, denied banner, reschedule, multi-recipe prompt | Manual script, Jest, RNTL | section 6; notification service tests; schedule screen tests |
| M5 live bake | RNTL, Maestro, manual | 56 pt/dp target check (RNTL layout assertion plus manual measurement), recompute updates notifications, two concurrent bakes, keep-awake on |
| M6 backup, malformed import, onboarding, privacy | Jest, Maestro, manual | backup parsing suite, cross-platform restore, network audit (section 7) |

## 5. Device and OS matrix

Chris's exact phones are an open question (plan Q10). The placeholders marked "Chris" are replaced when he answers. The recommended minimum below is what QA needs to cover regardless of which phones he owns.

The minimum OS versions come from the Expo SDK that AR-01 picks. Check the SDK's documented floor when the ADR lands and substitute the numbers below; do not assume them.

### 5.1 Placeholders to fill

| Slot | Model | OS version | Notes |
|---|---|---|---|
| Chris iPhone (primary iOS) | TBD (Q10) | TBD | The M0 dev build and the real bakes run here. Real device only |
| Chris Android (primary Android) | TBD brand and model (Q10) | TBD | Brand matters: Samsung, Xiaomi, OnePlus and others kill background work differently |
| Chris spare or family phones | optional | optional | Second restore target for the cross-phone backup test |

### 5.2 Recommended minimum matrix

| ID | Platform | OS | Device type | Why | Where run |
|---|---|---|---|---|---|
| I-MIN | iOS | the Expo SDK minimum | simulator | oldest supported behaviour, layout | simulator |
| I-OLD | iOS | latest minus 1 major | real device if available, else simulator | the version many users stay on | real preferred |
| I-NEW | iOS | latest stable at test time | Chris's iPhone | time-sensitive notification entitlement, Focus, all notification checks | real device (required for M4 sign-off) |
| I-SE | iOS | any supported | small phone (4.7 inch, for example iPhone SE class) | small screen, largest Dynamic Type | simulator |
| I-PAD | iPad | any supported | tablet simulator | only if `supportsTablet` is true. If it is false, record that the app runs in compatibility mode and test that once | simulator |
| A-MIN | Android | the Expo SDK minimum API | emulator | oldest behaviour, notification channels, no runtime notification permission before API 33 | emulator |
| A-31 | Android 12 (API 31) | emulator or real | exact alarm permission introduced, granted by default | emulator |
| A-33 | Android 13 (API 33) | emulator | `POST_NOTIFICATIONS` runtime permission | emulator |
| A-34 | Android 14 (API 34) | real device preferred | exact alarm permission denied by default for new installs, Doze behaviour | emulator for flows, real for timing |
| A-NEW | Android | latest stable API at test time | Chris's Android if it is current, else a Pixel or emulator | latest behaviour changes, edge-to-edge | real device (required for M4 sign-off) |
| A-LOW | Android | any supported | low-end device (2 GB RAM class, or an emulator with 2 GB and a slow CPU) | cold start time, memory, large font on small screens | real device preferred |
| A-OEM | Android | any supported | a second brand with aggressive battery management (Samsung or Xiaomi if Chris's phone is a Pixel, or the reverse) | background kill behaviour | real device, optional but recommended before any public release |
| A-TAB | Android | any supported | tablet emulator | wide layout, landscape | emulator |

Rules:

- Anything involving notification timing, Doze, Focus, battery saver or reboot runs on a real device. Emulators and simulators do not reproduce OEM or Focus behaviour.
- Layout, Dynamic Type, dark mode, landscape and screen reader navigation can start on simulators and emulators. VoiceOver and TalkBack get a real-device pass at M6.
- Cloud device farms (Firebase Test Lab, AWS Device Farm, BrowserStack) cost money after free tiers, so none are used without Chris's approval (CLAUDE.md spending rule). Firebase Test Lab's free daily quota can run Maestro-free Robo or instrumentation smoke tests on Android, and is the only farm worth evaluating, if at all.
- Display checks on each: largest system font, smallest, dark mode, light mode, portrait, landscape, notch or cutout, and the Android gesture navigation bar.

## 6. Manual notification test outline (feeds QA-04, `docs/test-scripts/notifications.md`)

Pass bar: every step start, fold reminder and heads-up fires within 1 minute of its scheduled time (PRD non-functional requirement). Record scheduled time and received time for each notification in `docs/test-runs/m4.md`. Use short bakes where possible (see the compressed-time switch in section 2.1) for the permission and lifecycle cases, and one full overnight bake for the long run.

### 6.0 Setup, both platforms

1. Install the preview or development build, fresh install, no prior data.
2. Create a bake whose steps are 2 to 5 minutes apart, so a whole run takes about 30 minutes. Include 4 fold reminders and a heads-up of 1 minute.
3. Note the exact scheduled instants from the in-app timeline. Compare against the arrival time on the lock screen.
4. Keep the scheduled-instant list for the notification service test (the unit test asserts the same list).

### 6.1 Permissions (T-PERM)

| ID | Scenario | Expected |
|---|---|---|
| T-PERM-1 | First schedule: permission prompt appears at a sensible moment (when scheduling, not on launch), with the explainer shown first | prompt once; granted state schedules everything |
| T-PERM-2 | Deny at prompt | in-app banner; timeline and live bake still work; nothing scheduled; banner links to system settings |
| T-PERM-3 | iOS "Don't allow" then later enable in Settings while app is in background, return | banner clears on foreground, notifications rescheduled |
| T-PERM-4 | Permission revoked in Settings while a bake is active and the app is running | banner appears on next foreground; no crash; in-app countdown continues |
| T-PERM-5 | Android 13+ prompt: "Don't allow" twice (system stops asking) | app routes the user to settings instead of re-prompting forever |
| T-PERM-6 | iOS "Deliver quietly" or "Scheduled Summary" enabled for the app | document behaviour; steps must still arrive on time (time-sensitive level). Record the result |
| T-PERM-7 | Notification channel or category blocked individually (Android) | app detects the blocked channel and warns, or the result is recorded as a known gap |

### 6.2 iOS: 64 pending notification cap (T-IOS-CAP)

iOS keeps at most 64 pending local notifications per app and drops the rest silently. By the PRD default template one bake produces about 25 notifications (11 step starts including "ready", up to 4 fold reminders, up to 11 heads-ups). Two bakes fit. Three do not. The exact count comes from AR-01's notification budget.

| ID | Scenario | Expected |
|---|---|---|
| T-IOS-CAP-1 | One bake, count pending requests (debug screen or `getAllScheduledNotificationsAsync`) | equals the expected count from the unit test |
| T-IOS-CAP-2 | Two concurrent bakes | all scheduled, count at most 64 |
| T-IOS-CAP-3 | Three concurrent bakes (about 75 wanted) | pending count never exceeds 64; the soonest notifications are the ones present; nothing from a later step crowds out an earlier one |
| T-IOS-CAP-4 | After T-IOS-CAP-3, let the first few notifications fire, then foreground the app | app tops up the pending set with the next-soonest ones; no duplicates; no gap |
| T-IOS-CAP-5 | Three bakes, app killed, notifications later than the cap window are due | known limitation: later ones only arrive if the app was opened before. Record the maximum safe gap between app opens, and tell the user in the UI if the budget is truncated |
| T-IOS-CAP-6 | Mark a step done early in bake 1 while at the cap | cancelled ones free slots; the top-up fills in the right ones |
| T-IOS-CAP-7 | Delete a bake | all of its pending notifications removed, others untouched |

### 6.3 Android 14+ exact alarms (T-AND-EXACT)

Plan A: request `SCHEDULE_EXACT_ALARM`, not `USE_EXACT_ALARM` (Play restricts that one). From Android 14 the permission is not granted by default to new installs.

| ID | Scenario | Expected |
|---|---|---|
| T-AND-EXACT-1 | Fresh install on API 34 or later, schedule a bake | explainer then deep link to the "Alarms and reminders" setting; app does not crash when the user returns without granting |
| T-AND-EXACT-2 | Permission granted | steps fire within 1 minute with screen off |
| T-AND-EXACT-3 | Permission denied | fallback inexact scheduling with a visible warning that reminders may be late by minutes; in-app countdown shown. Record the observed delay |
| T-AND-EXACT-4 | Permission revoked in Settings while a bake is active (Android stops the app and clears its exact alarms) | on next launch the app detects the missing permission and the missing alarms, shows the banner, reschedules after re-grant |
| T-AND-EXACT-5 | Permission granted again while the app is running or stopped | app reschedules (it listens for the permission-state change, or does so on next launch). No duplicates |
| T-AND-EXACT-6 | API 31 and 32 | permission pre-granted, no prompt, still fires on time |
| T-AND-EXACT-7 | API 33 | runtime notification permission shown, exact alarm per system default |
| T-AND-EXACT-8 | Doze (`adb shell dumpsys deviceidle force-idle`), screen off, 10 minutes | exact alarms still fire within 1 minute |
| T-AND-EXACT-9 | Battery saver on, app battery set to "Restricted" | document and, if reminders fail, show an in-app prompt to relax battery restrictions |
| T-AND-EXACT-10 | App standby bucket "Restricted" (`adb shell am set-standby-bucket <package> restricted`) | same as above, recorded |

### 6.4 Focus, Do Not Disturb, silent (T-DND)

| ID | Platform | Scenario | Expected |
|---|---|---|---|
| T-DND-1 | iOS | Do Not Disturb Focus on, app not in the allowed list | time-sensitive notification still alerts (it must be enabled by IO-01). If not, record as bug |
| T-DND-2 | iOS | Sleep Focus, schedule step at 03:05 | alerts; screen lights on a locked phone |
| T-DND-3 | iOS | Mute switch on | notification delivers; sound behaviour recorded. Decide whether it matters |
| T-DND-4 | iOS | Low Power Mode on | no delay |
| T-DND-5 | Android | DND on (priority only, app not exempt) | high-importance channel does not break through by default; record, and document that the user should allow the app or an alarm-style channel. Decide with Chris whether an in-app prompt is needed |
| T-DND-6 | Android | Silent or vibrate ringer | visible heads-up and vibration per channel config |
| T-DND-7 | Both | Quiet hours set in the app and a step falls inside | the app still delivers the notification (the warning is only at schedule time) |

### 6.5 App killed and lifecycle (T-LIFE)

| ID | Scenario | Expected |
|---|---|---|
| T-LIFE-1 | Swipe the app away from recents, lock phone, wait for 3 steps | all arrive on time (iOS and Android) |
| T-LIFE-2 | Android "Force stop" from App info | Android cancels the alarms. Record behaviour and that the app reschedules on next launch. Expected to be a known limitation to document |
| T-LIFE-3 | Tap a notification while the app is killed | app opens to the live bake view for the right bake and step (cold start deep link) |
| T-LIFE-4 | Tap a notification while the app is foreground, backgrounded, and on another screen | same destination; no duplicate screens on the stack |
| T-LIFE-5 | Notification fires while the app is in the foreground | in-app presentation (banner or sound) per design; not silently swallowed |
| T-LIFE-6 | Process death during a schedule save | on relaunch the bake is either fully saved with its notifications or absent; no half-saved bake |
| T-LIFE-7 | Background the app mid-recompute | state consistent on return |
| T-LIFE-8 | Two active bakes, notifications at the same minute | both arrive, distinguishable by title and body, neither replaces the other |

### 6.6 Reboot, update, time changes (T-REB)

| ID | Scenario | Expected |
|---|---|---|
| T-REB-1 | Reboot the phone with an active bake and do not open the app | Android: reminders still arrive (boot-completed reschedule). iOS: pending notifications survive reboot. Record any that do not |
| T-REB-2 | Reboot, then launch the app | pending set equals expected set, no duplicates (idempotent reschedule) |
| T-REB-3 | Install an app update (or EAS Update) over an active bake | notifications intact or rescheduled on launch, no duplicates |
| T-REB-4 | Reinstall (delete and install) | bake data gone; no stale notifications on Android; on iOS pending notifications are removed with the app |
| T-REB-5 | Restore a backup containing an active bake | notifications rescheduled for future steps only; past steps do not fire |
| T-REB-6 | Change device time zone while a bake is active (automatic time zone, or manual) | notifications fire at the original absolute instants; local display updates (DST-06) |
| T-REB-7 | Move the device clock manually forward past a step | the app reconciles on foreground; steps in the past are shown as overdue, not fired in a burst |
| T-REB-8 | DST night: set device date to Sat 2026-11-01 00:30 local (US zone) with a bake whose steps straddle 01:00 to 02:00, then sleep through the change | steps fire at their absolute instants; the repeated hour does not double-fire. Repeat for 2026-03-08 and the skipped hour |
| T-REB-9 | Airplane mode on during the whole bake | no difference (all local) |
| T-REB-10 | Low storage or notification limit on Android | scheduling failure is reported to the user, not swallowed |

### 6.7 Full run (T-FULL)

| ID | Scenario | Expected |
|---|---|---|
| T-FULL-1 | Overnight bake on Chris's real phones (Android with battery saver on, phone locked, app killed), default template, with at least one quiet-hours warning accepted | every reminder within 1 minute; log in `docs/test-runs/m4.md` |
| T-FULL-2 | Same on iPhone, with a Sleep Focus active | same |
| T-FULL-3 | Multi-recipe bake (three loaves, capacity 2) | merged timeline matches the plan; each reminder names the loaf or recipe |

## 7. Other manual and non-functional tests

| Area | Test | Expected |
|---|---|---|
| Accessibility | VoiceOver and TalkBack walk the recipe editor, schedule screen, live bake, backup screen. Check reading order, labels on icon buttons, "mark done" announced with step name | every interactive control reachable and labelled; timeline rows read as "step name, start time, warning if any" |
| Accessibility | Largest system font (iOS Accessibility XL and Android 200%) on the recipe editor and live bake | no clipped text, no unreachable buttons; mark-done target at least 56 pt/dp |
| Display | dark mode, light mode, landscape on phone and tablet, notch or cutout, gesture bar | no content under system UI; contrast legible |
| Input | empty names, 200 character names, emoji, RTL text (Arabic, Hebrew), pasted multi-line text in notes, quotes and backslashes, leading and trailing spaces | saved and displayed as typed; no crash; export and import round trip preserves them |
| Input | numeric fields: empty, 0, negative, 1e3, 1,5 vs 1.5 by locale, very large (999999), pasted values with units | validation message, no NaN on screen |
| Locale | currency and number format follow device locale (en-US, de-DE, ja-JP) | per `core-cases.md` FMT-* |
| Lifecycle | cold start vs warm start time on the low-end device | cold start under 3 seconds to the home screen (informal target; record the number) |
| Upgrade | install the previous build, create recipes, pantry, a bake, backup; install the new build; verify data, migrations, notifications | all data intact; pending notifications intact or rescheduled once |
| Backup | export on iOS, restore on Android, then the reverse; compare recipe, pantry, bake and settings counts and a sample of values (hydration, cost per loaf), plus active bake notifications | match exactly; confirm step shown before data is replaced |
| Backup | wrong version, truncated JSON, wrong types, empty file, a 50 MB file, a file renamed from another app's JSON | rejected with a clear message; no data changed |
| Network | airplane mode for the full run of M3 to M6 features | everything works. Network audit with a proxy (mitmproxy or Charles) over a full session: no requests except Expo update checks, if updates are on; no analytics SDK in the dependency list (SEC-02 cross-check) |
| Performance | schedule a bake from app open | under 60 seconds by a person who has used the app before (success measure). Record time and taps |
| Performance | 200 recipes and 300 pantry items (seed script) | list scroll smooth, search under 300 ms, no ANR |
| Keep-awake | live bake open, screen lock timeout 30 s | screen stays on while the live view is open and releases when leaving it |

## 8. Entry and exit criteria, defect handling

- Entry for QA-02: `docs/core-api.md` exists and `packages/core` has Vitest running (RN-01, AR-01). The cases are written first and run red until CO-01 to CO-03 land.
- Entry for QA-04: RN-07 merged and a preview build on both phones.
- Exit per milestone: all READY and PROPOSED cases for that milestone pass; BLOCKED cases have a written decision (an ADR or an answer from Chris) or are explicitly deferred with a reason in the test run file.
- Defects: logged as GitHub issues (BUILD_PLAN "Real use" row) with title, severity (blocker, major, minor, cosmetic), platform and OS, steps, expected, actual, evidence, suspected owner agent. A failed money, DST or notification case is at least major. A missed overnight reminder is a blocker.
- Severity blockers for release: any missed or more than 1 minute late reminder under the T-FULL scenarios, any wrong value in an expected PRD example, any data loss on restore, any network call other than update checks.

## 9. How to run (once the scaffold exists)

None of this has been run: this environment has no Node and no simulators. On Chris's Mac or in CI:

```
npm install
npm test                          # all workspaces
npm run lint && npm run typecheck
npm test --workspace packages/core
TZ=UTC npm test --workspace packages/core
TZ=America/Los_Angeles npm test --workspace packages/core
TZ=Asia/Kolkata npm test --workspace packages/core
npm test --workspace apps/mobile  # Jest + RNTL + repository tests
maestro test .maestro/            # needs a running emulator or simulator with a dev build installed
```

Exact workspace names depend on RN-01; adjust to the root `package.json` scripts.

## 10. Questions that block exact expected values

Full detail and the assumed value for each is the ambiguity ledger in `docs/test-cases/core-cases.md` section 13. In priority order:

1. Rounding rule (AMB-01, AMB-02): half up vs half even, and how per-loaf cost and sell price are derived. The PRD example gives 139 c for one loaf, but the same recipe at 2 or 4 loaves is 138.5 c per loaf.
2. Markup vs margin and sell price rounding (AMB-03). The "existing sourdough cost calculator" the PRD mentions is not in the repo.
3. Kitchen-temperature table (AMB-09, plan A6, Q7). No exact temperature values can be written.
4. Multi-recipe rules (AMB-10, plan A4, Q8): slot order, remainder placement, merged preheat, reheat gap.
5. Live recompute policy (AMB-11): shift only, or absorb into the cold-ferment range.
6. "Earliest possible ready time" definition (AMB-08).
7. DST rules for a ready time in the skipped or repeated hour (AMB-04), plus Chris's agreement to the elapsed-time model (A1).
8. Fold reminder placement and quiet-hour boundary rules (AMB-05, AMB-07).
9. Scaling by target dough weight and sub-gram amounts (AMB-13); unit definitions (AMB-12); money minor units (AMB-15).
10. Chris's phones (Q10) and whether the app supports tablets natively.
