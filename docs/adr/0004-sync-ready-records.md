# ADR 0004: Sync-ready records: UUIDs, UTC timestamps, soft-delete tombstones

- Status: Accepted (CL-01 reviews it for v1.1)
- Date: 2026-11-26

## Context

PRD section 3: v1 is local-only, but v1.1 adds accounts and cloud sync, which must not force a migration rewrite. Assumption A7: every table gets UUID ids, `createdAt`/`updatedAt` in UTC, and `deletedAt` tombstones. The v1.1 target is a DynamoDB single table with `PK = USER#<id>` and `SK = RECIPE#<id> | PANTRY#<id> | BAKE#<id>`.

## Options considered

1. **Sync fields now (UUID, timestamps, tombstones). Defer sync bookkeeping columns (`dirty`, `server_version`) to v1.1 as additive migrations.**
2. Add the full sync bookkeeping now (`dirty`, `rev`, `synced_at`). This designs a protocol we haven't chosen yet, and the columns would go unused for a whole release.
3. Integer autoincrement ids now, with remapping in v1.1. Remapping breaks backups and cross-device restore, and it would mean the migration rewrite the PRD forbids.

## Decision

**Option 1.**

- **ids:** UUID v4 strings from `expo-crypto.randomUUID()`, generated in the app layer through an injectable `ids.newId()`.
  - Exception: `settings` uses the fixed id `'settings'` (one row per device or user). The v1.1 sync key would be `SK = SETTINGS`.
  - `packages/core` never generates ids. Callers pass ids in.
- **Timestamps:** `TEXT` ISO 8601 UTC, always produced by `Date.prototype.toISOString()` (`YYYY-MM-DDTHH:mm:ss.sssZ`). The fixed width means lexical order equals time order, so indexes and `ORDER BY` work on strings.
- **Every syncable table** has `id TEXT PRIMARY KEY`, `created_at TEXT NOT NULL`, `updated_at TEXT NOT NULL` and `deleted_at TEXT NULL`.
- **Soft delete only:**
  - Deleting a recipe sets `deleted_at` on the recipe and its ingredient and step rows in one transaction.
  - Deleting a pantry item archives it. Recipe lines keep pointing at it and still price from it, and the UI labels it "(archived)".
  - Tombstones are kept forever in v1. v1.1 purges them after the server acknowledges them.
- **Uniqueness constraints** use partial indexes `WHERE deleted_at IS NULL`.
- **Child entities** (`recipe_ingredient`, `step`, `price_history`, `bake_item`, `bake_step`) have their own UUIDs and timestamps. That way v1.1 can sync them as separate items (`SK = RECIPE#<id>#ING#<id>`) or embed them in the parent document. CL-01 decides.
- **Aggregate version (sync-readiness N3):** any write to a `recipe_ingredient` or `step` row (insert, update, soft delete or revive) bumps the parent `recipe.updated_at` in the **same transaction**. RN-02 pins this with a test, and every write goes through the shared SQL helpers.
- **Pantry archive (sync-readiness N5), decided: keep reusing `deleted_at` as "archived" in v1, with no `archived_at` column and no schema change.** Consequence: pantry tombstones must **never be purged** by client or server, because live recipe lines still reference and price them. If v1.1 needs real pantry deletion or purging, add `archived_at` then as an additive migration (add the column and copy `deleted_at`). That's cheap, and nothing written in v1 blocks it.
- **Conflict rule assumed for v1.1** (written down here so v1 fields support it): last writer wins per record, using `updated_at`. Bake progress (`bake_step.actual_*`) wins over the plan, because what really happened beats what was planned.
- **Not synced:** `app_meta` (device-local keys, seed version, last reconcile) and `_migrations`.

## Consequences

- RN-02 repositories must never `DELETE` from syncable tables in v1. The only exception is a full restore, which replaces everything (ADR 0012).
- Every list query needs `WHERE deleted_at IS NULL`. Repository tests assert that deleted rows disappear from reads but stay in the table.
- CL-01 reviews `docs/data-model.md` section 4 (sync mapping).
