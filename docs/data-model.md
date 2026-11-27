# Sourdough Assistant: local data model (SQLite, v1)

2026-11-26 · mobile-solutions-architect (AR-01) · Consumers: RN-02 (implements), RN-03 (seed), CL-01 (sync review), SEC-01

Decisions behind this file: ADR 0003 (SQLite, migrations), ADR 0004 (sync-ready fields), ADR 0005 (time), ADR 0006 (money), ADR 0007 (levain), ADR 0014 (bake snapshots).

## 1. Conventions

| Rule | Detail |
|---|---|
| Engine | `expo-sqlite` on device and `node:sqlite` in tests. File name `sourdough.db`. On open: `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;` |
| Tables | `STRICT`. snake_case columns. The domain types in TS are camelCase, converted by the mappers in `src/db/mappers/` |
| ids | `TEXT` UUID v4 (`expo-crypto.randomUUID()`), through the `Ids` interface in `src/db/deps.ts`. Exception: `settings.id = 'settings'`. `settingsRepo.ensure()` creates the row, or revives it if it was tombstoned |
| Transactions | One connection; `BEGIN IMMEDIATE` behind the adapter's queue. Code inside a transaction uses only the `tx` it's given (ADR 0003) |
| Instants | `TEXT` ISO 8601 UTC from `toISOString()`: `2026-11-28T15:00:00.000Z`. Columns end in `_at` |
| Local dates | `TEXT` `YYYY-MM-DD` (only `priced_at`, which has date meaning and no instant). It is the **local** calendar date in the device zone, never the UTC date (sync-readiness N2). Repositories don't derive it from `nowIso()`. The clock injected through `src/db/deps.ts` provides a zone-aware `todayLocal()` (zone from `expo-localization`), or the service passes the date explicitly. A US baker pricing at 8 pm must get today's date, not tomorrow's |
| Booleans | `INTEGER` 0/1 with a CHECK |
| Money | `INTEGER` minor units, columns end in `_cents`. Never REAL |
| Weights | `REAL` grams, columns end in `_g`. Display rounds to whole grams |
| Durations | `INTEGER` minutes, columns end in `_min` |
| Sync fields | Every syncable table has `created_at`, `updated_at` (`TEXT NOT NULL`) and `deleted_at` (`TEXT NULL`) |
| Deletes | Soft delete only (set `deleted_at` and `updated_at`). The one exception is a full restore (ADR 0012) |
| Undo of a recipe delete | `recipes.restore(id)` (RN-05): in one transaction, clears `deleted_at` on the recipe and only on the `recipe_ingredient` and `step` rows whose `deleted_at` equals the recipe's (tombstoned by the same `softDelete`), and bumps `updated_at`. Returns `false` (no-op) for a live or unknown id |
| Reads | Always `WHERE deleted_at IS NULL` unless the caller asks for tombstones |
| JSON columns | `TEXT` with `CHECK (json_valid(col))`. Shapes are given in section 3 |

## 2. Schema: migration `0001_init`

```sql
-- Bookkeeping (not synced) ----------------------------------------------
-- _migrations is created by the migration runner itself (CREATE TABLE IF NOT EXISTS) before it reads
-- the version; it is NOT part of 0001_init (ADR 0003, amended after RN-02):
--   _migrations(version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT

CREATE TABLE app_meta (            -- device-local key/value; excluded from the JSON backup and never synced.
                                   -- NOTE: OS backups (iCloud / Android Auto Backup) DO carry it, incl. installId:
                                   -- v1.1 must not treat installId as unique per device (SEC-01 L2c, ADR 0015 §6)
  key    TEXT PRIMARY KEY NOT NULL, -- 'seedVersion', 'lastReconcileAt', 'lastTimeZone', 'installId',
                                    -- 'lastBackupExportedAt' (ISO UTC; when a backup FILE was made, DS-04),
                                    -- 'lastRestoreSafetyAt'  (ISO UTC; when the current pre-restore safety copy was written)
  value  TEXT NOT NULL
) STRICT;

-- Settings (one row) -----------------------------------------------------
CREATE TABLE settings (
  id                     TEXT    PRIMARY KEY NOT NULL CHECK (id = 'settings'),
  unit_system            TEXT    NOT NULL DEFAULT 'metric' CHECK (unit_system IN ('metric','us')),
  temperature_unit       TEXT    NOT NULL DEFAULT 'C'      CHECK (temperature_unit IN ('C','F')),
  quiet_hours_enabled    INTEGER NOT NULL DEFAULT 1        CHECK (quiet_hours_enabled IN (0,1)),
  quiet_start_min        INTEGER NOT NULL DEFAULT 1320     CHECK (quiet_start_min BETWEEN 0 AND 1439), -- 22:00
  quiet_end_min          INTEGER NOT NULL DEFAULT 360      CHECK (quiet_end_min   BETWEEN 0 AND 1439), -- 06:00
  oven_capacity          INTEGER NOT NULL DEFAULT 1        CHECK (oven_capacity BETWEEN 1 AND 12),
  reheat_gap_min         INTEGER NOT NULL DEFAULT 0        CHECK (reheat_gap_min BETWEEN 0 AND 120),   -- decided: no gap (open-questions B1)
  markup_bps             INTEGER NOT NULL DEFAULT 20000    CHECK (markup_bps BETWEEN 0 AND 1000000),   -- decided: 200% on cost (C1)
  sell_rounding_cents    INTEGER NOT NULL DEFAULT 0        CHECK (sell_rounding_cents BETWEEN 0 AND 10000), -- 0 = none (decided, C2), else round up to a multiple
  heads_up_min           INTEGER NOT NULL DEFAULT 10       CHECK (heads_up_min BETWEEN 0 AND 120),     -- 0 = off
  keep_awake_default     INTEGER NOT NULL DEFAULT 1        CHECK (keep_awake_default IN (0,1)),
  currency_override      TEXT    NULL CHECK (currency_override IS NULL OR length(currency_override) = 3),  -- v1: set only by restore (ADR 0012); no picker (plan A5)
  onboarding_completed_at TEXT   NULL,
  created_at             TEXT    NOT NULL,
  updated_at             TEXT    NOT NULL,
  deleted_at             TEXT    NULL
) STRICT;
-- Defaults for unit_system / temperature_unit are overwritten on first launch from the locale (en-US gives 'us'/'F') (decided, open-questions D2).
-- Quiet hours on, 22:00 to 06:00 (D3). keep_awake_default on (D5).

-- Pantry -------------------------------------------------------------------
CREATE TABLE pantry_item (
  id                   TEXT    PRIMARY KEY NOT NULL,
  name                 TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  category             TEXT    NOT NULL DEFAULT 'other'
                       CHECK (category IN ('flour','water','salt','starter','sweetener','fat','dairy','yeast','inclusion','other')),
  package_price_cents  INTEGER NULL CHECK (package_price_cents IS NULL OR package_price_cents >= 0),
  package_size         REAL    NULL CHECK (package_size IS NULL OR package_size > 0),
  package_unit         TEXT    NULL CHECK (package_unit IS NULL OR package_unit IN
                         ('g','kg','oz','lb','ml','l','tsp','tbsp','cup','floz','qt','gal','each')),
  grams_per_cup        REAL    NULL CHECK (grams_per_cup  IS NULL OR grams_per_cup  > 0),  -- density (C-2)
  grams_per_each       REAL    NULL CHECK (grams_per_each IS NULL OR grams_per_each > 0),  -- for 'each' items (jalapeño, egg)
  store                TEXT    NULL CHECK (store IS NULL OR length(store) <= 200),
  priced_at            TEXT    NULL,                                                         -- local date YYYY-MM-DD
  seed_key             TEXT    NULL,
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL,
  deleted_at           TEXT    NULL,                                                         -- "archived" in the UI
  CHECK ((package_price_cents IS NULL) = (package_size IS NULL)
     AND (package_size IS NULL) = (package_unit IS NULL))                                    -- all-or-none price
) STRICT;
CREATE INDEX pantry_item_name_idx ON pantry_item (name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX pantry_item_seed_key_uq ON pantry_item (seed_key) WHERE seed_key IS NOT NULL;

CREATE TABLE price_history (       -- append-only log; current price is mirrored on pantry_item
  id                   TEXT    PRIMARY KEY NOT NULL,
  pantry_item_id       TEXT    NOT NULL REFERENCES pantry_item(id),
  package_price_cents  INTEGER NOT NULL CHECK (package_price_cents >= 0),
  package_size         REAL    NOT NULL CHECK (package_size > 0),
  package_unit         TEXT    NOT NULL,
  store                TEXT    NULL,
  priced_at            TEXT    NOT NULL,                                                     -- local date
  created_at           TEXT    NOT NULL,
  updated_at           TEXT    NOT NULL,
  deleted_at           TEXT    NULL
) STRICT;
CREATE INDEX price_history_item_idx ON price_history (pantry_item_id, priced_at DESC, created_at DESC);

-- Recipes ------------------------------------------------------------------
CREATE TABLE recipe (
  id              TEXT    PRIMARY KEY NOT NULL,
  name            TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  notes           TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  yield_loaves    INTEGER NOT NULL DEFAULT 1 CHECK (yield_loaves BETWEEN 1 AND 50),
  dough_weight_g  INTEGER NULL CHECK (dough_weight_g IS NULL OR dough_weight_g > 0),  -- target PER LOAF (ADR 0010 §8)
  tags_json       TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(tags_json) AND json_type(tags_json) = 'array'),
  favorite        INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0,1)),
  seed_key        TEXT    NULL,
  created_at      TEXT    NOT NULL,
  updated_at      TEXT    NOT NULL,
  deleted_at      TEXT    NULL
) STRICT;
CREATE INDEX recipe_list_idx ON recipe (favorite DESC, name COLLATE NOCASE) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX recipe_seed_key_uq ON recipe (seed_key) WHERE seed_key IS NOT NULL;

CREATE TABLE recipe_ingredient (
  id                    TEXT    PRIMARY KEY NOT NULL,
  recipe_id             TEXT    NOT NULL REFERENCES recipe(id),
  pantry_item_id        TEXT    NULL REFERENCES pantry_item(id),   -- NULL only for imported/unlinked lines (cost: unpriced)
  position              INTEGER NOT NULL CHECK (position >= 0),
  name                  TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200), -- display name (defaults to pantry name)
  role                  TEXT    NOT NULL CHECK (role IN ('flour','water','salt','levain','inclusion','other')),
  amount_g              REAL    NOT NULL CHECK (amount_g >= 0),   -- canonical grams (BUILD_PLAN: grams in storage)
  entry_amount          REAL    NULL CHECK (entry_amount IS NULL OR entry_amount >= 0), -- as typed, for faithful redisplay
  entry_unit            TEXT    NULL CHECK (entry_unit IS NULL OR entry_unit IN
                          ('g','kg','oz','lb','ml','l','tsp','tbsp','cup','floz','qt','gal','each')),
  levain_hydration_pct  REAL    NULL CHECK (levain_hydration_pct IS NULL OR levain_hydration_pct BETWEEN 20 AND 300),
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL,
  deleted_at            TEXT    NULL,
  CHECK ((role = 'levain') = (levain_hydration_pct IS NOT NULL))   -- ADR 0007
) STRICT;
CREATE INDEX recipe_ingredient_recipe_idx ON recipe_ingredient (recipe_id, position) WHERE deleted_at IS NULL;
CREATE INDEX recipe_ingredient_pantry_idx ON recipe_ingredient (pantry_item_id) WHERE deleted_at IS NULL;

CREATE TABLE step (
  id                 TEXT    PRIMARY KEY NOT NULL,
  recipe_id          TEXT    NOT NULL REFERENCES recipe(id),
  position           INTEGER NOT NULL CHECK (position >= 0),
  name               TEXT    NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  kind               TEXT    NOT NULL DEFAULT 'other' CHECK (kind IN
                       ('feed','mix','fold','bulk','shape','proof','coldProof','preheat','bake','cool','other')),
  duration_min       INTEGER NOT NULL,
  min_min            INTEGER NOT NULL,
  max_min            INTEGER NOT NULL,
  temp_sensitive     INTEGER NOT NULL DEFAULT 0 CHECK (temp_sensitive IN (0,1)),
  anchor_type        TEXT    NOT NULL DEFAULT 'sequential' CHECK (anchor_type IN ('sequential','alongside')),
  anchor_step_id     TEXT    NULL REFERENCES step(id),
  anchor_align       TEXT    NULL CHECK (anchor_align IS NULL OR anchor_align IN ('endsAtStart','startsAtStart','endsAtEnd')),
  anchor_offset_min  INTEGER NOT NULL DEFAULT 0 CHECK (anchor_offset_min BETWEEN -1440 AND 1440),
  fold_count         INTEGER NULL CHECK (fold_count IS NULL OR fold_count BETWEEN 1 AND 12),
  fold_interval_min  INTEGER NULL CHECK (fold_interval_min IS NULL OR fold_interval_min BETWEEN 5 AND 180),
  notify             INTEGER NOT NULL DEFAULT 1 CHECK (notify IN (0,1)),
  notes              TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
  created_at         TEXT    NOT NULL,
  updated_at         TEXT    NOT NULL,
  deleted_at         TEXT    NULL,
  CHECK (0 < min_min AND min_min <= duration_min AND duration_min <= max_min AND max_min <= 10080),
  CHECK ((anchor_type = 'alongside') = (anchor_step_id IS NOT NULL AND anchor_align IS NOT NULL)),
  CHECK ((fold_count IS NULL) = (fold_interval_min IS NULL)),
  CHECK (fold_count IS NULL OR (duration_min = fold_count * fold_interval_min
                                AND min_min = duration_min AND max_min = duration_min))  -- ADR 0010 §3
) STRICT;
CREATE INDEX step_recipe_idx ON step (recipe_id, position) WHERE deleted_at IS NULL;

-- Bakes --------------------------------------------------------------------
CREATE TABLE bake (
  id                  TEXT    PRIMARY KEY NOT NULL,
  status              TEXT    NOT NULL CHECK (status IN ('scheduled','active','completed','cancelled')),
  mode                TEXT    NOT NULL CHECK (mode IN ('backward','forward')),
  requested_ready_at  TEXT    NULL,                 -- what the user asked for (backward mode)
  original_ready_at   TEXT    NOT NULL,             -- plan at scheduling time, never updated
  planned_ready_at    TEXT    NOT NULL,             -- current plan (updated by recompute)
  time_zone           TEXT    NOT NULL,             -- IANA zone at scheduling (record only, ADR 0005)
  kitchen_temp_c      REAL    NULL CHECK (kitchen_temp_c IS NULL OR kitchen_temp_c BETWEEN 10 AND 40),
  oven_capacity       INTEGER NOT NULL CHECK (oven_capacity BETWEEN 1 AND 12),
  reheat_gap_min      INTEGER NOT NULL DEFAULT 0 CHECK (reheat_gap_min BETWEEN 0 AND 120),
  heads_up_min        INTEGER NOT NULL CHECK (heads_up_min BETWEEN 0 AND 120),  -- snapshot of settings
  currency_code       TEXT    NOT NULL CHECK (length(currency_code) = 3),
  oven_slots_json     TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(oven_slots_json)),
  notes               TEXT    NOT NULL DEFAULT '' CHECK (length(notes) <= 10000),
  started_at          TEXT    NULL,
  completed_at        TEXT    NULL,
  cancelled_at        TEXT    NULL,
  created_at          TEXT    NOT NULL,
  updated_at          TEXT    NOT NULL,
  deleted_at          TEXT    NULL
) STRICT;
CREATE INDEX bake_status_idx ON bake (status, planned_ready_at) WHERE deleted_at IS NULL;

CREATE TABLE bake_item (
  id                    TEXT    PRIMARY KEY NOT NULL,
  bake_id               TEXT    NOT NULL REFERENCES bake(id),
  recipe_id             TEXT    NULL REFERENCES recipe(id),   -- provenance only; the snapshot is authoritative
  position              INTEGER NOT NULL CHECK (position >= 0),
  loaves                INTEGER NOT NULL CHECK (loaves BETWEEN 1 AND 50),
  scale_factor          REAL    NOT NULL CHECK (scale_factor > 0), -- loaves / snapshot.yieldLoaves
  recipe_snapshot_json  TEXT    NOT NULL CHECK (json_valid(recipe_snapshot_json)),
  cost_snapshot_json    TEXT    NULL     CHECK (cost_snapshot_json IS NULL OR json_valid(cost_snapshot_json)),
  created_at            TEXT    NOT NULL,
  updated_at            TEXT    NOT NULL,
  deleted_at            TEXT    NULL
) STRICT;
CREATE INDEX bake_item_bake_idx ON bake_item (bake_id, position) WHERE deleted_at IS NULL;

CREATE TABLE bake_step (
  id                         TEXT    PRIMARY KEY NOT NULL,
  bake_id                    TEXT    NOT NULL REFERENCES bake(id),
  bake_item_id               TEXT    NULL REFERENCES bake_item(id),  -- NULL for bake-wide steps (merged preheat, reheat)
  step_key                   TEXT    NOT NULL,                       -- ADR 0009 §8; stable across recomputes
  source_step_id             TEXT    NULL,                           -- step id inside the snapshot
  slot_index                 INTEGER NULL CHECK (slot_index IS NULL OR slot_index >= 1),
  position                   INTEGER NOT NULL,                       -- order on the merged timeline at creation
  name                       TEXT    NOT NULL,
  kind                       TEXT    NOT NULL,
  is_alongside               INTEGER NOT NULL DEFAULT 0 CHECK (is_alongside IN (0,1)),
  duration_min               INTEGER NOT NULL CHECK (duration_min >= 0),
  duration_source            TEXT    NOT NULL CHECK (duration_source IN ('default','temperature','user','derived')),
  min_min                    INTEGER NOT NULL,
  max_min                    INTEGER NOT NULL,
  original_planned_start_at  TEXT    NOT NULL,
  planned_start_at           TEXT    NOT NULL,
  planned_end_at             TEXT    NOT NULL,
  actual_start_at            TEXT    NULL,
  actual_end_at              TEXT    NULL,
  status                     TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','done','skipped')),
  inferred_done              INTEGER NOT NULL DEFAULT 0 CHECK (inferred_done IN (0,1)),
  fold_count                 INTEGER NULL,
  fold_interval_min          INTEGER NULL,
  folds_done                 INTEGER NOT NULL DEFAULT 0,
  fold_times_json            TEXT    NOT NULL DEFAULT '[]' CHECK (json_valid(fold_times_json)), -- ISO strings of actual folds
  notify                     INTEGER NOT NULL DEFAULT 1 CHECK (notify IN (0,1)),
  created_at                 TEXT    NOT NULL,
  updated_at                 TEXT    NOT NULL,
  deleted_at                 TEXT    NULL
) STRICT;
CREATE UNIQUE INDEX bake_step_key_uq ON bake_step (bake_id, step_key);
CREATE INDEX bake_step_time_idx ON bake_step (bake_id, planned_start_at);
```

Notes:
- FKs have no `ON DELETE` actions, because deletes are soft. The full-restore hard delete removes child tables first: `bake_step`, `bake_item`, `bake`, `step`, `recipe_ingredient`, `recipe`, `price_history`, `pantry_item`, then `settings`.
- The `step.anchor_step_id` self-reference must point at a step of the same recipe. The repository enforces this, plus core `validateSteps`.
- "Water defaults to zero cost" (C-5): the seeded Water pantry item has `package_price_cents = 0`, `package_size = 1000`, `package_unit = 'ml'` and `grams_per_cup = 236.59`.

## 3. JSON column shapes

```ts
// recipe.tags_json
type Tags = string[];                         // trimmed, lowercased for search, max 20 tags, max 40 chars each

// bake.oven_slots_json
type OvenSlotsJson = Array<{ index: number; startAt: string; endAt: string; loaves: Array<{ bakeItemId: string; loaves: number }> }>;

// bake_item.recipe_snapshot_json
interface RecipeSnapshotV1 {
  snapshotVersion: 1;
  recipe: { id: string; name: string; yieldLoaves: number; doughWeightG: number | null; notes: string };
  ingredients: Array<{
    id: string; name: string; role: IngredientRole; amountG: number;      // already SCALED to this bake's loaves
    levainHydrationPct: number | null;
    pantry: null | { id: string; name: string; packagePriceCents: number | null; packageSize: number | null;
                     packageUnit: Unit | null; gramsPerCup: number | null; gramsPerEach: number | null };
  }>;
  steps: StepTemplate[];                    // the core type (docs/core-api.md), unscaled
}

// bake_item.cost_snapshot_json
interface CostSnapshotV1 { snapshotVersion: 1; currencyCode: string; computedAt: string; breakdown: CostBreakdown; sellPriceCents: number | null; markupBps: number }
```

## 4. Mapping to v1.1 sync (for CL-01)

| Local table | Proposed DynamoDB item (`PK = USER#<userId>`) | Notes |
|---|---|---|
| settings | `SK = SETTINGS` | fixed id |
| pantry_item | `SK = PANTRY#<id>` | |
| price_history | `SK = PANTRY#<pantryId>#PRICE#<id>` | append-only |
| recipe (+ recipe_ingredient, step) | `SK = RECIPE#<id>`, plus either embedded children or `RECIPE#<id>#ING#<id>` / `RECIPE#<id>#STEP#<id>` | CL-01 decides embedded vs separate. Both work because children have their own ids and timestamps |
| bake (+ bake_item, bake_step) | `SK = BAKE#<id>`, `BAKE#<id>#ITEM#<id>`, `BAKE#<id>#STEP#<id>` | step progress is per-row LWW (ADR 0004) |
| app_meta, _migrations | not synced | device-local |

Expected additive v1.1 migration (no rewrite): `ALTER TABLE <t> ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1` and `server_version INTEGER NULL` on the syncable tables, plus an `outbox` table if CL-01 picks one.

## 5. Seed data (RN-03)

- Seeds run inside one transaction after migrations, when `app_meta.seedVersion` is less than `SEED_VERSION` (starting at 1). Each seed row carries a stable `seed_key` (for example `recipe:country-loaf`, `pantry:bread-flour`).
- **Deterministic seed identity (sync-readiness N1, required):**
  - Every seeded row (recipe, recipe_ingredient, step, pantry_item, price_history) has a **fixed UUID hard-coded in the seed data**. These are generated once and committed, never minted at runtime, so every install of the same user holds the same ids.
  - Every seeded row has `created_at = updated_at = SEED_EPOCH`, a single fixed constant (for example `'2026-12-01T00:00:00.000Z'`), never the install time. That way any real user edit or delete beats an untouched seed under v1.1 LWW.
  - `priced_at` of seeded prices is the date part of `SEED_EPOCH`.
  - The existing `seed_key` and tombstone-skip rules are unchanged. **Seed tombstones are never purged** (CL-01).
  - The user-initiated "Add starter recipes" copies below are user data, not seeds: they get random ids, the current time, and `seed_key = NULL`.
- Before inserting, the seeder skips any `seed_key` that already exists **including tombstoned rows**, so a seed the user deleted is never recreated. After the run it sets `seedVersion`.
- **User-initiated "Add starter recipes"** (empty recipe list only, DS-02 Q-A6): `seedService.addStarterRecipes()` inserts fresh **copies**, with new UUIDs and `seed_key = NULL`. Pantry items are matched by live `seed_key`, then by case-insensitive name. Missing ones are created with `seed_key = NULL`. Tombstones are never revived, and the automatic seed rule above stays unchanged.
- **Recipes:** a basic country loaf (the PRD section 5 step template, with the R-HYD amounts 500/375/10/100 levain at 100%), whole wheat, and an inclusion loaf (cheddar and jalapeño).
  - **Decided (open-questions D1):** these recipes and the starter pantry prices below **stay placeholders** (in `apps/mobile/src/db/seed/data.ts`) until Chris supplies replacements.
  - Replacing them later is a seed-data change: bump `SEED_VERSION` and add new fixed-UUID rows. Rows already seeded keep their fixed ids (N1), and the existing tombstone rules still apply. Don't rewrite them in place.
- **Starter pantry:** bread flour, whole wheat flour, salt, water (0 ¢), cheddar, jalapeño (`grams_per_each`), with illustrative prices (`priced_at` = seed date) and `grams_per_cup` defaults (bread flour 120, whole wheat 113, salt 292, water 236.59).

**Default template steps** (all `notify = 1`):

| position | name | kind | default / min / max (min) | flags |
|---|---|---|---|---|
| 0 | Final starter feeding | feed | 480 / 360 / 600 | |
| 1 | Mix and rest | mix | 60 / 30 / 120 | |
| 2 | Stretch and folds | fold | 120 / 120 / 120 | fold_count 4, fold_interval_min 30 |
| 3 | Bulk ferment | bulk | 360 / 300 / 480 | temp_sensitive |
| 4 | Shape | shape | 10 / 5 / 15 | |
| 5 | Cold ferment (fridge) | coldProof | 720 / 720 / 1440 | range 12 to 24 h confirmed by Chris (open-questions B5), so no template change |
| 6 | Preheat oven and Dutch oven | preheat | 30 / 20 / 45 | alongside → step 7, `endsAtStart` |
| 7 | Bake, covered | bake | 30 / 25 / 35 | |
| 8 | Bake, uncovered | bake | 15 / 10 / 25 | |
| 9 | Cool | cool | 60 / 30 / 120 | |

## 6. Domain types (camelCase) the repositories return

Same fields as the tables, in camelCase, with these differences:
- Booleans are `boolean`. JSON columns are parsed.
- Recipe aggregates come back as `{ recipe, ingredients, steps }`.
- Step rows map to the core `StepTemplate` (`anchor` and `folds` objects, ADR 0010).

The exact TS types live in `apps/mobile/src/db/types.ts` (RN-02). Core-facing types come from `packages/core` (`docs/core-api.md`).
