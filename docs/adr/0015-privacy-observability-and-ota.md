# ADR 0015: No analytics or crash SDK, local diagnostics, compile-time flags, data at rest, OS backups, OTA

- Status: Accepted, except section 5 (OTA / `expo-updates`), which is an **OPEN decision for Chris** (SEC-01 H1)
- Date: 2026-11-26, updated after SEC-01 (`docs/security/threat-model.md`)

## Context

- PRD NFR: the MVP stores nothing off the device, and there are no analytics without opt-in.
- The plan originally set up an EAS Update channel on the free tier.
- SEC-01 found the following:
  - **H1:** `expo-updates` sends an install identifier, so "Data Not Collected" would be inaccurate.
  - **L1:** unencrypted SQLite is acceptable.
  - **L2:** OS backups stay on, with exclusions.
  - **L6:** log content rules.
  - **L7:** release-build hygiene.

## Decision

### 1. Analytics and crash reporting

No analytics SDK and no crash-reporting SDK (no Sentry, no Firebase) in v1. Crash data comes from TestFlight and Play Console vitals, which the OS collects under the user's own OS-level consent.

### 2. Local diagnostics (SEC-01 L6)

- `src/lib/logger.ts` keeps an in-memory ring buffer of the last 500 entries (level, ts, scope, message code, small numeric or enum context).
- On an error-boundary trip, the last 200 entries are flushed to `<documents>/diagnostics.log`.
- **Never logged:**
  - recipe, step or pantry names
  - notes
  - **money amounts** of any kind: prices, costs, sell prices and markups (DS-04 `DIAG-SHARE` promises "never included: prices")
  - file URIs or filenames
  - imported file content, including Zod messages (log only the path and code)
  - full SQL parameters
- `console.*` is stripped in release builds with `babel-plugin-transform-remove-console`.
- Settings, About has "Share diagnostics". The user starts it, it goes through the share sheet, and it shows a short note on what's included first.

### 3. Feature flags

Compile-time constants in `src/lib/flags.ts` (for example `calendarExport: false`, `readyNotification: true` (provisional, ADR 0011) and `devSelfTest: __DEV__`). No remote flags.

### 4. Data at rest (SEC-01 L1): accepted

- The SQLite file is **not encrypted** at the app level. It holds recipes, prices and timings.
- It's protected by iOS Data Protection (the default class, `CompleteUntilFirstUserAuthentication`), Android file-based encryption, and the app sandbox.
- **Do not** raise the iOS protection class to `Complete`. The reconcile that runs on foreground right after unlock must be able to read the DB.
- No SQLCipher, because it would need key management and raise export-compliance questions.
- Revisit in v1.1. Cognito tokens go in `expo-secure-store`, never in SQLite.

### 5. OTA updates (`expo-updates`): **OPEN, Chris to decide** (SEC-01 H1, M1)

Each update check sends Expo an EAS client ID (a random install identifier) and keeps update error data. With it, the store answers "Data Not Collected" (App Store) and "No data collected" (Play) are **inaccurate**. Integrity also relies on the Expo account and token, because update code signing needs a paid plan (M1).

| Option | What it means |
|---|---|
| **(a) Drop `expo-updates` from v1 builds** (SEC-01 recommendation, and the architect agrees) | The app makes **zero** network calls. New code reaches testers through TestFlight and Play internal testing builds, which v1 uses anyway. Add `android.permission.INTERNET` to `blockedPermissions` for the `preview` and `production` profiles so the claim can be checked (keep it for `development`, which Metro needs). Privacy answers stay "Data Not Collected". `expo-updates` can be added back in v1.1, when sync brings network use and store declarations anyway. |
| **(b) Keep `expo-updates`** | Declare *Identifiers > Device ID* (App Store, app functionality, not linked, not tracking) and *Device or other IDs* (Play, required). Add matching `PrivacyInfo.xcprivacy` entries and a privacy-policy sentence. Apply the M1 mitigations: 2FA on the Expo account, no publish-capable `EXPO_TOKEN` in CI, `production` channel unused. |

**Until Chris decides, builds proceed as (a):** `expo-updates` isn't added, so no runtime-version or channel config is needed. Adding it later is cheap, but taking back an inaccurate privacy claim isn't.

If (b) is chosen, the configuration is:
- `runtimeVersion: { policy: 'fingerprint' }`
- the `preview` channel
- `checkAutomatically: 'ON_LOAD'` and `fallbackToCacheTimeout: 0`
- the migration rule from ADR 0003: never roll back an update that contains a migration

### 6. OS device backups (SEC-01 L2): kept on (this closes the earlier provisional item)

- iCloud device backup and Android Auto Backup stay **enabled**. They're user-controlled OS features that protect against a lost phone, not collection by the app.
- **Android:** `dataExtractionRules` (API 31+, both `cloud-backup` and `device-transfer`) and `fullBackupContent` (legacy) leave out the following, to keep within the 25 MB Auto Backup quota:

  | Path (domain `file`) | Contents | Owner |
  |---|---|---|
  | `SQLite/backups/` | pre-migration DB copies (ADR 0003, written by RN-02) | RN-02 |
  | `backups/` | pre-restore JSON safety export (ADR 0012) | RN-09 |
  | `diagnostics.log` | crash-boundary log flush | RN-04 |

  The live `SQLite/sourdough.db` (plus `-wal`/`-shm`) **is** included. Owner: AN-02, through a config plugin or `android` config. The merged manifest is checked, because Expo sets `allowBackup=true`.
- **iOS:** optionally set `isExcludedFromBackup` on `Documents/SQLite/backups/` and `Documents/backups/`. Neither expo-sqlite nor expo-file-system exposes that flag, so this needs a few lines of native code or is skipped. IO-02 decides. The copies are small and keeping them in iCloud backups is harmless.
- **Caveat for v1.1 (CL-01):** `app_meta` is left out of the *JSON* backup, but an OS restore carries it over, including `installId`. So two devices restored from the same OS backup share an `installId`. v1.1 sync must not treat `installId` as a unique device id unless it regenerates it when it detects a restore (for example by storing an id with a per-install Keychain/Keystore marker).
- QA-06 runs one OS-level restore (iCloud restore or Android device transfer). It checks that the DB opens and that the cold-start rebuild reschedules reminders.

### 7. Release-build hygiene (SEC-01 L7)

- `expo-dev-client` is used only in the `development` EAS profile. `preview` and `production` are release builds.
- Source maps are not published.
- CI runs `npm audit --omit=dev --audit-level=high` and `package-lock.json` is committed.
- Every new dependency is checked for network calls.
- `com.google.android.gms.permission.AD_ID` is blocked.

### 8. No secrets in v1

No secrets are stored, so `expo-secure-store` isn't used in v1. There's no MMKV either: small device keys live in the SQLite `app_meta` table.

## Consequences

- IO-02, AN-02 and RE-03 wait for the H1 decision before filling in the privacy answers. With (a), they answer "Data Not Collected" and the privacy policy says "no network connections".
- RE-01: with (a), `app.config.ts` has no `updates` or `runtimeVersion` config, and `eas.json` has no channels. Remove them if they're already added. The bundle-size CI step doesn't depend on this.
