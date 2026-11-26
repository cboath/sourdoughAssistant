# ADR 0012: Versioned JSON backup and single-recipe file formats

- Status: Accepted
- Date: 2026-11-26

## Context

R-10 requires:
- Full backup and restore of all data to one file through the share sheet (manual only).
- Single-recipe import and export as JSON or plain text.

M6 adds:
- A backup made on iOS must restore on Android.
- A malformed or wrong-version file must be rejected with no data changed.

The files are untrusted input (SEC-01 and SEC-02).

## Decision

### Full backup: `sourdough-backup-YYYY-MM-DD-HHmm.json`

```jsonc
{
  "format": "sourdough-assistant/backup",
  "formatVersion": 1,            // bumped on any breaking change to this file shape
  "dbSchemaVersion": 1,          // the _migrations max version at export (informational)
  "exportedAt": "2026-11-26T18:04:00.000Z",
  "app": { "version": "1.0.0", "build": "12", "platform": "ios" },
  "locale": { "currency": "USD", "tag": "en-US" },
  "counts": { "pantryItems": 14, "priceHistory": 20, "recipes": 3, "recipeIngredients": 15,
              "steps": 30, "bakes": 4, "bakeItems": 5, "bakeSteps": 60 },
  "data": {
    "settings": { /* camelCase Settings row */ },
    "pantryItems": [], "priceHistory": [],
    "recipes": [], "recipeIngredients": [], "steps": [],
    "bakes": [], "bakeItems": [], "bakeSteps": []
  },
  "checksum": { "alg": "sha256", "value": "<hex of JSON.stringify(data)>" }
}
```

- **Flat arrays mirror the tables,** using camelCase domain types. Ids, `createdAt` and `updatedAt` are kept exactly, so a restore on another phone is the same data, ready for v1.1 sync.
- **Tombstoned rows are excluded.** A backup holds live data only.
- `recipeSnapshot` and `costSnapshot` on bake items are embedded as JSON objects, not strings.
- The checksum is computed with `expo-crypto` `digestStringAsync(SHA256)`.

### Restore pipeline (all or nothing)

1. Pick the file with `expo-document-picker` (`copyToCacheDirectory: true`; accept `application/json`, `text/plain` and `*/*`, because Android providers often report `application/octet-stream`). Validation relies on the content, never the MIME type.
   - **Size check (SEC-01 M3):** after copying, read `FileSystem.getInfoAsync(uri).size`. Don't trust `DocumentPickerAsset.size`. **Reject the file before reading it if the size is unknown or over 10 MB** (the backup cap; QA may raise it with measured data).
   - Show a "Checking file…" state.
   - The URI only ever comes from the in-process picker. It is **never** taken from a route param or deep link.
2. `JSON.parse` inside a try block. Error: "This isn't a Sourdough Assistant backup." Strip a UTF-8 BOM first. The fuzz corpus covers UTF-16, truncation, deep nesting, `__proto__` keys and duplicate keys.
3. Check `format`. If `formatVersion` is newer than this build supports, reject with "Made by a newer version: update the app first." If it's older, run the upgraders in order (`upgrade_v1_to_v2`, and so on). They are pure functions with unit tests.
4. Validate with **Zod strict schemas** (`backup/schema.ts`, SEC-01 M4):
   - **Every nested object is fully specified and strict.** That includes `recipeSnapshot`, `costSnapshot`, `bakeSteps[].name/kind` and `priceHistory[].packageUnit/store`. Never use `z.any()`, `z.unknown()`, `.passthrough()`/`.loose()` or `z.record()`.
   - Numbers use `z.number().finite()`, plus `.int()` and `.safe()` for integers. Ranges match the DB CHECKs. Enums match the DB. Timestamps are ISO strings and ids are UUIDs.
   - **String caps** match the DB: names 200, step notes 2,000, notes 10,000, tags at most 20 × 40.
   - **Sanitizing names** (`sanitizeName`, shared with notification text): allow only the Unicode categories L, M, N, P, S and Zs. Strip C0/C1 controls and the bidi overrides U+202A–U+202E and U+2066–U+2069. Notes may also keep `\n`.
   - **Per-table row caps:** `bakeSteps` 200,000; `bakes` and `bakeItems` 20,000; `priceHistory` 50,000; `pantryItems`, `recipes`, `recipeIngredients` and `steps` 10,000 / 10,000 / 100,000 / 100,000.
   - The app only ever uses Zod's output. The raw parsed object is never spread or `Object.assign`-ed.
5. Check **integrity** in memory:
   - **Ids are unique** within each table.
   - References: ingredient → recipe and pantry, bake item → bake, bake step → bake item, price history → pantry.
   - **Step anchors stay in the same recipe, with no cycles.**
   - Core `validateSteps` runs on every recipe **and** every bake-item snapshot.
   - The checksum must match.
   - Any failure means reject, with the first three errors shown as path plus code, never the file's content.
6. Show a **confirm step** with counts **computed from the validated data** (the file's own `counts` field is only cross-checked, never displayed): "Replace all data on this phone? 3 recipes, 14 pantry items, 4 bakes." Restore **replaces** everything. Merging isn't in v1. The checksum detects corruption only, so the UI never calls the file "verified".
7. Write a **safety export** of the current data to `<documents>/backups/pre-restore-<ts>.json`, keeping only the last one. The user can undo through Settings, Backup, "Undo last restore".
8. In **one transaction**, delete all rows from the syncable tables (the only hard delete in v1), insert everything, and upsert settings. On any error, roll back and report it.
   **Settings fix-ups inside the same transaction** (DS-04 Q-A3, Q-A7):
   - **Onboarding:** `onboardingCompletedAt` = the backup's value, or **now** if that's null. A restore started from onboarding never loops back into it.
   - **Currency, decided: don't block. Keep the prices in their original currency and show a banner.** Pantry prices carry no currency, so a EUR backup on a USD phone would otherwise show euro amounts as dollars.
     - If the backup's settings already have `currencyOverride`, keep it.
     - Otherwise, if `locale.currency` differs from the device currency, set `settings.currency_override = locale.currency`.
     - The app's currency resolver (`src/lib/locale.ts`) is `currency_override ?? device currency`. It's used for formatting and for new cost snapshots, and old bake snapshots keep their own `currencyCode`.
     - The preview banner says "Prices in this backup are in EUR and will stay in EUR". Settings, Cost shows "Currency: EUR (from backup)" read-only.
     - There's still no currency picker in v1 (A5). Clearing the override is a v1.1 item, together with the picker.
   - `app_meta` is untouched by a restore except `lastRestoreSafetyAt`, which step 7 sets when it writes the safety copy.
9. After commit: invalidate all queries, re-hydrate the settings store, and run `reconcileNotifications({ mode: 'rebuild' })`. Steps of active bakes that are already in the past aren't notified.

### Single-recipe JSON: `<slug>.sourdough-recipe.json`

```jsonc
{
  "format": "sourdough-assistant/recipe",
  "formatVersion": 1,
  "recipe": { "name": "...", "notes": "...", "yieldLoaves": 1, "doughWeightG": 900, "tags": [] },
  "ingredients": [
    { "position": 0, "name": "Bread flour", "role": "flour", "amountG": 450,
      "entryAmount": 450, "entryUnit": "g", "levainHydrationPct": null,
      "pantry": { "name": "Bread flour", "category": "flour", "gramsPerCup": 120, "gramsPerEach": null,
                  "price": { "packagePriceCents": 1089, "packageSize": 5, "packageUnit": "lb", "currency": "USD" } } }
  ],
  "steps": [ { "ref": "s1", "position": 0, "name": "...", "kind": "feed", "durationMin": 480, "minMin": 360, "maxMin": 600,
               "tempSensitive": false, "anchor": { "type": "sequential" }, "folds": null, "notify": true } ]
}
```

- **Import creates new UUIDs** to avoid collisions. Step anchors use the file-local `ref`.
- **Pantry matching:** match by case-insensitive trimmed name among non-deleted items. If there's no match, create the pantry item. Its price is included only if the currency matches the device currency, otherwise it's left unpriced. The import preview shows which items are new.
- The validation, sanitizing and Zod pipeline are the same as for a full backup. The size cap is **1 MB**.

### Plain text (R-10)

- **Export:** a human-readable recipe card (name, yield, ingredient lines like `450 g Bread flour (flour)`, then the steps with durations and ranges).
- **Import:** best effort, but only for our own export grammar: one ingredient per line, `<amount> <unit> <name> [(<role>)]`, and step lines `<name>: <duration>[ (<min>–<max>)]`. Lines that don't parse are listed in the preview for the user to fix. Free-form text from the web is **not** supported in v1.
- **Caps (SEC-01 M3):** 64 KB, 500 lines, 500 characters per line, all checked before parsing.
- The parser works line by line, with **anchored regexes and no nested or overlapping quantifiers** (ReDoS). Unit tests cover pathological inputs under a time limit.

### Transport

- **Export** writes to `FileSystem.cacheDirectory` and calls `expo-sharing` `shareAsync`.
  - **Before sharing, the exporter runs its own output through the full restore validator, including the step 1 size cap** (the UTF-8 byte length of the serialized file must be ≤ 10 MB; 1 MB for a recipe file), and then steps 2 to 5. The app can never produce a file it would refuse to restore. If the file is over the cap, export fails with a clear message. With realistic data that's practically unreachable. QA measures a heavy-user file, and if needed the cap is raised in one constant shared by both sides.
  - After a successful share, `app_meta.lastBackupExportedAt` is set to now. It's labeled in the UI as when the file was made, because the share sheet can't confirm it was saved.
  - The cache file is deleted after `shareAsync` resolves.
  - The export screen says the file contains all recipes, prices and bakes.
- **Import** uses `expo-document-picker` with `copyToCacheDirectory: true`.
- The app doesn't register document types or file associations in v1, and doesn't set `UIFileSharingEnabled` or `LSSupportsOpeningDocumentsInPlace` (SEC-01 L4).

## Options considered

- **SQLite file copy as the backup.** Opaque, tied to the schema version, and hard to validate safely.
- **Merge restore.** Needs conflict rules; deferred until v1.1 sync defines them.
- **ZIP with photos.** No photos in v1.

## Consequences

- RN-09 implements `apps/mobile/src/features/backup/{export,import,schema,upgrade,text}.ts`. The Zod schemas live in the app. If the web app needs them, they can move to `packages/core` in v1.1.
- SEC-01/SEC-02 review the size caps, string caps, the Zod strictness and the parsing of the text grammar.
- Restore is the one permitted hard delete. Data-model rule exception noted in ADR 0004.
