# Notification manual test script (QA-04)

Covers M4 ("every reminder fires on time with the app closed") and the M5 live-recompute link, on both phones. Nothing in this script has been run: this environment cannot tap a Simulator or reach a phone. Results go in `docs/test-runs/m4.md`.

Related documents. Do not copy their steps here, follow them:

| Document | What it owns |
| --- | --- |
| `docs/native/ios-notifications.md` section 8 (the "IO-01 checklist", items 1 to 15) | Harness-level iOS checks: permission states, display, sound and ringer, the 64 cap with `satest:` reminders, Focus with the harness, reboot, action buttons, time zone, Dynamic Type, Release safety. Run it first. Items are cited here as **IO-n** |
| `docs/test-plan.md` section 6 | The T-* case IDs and the pass bar (within 1 minute). Cited here as **T-xxx** |
| `docs/test-runs/m4.md` | Where results are recorded |

This script adds what the IO-01 checklist does not cover: real bakes through the Schedule and Live screens, the tap-to-open routes, recompute versus pending reminders, DST nights, and Focus with the real reminders.

## 0. Rules for the run

- Pass bar: a start, fold or heads-up is delivered within **60 seconds** of its scheduled instant (PRD). Anything later than that in a T-FULL run is a **blocker**. A missed reminder is a blocker.
- Record the scheduled time (the in-app timeline row) and the received time. Read the received time against a clock that shows seconds: film the phone next to a laptop showing a seconds clock (for example time.is). The lock screen shows only minutes.
- iOS sound follows the ringer switch. Keep the ringer on, except where a step says otherwise.
- Tester notes the build id (git commit, and `SA_TIME_SENSITIVE` value) in the run header.
- If a step fails, stop that scenario, record what you saw (screenshot or video), file the bug (`docs/test-runs/m4.md` section 4) and continue with the next scenario.
- Android rows are written now and marked **BLOCKED-ANDROID** (no emulator or phone: plan section 9). Run them when Chris frees disk space or provides a phone. The `adb` commands are exact.

## 1. Builds and devices

| Build | How | Used for |
| --- | --- | --- |
| iOS-A (default) | `cd apps/mobile`, `npx expo prebuild --clean -p ios`, open `ios/SourdoughAssistant.xcworkspace`, personal team, run on the iPhone (iOS 18 or later). No time-sensitive entitlement | Every scenario |
| iOS-B (entitlement) | `SA_TIME_SENSITIVE=1 npx expo prebuild --clean -p ios`, rebuild | Focus scenarios F2 and F3. If Xcode refuses to sign (IO-3), record the exact error and skip B: the with-entitlement rows stay NOT RUN until the paid account in M6 |
| Android | EAS APK or Android Studio build | BLOCKED-ANDROID |

Install lasts 7 days on a free team. Reinstalling deletes bake data. A dev build also needs `npx expo start --dev-client` running for the first launch.

Devices: Chris's iPhone (minimum iOS 18, record the exact version) and Chris's Android phone (record brand and API level). The Simulator cannot cover any scenario below except S1 and C3.

## 2. Test data

### 2.1 Short bake "QA short" (about 100 minutes, with every notification kind)

Create it once in the recipe editor (Recipes, New recipe). One loaf, any ingredients. Steps in this order, each "No range":

| # | Name | Kind | Duration |
| --- | --- | --- | --- |
| 1 | QA feed | Feed | 15 min |
| 2 | QA mix | Mix | 15 min |
| 3 | QA folds | Stretch and folds, 4 folds, interval 5 min | 20 min |
| 4 | QA bulk | Bulk | 15 min |
| 5 | QA shape | Shape | 15 min |
| 6 | QA bake | Bake | 15 min |
| 7 | QA preheat | Preheat, alongside "QA bake", ends when it starts | 20 min |

Schedule it with "Ready at" about 2 hours from now, so the first step is about 20 minutes away. The reminder lead is the Settings value stored on the bake. The Settings screen does not exist yet (RN-10), so it is the database default of **10 minutes**. With 15-minute steps each heads-up falls inside the previous step, so every heads-up is visible.

Expected reminder count for QA short: 7 starts, 7 heads-ups, 3 extra folds = 17. (The folds step has its fold 1 merged into its start.) The preheat is 20 minutes, so it starts 5 minutes after "QA shape" and nothing coalesces. (A 15-minute preheat would start in the same minute as "QA shape" and the two starts would merge into one "2 steps now" notification, which is also correct behavior but changes the count to 16.)

### 2.2 Overnight bake "Default" (T-FULL-1, T-FULL-2)

The seeded Country loaf, ready Saturday 10:00 AM, scheduled on Thursday. Expect 23 reminders: the 3:05 AM feeding on Friday sits inside quiet hours (the plan shows the warning) and **must still ring**.

### 2.3 Capacity bakes (section 7)

Several Country loaf bakes with different ready times. The counts are given in section 7.

### 2.4 Result table

For each reminder record: bake, step, kind (start, fold n, heads-up), scheduled (from the timeline), received (seconds), delta in seconds, pass (delta at most 60). Use the table in `docs/test-runs/m4.md` section 6.

## 3. Scenarios, iOS first

Each row: ID, T-case, steps, expected. Platform column: **iOS** runs now (when someone has the phone), **Android** is BLOCKED-ANDROID.

### S. Setup and smoke

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| S1 | T-PERM-1 | Do IO-1, IO-2 (install, first permission). Then, on a fresh install, create QA short and tap Schedule bake | The explainer ("primer") screen appears after the bake is saved and before any system prompt. "Not now" opens the bake with no prompt. "Turn on reminders" shows the system prompt once. After Allow, you land on the bake |
| S2 | T-FULL smoke | Schedule QA short, lock the phone, wait for the first heads-up and start | Both arrive. This is the smoke test for the rest of the script |

### A. App killed, locked

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| A1 | T-LIFE-1 | Schedule QA short. Swipe the app away from the app switcher. Lock the phone. Leave it | Every heads-up, start and fold within 60 s. Record all 17. Lock-screen text names the step and recipe; the fold titles read "Stretch and folds: fold n of 4" |
| A2 | T-LIFE-1 | Repeat A1 with the phone face down on a table, Wi-Fi on, and again with airplane mode on from the moment you schedule | Same result (T-REB-9: everything is local) |
| A3 | T-LIFE-5 | Schedule QA short, keep the app open on the live bake screen when a reminder is due | The banner and sound appear while foregrounded (in-app presentation, not swallowed) |
| A4 | Android | Same as A1 on Android, screen off, app removed from Recents | BLOCKED-ANDROID. Alarm-clock delivery: see section 6 |

### B. Tap to open

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| B1 | T-LIFE-3 (cold) | Schedule QA short, force-quit the app, wait for the "QA shape" heads-up, tap it on the lock screen | The app cold starts into **that bake**, with **QA shape** highlighted in the list (it is a later step). Nothing was written: QA shape is still "Pending" |
| B2 | T-LIFE-3 (cold) | Same for a fold reminder while the folds step is running | The bake opens on the fold step with the "Fold n of 4 done" button |
| B3 | T-LIFE-4 (warm) | App in the background (home button), tap a reminder | Same destination |
| B4 | T-LIFE-4 (foreground) | Open the live bake screen, then tap the banner of the next reminder, then tap Back once | Lands on the same bake, **Back goes to the screen you were on, not to a second copy of the live screen**. Known risk R1 (`docs/test-runs/m4.md` section 4): the tap handler uses `push`, which may stack a duplicate. Record what happens |
| B5 | T-LIFE-4 (other screen) | Be on Recipes, tap a reminder, press Back | Back returns to Recipes |
| B6 | stale tap | Schedule QA short, cancel the bake in the app, tap a reminder that was already in Notification Center | The app opens on "This bake isn't here anymore" with a way back. No crash |
| B7 | tampered | Not reproducible by hand. Covered by `tapToLive.test.tsx`. Skip | N/A |

### C. Live recompute versus pending reminders (M5)

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| C1 | M5 recompute | Schedule QA short. On the live bake, tap Done on "QA mix" **5 minutes late** (wait until 5 minutes after its planned end), then watch the next start | "QA folds" start arrives 5 minutes later than the original time (its new planned time on the timeline), and the **old** time passes with nothing delivered. Ready time on the card moves by 5 minutes |
| C2 | M5 +15 | On the running step tap +15 min | The next reminder moves 15 minutes later; the old time stays silent |
| C3 | Undo | Tap Done, then Undo in the snackbar within 8 seconds | Reminders are back at their first times (check the next one arrives at the original time) |
| C4 | T-LIFE-7 | Tap Done, then immediately swipe to the home screen and wait | Back in the app, the bake shows the new plan; the next reminder is at the new time. No duplicate |
| C5 | Cancel | Cancel the bake from the menu | No further reminder arrives for it. Wait for at least one planned reminder time to pass |
| C6 | Finish | Finish the bake at the last step | No further reminder |
| C7 | Two bakes | Schedule two bakes whose reminders land in the same minute (same recipe, different ready times fall apart; use two QA short bakes with ready times 2 minutes apart) | Both arrive, as two notifications (the title or body tells them apart; same-recipe bakes are told apart by "ready <day time>"), grouped by bake thread |
| C8 | Hold ready time | Use the "Default" bake with an 18 h cold ferment; finish "Bulk" 40 minutes late and tap Hold ready time | The oven reminders keep their original times (check the pending count with IO harness, or wait on the morning reminders in a long run) |

### D. Reboot, update, relaunch

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| D1 | T-REB-1 | Schedule QA short, restart the phone, **do not open the app** | iOS keeps pending local notifications across a reboot (IO-11): all remaining reminders arrive on time |
| D2 | T-REB-2 | Restart, then open the app. Open `/dev-notifications` in a dev build and read the pending count | The count equals the expected number for the time left (17 minus the ones that fired), no duplicates |
| D3 | T-REB-3 | Install a new build over the old one with a bake pending (Xcode Run again) | After first launch the pending set is intact or rebuilt, no duplicates. Reminders still arrive |
| D4 | T-REB-4 | Delete the app, reinstall | No stale reminders arrive (iOS removes them with the app) |
| D5 | Android | D1 to D4 on Android | BLOCKED-ANDROID. Also run section 6 |

### E. Clock, time zone and DST

Set the device date by hand in Settings, General, Date and Time (turn off Set Automatically). **Turn it back on at the end.** Use a US Eastern time zone (New York).

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| E1 | T-REB-6 | Schedule QA short for 10 minutes ahead. Change the time zone (for example to Los Angeles) before the first reminder | The reminder arrives at the **same instant**, not shifted by the zone change. The timeline shows local times for the new zone. See also IO-13 |
| E2 | T-REB-7 | Schedule QA short. Move the device clock forward 30 minutes, open the app | No burst of reminders for the skipped times. The live screen shows the step as over time ("+N min over"). Next reminders are the future ones only |
| E3 | T-REB-8 fall back | Date and Time off. Time zone New York. Set date to **Sun 2026-11-01 00:30**. Create recipe "DST fall" with seven steps of **20 minutes** each, kind Other, no folds (Feed, Mix, Shape, Bulk, Proof, Bake, Cool), tap **Start now** (so the first step starts at 00:30), lock the phone | Reminders arrive 20 minutes apart in **elapsed** time. Local wall times on the timeline run 12:50 AM, 1:10 AM, 1:30 AM, 1:50 AM, then **1:10 AM again (the clock repeated)**, 1:30 AM. Heads-ups arrive 10 minutes before each Each reminder arrives exactly once. The repeated 1:10 is not dropped, doubled or shifted to 2:10 |
| E4 | T-REB-8 spring forward | Set date to **Sun 2027-03-14 01:30**, New York. Start now with the same "DST fall" recipe | 20 minutes apart elapsed: 1:50, then 3:10 (2:xx does not exist), 3:30 ... No reminder is lost in the skipped hour |
| E5 | DST ready time | Set date to **Wed 2026-10-28**, schedule the "Default" bake ready **Sun 2026-11-01 10:00**. Open the timeline | Ready 10:00 AM local. The timeline times are consistent with elapsed durations across the change. Schedule it, then confirm with `/dev-notifications` that the pending count is 23 |
| E6 | restore | Turn Set Automatically back on and reboot | Normal clock. Delete the test bakes |

### F. Focus and Do Not Disturb

Run IO-10 (the harness Focus check) first. Then repeat with real bakes. Reminders: start and fold are time-sensitive, heads-ups are active (ADR 0011 section 5).

| ID | T-case | Build | Steps | Expected |
| --- | --- | --- | --- | --- |
| F1 | T-DND-1, T-DND-2 baseline | iOS-A (no entitlement) | Turn on Do Not Disturb. Schedule QA short, lock, kill the app | **Both start and heads-up are silenced** (no entitlement means the level is ignored). Delivered silently to Notification Center. Record. This is the free-team reality until M6 |
| F2 | T-DND-1 | iOS-B (entitlement) | Same as F1 | Start and fold reminders **break through**, heads-ups are silenced. Record |
| F3 | T-DND-2 | iOS-B | Turn on **Sleep Focus**, schedule "Default" with the 3:05 AM feeding and set the device clock to 02:50 AM that morning (E-style date change) or use QA short | The feeding start alerts and lights the screen on a locked phone. Heads-up does not |
| F4 | T-DND-3 | any | Ringer switch to silent, schedule QA short | Notification delivers; no sound. Record whether that is acceptable for an overnight bake |
| F5 | T-DND-4 | any | Low Power Mode on | No delay (within 60 s) |
| F6 | T-PERM-6 | any | Settings, Notifications, Sourdough, choose **Deliver Quietly**, then **Scheduled Summary** | Record what arrives and when. A Scheduled Summary delays everything not time-sensitive: the user-visible effect on heads-ups is the finding |
| F7 | T-DND-7 | any | Quiet hours 22:00 to 06:00 (default), a reminder at 03:05 | The 3:05 AM feeding rings (warning only at schedule time) |
| F8 | T-DND-5, T-DND-6 | Android | Priority-only DND, silent and vibrate ringer | BLOCKED-ANDROID |

### G. Permissions

IO-2, IO-4 and IO-5 cover the harness. These are the app flows.

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| G1 | T-PERM-2 | Fresh install. Schedule QA short, tap "Not now" on the primer. Then open the bake | A banner says reminders are off; timeline and live bake work; no reminder arrives. The banner action opens system Settings, never a second prompt |
| G2 | T-PERM-2 | Fresh install, primer, "Turn on reminders", **Don't Allow** | The bake opens (saved), the banner appears, nothing arrives |
| G3 | T-PERM-3 | After G2: in Settings turn Allow Notifications on while the app is in the background, return | The banner disappears. The reminders for the future steps now arrive (rebuild after the grant). No duplicates: count them |
| G4 | T-PERM-4 | With a bake pending and permission granted, turn notifications off in Settings, return to the app, then on again | Banner appears on return, the in-app countdown keeps running, the app does not crash. After turning it back on and returning, the banner clears and reminders arrive |
| G5 | T-PERM-5, T-PERM-7 | Android: Don't allow twice; block one channel | BLOCKED-ANDROID |

### H. The 64 cap with real bakes

First do IO-8 and IO-9 (harness: how iOS behaves at 64). Then, with the app's own planner:

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| H1 | T-IOS-CAP-1 | Schedule one "Default" bake. Open `/dev-notifications`, read the pending count | 23 |
| H2 | T-IOS-CAP-2 | Schedule two "Default" bakes (different ready times) | 46. No budget hint on Bakes home |
| H3 | T-IOS-CAP-3 | Three "Default" bakes | 60 (39 start and fold, 21 heads-ups): the three bakes want 69. The soonest heads-ups stay; the latest are not scheduled; every start and fold is present. The budget hint appears on Bakes home |
| H4 | T-IOS-CAP-3 sentinel | Five "Default" bakes | Design: 59 starts and folds plus one "Open Sourdough Assistant" reminder, at most 60. Code today plans 60 or 61 (bug QA04-B1, still under the 64 cap). Record the number you read |
| H5 | T-IOS-CAP-4 | After H3, let the first 4 reminders fire (use bakes whose first steps are minutes apart), then open the app and read the count | The pending set tops up with the next-soonest heads-ups. No duplicates, no gap |
| H6 | T-IOS-CAP-5 | After H4, leave the app closed until the sentinel arrives; note the first start that is **missing** | Record the maximum time the app can stay closed before a reminder is missing. Tell Chris |
| H7 | T-IOS-CAP-6 | After H3, mark steps done on one bake, read the count | Freed slots are filled with the next heads-ups, count at most 60 |
| H8 | T-IOS-CAP-7 | Cancel one of the bakes | Only its reminders are gone (count drops by that bake's share). Bake deletion has no UI yet; cancel is the closest |

### I. The overnight run (T-FULL)

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| I1 | T-FULL-2 | iOS. "Default" bake, ready Saturday 10:00 AM. Schedule on Thursday. App killed, phone locked, **Sleep Focus on**, ringer on, charging. Record every one of the 23 reminders | All within 60 s. With iOS-A (no entitlement) the Sleep Focus silences them: record it as the finding, then rerun on iOS-B when the entitlement signs. The "Default" run on iOS-A without Focus is the real M4 gate |
| I2 | T-FULL-3 | Schedule 3 loaves of Country loaf with oven capacity 2 (two slots). Check the timeline, then wait for the oven reminders | Oven steps are named with loaves and slot ("Bake, covered · 2 of 3 loaves · slot 1"). Preheat once. Two steps in the same minute arrive as one notification titled "2 steps now" |
| I3 | T-FULL-1 | Android, battery saver on, phone locked, app killed | BLOCKED-ANDROID |

### J. Accessibility of reminders

IO-14 (largest Dynamic Type on the lock screen, VoiceOver reading the banner) covers this. Add: with VoiceOver on, open the live bake from a reminder tap and check that the step name is the first thing read.

## 4. Quick order for one afternoon on the iPhone

1. IO-1 to IO-9 (about 30 minutes).
2. S1, S2, A1, B1 to B6, C1 to C7 in one QA short run (about 2 hours; schedule a second QA short while the first runs).
3. G1 to G4, D1 to D4, E1 to E6, F1 to F7.
4. H1 to H8.
5. I1 (overnight), I2.

## 5. What this script does not cover

- Whether iOS-B can sign on a free team (IO-3). If not, the time-sensitive behavior stays unverified until M6.
- Android exact alarms, Doze, OEM kills: section 6.
- A real "dead phone then reboot at 3 AM" scenario beyond D1.

## 6. Android (BLOCKED-ANDROID, written for when a phone or emulator exists)

Package id: `com.cboath.sourdoughassistant`. Test on Chris's phone with battery saver on, and record the brand and API level.

| ID | T-case | Steps | Expected |
| --- | --- | --- | --- |
| AN1 | T-AND-EXACT-1 | Fresh install on API 34 or later, schedule QA short, accept notifications | The "on-time reminders" explainer appears and opens the "Alarms and reminders" system page. Back without granting does not crash, and a banner says reminders may be late. **Known gap:** `app.config.ts` does not declare `SCHEDULE_EXACT_ALARM` yet (plan section 9), so the state reads as denied until it is added. Record that |
| AN2 | T-AND-EXACT-2 | Grant exact alarms. Screen off, app removed from Recents | Every reminder within 60 s. Start and fold use `alarmClock` delivery (an alarm icon shows in the status bar) |
| AN3 | T-AND-EXACT-3 | Deny exact alarms | "Reminders may be late" banner. Record the observed delay |
| AN4 | T-AND-EXACT-4 | `adb shell appops set com.cboath.sourdoughassistant SCHEDULE_EXACT_ALARM deny` with a bake pending, then open the app | Banner appears; after re-granting (`appops set ... allow`) and returning, all reminders are rescheduled once, no duplicates |
| AN5 | T-AND-EXACT-5 | Grant while the app is running, and while stopped | Rescheduled without duplicates |
| AN6 | T-AND-EXACT-6, -7 | API 31, 32, and 33 | No prompt on 31 and 32; the runtime prompt on 33 |
| AN7 | T-AND-EXACT-8 | `adb shell dumpsys battery unplug`, `adb shell dumpsys deviceidle force-idle`, screen off, wait 10 minutes | Exact alarms fire within 60 s. Undo with `adb shell dumpsys deviceidle unforce` and `adb shell dumpsys battery reset` |
| AN8 | T-AND-EXACT-9 | Battery saver on (`adb shell settings put global low_power 1`), app battery set to Restricted in Settings | Record; if reminders fail the app should offer to relax the restriction. Undo with `low_power 0` |
| AN9 | T-AND-EXACT-10 | `adb shell am set-standby-bucket com.cboath.sourdoughassistant restricted` | Record |
| AN10 | T-LIFE-2 | Settings, Apps, Force stop | Android cancels the alarms. Reminders resume after the next launch (rebuild). Record |
| AN11 | T-REB-1 | Reboot without opening the app | Reminders still arrive (boot-completed re-arm) |
| AN12 | T-REB-10 | Fill the alarm limit or use `adb shell cmd alarm` tools; or deny memory | A scheduling failure shows the "couldn't schedule" banner with Retry |
| AN13 | T-PERM-5, -7 | Android 13: Don't allow twice; block a channel in system settings | After two denials the app routes to Settings. A blocked channel is detected or recorded as a gap |
| AN14 | T-DND-5, -6 | Priority-only DND without exempting the app; silent and vibrate | Record. The channel is HIGH importance and has no `bypassDnd` |
| AN15 | lock screen | Secure lock screen with "Hide sensitive content" | Reminder shows "Contents hidden" (PRIVATE visibility, accepted in ADR 0011 section 4). Record |
| AN16 | alarms | `adb shell dumpsys alarm \| grep -A3 com.cboath.sourdoughassistant` | Count of pending alarms matches the app's expected count (at most 150) |
