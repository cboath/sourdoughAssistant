# SEC-M3 security review: milestone M3

2026-11-26 · security-reviewer (read-only; saved by the orchestrator) · builds on `threat-model.md` (SEC-01)

**Verdict: ship M3.** Critical 0 · High 0 · Medium 0 · Low 3 · Info 4.

## 1. Threat model changes since SEC-01

- **New assets:**
  - Pantry prices and price history, which are business-confidential for a cottage baker.
  - Recipe notes.
  - Soft-deleted recipes and prices, which stay in the database.
- **Actors:** no change. The attacker who matters is a malicious app on the same device sending deep links. Malicious files come later, because no import code exists yet.
- **Entry points in M3:**
  - TB2 deep links, through `+native-intent.tsx`.
  - Route params.
  - Number and text input on the pantry, price, recipe, ingredient and step forms.
  - The `withAndroidAppLabel` config plugin, at build time.
- **Network:** none. No `fetch`, `Linking.openURL`, WebView, clipboard, file-system or document-picker use was found.

## 2. Findings

### Low

**SEC-M3-01: package size has no lower bound, and cost math has no finiteness guard**
- **Where:** `src/features/pantry/validation.ts:60-66`, `:96-99`; `packages/core/src/cost/cost.ts:47-53`, `:117-118`
- **Scenario:** a package size like 1e-300 passes the `> 0` check. Line cost becomes Infinity, the screen shows "$∞", and the share becomes NaN. In M4, `JSON.stringify(Infinity)` writes `null` into `cost_snapshot_json`. Sizes around 1e-9 push integer cents past 2^53.
- **Fix:**
  - Set a minimum package size of 0.01 g/ml/each after conversion, allow at most 3 decimals, and give the field a `maxLength` of about 12.
  - Have core return `invalidAmount` when a result isn't finite or is above `MAX_SAFE_INTEGER`.
  - Add tests for 1e-300, 1e-9 and the largest allowed values.
  - The RN-09 import schemas reuse the same bounds.
- **Owner:** react-native-engineer (both the pantry validation and the core guard)

**SEC-M3-02: the logger doesn't block money keys**
- **Where:** `src/lib/logger.ts:29`
- **Scenario:** numeric fields like `{ priceCents }` would be logged, which breaks the promise in ADR 0015 §2 and DIAG-SHARE that prices are never included. No current call does this; all 23 were checked.
- **Fix:** add `price|cost|cent|amount|markup|sell|money|bps` to `FORBIDDEN_KEY`, with a test. The ring buffer is 200 entries in code but 500 in ADR 0015; align them.
- **Owner:** react-native-engineer (RN-04)

**SEC-M3-03: soft-deleted data stays in the database and in any raw-DB share**
- **Where:** `src/db/repositories/recipes.ts:166-181`; `src/db/maintenance.ts:15-34`; ADR 0004
- **Scenario:** a user deletes a recipe and its notes, then later shares the raw `.db` through "Save my data". The deleted content goes with it.
- **Fix:**
  - In RN-09, share a `VACUUM INTO` copy and hard-delete tombstones in that copy, except pantry and `seed_key` rows. Otherwise, disclose that deleted items are included (DS-04 L4f).
  - The privacy policy says deleted items stay on the device (RE-03).
- **Owner:** RN-09, DS-04, RE-03

### Info

**SEC-M3-04: `restore` matches children by exact `deleted_at`**
- **Where:** `src/db/repositories/recipes.ts:188-204`
- **Scenario:** a child removed by an edit in the same millisecond as the delete would also come back. This can't happen through the UI. The query is scoped to `recipe_id`.
- **Fix:** optional for v1.1. Record a delete-batch ID instead.
- **Owner:** backend-engineer (CL-01 note)

**SEC-M3-05: `babel-plugin-transform-remove-console` isn't configured, though ADR 0015 calls for it**
- **Where:** no `babel.config.js`
- **Scenario:** the app's own console use goes through the logger and only in `__DEV__`. Third-party `console.*` calls still reach logcat.
- **Fix:** add the plugin for production, or amend ADR 0015.
- **Owner:** RN-04 / RE-01

**SEC-M3-06: `npm audit --omit=dev` reports 20 moderate, 0 high and 0 critical**
- **Where:** jest 30 → `glob` (GHSA-3g3m-2fjr-6pw4); `@expo/fingerprint` → `minimatch` (GHSA-g3hv-75wg-m249)
- **Scenario:** none at runtime. These are build and test tooling only, and none ships in the bundle. The CI gate at `high` passes.
- **Fix:** take the fixes through normal Expo and Jest updates. **Do not run `npm audit fix --force`:** it would downgrade expo to 52.
- **Owner:** RE-01

**SEC-M3-07: stale comments in `app.config.ts`**
- **Where:** `app.config.ts:3-4`, `:10`, `:35-36`; the local `ios/` folder
- **Scenario:** the comments still say the bundle ID, scheme and OTA are "pending Chris", though all three are decided (A2, A6). A later agent could read that and add `expo-updates`. The local prebuilt `ios/` folder is also stale.
- **Fix:** update the comments to cite A2, A6 and ADR 0015 §5. Run `expo prebuild --clean` before the next device build.
- **Owner:** RE-01

## 3. Status of earlier items

- **INTERNET in `blockedPermissions` (plan §9, RE-01):** not done yet, and nothing in the code needs the network. Key it on `APP_ENV`, which `eas.json` already sets for each profile.
- **SEC-01 L5a (AD_ID) and L2a (Android backup rules):** still open, owned by AN-02 at M6. L2a matters once a second migration writes `pre-migration-v*.db`.
- **SEC-01 M3/M4 import caps and strict schemas:** not applicable yet, because there's no import code. They belong to RN-09.
- **SEC-01 M1/H1 (OTA):** closed. Neither `expo-updates` nor `expo-dev-client` is in the lockfile, and there's no `updates` or `runtimeVersion` config.

## 4. Verified OK

- **Parameterized SQL:**
  - Every value is bound.
  - Identifiers come only from FieldMaps and constants owned by the code.
  - `getByIds` builds placeholders, not values.
  - `vacuumInto` binds the path.
  - No field can be mass-assigned.
- **Restore and child writes:**
  - `restore` only touches children of the same `recipe_id`.
  - `writeChildren` scopes updates to `id AND parent_column`, so a foreign ID fails with a primary-key error and rolls back.
  - Step anchors are validated.
- **Number input:**
  - Input takes ASCII digits only and rejects non-finite values, with no ReDoS-prone regexes.
  - Money is integer cents within safe-integer range, non-negative and capped at 1,000,000.
  - Weight, dough, loaves, folds, durations, offsets and levain hydration are all bounded.
  - STRICT tables and CHECK constraints act as a second guard.
  - The one gap is SEC-M3-01.
- **Deep links:**
  - Paths are rebuilt only from Zod-validated UUIDs. Schemes, fragments, extra queries and segments, and inputs over 300 characters are rejected.
  - Every screen validates its params and falls back to `NotFoundView`.
  - Rejected paths are never logged.
  - The `returnTo` value is passed in memory, not through the URL.
- **Logger:**
  - Events are static identifiers.
  - Fields can only be numbers, booleans or null.
  - Errors are reduced to name and code.
  - The console is used only in `__DEV__`.
- **Debug code:**
  - `runDeviceDbSelfTest` only runs in `__DEV__`.
  - Flags hide routes that don't exist yet.
  - Preview and production builds have `developmentClient: false`.
  - The exports don't include source maps.
- **Config plugin:** it sets only `strings.xml` `app_name`, from a literal escaped by xml2js. It has no file system, network or shell access.
- **Secrets:** none in source, config or CI. `.gitignore` covers `.env*`, keystores and `.p8`/`.p12` files.
- **Privacy labels:** "Data Not Collected" holds.
  - There are no analytics, crash or network SDKs.
  - `PrivacyInfo.xcprivacy` declares no collected data types.
  - `NSAllowsArbitraryLoads=false`.
