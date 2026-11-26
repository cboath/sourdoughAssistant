# ADR 0001: Expo SDK 58, React Native, and minimum OS targets

- Status: Accepted (OS minimums are **provisional** until Chris answers plan Q10, test devices)
- Date: 2026-11-26
- Deciders: mobile-solutions-architect (AR-01)

## Context

The PRD (section 8) and BUILD_PLAN already pick React Native with Expo and TypeScript. This ADR records the trade-off behind that choice, fixes the SDK version, and sets the minimum OS versions.

Platform facts (Expo docs, checked 2026-11-26):

| | Expo SDK 58 (latest stable, released 2026-10-15) | SDK 57 |
|---|---|---|
| React Native / React | 0.88 / 19.3 | 0.86 / 19.2 |
| Minimum iOS supported by Expo | 16.4 | 16.4 |
| Minimum Android supported by Expo | 7 (API 24) | 7 |
| compileSdk / targetSdk | 37 / 36 | 36 / 36 |
| Xcode | 26.4+ (builds against the iOS 27 SDK) | 26.4+ |
| Node | 22.13+, 24.3+ or 26+ (odd-numbered releases unsupported) | |

SDK 58 changes that affect this project:
- `expo-notifications` adds `delivery: 'alarmClock'` on Android (`AlarmManager.setAlarmClock`), which we rely on (ADR 0011). It also shows foreground notifications by default.
- `expo-router` has a reworked navigation core, and `withLayoutContext` is deprecated. We use only the stock Stack and Tabs.
- `expo-sqlite` has dropped libSQL. We don't use it.
- R8 is on by default for Android release builds. Release builds must be smoke-tested (RE tasks).
- Until the SDK 58 Expo Go ships, `create-expo-app` still scaffolds SDK 57. We use dev builds rather than Expo Go anyway.
- Some SDK 58 packages are alpha or beta (`expo-app-intents`, Expo Modules 2.0). **We use none of them.**

## Options considered

1. **React Native + Expo (managed workflow, prebuild and config plugins).** One TypeScript codebase. `packages/core` is shared with the Phase 2 web app. Local notifications, SQLite, sharing, document picker and keep-awake are all stock Expo modules.
2. **Native apps (SwiftUI + Jetpack Compose).** These give the best notification control. But they mean two codebases for a single developer, and the core math would be duplicated or shared through KMP. The app has no heavy platform APIs, AR, widgets or watch features, and no binary-size limit.
3. **Flutter.** Its notification and SQLite plugins are workable, but the core math couldn't be shared with the planned React web app, and nothing about this app calls for it.

## Decision

- **React Native + Expo SDK 58** (`expo@~58.0.0`), New Architecture (the only option since SDK 55), Hermes, TypeScript strict.
- **Dev builds only** (`expo-dev-client`). No Expo Go. `npx expo prebuild` runs in EAS, and `ios/` and `android/` are not committed (CNG).
- **Node 24 LTS** in CI and locally (`.nvmrc` = `24`).
- **Minimum OS (provisional):**
  - **iOS 18.0** (deployment target), which is the latest (iOS 27) minus two major releases (26, 18).
  - **Android minSdk 31 (Android 12)**, targetSdk 36, compileSdk 37 (SDK 58 defaults for the last two).
  - Written reason for Android being looser than "latest minus two" (which would be API 35): Android OS updates lag badly, Chris's Android model is unknown (Q10), and API 31 is where the exact-alarm permission model starts, so every supported device uses the same notification code path (`SCHEDULE_EXACT_ALARM`). If Chris's phone runs Android 15 or later, we can raise this to 33 without code changes.
- Set through `expo-build-properties` in `app.config.ts` (owner: RE-01, then IO-02/AN-02).

## Consequences

- RN-01 must pin `expo@~58` explicitly instead of trusting `create-expo-app`'s default, and must use Node 24.
- RE-01: CI uses Node 24. EAS images must have Xcode 26.4 or later.
- Native work is limited to config plugins (exact alarm, time-sensitive entitlement). There is no custom native module in v1 unless AN-01/IO-01 find that `expo-notifications` falls short.
- If Q10 shows an older device (iOS 17 or Android 11 or lower), we lower the minimums. Expo supports down to iOS 16.4 and Android 7. Android 11 and lower would need a second code path that skips the exact-alarm permission.
