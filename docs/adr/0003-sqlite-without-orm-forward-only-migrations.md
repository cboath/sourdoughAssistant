# ADR 0003: SQLite via expo-sqlite with hand-written repositories and forward-only migrations

- Status: Accepted
- Date: 2026-11-26

## Context

BUILD_PLAN M2 calls for an SQLite schema, a migration runner with a version table, and typed repositories tested against in-memory SQLite. The data set is small (tens of recipes, hundreds of bake steps). The schema must stay sync-ready (ADR 0004).

## Options considered

1. **`expo-sqlite` async API, plain SQL, hand-written typed repositories, and our own migration runner.** Zero extra dependencies. The SQL behaves the same in Node tests and on device. The runner is about 60 lines.
2. **Drizzle ORM + drizzle-kit migrations.** Typed queries and generated migrations. Its migrations are bundled through a Babel or Metro plugin. It adds a build step and generated artifacts, and it's another abstraction between us and SQLite that we'd have to keep working in both Jest and the app.
3. **WatermelonDB.** Built for large data sets and has its own sync protocol. Too heavy here, and its sync protocol may not fit the AWS backend planned for v1.1.
4. **MMKV / AsyncStorage with JSON blobs.** No relational integrity, no queries, and painful migrations.

## Decision

**Option 1.**

- **Database file:** `sourdough.db` in the default expo-sqlite directory (app sandbox), opened with `openDatabaseAsync`.
- **PRAGMAs run on open:** `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- **STRICT tables** and CHECK constraints for enums and ranges. SQLite 3.37 or later is required, which expo-sqlite and Node 22+/24 both bundle.
- **`SqlDatabase` adapter interface** (`apps/mobile/src/db/adapter.ts`). Repositories depend only on this interface. There are two implementations:
  - `expoAdapter`: wraps `SQLiteDatabase` on **one connection**. Transactions run `BEGIN IMMEDIATE … COMMIT/ROLLBACK` behind a promise queue.
    - *Amended after RN-02:* `withExclusiveTransactionAsync` opens a separate connection where `PRAGMA foreign_keys` is off and can't be turned on inside a transaction, so FKs would silently go unenforced. The plain `withTransactionAsync` lets unrelated queries interleave.
    - **Condition:** while a transaction is open, the adapter must queue **every** call made on the outer `db` (reads too) until it commits or rolls back. Otherwise an outer call on the same connection would silently run inside the open transaction.
    - Code inside a transaction uses only the `tx` it's given. Calling the outer `db` from inside a transaction would deadlock on the queue. That's the intended loud failure, and a test covers it.
  - `nodeAdapter` (tests only): wraps `node:sqlite` (ADR 0013).
- **Transactions:** every multi-row write (a recipe with its children, a bake with its items and steps, a restore) runs in one transaction. The adapter serializes transactions through a promise queue.
- **Migrations:** `apps/mobile/src/db/migrations/NNNN_name.ts`, each exporting `{ version, name, up: (tx) => Promise<void> }`. They are listed in a registry array (`migrations/index.ts`).
  - Bookkeeping table `_migrations(version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)`. **The runner creates it** (`CREATE TABLE IF NOT EXISTS`) before reading the current version. `0001_init` doesn't contain it (amended after RN-02).
  - The runner checks that versions are contiguous from 1, then applies each pending migration in **its own transaction** and inserts its `_migrations` row in that same transaction. Re-running is a no-op.
  - **Forward-only.** There are no down migrations.
  - **Safety copy:** if the DB already has data and migrations are pending, the runner first copies the DB with expo-sqlite's backup API to **`<defaultDatabaseDirectory>/backups/pre-migration-v<from>.db`** and keeps only the last copy. *Amended after RN-02:* the data layer doesn't depend on expo-file-system. `defaultDatabaseDirectory` is `Documents/SQLite/` on iOS and `files/SQLite/` on Android. The OS-backup exclusion rules (ADR 0015 section 6) point at this path.
  - **Downgrade guard:** if the DB's max version is newer than the highest bundled migration, the app refuses to open the DB and shows "This data was written by a newer version of the app. Please update." This can only happen after an OTA rollback or by sideloading an older build.
- **Repository conventions:**
  - One file per aggregate: `pantry.ts`, `recipes.ts` (with ingredients and steps), `bakes.ts` (with items and steps), `settings.ts`.
  - Row types use snake_case. Domain types use camelCase. Mappers sit beside each repository.
  - Reads filter out `deleted_at IS NOT NULL`. Deletes are soft (ADR 0004).
  - Every write sets `updated_at` from an injected `clock.nowIso()`, so tests are deterministic. The `Clock` and `Ids` interfaces live in **`src/db/deps.ts`** (amended after RN-02). The app-side implementations and `useNow` in `src/lib/clock.ts` and `src/lib/ids.ts` import those interfaces. Nothing redefines them.
  - **Settings** has `deleted_at` like every table (for uniformity). `settingsRepo.ensure()` inserts the defaults row if it's missing, or revives it (clears `deleted_at`) if it's tombstoned. No UI path ever soft-deletes settings.
  - No Zod on internal reads. Zod is used only at trust boundaries (import/restore files, ADR 0012).

## Consequences

- RN-02 owns `apps/mobile/src/db/**` exactly as specified in `docs/data-model.md`.
- **OTA policy:** an EAS Update that contains a new migration must never be rolled back. Fix forward instead. `docs/release.md` (RE-03) must say this.
- Writing SQL by hand costs some typing. Mapper unit tests and the round-trip repository tests required by M2 cover the risk.
