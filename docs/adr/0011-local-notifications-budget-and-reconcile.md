# ADR 0011: Local notifications: platform budget, deterministic ids, idempotent reconcile

- Status: Accepted. Delivery details (marked **verify**) are confirmed by the AN-01 and IO-01 spikes. These are technical checks, not open decisions. The ready notification was decided as off by default (`docs/open-questions.md` B8)
- Date: 2026-11-26

## Context

- NFR: step notifications must fire within 1 minute with the app closed, including under Android battery saver.
- iOS keeps at most **64 pending** local notifications per app and silently drops the rest.
- Android 12+ needs exact-alarm permission. Android 14+ denies `SCHEDULE_EXACT_ALARM` by default for new installs, and Play restricts `USE_EXACT_ALARM` to alarm-clock and calendar apps. Doze and OEM battery killers defer alarms. AlarmManager caps each app at 500 alarms.
- Pending notifications must be rescheduled with no duplicates after a reboot, an app update or a restore (M4).
- A default single bake produces about **23 notifications**: 10 step starts (including preheat), 3 extra folds, and about 10 heads-ups at the default 10 min. Three concurrent bakes come to about **69 to 75**, which is over the iOS cap (QA ledger).

## Decision

### 1. One source of truth, a pure planner, and an idempotent reconcile

- The **desired set** of notifications is derived purely from the DB: active and scheduled bakes, their `bake_step` rows, settings, and `now`.
- `planNotifications(input) → NotificationIntent[]` is a pure TS function in `apps/mobile/src/features/notifications/planner.ts`, unit-tested in Jest. It lives in the app, not in core, because it is platform policy.
- `reconcileNotifications({ mode })` in `service.ts` compares the desired set with `Notifications.getAllScheduledNotificationsAsync()`, cancels anything stale, and schedules anything missing. It is safe to call any number of times.

### 2. Deterministic identifiers and a content hash

- **Identifier:** `sa1:<bakeId>:<stepKey>:<kind>[:<n>]`, where `kind` is `start | fold | headsup | topup | ready` and `n` is the fold index. For `ready`, the identifier uses the itemId in place of the stepKey. Step keys come from ADR 0009.
- **Payload** in `content.data` (this confirms the DS-01 deep-link payload):

  ```ts
  { v: 1, bakeId, bakeStepId, stepKey, kind, foldIndex?, fireAt /* ISO UTC */, hash }
  ```

  `hash` is a short FNV-1a hash of (fireAt, title, body, channel, delivery, interruptionLevel).
- An existing request with the same id and the same hash is left alone. A different hash means cancel, then schedule. Requests in our `sa1:` namespace whose ids aren't desired are cancelled.
- **Modes:**
  - `diff` is the default.
  - `rebuild` cancels everything in our namespace and schedules the whole desired set. It runs on **cold start**, after a **restore**, after the **exact-alarm permission changes**, and after a **time-zone change**. The rebuild covers state that `getAllScheduled` can misreport, for example alarms that Android cleared after a force-stop.
- **Single flight:** a module-level promise queue. If a reconcile is requested while one is running, one more run is queued after it. Two runs never overlap, so duplicates can't happen.
- **Triggers:**
  - app launch (`rebuild`)
  - `AppState` changes to `active` (`diff`)
  - a bake is created, edited, cancelled or completed
  - any recompute event
  - (A settings change doesn't trigger one: each bake snapshots `heads_up_min` when it's created, and quiet hours only produce warnings.)
  - restore (`rebuild`)
  - a permission grant (`rebuild`)
  - a notification is received while the app is in the foreground (`diff`, to top up)

### 2a. Test reminder (DS-04 `SET-REMINDERS`)

- The "Send a test reminder" action schedules **one** notification with identifier **`satest:<epochMs>`**, firing 10 s later on the same channel, delivery and interruption level as a step start. Its payload is `{ v: 1, kind: 'test' }` and it deep-links to `/`.
- **It's outside the `sa1:` namespace**, so neither `diff` nor `rebuild` touches it. Reconcile only ever lists and cancels `sa1:` ids.
- Before scheduling, the action cancels any pending `satest:` request, so at most one exists at a time.
- **Budget:** it briefly takes one of the 4 spare iOS slots (60 + 1 < 64), so it never displaces bake reminders. Android's budget is unaffected.

### 3. Budget (the iOS 64 cap)

- **Budget:** iOS **60**, leaving 4 spare under the 64 cap for system slack and the top-up sentinel. Android **150**, well below the 500-alarm cap.
- **Coalescing:** within one bake, `start` and `fold` intents that fire in the same minute merge into one notification ("Shape: Country loaf, Whole wheat"). The id uses the earliest stepKey, and the payload lists them all.
- **Selection:**
  1. **Critical** intents (`start`, `fold`) are sorted by `fireAt`, and the first `budget − 1` are taken. `H` is the `fireAt` of the last one taken, or infinity if they all fit.
  2. **Heads-ups and `ready` intents** with `fireAt ≤ H` fill the remaining slots, soonest first. They never displace a critical intent.
  3. If any critical intent was left out, one **top-up sentinel** fires at `H − 1 min`: "Open Sourdough Assistant to keep your bake reminders coming." It uses the active, non-time-sensitive level.
- **Worked example:** three concurrent default bakes have about 39 critical intents (after coalescing), so all of them fit. About 21 heads-ups then fit, and the latest-firing heads-ups are dropped. QA-04 adds a three-bake case and a five-bake case that exercises the sentinel.
- Intents with `fireAt ≤ now + 5 s` are never scheduled. Missed reminders show in the live view instead.

### 4. Content and lock screen

- **Title:** the step label from the shared `stepLabel` helper (the plain core name plus slot or loaf info, ADR 0009). **Body:** as specified by DS-03: "Time to start · {recipe}", plus "Fold 2 of 4", "In 10 min: Shape", and the A–D letter or "ready {dayTime}" where DS-03 says so.
- **Ready notification (`kind: 'ready'`): built, but OFF by default** (decided by Chris, `docs/open-questions.md` B8; DS-03 Q-C4).
  - It sits behind `flags.readyNotification`, **default `false`**. While the flag is off, the planner emits **no** `ready` intents, so it adds nothing to the iOS 64 budget.
  - When the flag is on: one per bake item at its ready instant (the end of Cool), "Ready to eat · {recipe}". Identifier `sa1:<bakeId>:<itemId>:ready`, on the `bake-headsup-v1` channel with `interruptionLevel: 'active'`. Budget tier: non-critical, same as heads-ups, so it never displaces a step or fold reminder.
  - Turning it on is a one-line flag change plus a QA budget re-check.
- **Android public version (DS-03 Q-A8):** expo-notifications' documented content input has no `publicVersion` field, so with PRIVATE visibility a secure lock screen shows the system's "Contents hidden" text. That's accepted, and no native work is planned. AN-01 confirms on device.
- No personal data. SEC-01 L3 accepts recipe and step names on the lock screen.
- **Titles and bodies are capped at 100 characters** and cleaned: control and bidi-override characters are removed (same rules as the ADR 0012 import sanitizer), because imported names reach the lock screen.
- Tapping a notification deep-links to `/bake/<bakeId>?step=<bakeStepId>`. The root layout handles this with `Notifications.useLastNotificationResponse()` for cold starts and `addNotificationResponseReceivedListener` otherwise.
- **The payload is validated before navigating** (SEC-01 M2): `v === 1`, and `bakeId` and `bakeStepId` must be UUIDs, checked with Zod. Anything else opens `/` and is logged as a code only.
- **No action buttons ("Done") in v1.** This confirms DS-01's recommendation: marking a step done must show the recompute result first. Revisit in v1.1 with a category and a background task.
- Foreground: `setNotificationHandler` shows banners and plays sound. SDK 58 does this by default; we set it explicitly.

### 5. iOS

- Ask for permission with `allowAlert`, `allowSound` and `allowBadge: false`, after an in-app primer screen (DS-01 `PERM-NOTIF`).
- `interruptionLevel: 'timeSensitive'` for `start` and `fold`, and `'active'` for heads-ups and the sentinel. This needs the **`com.apple.developer.usernotifications.time-sensitive`** entitlement, added through `ios.entitlements` in `app.config.ts`, with no Apple approval needed. **Verify (IO-01):** whether a free personal team can sign it. This matters for all of M0 to M5, because Chris won't enroll in the Apple Developer Program until M6 (open-questions A3), so every iPhone build before then is a free 7-day Xcode install. If a personal team can't sign it, the entitlement is added only in the M6 Developer Program builds. Until then, overnight reminders use the `active` level and may be silenced by Focus, so QA-04 notes this.
- `threadIdentifier = bakeId` groups each bake's notifications.
- **Critical alerts are out of scope** (they need Apple approval).

### 6. Android

**Channels** (ids are versioned, because a channel's importance can't change after it's created):

| Channel id | Name | Importance | Used for |
|---|---|---|---|
| `bake-steps-v1` | Bake steps | HIGH (heads-up banner, sound, vibration) | start, fold |
| `bake-headsup-v1` | Upcoming step warnings | DEFAULT | headsup |
| `general-v1` | General | DEFAULT | top-up sentinel |

- Channels are created at startup, before the permission request (Android 13 shows the prompt only after a channel exists).
- `bypassDnd` is **not** used, because it needs the policy-access permission.
- **Lock-screen visibility is PRIVATE** (`AndroidNotificationVisibility.PRIVATE`), changed from PUBLIC per SEC-01 L3. This respects the user's "hide sensitive content" setting.
  - It must be set before the first install anywhere, because a channel's settings can't be changed once it exists.
  - If it ever needs to change, create new `-v2` channel ids and delete the `-v1` ones.

**Permissions:**
- `POST_NOTIFICATIONS` (API 33+), requested at runtime after the primer.
- `SCHEDULE_EXACT_ALARM`, declared in the manifest. If `getExactAlarmPermissionsAsync()` reports it as denied, the app shows the `PERM-ALARM` explainer and then calls `requestExactAlarmPermissionsAsync()`, which opens system settings. On return, the app checks again and runs a `rebuild`.
- **Not `USE_EXACT_ALARM`** (Play policy).
- `RECEIVE_BOOT_COMPLETED` is added by expo-notifications so it can re-arm after a reboot.
- `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is **not** requested (Play restricts it). Instead, the app detects optimization with `expo-battery` `isBatteryOptimizationEnabledAsync()` and deep-links to `Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` with a short guide. An OEM-specific guide link is also shown (for example, dontkillmyapp.com content summarized in-app, so no network is needed).

**Delivery:**
- `start` and `fold` use **`delivery: 'alarmClock'`** (`setAlarmClock`), which is never deferred by Doze or battery saver. It shows an alarm icon in the status bar, which is acceptable for an overnight baking reminder.
- Heads-ups and the sentinel use `'bestEffort'` (`setExactAndAllowWhileIdle`).
- Without exact-alarm permission, expo falls back to `bestEffort`. In that case the app shows the "Reminders may be late" banner.
- **Check before every reconcile** (SEC-01 L5b): run `getExactAlarmPermissionsAsync()` and pick the `delivery` value from the result, rather than relying on the fallback. `setAlarmClock` can throw `SecurityException`, and Android cancels an app's exact alarms when the user revokes the permission. The resulting change in the delivery-mode hash makes the next foreground reconcile reschedule everything.
- **Verify (AN-01):** on-time delivery with `alarmClock` on Chris's phone, under battery saver, after a reboot, and after an app update. Also check whether a config plugin is needed. The hypothesis is that it isn't.

### 7. Permission-denied and degraded states

`usePermissions` (Zustand), refreshed when the app comes to the foreground, drives banners on Bakes home and the live view:
- notifications denied
- exact alarms denied (Android)
- battery optimization on (Android, informational)

The schedule and live view work in all of these states (PRD edge case).

### 8. Calendar (S-10, Could)

Only if M4 finishes on time: `expo-calendar` write-only access, creating events in a user-chosen calendar. Not part of the reconcile.

## Options considered

- **Store a notification ledger table in SQLite.** Rejected: the OS's pending list plus deterministic ids is enough, and a ledger can drift from the OS.
- **Schedule only the next N hours.** It needs background wake-ups to top up, which iOS doesn't guarantee. The budget-by-count approach plus the sentinel is deterministic.
- **Use `USE_EXACT_ALARM`.** Rejected by Play policy for this app category.
- **Use an Android foreground service for long bakes.** Too heavy, it needs a persistent notification, and it isn't needed when `setAlarmClock` is used.

## Consequences

- RN-07 implements `planner.ts`, `service.ts`, `channels.ts` and `permissions.ts`. IO-01 owns the entitlement. AN-01 owns verifying exact alarms.
- QA-04 adds these cases: three concurrent bakes, five concurrent bakes (sentinel), permission revoked and then granted, and a time-zone change.
