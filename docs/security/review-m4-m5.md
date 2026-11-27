# SEC-M45 security review: milestones M4 and M5

2026-11-27 · security-reviewer (read-only; saved by the orchestrator) · builds on `threat-model.md` and `review-m3.md`. This review covers the code after the DR-02 and QA-04 fix loop.

**Verdict:** ship with fixes. iOS is fine for device testing. Android distribution waits on SEC-M45-01 and -03.

**Counts:** 0 critical · 0 high · 1 medium · 3 low · 5 info

## 1. Threat model changes since M3

### New assets

- **Bake records:**
  - A recipe snapshot: name, notes, amounts, and package prices at the time of the bake.
  - A cost snapshot: cents, markup and sell price.
- **Notification text held by the OS:** step and recipe names only, so nothing the DB doesn't already hold.
  - On iOS it sits in the system notification store.
  - On Android it sits in the expo-notifications SharedPreferences, which Auto Backup includes.
  - It is outside the DB's tombstone handling (SEC-M3-03).
- **Lock-screen text:** step label, recipe name, the A–D letter, the loaf or slot, and the "ready" day and time. It never includes notes, amounts or money.

### New entry points

- **Notification responses (taps):**
  - Android: `ExpoNotificationLifecycleListener` turns any intent with a `google.message_id` extra that reaches the exported `MainActivity` into a response, so **another app can forge a tap with any data.**
  - `payload.ts` is the only gate, and it holds (section 4).
- **Broadcasts:** `NotificationsService` is `exported=false`.
- **Settings links:** these use `Linking.openSettings()` and `requestExactAlarmPermissionsAsync()`.
- **Build-time env:** the entitlement plugin reads `SA_TIME_SENSITIVE` and `EAS_BUILD_PROFILE`.
- **Route params:**
  - `/bake/[id]?step=`
  - `/bake/schedule/plan?recipeId=&loaves=`
  - the primer `?bakeId=`

### Network

App code makes no network calls: no fetch, XHR or WebSocket, no `openURL`, no push-token APIs, no WebView and no clipboard. The Android binary now contains Firebase Messaging (SEC-M45-01).

## 2. Findings

### SEC-M45-01 · Medium (Android release only) · Firebase Messaging is bundled and INTERNET isn't blocked

- **Where:** `expo-notifications/android/build.gradle:43` (`firebase-messaging:25.0.1`), the library's AndroidManifest (`ExpoFirebaseMessagingService`), and `app.config.ts:21` (no `blockedPermissions`).
- **Issue:** the merged manifest adds `INTERNET`, `ACCESS_NETWORK_STATE`, `WAKE_LOCK` and `c2dm.permission.RECEIVE`, plus `FirebaseInitProvider` and an exported `FirebaseInstanceIdReceiver`.
- **Scenario:** without `google-services.json`, Firebase never initializes and nothing goes over the network. Even so, the APK carries a push SDK and the network permission, so the manifest can't show "no data collected". A later dependency or config change could quietly turn FCM on.
- **Fix:**
  - Add `android.blockedPermissions: ['android.permission.INTERNET', 'com.google.android.c2dm.permission.RECEIVE']` for preview and production, keyed on `APP_ENV`. Development keeps INTERNET for Metro.
  - At AN-01, check the merged manifest and confirm there's no `google-services.json`.
  - If Play's SDK Index flags firebase-messaging, note why it's inert in the Data safety notes.
- **Owner:** RE-01 and AN-01/AN-02

### SEC-M45-02 · Low · Live writes check status outside the write transaction

- **Where:** `src/features/live/services/liveOps.ts:95-234` (applyEvent, revert, finish, cancel, sweep) and `src/db/sql.ts:49-70`.
- **Issue:** status and staleness are read before the write transaction, and the write has no status or `updated_at` guard. `useSweepBakes` runs on mount and on every foreground in two screens.
- **Scenario:**
  - (a) A sweep reads a `scheduled` bake while the user cancels it. The sweep then writes `active`, which brings the cancelled bake back and re-arms its reminders.
  - (b) applyEvent reads a stale bake while a sweep completes it, then writes `active`.
  - (c) Revert checks `updatedAt` and restores in separate transactions. `updated_at` only has millisecond resolution.
- **Fix:**
  - Do read, check and write in one `repos.transaction`.
  - Make status writes compare-and-set: `WHERE id=$id AND status IN ('scheduled','active')`, treating 0 changed rows as `notActive`.
  - Run revert as `UPDATE … WHERE updated_at=$post` in the same transaction as the step restores.
  - Make sweep single-flight.
  - Add tests for cancel during sweep and finish during applyEvent.
- **Owner:** RN-08

### SEC-M45-03 · Low (Android, on hold) · SCHEDULE_EXACT_ALARM isn't declared

- **Where:** `app.config.ts:21` and `permissions.ts:103-122`.
- **Scenario:** the request fails, so exact alarms count as denied. `alarmClock` delivery never runs, and reminders can be late under Doze. This fails safe.
- **Fix:** declare `android.permission.SCHEDULE_EXACT_ALARM`. Never use `USE_EXACT_ALARM`. Verify the PERM-ALARM flow and revocation at AN-01.
- **Owner:** AN-01

### SEC-M45-04 · Low · The tap handler can replay the last tap

- **Where:** `useNotificationTaps.ts:18-27`.
- **Issue:** the handled key lives in a `useRef`, while `useLastNotificationResponse()` keeps returning the last response for the life of the process.
- **Scenario:** when `NotificationsHost` remounts, the last tap (or a forged Android response) navigates again. It can only open a validated path.
- **Fix:** call `Notifications.clearLastNotificationResponse()` after acting on a response, or keep the key at module level. Add a remount test.
- **Owner:** RN-07

### SEC-M45-05 · Info · Sanitizers miss some invisible and bidi characters

- **Where:** `src/lib/sanitize.ts:6-9` and `route-params.ts:24-27`.
- **Issue:** they miss U+061C, U+180E, U+2060–2064 and U+FEFF. `cleanPrefill` also misses U+2066–2069.
- **Scenario:** an imported name could reorder or hide text in a notification. The impact is cosmetic or spoofing only, with a 100-character cap.
- **Fix:** add these to both patterns and add tests. RN-09's import uses the same patterns.
- **Owner:** react-native-engineer

### SEC-M45-06 · Info · `rebuild` cancels everything before rescheduling

- **Where:** `service.ts:110-144`.
- **Issue:** `rebuild` cancels all `sa1:` notifications, then reschedules them.
- **Scenario:** if the app is killed between the two steps, there are no reminders until the next launch. That's a reliability risk for overnight bakes.
- **Fix:** schedule first (the same id replaces the request), then cancel only the ids that aren't wanted.
- **Owner:** RN-07

### SEC-M45-07 · Info · Stale payloads open the not-found view

- **Where:** `payload.ts:20-26` and `LiveBakeScreen.tsx:150-154`.
- **Issue:** a stale payload opens `/bake/<id>`, which shows NotFoundView, not `/` as the brief says.
- **Scenario:** none. It writes nothing.
- **Fix:** accept it and note it in ADR 0011 §4. Optionally, `replace('/')` when the screen was opened from a tap.
- **Owner:** RN or the architect

### SEC-M45-08 · Info · A stale revert gives no feedback, and its log is useless

- **Where:** `useLiveActions.ts:58-70` and `useBakeLifecycle.ts:24`.
- **Issue:** a stale revert does nothing visible. `live.action_rejected` logs the length of the error code.
- **Fix:** show `live.undoExpired`, and log an index into a fixed list of error codes.
- **Owner:** RN-08

### SEC-M45-09 · Info · No cap on open bakes or steps per recipe

- **Where:** `service.ts:70-74`, `liveOps.ts:212-234` and `schedule/labels.ts:9`.
- **Issue:** there's no cap on open bakes or on steps per recipe. Reconcile and sweep read every open bake. The OS side is safe because the planner caps its output.
- **Scenario:** a future import that brings in thousands of open bakes would make the app slow on each foreground. There are no unbounded loops.
- **Fix:** in RN-09, cap steps in the import schema and import bakes as `completed`. Optionally cap open bakes at about 10.
- **Owner:** RN-09

## 3. Status of earlier items

### Closed

- **SEC-M3-01:** pantry size bounds, the core finiteness guard, and `isStorableBreakdown`, which stores `null` for a bad snapshot.
- **SEC-M3-02:** `FORBIDDEN_KEY` covers money and also `title|text|body`. The ring buffer is 500.
- **SEC-M3-07:** the comments are fixed and `ios/` was rebuilt clean.
- **SEC-01 L5b:** the exact-alarm state is read before each reconcile.
- **SEC-01 H1/M1:** no OTA.

### Still open

- **INTERNET block:** now more urgent (SEC-M45-01).
- **SEC-M3-03:** owned by RN-09, DS-04 and RE-03. It now also covers bake snapshots.
- **SEC-M3-04:** v1.1.
- **SEC-M3-05:** no `babel.config.js` yet. Native notification and Firebase logs aren't affected by the plugin either way.
- **SEC-M3-06:** still 20 moderate, 0 high, in dev tooling. The new packages add none. **Never run `npm audit fix --force`.**
- **SEC-01 L5a and L2a:** owned by AN-02 at M6. L2a now also covers the expo-notifications SharedPreferences, which is fine to keep in backups.
- **`cancelBakeNotifications` with no caller:** fine for now, because the next diff reconcile cancels the ids. RN-09's delete will need it.

## 4. Verified OK

### Lock-screen privacy

- **Text content:** titles and bodies come only from the step label, recipe name, letter, fold n/m, minutes and day/time. They contain no notes, amounts, costs or recipe text.
- **Cleaning:** `cleanText` removes control and bidi characters, collapses whitespace and caps at 100 code points.
- **Interpolation:** single-pass `t()` interpolation.
- **Android channels:** PRIVATE, with no `bypassDnd`.
- **Payload:** UUIDs and metadata only, with no names.

### Tap trust

- **Payload validation:** `pathForPayload` requires `v === 1`, a known kind and `z.uuid()` values. It rebuilds the path from parsed values and sends anything else to `/`. Only the default action is accepted.
- **Live screen:**
  - It validates its params again.
  - It focuses `step` only if that step is in the bake.
  - Params never cause a write.
- **External links:** still limited to `/`, `/bake/<uuid>` and a single `?step=<uuid>`.
- **Internal routes:** the primer and plan routes can't be reached from outside.

### No remote push

- `enableRemoteNotifications: false` is set.
- The entitlements file is an empty `<dict/>`, with no `UIBackgroundModes`.
- There are no push-token or background-task calls.

### "Data Not Collected"

- **iOS:** the expo-notifications and app privacy manifests declare no collected types and no tracking. `NSAllowsArbitraryLoads=false`.
- **keep-awake:** makes no network calls.
- **Android:** see SEC-M45-01.

### Entitlement plugin

Deterministic. It only reads two env vars, has no secrets and no file-system, network or shell access, and never touches `aps-environment`.

### Dev spike

- `__DEV__` gates the `require`, so it isn't bundled in release, and the route redirects to `/`.
- The allowlist admits it only in `__DEV__`.
- No in-app link points to it.
- `spikeCore.ts` contains only pure helpers.
- **Still to run on a device:** IO-01 check 15, that a Release build lands on Bakes.

### Data integrity

- **Parameterized SQL:** every value is bound, and identifiers come only from code-owned FieldMaps.
- **Transactions:** every multi-row write runs in one `BEGIN IMMEDIATE` transaction, and the adapter queue serializes statements.
- **Scoping:** `restoreRows` and `updateSteps` are scoped to `id AND bake_id AND deleted_at IS NULL` and roll back if 0 rows change.
- **Revert tokens:** held in memory and expire after a later header write.
- **Sweep:** only touches `scheduled` and `active` bakes. The one gap is SEC-M45-02.
- **Bad values:**
  - Costs are guarded against non-finite values.
  - `toISOString` throws on NaN, so a bad value fails `create` instead of being stored.

### Logger

All 45 new calls use static names with numeric or boolean fields, and none log ids, text, money or SQL params.

### Robustness

- **Reconcile:** single-flight, at most one run plus one queued, with rebuild taking priority. Only `sa1:` ids are touched, never `cancelAll`, and `satest:` entries are replaced.
- **Budget:** the planner never exceeds it, even with the sentinel.
- **Minimum lead:** 5 s.

### Permissions

- **iOS prompt:** shown only after a tap. It asks for alert and sound only: no badge, no provisional.
- **Android prompt:** channels are created before the prompt.
- **Exact alarms:** not used on iOS. A read error counts as denied. `USE_EXACT_ALARM` is absent.

### Keep-awake and shared helpers

- **Keep-awake:** held only while the live screen is open and the app is in the foreground. It's released on background, unmount and when the bake ends, and it uses a named tag.
- **`hourCycle` and `announced`:** pure in-memory helpers with no user data.

## 5. Recommendation

### iOS

Go for device testing. Fix SEC-M45-02 and -04 before M6. Run IO-01 checks 3 (time-sensitive signing on a free team) and 15 (a Release build can't open `/dev-notifications`).

### Android

Don't distribute a preview or production build until SEC-M45-01 and -03 are done, as part of AN-01.

### Backlog

The Info items go into the normal backlog. SEC-M45-05 and -09 must be done before RN-09 import ships.
