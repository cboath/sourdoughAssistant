# iOS local notifications: IO-01 spike findings and RN-07 guidance

Status: **build and config verified on the Simulator; interactive behavior not verified.** The clean prebuild, the Simulator build (iPhone 18 Pro, iOS 27.2) and app launch with `ExpoNotifications` linked all work. The Simulator tests that need taps (permission prompt, scheduling, the 64 cap, display) were **not run**: this Mac has no UI automation (no `idb`, no `cliclick`, and osascript is denied Accessibility/Apple events), `xcrun simctl privacy` cannot grant notifications, and `simctl openurl` shows an "Open in Sourdough?" confirmation that needs a tap. Those steps move to the checklist in section 8 (the harness is built and ready, so they take minutes by hand). Every behavior claim below is tagged:

- **[verified]**: observed or checked in this repo (build, plist, entitlements, launch).
- **[Apple docs]**: documented platform behavior, not yet observed here.
- **[unverified]**: needs the Simulator or Chris's iPhone. The checklist in section 8 closes each one.

## 1. What was built

| Item | Where |
|---|---|
| `expo-notifications ~58.1.10` | `apps/mobile/package.json` |
| Plugin entry `['expo-notifications', { enableRemoteNotifications: false }]` | `apps/mobile/app.config.ts` |
| Gated time-sensitive entitlement plugin | `apps/mobile/plugins/withTimeSensitiveNotifications.js` |
| Dev-only harness | `apps/mobile/src/features/notifications/spike/` (`spikeApi.ts`, `NotificationSpikeScreen.tsx`), pure helpers in `src/features/notifications/spikeCore.ts` (+ test) |
| Dev-only route | `apps/mobile/app/dev-notifications.tsx` |
| Allowlist exception, `__DEV__` only | `apps/mobile/src/lib/deepLinks.ts` (+ tests) |

**[verified]** After `npx expo prebuild --clean -p ios` with no env vars:
- `ios/SourdoughAssistant/SourdoughAssistant.entitlements` is empty (no `aps-environment`, no time-sensitive key).
- `Info.plist` has no `UIBackgroundModes`, so no `remote-notification`.
- `CFBundleDisplayName` is still `Sourdough`.
- The `withAndroidAppLabel` plugin is untouched.

**[verified on the built Simulator app]** The signed `.app` has an empty entitlements dict, no `UIBackgroundModes`, and `ExpoNotifications_privacy.bundle` (UserDefaults reason CA92.1, no tracking, no collected data). The app launches with the native module present.

The SDK 58 `expo-notifications` plugin adds `aps-environment` by default. The `enableRemoteNotifications: false` option stops that. This is what architecture §10 asked IO-01 to check. `getDevicePushTokenAsync` (the only caller of `registerForRemoteNotifications`) is never called, and the app gains no network access or tracking.

## 2. What works without a paid Apple Developer account

| Capability | Simulator | Free personal team (7-day install) | Needs paid account (M6) |
|---|---|---|---|
| Local notifications (`scheduleNotificationAsync`, DATE trigger) | Yes [Apple docs], the permission prompt appears [unverified] | Yes [Apple docs]: local notifications need no capability, entitlement or profile | No |
| Permission prompt, provisional, denied states | Yes [unverified] | Yes | No |
| Sound (default) | Plays through the Mac [unverified] | Yes | No |
| `interruptionLevel` `passive` / `active` | Accepted [unverified] | Yes | No |
| `interruptionLevel: 'timeSensitive'` | Request accepted. **Focus breakthrough cannot be tested**: the Simulator has no Focus modes [Apple docs] | **Probably cannot be signed** [unverified], see below | Yes, plan in section 4 |
| Notification categories and actions ("Mark done") | Yes [unverified] | Yes | No |
| Critical alerts | Out of scope: needs Apple approval, not pursued | n/a | n/a |
| Push, APNs, `aps-environment` | Not used (no push in v1) | Not available to free teams anyway | Not needed |

**Time-sensitive on a free team.** The entitlement `com.apple.developer.usernotifications.time-sensitive` is a provisioned capability ("Time Sensitive Notifications" in Xcode and the App ID). Apple's supported-capabilities page lists it, but I could not read which membership columns include it, and no Apple source says a personal team can sign it. Forum evidence shows personal teams lack other provisioned capabilities (Push Notifications, iCloud, and similar). **Working assumption: a free team cannot sign it.** If it can't, the symptom is an Xcode signing error such as "Provisioning profile ... doesn't include the com.apple.developer.usernotifications.time-sensitive entitlement". Chris's iPhone settles it (checklist item 3).

**Simulator and the entitlement.** The Simulator does not check provisioning profiles, so a build with the entitlement should run there [unverified]. That proves nothing about a free team's device signing.

## 3. The 64-pending behavior

- **[Apple docs]** iOS keeps at most 64 pending local notification requests per app. When more are scheduled, the system keeps the **soonest-firing 64** and silently discards the rest. `scheduleNotificationAsync` does not throw for the dropped ones.
- **[Apple docs]** Dropped requests are gone. They do not come back when earlier ones fire, which is why ADR 0011 plans a budget of 60, a top-up sentinel, and a reconcile on every launch and foreground.
- **[unverified]** Exactly which requests survive when the 65th is scheduled with an earlier fire time than existing ones, and whether `getAllScheduledNotificationsAsync` ever reports more than 64. The harness checks this: schedule N=70, then "Read pending count".
- Time-interval and date triggers both count. Repeating triggers count as one.

## 4. Time-sensitive entitlement plan

The plugin `withTimeSensitiveNotifications` adds or removes the key:

| Build | Entitlement | Why |
|---|---|---|
| Local `expo run:ios`, Simulator, default | **Off** | Guarantees a free-team build still signs |
| `SA_TIME_SENSITIVE=1 npx expo prebuild --clean -p ios` | On | Lets Chris test whether his free team can sign it |
| `SA_TIME_SENSITIVE=0` | Off, even on EAS | Escape hatch |
| EAS `preview` and `production` profiles (`EAS_BUILD_PROFILE`) | **On** (M6) | Paid team; EAS enables the App ID capability |

**Before M6 (free team):**
1. Try once with `SA_TIME_SENSITIVE=1`. If Xcode signs it, leave it on locally. If not, stay on the default.
2. Without the entitlement, iOS ignores `interruptionLevel: 'timeSensitive'` and delivers at `active`. Scheduling does not fail [unverified]. Planner code can keep requesting `timeSensitive` unchanged.
3. QA-04 notes that overnight reminders can be silenced by Focus and Sleep Focus on free-team builds.

**After M6 (paid team):**
1. Enroll in the Apple Developer Program (A3).
2. Run an EAS `preview` build. EAS syncs the capability from the entitlement. If not, enable "Time Sensitive Notifications" on the App ID in the developer portal.
3. Run the section 8 Focus checks on that build.

**Fallbacks if time-sensitive is not available or fails:**
- Use `active` for everything and show a one-time tip: add Sourdough to the allowed apps of the user's Sleep Focus (Settings, Focus, Sleep, Apps).
- Keep the in-app "Send a test reminder" action, so the user can check the setup before an overnight bake.
- Optional v1.1 idea, not explored: AlarmKit (iOS 26+) is above the iOS 18 minimum, so it can only be an add-on.
- Critical alerts stay out of scope.

## 5. Focus and Do Not Disturb

All **[Apple docs]**, to be confirmed on a device (section 8):
- `active` is silenced by any active Focus (including Do Not Disturb and Sleep) unless the user allowed the app or the person.
- `timeSensitive` breaks through Focus and the Scheduled Summary and lights the screen. The user can turn this off per app (Settings, Notifications, Sourdough, "Time Sensitive Notifications"). It shows only when the app has the entitlement.
- `passive` is delivered silently to Notification Center.
- Notification sound still follows the ringer switch. Only critical alerts bypass it, and they are out of scope. An overnight baker needs the ringer on.
- Show Previews and the lock-screen setting are the user's choice. Titles are step names (SEC-01 L3).

## 6. Recommended API usage for RN-07

- **Handler:** call `Notifications.setNotificationHandler` once at startup with `shouldShowBanner`, `shouldShowList`, `shouldPlaySound: true`, `shouldSetBadge: false`. These are the SDK 58 field names (the harness uses them).
- **Permission:** `requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } })` after the primer. Do not set `allowProvisional` or `allowCriticalAlerts`. Provisional delivers quietly, so it is wrong for time-critical reminders. Read the state with `getPermissionsAsync()` and `ios.status` (0 undetermined, 1 denied, 2 authorized, 3 provisional). Once denied, the prompt never shows again, so the denied banner must link to `Linking.openSettings()`.
- **Trigger:** `{ type: SchedulableTriggerInputTypes.DATE, date: <epoch ms> }`. Absolute dates survive time-zone and DST changes. Do not use `TIME_INTERVAL` for plan steps. Do not pass `channelId` or `delivery` on iOS.
- **Identifier:** pass `identifier` (`sa1:<bakeId>:<stepKey>:<kind>[:n]`). Scheduling with an existing id replaces that request, so same-id reschedules need no cancel first [Apple docs].
- **Content:** `interruptionLevel: 'timeSensitive'` for `start` and `fold`, `'active'` for heads-ups and the sentinel. `threadIdentifier: bakeId`. `sound: 'default'`. Titles and bodies are capped and cleaned per ADR 0011 section 4. `data` carries the validated payload.
- **Cancel:** by id with `cancelScheduledNotificationAsync`. Never call `cancelAllScheduledNotificationsAsync` (it would also remove `satest:` and any future namespace).
- **Reconcile on launch:** on cold start, read `getAllScheduledNotificationsAsync()`, filter ids that start with `sa1:`, compare hashes, and top up to the 60 budget. Repeat on `AppState` `active`. Never touch `satest:` ids.
- **Categories ("Mark done"):** ADR 0011 keeps action buttons out of v1. If added in v1.1, register with `setNotificationCategoryAsync(id, [{ identifier: 'done', buttonTitle: 'Mark done', options: { opensAppToForeground: true } }])` and set `categoryIdentifier` on the content. Use `opensAppToForeground: true` so the user sees the recompute result (DS-01). A background-only action needs `registerTaskAsync`, which is a v1.1 piece. The harness registers a category `satest-actions` so the display and the response callback can be checked.
- **Taps:** validate the payload (`v === 1`, UUIDs) before navigating, as ADR 0011 section 4 says. The deep-link allowlist already rewrites anything else to `/`.
- **Logging:** static event names and numeric fields only. Never log titles, bodies or ids.

## 7. Dev-only harness and the deep-link rule

- Route: `/dev-notifications`. In release, `__DEV__` is false, Metro drops the `require` branch, and the route redirects to `/`. The spike modules are not loaded.
- External links: `+native-intent` runs `sanitizeIncomingPath`, which admits `/dev-notifications` **only when `__DEV__` is true**, with no query. Tests cover both states. In a development build another app on the same phone could open it. That build is never distributed, so this is accepted.
- Open it on the Simulator: `xcrun simctl openurl booted "com.cboath.sourdoughassistant://dev-notifications"`.
- Controls: request permission (standard or provisional), the current state with lock-screen and critical-alert flags, N in {1, 5, 30, 62, 70}, level (passive, active, timeSensitive), sound on or off, action buttons on or off, delay 10 or 60 s, read the pending count (with the cap verdict), cancel `satest:` only, plus a log of notification responses.

## 8. Device test checklist (Chris's iPhone)

Setup: `cd apps/mobile`, `npx expo prebuild --clean -p ios`, open `ios/SourdoughAssistant.xcworkspace`, choose your personal team, run on the iPhone (iOS 18 or later), then `npx expo start --dev-client` and open `com.cboath.sourdoughassistant://dev-notifications`.

1. **Install:** the app installs with the default build (no entitlement). It shows as "Sourdough". Install expires in 7 days.
2. **Permission, first run:** "Request permission" shows the system alert. Allow. The state reads `authorized`.
3. **Time-sensitive signing:** run `SA_TIME_SENSITIVE=1 npx expo prebuild --clean -p ios`, rebuild in Xcode. Record: signs and installs, or the exact signing error. Then go back to the default build if it fails.
4. **Provisional:** delete the app, reinstall, tap "Request provisional". No prompt appears, the state reads `provisional`, and a test notification arrives quietly in Notification Center only.
5. **Denied:** Settings, Notifications, Sourdough, turn off. Reopen the app: state reads `denied`, the request button does nothing, scheduling still returns without error but nothing shows.
6. **Display:** schedule N=5, level `active`, sound on, delay 10 s. Check banner, sound, lock screen with the phone locked, and grouping under one thread.
7. **Sound and ringer:** repeat with the ringer switch off (no sound expected) and with sound off in the harness.
8. **Cap:** cancel all, schedule N=62, then N=70 (second batch has later fire times). Read the pending count. Record the number (expected 64), and whether the dropped ones are the latest. Then schedule N=5 sooner than all of them and check which 64 remain.
9. **After firing:** wait for a few to fire and read the count again, to see that dropped requests do not reappear.
10. **Focus (entitlement build only):** turn on Do Not Disturb, then Sleep Focus. Schedule one `active` and one `timeSensitive` reminder. Expected: only `timeSensitive` appears, and only if step 3 signed. On the default build both should be silenced. Also test with the app force-quit and the phone locked.
11. **Reboot:** schedule 5 reminders 5 minutes out, restart the phone, and check they still fire.
12. **Action buttons:** with "Actions on", long-press a delivered notification and check "Mark done" and "Open" show. Tap each and check the harness log.
13. **Time zone:** schedule one for 2 minutes out, change the time zone before it fires, and check when it fires (absolute DATE trigger).
14. **Accessibility:** check the lock-screen text at the largest Dynamic Type size and with VoiceOver reading the banner.
15. **Release safety:** a Release build (`npx expo run:ios --configuration Release`) must not show or open `/dev-notifications`: the openurl lands on the Bakes tab.

## 9. Not done, and why

- **Simulator interactive tests.** See the status line: no way to tap on this Mac. Needed steps: open `com.cboath.sourdoughassistant://dev-notifications` (tap **Open** on the system dialog), tap **Request permission** and **Allow**, then run checklist items 6 and 8 on the Simulator. After permission is granted, `xcrun simctl push booted com.cboath.sourdoughassistant payload.json` can check display (local payload only).
- **Entitlement build on the Simulator.** Not rebuilt (a full rebuild takes about 25 minutes and the Simulator does not check provisioning, so it proves nothing about free-team signing). Check it on the iPhone (item 3).
- **Build notes.** `expo run:ios` takes more than 25 minutes cold here. Do not wrap it in a 1500 s timeout: an earlier run was cut off, and the app that was installed was a stale binary without ExpoNotifications ("Cannot find native module 'ExpoPushTokenManager'"). The osascript failure at the end of `expo run:ios` is harmless. Disk use after the build: about 10 GB free.
- The harness, config, plugin, and helpers typecheck, lint and test clean. Failures in `src/features/schedule/` (lint, Prettier, two Jest suites) belong to the schedule work in progress and are not part of this task.

## 10. Items for the release engineer (M6)

1. Enroll in the Apple Developer Program (A3), then build with EAS profile `preview` or `production` so the time-sensitive entitlement is included.
2. Confirm the App ID has the "Time Sensitive Notifications" capability. No push capability and no APNs key are needed.
3. App Privacy answer stays "Data Not Collected". `expo-notifications` ships its own `PrivacyInfo.xcprivacy`, which the build merges. Check the final manifest at M6.
4. No `NS*UsageDescription` string is needed for notifications.
