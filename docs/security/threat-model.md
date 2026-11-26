# SEC-01 threat model: Sourdough Assistant v1 (local-only)

2026-11-26 · security-reviewer (SEC-01), saved by the orchestrator · Read-only review

**Inputs:**

- `docs/architecture.md`, `docs/data-model.md`
- ADRs 0003 (safety copy), 0011, 0012 and 0015
- `docs/PRD.md` §8
- `docs/design/flows.md` §1.4, §5.3 and §9
- `apps/mobile/package.json`, `apps/mobile/app.config.ts`, root `package.json`

`npm audit` was not run because npm wasn't on the PATH in the review shell. SEC-02 runs it (L7).

## 1. Summary

| Area | Verdict |
|---|---|
| Unencrypted SQLite | **Acceptable.** Data is low-sensitivity and OS file encryption is enough (L1) |
| iCloud and Android Auto Backup left on | **Keep them on.** Add Android backup rules that leave out `backups/` and `diagnostics.log` (L2) |
| Recipe and step names on the lock screen | **Acceptable.** On Android, use PRIVATE visibility rather than PUBLIC (L3) |
| Backup and import parsing | Sound design. RN-09 must close the gaps (M3, M4) |
| Deep links | Expo Router exposes **every route**. Needs an allowlist (M2) |
| OTA updates | A supply-chain risk without code signing (M1) |
| Privacy labels | **"Data Not Collected" is inaccurate while `expo-updates` ships** (H1) |

**Totals:** 0 Critical, 1 High (a privacy-disclosure problem, not an exploitable bug), 4 Medium, 7 Low.

## 2. Assets

| Asset | Location | Sensitivity |
|---|---|---|
| Recipes, steps, notes, tags | `sourdough.db` | Low. Becomes personal data if a cottage baker puts customer names or order notes in names or notes |
| Pantry prices, stores, price history | `sourdough.db` | Low. Business-confidential for a cottage baker |
| Bake schedules (when the user is awake or away overnight) | `sourdough.db`, pending OS notifications | Low |
| Settings, `app_meta.installId` | `sourdough.db` | Low. `installId` is a stable per-install identifier |
| Safety copies | `<documents>/backups/pre-restore-*.json`, `pre-migration-v*.db` | Same as the DB |
| Exported backup and recipe files | `cacheDirectory`, then wherever the user sends them | Same as the DB, and outside app control once shared |
| `diagnostics.log` | `<documents>` | Low, if L6 holds |
| Integrity of the app's JS code | EAS Update CDN, device cache | **High.** Whoever controls the JS controls everything |
| Publishing credentials (Expo account, `EXPO_TOKEN`, store keys) | Chris, GitHub Actions secrets | **High** |
| Accurate privacy declarations | App Store Connect, Play Console, privacy policy | High: store compliance and trust |

## 3. Actors

1. **The device owner:** trusted, but makes mistakes, such as picking the wrong file or hand-editing a backup.
2. **A malicious file author:** shares a recipe or "backup" by message, AirDrop or web download. This is the realistic v1 attacker.
3. **A malicious app on the same device:** fires deep links at our scheme, registers the same scheme, or offers files through the picker or a storage provider.
4. **Someone with the unlocked or locked phone:** can see lock-screen notifications. Physical extraction is out of scope.
5. **A compromise of Expo, GitHub or the npm supply chain:** could deliver malicious JS by OTA or in a build.
6. **A store reviewer or regulator:** checks the privacy labels against what the app actually does.

## 4. Trust boundaries and entry points

| # | Boundary | Entry point | What crosses |
|---|---|---|---|
| TB1 | File system → app | `expo-document-picker` (backup restore, recipe JSON or text import) | Untrusted bytes, up to 20 MB |
| TB2 | Other apps → app | Custom URL scheme (`sourdough` in the architecture doc, `sourdoughassistant` in `app.config.ts`); expo-router deep-links every route automatically | Untrusted path and query parameters |
| TB3 | OS → app | Notification tap (`content.data`) | Our own payload, round-tripped through the OS |
| TB4 | App → OS or other apps | `expo-sharing`, FileProvider URIs, "Save my data" (raw `.db`), "Share diagnostics" | User data leaving the sandbox at the user's request |
| TB5 | App → lock screen | Notification title and body | Step and recipe names |
| TB6 | App → OS backup | iCloud device backup, Android Auto Backup and device-to-device transfer | The whole sandbox except caches |
| TB7 | Network → app | `expo-updates` check and download from Expo | Executable JS, plus install identifiers sent out |
| TB8 | Build pipeline → binary | npm, EAS Build, GitHub Actions | Code |

## 5. Threats and recommendations

### High

**H1. "Data Not Collected" is inaccurate while `expo-updates` is included**

- **Where:** ADR 0015 ("only network call"), IO-02, AN-02, RE-03.
- **Issue:**
  - Each update check sends Expo an EAS client ID, a random install identifier stored on the device. Expo also keeps failed-update IDs and launch error text.
  - Expo's store-declaration guidance says to declare **Identifiers > Device ID** on the App Store (not used for tracking), and **Device or other IDs** on Play (required).
  - `expo-updates` ships no privacy manifest, so Xcode's privacy report won't show this.
- **Scenario:** Chris submits "Data Not Collected" and "No data collected". A Play review or a later traffic audit finds the identifier. The result can be a Data safety policy violation or an App Store rejection. It also contradicts PRD §8 ("stores nothing off the device").
- **Fix (choose one and record it in ADR 0015):**
  - **(a) Recommended for v1:** leave `expo-updates` out of v1 builds. They're internal testing only, and new builds go out through TestFlight and Play internal testing anyway. The app then makes zero network calls. Optionally add `android.permission.INTERNET` to `blockedPermissions` for preview and production so the claim can be checked.
  - **(b) Keep OTA:**
    - Declare Device ID / Device or other IDs (App functionality, not linked to identity, not tracking), plus diagnostics if the error text applies.
    - Add matching `PrivacyInfo.xcprivacy` entries.
    - Add a sentence to the privacy policy.
- **Owners:** AR-01 follow-up for the decision, then IO-02, AN-02 and RE-03.

### Medium

**M1. OTA updates aren't signed end to end**

- **Where:** ADR 0015, the EAS Update `preview` channel.
- **Issue:** EAS Update code signing needs a Production or Enterprise plan, so it isn't available on the free tier. Integrity then rests only on TLS and on control of the Expo account and `EXPO_TOKEN`.
- **Scenario:** The Expo account is phished or the CI token leaks. The attacker publishes a JS bundle to `preview`, and every tester loads it on the next launch. Because the app has `INTERNET`, that bundle can read the whole DB and send it out.
- **Fix:**
  - H1(a) removes this threat.
  - If OTA stays:
    - Turn on 2FA for the Expo account.
    - Don't give CI an `EXPO_TOKEN` that can publish updates. Publish by hand, or use the narrowest robot token.
    - Leave `production` unused.
    - Adopt `updates.codeSigningCertificate` if the plan is ever upgraded. This needs a new runtime version.
- **Owners:** RE-01 (CI secrets), RE-03 (channel policy).

**M2. The deep-link surface is the whole route tree**

- **Where:** `architecture.md` §4, `app.config.ts`.
- **Issue:**
  - Expo Router deep-links every file route, so any app or web page can open any route with any parameters. That includes `import.tsx`, `settings/backup.tsx`, `bake/[id]/index.tsx`, `recipe-editor/[id].tsx?duplicateOf=` and `pantry-editor/[id].tsx?returnTo=`.
  - The scheme doesn't match between the docs (`sourdough`) and the config (`sourdoughassistant`).
  - `sourdough` is generic enough that another app could claim it. On iOS, which app wins is undefined.
- **Scenario:**
  - A web page opens `sourdoughassistant://import?file=...` or `.../settings/backup?action=undo`.
  - Nothing reads a query parameter on mount yet, so this is harmless today. RN-09 and RN-10 could easily add that kind of behavior.
  - Bad parameters, such as non-UUIDs or very long strings, could crash screens or end up in logs.
- **Fix:**
  1. Add `app/+native-intent.tsx` (`redirectSystemPath`). Allow only `/` and `/bake/<uuid>`, with an optional `?step=<uuid>`. Send everything else to `/`.
  2. No route changes state on mount because of a parameter. Import accepts only a URI returned by the in-process picker, never one from a route parameter.
  3. Every screen checks its parameters with Zod: `z.uuid()`, or `'new'` where allowed. An unknown ID goes to `+not-found`.
  4. Notification taps check the payload (`v === 1`, UUIDs) before `router.push`.
  5. Use one distinctive scheme. The bundle ID, `com.cboath.sourdoughassistant`, avoids collisions. Update the architecture doc to match.
- **Owners:** RN-04, RN-07, RN-09, RE-01, AR-01.

**M3. Imports can exhaust memory or hang the app**

- **Where:** ADR 0012 steps 1 and 2, and the text grammar.
- **Issues:**
  - `DocumentPickerAsset.size` can be `undefined` or wrong with Android storage providers (SAF). A size check that relies only on it lets a file of any size be read.
  - Even when the check works, a 20 MB `readAsStringAsync` plus `JSON.parse` uses several times that in heap on Hermes and blocks the JS thread on a mid-range Android.
  - The text parser is a ReDoS risk if its regexes have nested or overlapping quantifiers.
  - `1e400` parses to `Infinity`.
- **Scenario:** Someone sends a 200 MB `.json` "recipe", or a text file with one 1 MB line. The app freezes or crashes out of memory every time the user tries to import it.
- **Fix:**
  - After copying the file to the cache, check `FileSystem.getInfoAsync(uri).size`. Reject it before reading if the size is unknown or over the cap.
  - Caps:
    - Backup: **10 MB**, unless QA measures that realistic data needs more.
    - Recipe JSON: **1 MB**.
    - Recipe text: **64 KB**, **500 lines** and **500 characters per line**.
  - Parse text line by line with anchored regexes that have no nested quantifiers. Unit-test pathological inputs with a time limit.
  - Use `z.number().finite()`, plus `.int()` and `.safe()` where they apply.
  - Show a "Checking file…" state.
  - Fuzz corpus: truncated files, 1e6-deep `[[[...]]]`, `__proto__` keys, NaN-like values, BOM, UTF-16, duplicate keys, a 21 MB file.
- **Owner:** RN-09.

**M4. Schema gaps: unchecked strings, anchor cycles, row caps that are too low**

- **Where:** ADR 0012 step 4, `data-model.md` §2.
- **Issues:**
  1. Several fields have no DB CHECK, so Zod is the only guard. They must use strict schemas with caps, never `z.any()`, `z.unknown()`, `.passthrough()`/`.loose()` or `z.record()`. The fields are:
     - `bake_step.name` and `kind`
     - `price_history.package_unit` and `store`
     - the embedded `recipeSnapshot` and `costSnapshot`
  2. `step.anchor_step_id` can form a cycle or point into another recipe. A crafted recipe hangs the app when it's scheduled.
  3. Duplicate primary keys inside an array only show up as a vague transaction failure.
  4. The cap of 10,000 rows per table is too low for `bakeSteps` (about 700 bakes at about 15 steps each). A heavy user's real backup would be rejected and could never be restored.
  5. The confirm dialog might show the file's own `counts` field instead of counts computed from the validated data.
- **Fix:**
  - Strict, fully specified Zod schemas for every nested object, with the same caps as the DB: names 200, step notes 2000, notes 10,000, tags 20 × 40.
  - Names allow only Unicode general categories L, M, N, P, S and Zs. Remove C0/C1 control characters and the bidi overrides U+202A–U+202E and U+2066–U+2069.
  - In memory, check that IDs are unique and that anchors stay in the same recipe without cycles.
  - Run core `validateSteps` on every imported recipe and every snapshot. **The core scheduler must fail closed on cycles**, using a visited-set or depth guard.
  - Per-table caps: `bakeSteps` about 200k, `bakeItems` and `bakes` about 20k, `priceHistory` about 50k.
  - **The exporter runs the export through the restore validator before sharing it**, so the app can never produce a backup it can't restore.
  - Never `Object.assign` or spread the raw parsed object. Use only Zod's output.
- **Owners:** RN-09, CO-02 and CO-03 (cycle guard).

### Low

**L1. Unencrypted SQLite: accepted**

- **Why it's acceptable:**
  - The data is recipes, prices and timings.
  - iOS Data Protection (`CompleteUntilFirstUserAuthentication`) and Android file-based encryption protect the file at rest, and the sandbox keeps other apps out.
  - SQLCipher would bring key management, a `secure-store` dependency and export-compliance questions for no real gain.
- **Don't raise the iOS protection class to `Complete`.** Foreground reconciles right after unlock need to read the DB.
- **v1.1:** revisit when Cognito arrives. Tokens go in `expo-secure-store`, never in SQLite.
- **Owners:** RN-02 (no action); AR-01 records the acceptance in ADR 0015.

**L2. OS device backups: keep them enabled**

- **Why:** these are user-controlled OS features that protect against a lost phone, the main way a local-only user loses data. This isn't collection by the app.
- **Refinements:**
  - **(a)** Android `dataExtractionRules` (API 31+) and `fullBackupContent`: leave out `files/backups/` and `diagnostics.log`. Auto Backup has a 25 MB quota per app, and going over it silently stops backups. Expo turns `allowBackup` on by default, so AN-02 checks the merged manifest.
  - **(b)** On iOS, optionally set `isExcludedFromBackup` on `backups/`.
  - **(c)** `data-model.md` says `app_meta` is "never backed up". That holds for the JSON backup but not for OS backups: a restored device keeps the same `installId`. v1.1 sync must not treat `installId` as a unique device ID without regenerating it when it detects a restore (CL-01).
  - **(d)** QA-06 adds one OS-level restore, either an Android device-to-device transfer or an iCloud restore. It confirms that the DB opens and that the cold-start rebuild reschedules reminders.
- **Owners:** AN-02, IO-02, CL-01, QA-06.

**L3. Lock-screen notification content: acceptable, with one change**

- Names like "Shape / Country loaf" are low-sensitivity, and iOS users control previews with *Show Previews*.
- **The change:** ADR 0011 §6 sets Android lock-screen visibility to **PUBLIC**, which overrides the user's "Hide sensitive notification content" setting. A recipe named "Smith wedding order" would show in full. Use **PRIVATE**, or leave `lockscreenVisibility` unset.
- **Decide before the first install.** Once a channel exists, users can change its settings but the app can't.
- Cap titles and bodies at about 100 characters and clean them as in M4. Imported names reach the lock screen and could carry phishing text.
- **Owners:** RN-07 (`channels.ts`), AN-01 (verify), DS-01.

**L4. File hygiene for share sheet, export and picker**

- **(a)** Delete exported files from `cacheDirectory` after `shareAsync` resolves.
- **(b)** Don't set `UIFileSharingEnabled` or `LSSupportsOpeningDocumentsInPlace`. Otherwise `backups/` and `diagnostics.log` show up in the Files app.
- **(c)** Before "Save my data" shares the raw `.db`, run `PRAGMA wal_checkpoint(TRUNCATE)` or `VACUUM INTO` a temporary copy. Otherwise recent writes are missing, because the `-wal` file isn't included.
- **(d)** The picker accepts `application/json`, `text/plain` and `*/*`. Android providers often report `application/octet-stream`. Rely on content validation, not MIME type.
- **(e)** SEC-02 checks that the FileProvider from `expo-sharing`/`expo-file-system` has `exported=false` and `grantUriPermissions=true`.
- **(f)** The export screen says that the file contains all recipes, prices and bakes.
- **Owners:** RN-09, RN-02, IO-02, SEC-02, DS-04.

**L5. Permissions: the set is appropriate**

- **The set:** `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (not `USE_EXACT_ALARM`), the automatic `RECEIVE_BOOT_COMPLETED` and `VIBRATE`, and the iOS time-sensitive entitlement. All fit the core feature.
- **Additions:**
  - **(a)** Add `com.google.android.gms.permission.AD_ID` to `blockedPermissions` as a precaution.
  - **(b)** Call `canScheduleExactAlarms()` before using `delivery: 'alarmClock'`. `setAlarmClock` throws `SecurityException` without the permission, and Android cancels the app's exact alarms when the user revokes it. The foreground rebuild covers that.
  - **(c)** Remove `aps-environment`, as ADR 0011 says.
  - **(d)** If S-10 ships, calendar events sync through the user's calendar account. Say so in the privacy policy and keep access write-only.
  - **(e)** SEC-02 lists the exported components in the merged manifest.
- **Owners:** AN-02, RN-07, IO-01, RE-03, SEC-02.

**L6. Diagnostics and log content**

- The logger never records any of these:
  - recipe, step or pantry names
  - notes
  - file URIs or filenames
  - imported file content, including in Zod error messages; log the path and code only
  - full SQL parameters
- Strip `console.*` in release builds.
- "Share diagnostics" shows a preview or a short note about what it contains.
- **Owners:** RN-04 (`src/lib/logger.ts`), RN-09.

**L7. Release build and supply chain**

- **(a)** `expo-dev-client` only in the `development` profile. The `preview` and `production` profiles are release builds (`developmentClient: false`). The dev launcher loads bundles from any URL.
- **(b)** Don't publish source maps. Keep them private if they're uploaded anywhere.
- **(c)** Add `npm audit --omit=dev --audit-level=high` to CI, and commit `package-lock.json`.
- **(d)** Check every new dependency for network calls, as ADR 0015 says. The current list has no third-party network SDKs. Set TanStack Query to `networkMode: 'always'`.
- **Owners:** RE-01, RN-04.

### Informational

- The backup's SHA-256 checksum detects corruption, not who made the file. The UI shouldn't call it "verified".
- The pre-migration and pre-restore safety copies are good practice and add no exposure.

## 6. Answers to the questions put to SEC-01

| Question | Answer |
|---|---|
| Is unencrypted SQLite acceptable? | Yes (L1) |
| Keep iCloud and Android Auto Backup on? | Yes, with rules that leave out the safety copies and logs (L2). Close the provisional item in ADR 0015 |
| What restore size and string caps? | Check the size after copying. Caps of 10 MB for backups, 1 MB for recipe JSON and 64 KB for text. Raise the per-table row caps. Cap and clean every string, including those in snapshots (M3, M4) |
| Are names on the lock screen OK? | Yes, but use PRIVATE rather than PUBLIC visibility on Android (L3) |
| Is "Data Not Collected" accurate? | Not while `expo-updates` ships (H1) |

## 7. Owner routing

| Owner | Findings |
|---|---|
| AR-01 follow-up | H1 decision, L1 and L2 recorded in ADR 0015, M2 scheme mismatch |
| RN-02 | L4c |
| RN-04 | M2, L6, L7d |
| RN-07 | M2 payload check, L3, L5b |
| RN-09 | M2 import route, M3, M4, L4 |
| CO-02 / CO-03 | M4 anchor-cycle guard |
| AN-01 / AN-02 | L2a, L3 verify, L5a, L5e, H1 Data safety |
| IO-01 / IO-02 | L2b, L5c, H1 App Privacy and privacy manifest |
| RE-01 | M1, M2 scheme, L7a–c |
| RE-03 | H1 privacy policy, M1 channel policy, L5d |
| CL-01 | L2c `installId` |
| QA-06 / SEC-02 | L2d, M3 fuzz corpus, merged-manifest checks |

## Release recommendation

**Ship with fixes.** Nothing blocks M0–M5. Before the M6 TestFlight and Play internal submissions (RE-03):

- H1 must be resolved.
- The M2–M4 fixes must be in the RN-04 and RN-09 code.
- SEC-02 checks all of this.

## Sources

- [Expo: EAS Update store privacy declarations](https://docs.expo.dev/eas-update/store-privacy-declarations/)
- [Expo: client ID reference](https://docs.expo.dev/eas/observe/reference/client-id/)
- [Expo: EAS Update code signing](https://docs.expo.dev/eas-update/code-signing/)
