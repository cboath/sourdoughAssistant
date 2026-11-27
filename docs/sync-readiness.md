# Sourdough Assistant: v1.1 sync-readiness review (CL-01)

2026-11-26 · cloud-infrastructure-architect · Review only: no infra was written and nothing in `infra/` changed.

**Inputs reviewed:** `docs/data-model.md`, `docs/PRD.md` §7, `docs/adr/0004-sync-ready-records.md`, `docs/architecture.md` (§1 sync API note, §10, §14), ADR 0009 §8, 0012, 0014, 0015, `docs/security/threat-model.md` L2c, `apps/mobile/src/db/migrations/0001_init.ts`, `apps/mobile/src/db/sql.ts`, `deps.ts`, `ids.ts`, `repositories/**`.

## 0. Verdict

**The schema is sync-ready. v1.1 can add sync with additive migrations only, and nothing needs rewriting.**

- UUID ids, fixed-width ISO UTC timestamps, soft-delete tombstones, and the rule that every write goes through `sql.ts` (`insertRow`, `updateRow`, `writeChildren`, `softDeleteWhere`) are the right foundation. The `writeChildren` skip-unchanged behavior and the always-bumped `recipe.updated_at` make both per-row and per-aggregate LWW workable.
- **One thing must change before v1 data exists: seed rows need deterministic ids** (§7, N1). RN-03 hasn't been built yet, so this costs about ten lines now. If v1 ships random seed ids, the first sync between two devices duplicates every seed recipe and pantry item. It can also abort the pull on the `seed_key` unique index. Fixing that later means an id-remap migration across `recipe`, `recipe_ingredient`, `step`, `pantry_item`, `price_history` and `bake_item`, which is exactly the rewrite ADR 0004 is meant to prevent.
- Two more items are cheap now and can't be repaired later, but they don't block sync (§7, N2 and N3).
- Everything else (outbox/dirty columns, server cursor, per-field settings merge, purge, device id) is additive and belongs in v1.1.

## 1. ID strategy

| Check | Finding | Status |
|---|---|---|
| Format | UUID v4 `TEXT` from `expo-crypto.randomUUID()` via injectable `ids.newId()` (`ids.ts`). `packages/core` never mints ids | OK |
| Child rows | `recipe_ingredient`, `step`, `price_history`, `bake_item`, `bake_step` have their own UUID PKs. Every reference (`recipe_id`, `pantry_item_id`, `anchor_step_id`, `bake_item_id`) is a global PK, not a position or a per-parent index | OK |
| Settings | Fixed id `'settings'` → `SK = SETTINGS`. Fine because there is one row per user | OK |
| Import | Single-recipe import mints new ids (ADR 0012). Re-importing the same file twice gives two recipes, which is the correct semantics | OK |
| Restore | Full restore keeps ids and timestamps (ADR 0012), so a restore on a second phone is the same data. Server keys are always scoped under `USER#<sub>`, so two *different* accounts that restored the same backup file can share UUIDs without colliding. **The server must never index by bare `id` across users** (no GSI on `id`) | OK, with a rule for v1.1 |
| Seed rows | Seeding mints random UUIDs per install, and `seed_key` has a non-partial `UNIQUE` index. Two installs of the same user get different ids for `recipe:country-loaf`. The second one to sync either duplicates it or trips the unique index on pull | **Fix now (N1)** |
| `bake_step` | `UNIQUE (bake_id, step_key)` includes tombstones. Bakes and their steps are created on one device, so a cross-device collision needs two devices to `addSteps` the same key at the same time. That's unlikely, but if it happens the pull fails on that constraint | Optional now (N4) |

UUID v7 (time-ordered) would give slightly better SQLite index locality, but switching isn't worth it. v4 is fine for DynamoDB because the partition key is the user, not the id.

## 2. Timestamps, precision, clock skew

**Format.** `toISOString()` always produces `YYYY-MM-DDTHH:mm:ss.sssZ`: fixed width, UTC, millisecond precision. Lexical order equals time order, so string comparison works in SQLite (`MAX(text, text)`), in TS, and in DynamoDB condition expressions on `S` attributes. No change needed.

**What client `updated_at` is good for, and what it isn't:**

| Use | Safe? | Why |
|---|---|---|
| LWW comparison between two versions of the same row | Yes, with the guards below | Captures user intent ("my later edit wins"), including edits made offline |
| Pull cursor (`?since=<updated_at>`) | **No** | An edit made offline at 09:00 and pushed at 18:00 sorts before rows another device already pulled up to 17:00, so it is never pulled. Clock skew makes it worse. Use a server-assigned sequence (§4) |

**Guards for LWW in v1.1 (all additive, none needed in v1):**

1. **Future-clock clamp (server).** If an incoming `updatedAt > serverNow + 5 min`, rewrite it to `serverNow` before comparing and storing, and return the stored value to the client. Without this, a phone whose clock is set to 2030 wins every conflict forever.
2. **Per-row monotonic local stamp (client).** If the device clock steps backwards (manual change, NTP correction), a newer local edit could get an older `updated_at` than the version the server already holds, and the server would silently drop it. In `updateRow` and `softDeleteWhere`, set `updated_at = CASE WHEN $now > updated_at THEN $now ELSE strftime('%Y-%m-%dT%H:%M:%fZ', updated_at, '+0.001 seconds') END`. This only matters once rows are being pushed, so it can wait for v1.1 (D4).
3. **Deterministic tie-break.** For equal `updatedAt`, compare `deviceId` lexically (the v1.1 sync device id, §5, not `installId`). Same-millisecond writes from two devices are rare but must resolve identically on every replica.

Hybrid logical clocks would remove guards 1 and 2. That's more machinery than a single-user app needs, and it is still additive later (a `hlc TEXT` column) if it's ever needed.

## 3. Tombstones, retention and purge

**v1 (current):** soft delete everywhere, tombstones kept forever, and hard deletes only on full restore. Recipe delete tombstones its children with the same `now`, and `writeChildren` revives a tombstoned child when its id reappears. This is correct, and nothing needs changing in v1.

**Things v1.1 must respect (they come from the v1 data semantics):**

| Rule | Reason |
|---|---|
| **Never purge `pantry_item` tombstones** (server or client) | `deleted_at` on pantry means "archived", and archived items are still referenced by live `recipe_ingredient.pantry_item_id` and still price recipes (ADR 0004). Purging one breaks costs and FKs. Splitting out an `archived_at` column would be cleaner but is optional (N5) |
| **Never purge tombstones of rows with a `seed_key`** | The tombstone is what stops a deleted seed being recreated. If the server purges it, a fresh device re-seeds the recipe with the same deterministic id (N1), and the user's delete is undone. These tombstones are a few hundred bytes each, so keep them forever |
| Client purge: only tombstones the server has acked, older than 30 days, and with no live FK referencing them (`NOT EXISTS` on `bake_item.recipe_id`, `recipe_ingredient.pantry_item_id`, `step.anchor_step_id`, `bake_step.bake_item_id`) | `foreign_keys = ON` would reject the delete anyway. Checking first keeps the purge job from failing |
| Server purge: DynamoDB TTL attribute `purgeAt = deletedAt + 180 days` on recipe, bake, bake-child and price-history tombstones only | Free deletes. Items with no `purgeAt` are never expired |
| **Stale-device resync:** the pull cursor carries the time it was issued. If it's older than `180 days − 7 days`, the server answers `410 RESYNC`. The client then does a full pull and hard-deletes local rows that aren't dirty and aren't on the server | Otherwise a device offline longer than the retention window never learns about purged deletions and pushes them back to life |
| Pull applier: if a `bake_item.recipe_id` points at a recipe that isn't present locally, set it to `NULL` | It is provenance only (data-model §2), and the snapshot is authoritative. This avoids an FK failure when a recipe tombstone was purged before a new device joined |
| **Restore while signed in** (v1.1): a full restore hard-deletes and leaves no tombstones, so under sync it behaves as "merge with server", not "replace" | Needs a product decision (§9 Q1 = `docs/open-questions.md` F1, **open for v1.1**). Whatever is decided, restore must reset the local cursor and mark every restored row dirty |

## 4. Conflict resolution

### 4.1 Unit of conflict per entity (recommendation)

| Entity | Sync unit | Merge rule | Why |
|---|---|---|---|
| `settings` | one item | **Per-field LWW** (v1.1 adds `field_clock_json`, additive, D3) | Whole-row LWW loses real edits. Example: device B finishes onboarding with locale defaults and overwrites the quiet hours tuned on device A. Settings has 13 independent fields and no cross-field invariants |
| `pantry_item` | one item | Row LWW | Small, edited rarely |
| `price_history` | one item each | Append-only. Duplicates are harmless; deletes use LWW | Concurrent price edits on two devices both append, and both entries are kept. The `pantry_item` mirror goes to the LWW winner. Acceptable |
| **`recipe` + `recipe_ingredient` + `step`** | **one aggregate item**, versioned by `recipe.updated_at` | Aggregate LWW | See 4.2 |
| `bake` header | one item | Row LWW, then the client re-derives `oven_slots_json` and the plan | |
| `bake_item` | one item each | Row LWW | Effectively immutable after scheduling (the snapshot). Kept separate because snapshots are 5 to 40 KB and shouldn't be rewritten on every step tap |
| `bake_step` | one item each | **Row LWW for plan fields, field rules for progress** (4.3) | Two devices tapping progress on the same bake must not lose an actual time |

### 4.2 Recipe aggregate: why embedded, and why it works with the current code

- **Invariants span rows:** alongside anchors must point at a live step of the same recipe, levain role ↔ hydration, positions, fold math, and core `validateSteps`. Per-row LWW can merge two individually valid edits into an invalid graph. For example, device A deletes step X while device B adds a step anchored to X, and the merged recipe then fails `validateSteps` when it's opened.
- **The UI already saves whole aggregates.** `recipes.update()` replaces the ingredient and step lists, and **`recipe.updated_at` always bumps** (RN-02), including when only a child changed and on soft delete. That makes it a valid aggregate version.
- **Applying a pulled recipe reuses `writeChildren`.** Upsert the header, then `writeChildren` for each list: missing children are soft-deleted locally, and unchanged ones aren't touched. The only addition is a remote-apply variant that writes the server's `updated_at` instead of `clock.nowIso()`.
- **Cost of the choice:** if both devices edit *different* lines of the same recipe while offline, one whole edit is lost. For a single baker that's acceptable. A later version could keep a "conflicted copy" instead of discarding the losing edit.
- **Size:** worst case is 10 KB of notes, about 50 ingredients, and 20 steps with 2 KB notes each, which comes to about 60 KB. That's far below the 400 KB item limit. Typical is 3 to 8 KB.
- **Pinned by a test now (N3):** no code path may write `recipe_ingredient` or `step` without bumping `recipe.updated_at` in the same transaction.

Child rows keep their own ids and timestamps. The server body includes them, so switching to per-row merge later needs no local schema change.

### 4.3 Bake progress merge (`bake_step`)

ADR 0004 says "actuals beat plan". Here it is made concrete, so it holds even when whole-row LWW would drop a field:

| Field(s) | Rule |
|---|---|
| `actual_start_at` | earliest non-null |
| `actual_end_at` | non-null wins; if both are set, the later one wins |
| `status` | highest rank wins: `pending < active < done`; `skipped` beats `pending` and `active`; `done` beats `skipped` |
| `fold_times_json` | set union, sorted; `folds_done = max(folds_done, length(union))` |
| `planned_*`, `duration_*`, `slot_index` | row LWW, then **the client re-runs `recomputePlan` from the merged actuals** and writes the result as a new local edit |
| `deleted_at` | row LWW |

The server can apply these rules inside the push Lambda (read, merge, conditional write). Alternatively the server stores both and the client merges on pull. Either way the v1 schema already has every column the rules need.

**Aggregate consistency of the bake:** every bake write (create, recompute, remove item) is one local transaction. On the wire, a bake's create is pushed in one batch (≤ 99 rows per `TransactWriteItems`, §4.5). A bake of 2 items × 40 steps fits easily. A pulled bake that is temporarily incomplete (header present, steps on a later page) is avoided by applying all pull pages in one local transaction (§4.5).

### 4.4 Snapshots

`recipe_snapshot_json` and `cost_snapshot_json` are self-contained, carry `snapshotVersion: 1`, and are never recomputed. They sync as opaque JSON on the `bake_item` item, and nothing else is required. Two small notes:

- Each snapshot embeds pantry and recipe ids, but readers never resolve them. Keep it that way, so purged recipes can't break old bakes.
- `cost_snapshot_json.computedAt` is a client timestamp. It's display-only, so skew doesn't matter.

### 4.5 Protocol sketch (for the v1.1 contract; not built now)

- **Push** `POST /sync/push` `{ deviceId, schemaVersion, changes: [{ type, id, updatedAt, deletedAt, body }] }`, at most 99 changes per call.
  1. Lambda reads the current versions of those keys with `BatchGetItem` (consistent read).
  2. It merges per §4.1 to §4.3.
  3. It writes the winners plus the counter bump in one `TransactWriteItems`.
  4. It returns `{ accepted: [{id, seq}], rejected: [{id, server: item}] }`.
  5. The client clears `dirty` only `WHERE id = ? AND updated_at = <pushed updated_at>`, so an edit made while the push was in flight stays dirty.
- **Pull** `GET /sync/pull?since=<opaque cursor>&limit=200` returns `{ items, cursor, hasMore }` or `410 RESYNC`. The client stages all pages, then applies them in one SQLite transaction with `PRAGMA defer_foreign_keys = ON`. That's needed because an item's *current* seq can be higher than its children's (a pantry item edited after the recipe that references it), so page order isn't FK order.
- **Schema skew:** the v1 tables are `STRICT` with enum `CHECK`s. An older client that pulls a row with a new enum value (for example a new step `kind`) fails the insert. Every push sends `schemaVersion`. The server stores it per item and answers `426 Upgrade Required` when a pull would return an item newer than the client's version. This is a v1.1 server rule, and the v1 schema needs nothing.

## 5. `installId` caveat (threat model L2c, ADR 0015)

`app_meta.installId` lives in `sourdough.db`. iCloud and Android Auto Backup are deliberately left on (threat model L2), so an OS-level restore onto a new phone copies it. **Two phones restored from the same OS backup share one `installId`.** Anything in app_meta that sync stores, such as the cursor or a last-push watermark, is copied too.

**v1.1 rule: never use `installId` as the sync device identity.** Instead:

1. On sign-in, generate a `syncDeviceId` (UUID). Store it **both** in `app_meta` and in `expo-secure-store` with `keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
   - On iOS, `…ThisDeviceOnly` Keychain items are not restored to a different device.
   - On Android, the SecureStore value is encrypted with an Android Keystore key, which is never backed up, so a restored copy can't be decrypted. Android backup rules should also exclude the SecureStore prefs file, alongside `backups/` and `diagnostics.log` (L2).
2. On every launch, if `app_meta.syncDeviceId` exists but the SecureStore value is missing or doesn't match, this is a **restored device**:
   - generate a new `syncDeviceId`
   - drop the local cursor and do a full pull
   - mark every local row dirty, so a re-push is idempotent under LWW because the rows carry the same `updatedAt`
3. The device id is used only for LWW tie-breaks, the `DEVICE#` item (last seen, app version, future push token), and diagnostics. It's never used for authorization, which always comes from the Cognito `sub`.

**Nothing to change in v1.** `installId` isn't used for sync, and the restore detection is pure v1.1 code.

## 6. DynamoDB mapping (v1.1 target)

One table per environment (`sourdough-sync-dev` / `-prod`), on-demand, PITR on in prod, TTL attribute `purgeAt`. Partition key `PK` (S), sort key `SK` (S), and **LSI1** with sort key `LSI1SK` (S), projection `ALL`. An LSI is chosen over a GSI because pull needs **strongly consistent** reads by sequence, and only an LSI offers that. The 10 GB per-partition limit an LSI imposes is irrelevant for one user's data (a few MB per year). An LSI can only be created with the table, so it has to be in the first v1.1 template.

### 6.1 Entity → key patterns

| Entity (local table) | PK | SK | LSI1SK | Body | TTL |
|---|---|---|---|---|---|
| sync counter | `USER#<sub>` | `META#SYNC` | (none: sparse) | `seq` (N), `createdAt` | never |
| device | `USER#<sub>` | `DEVICE#<syncDeviceId>` | (none) | `platform`, `appVersion`, `schemaVersion`, `lastPullSeq`, `lastSeenAt` | 400 d after `lastSeenAt` |
| settings | `USER#<sub>` | `SETTINGS` | `SEQ#<seq20>` | fields + `fieldClock` map | never |
| pantry_item | `USER#<sub>` | `PANTRY#<id>` | `SEQ#<seq20>` | row | never (§3) |
| price_history | `USER#<sub>` | `PANTRY#<pantryId>#PRICE#<id>` | `SEQ#<seq20>` | row | `deletedAt + 180 d` |
| recipe (+ ingredients + steps) | `USER#<sub>` | `RECIPE#<id>` | `SEQ#<seq20>` | header + `ingredients[]` + `steps[]` (each with id, position, timestamps) | `deletedAt + 180 d`, unless `seedKey` is set |
| bake | `USER#<sub>` | `BAKE#<id>` | `SEQ#<seq20>` | header | `deletedAt + 180 d` |
| bake_item | `USER#<sub>` | `BAKE#<bakeId>#ITEM#<id>` | `SEQ#<seq20>` | row incl. snapshots | `deletedAt + 180 d` |
| bake_step | `USER#<sub>` | `BAKE#<bakeId>#STEP#<id>` | `SEQ#<seq20>` | row | `deletedAt + 180 d` |
| app_meta, _migrations | not synced | | | | |

Common attributes on every synced item: `type`, `id`, `updatedAt` (client, after clamping), `deletedAt`, `deviceId` (last writer), `seq` (N), `schemaVersion` (N), `purgeAt` (N, epoch seconds, optional). `<seq20>` is the sequence zero-padded to 20 digits, so string order equals numeric order.

**data-model.md §4 conformance:** the proposed mapping is kept, with three refinements:

- recipe children are **embedded**, which settles the open question in §4
- the `bake_step` SK uses the row id; `step_key` stays in the body
- `META#SYNC`, `DEVICE#` and `LSI1SK` are added

### 6.2 Access patterns

| # | Pattern | Operation |
|---|---|---|
| A1 | Push a batch of changes | `BatchGetItem` (consistent) on the keys, merge, then `TransactWriteItems`: `Update META#SYNC SET seq = seq + :n` conditioned on `seq = :read`, plus up to 99 `Put`s, each with `LSI1SK = SEQ#<read+i>` and a condition that `updatedAt` is unchanged since the read. If the transaction is cancelled, re-read and retry (3×, with jitter) |
| A2 | Pull changes since cursor | `Query` on LSI1 with `PK = USER#<sub> AND LSI1SK > SEQ#<cursor>`, `ConsistentRead`, `Limit 200`, paginated |
| A3 | Full resync and first sign-in | `Query` on the base table with `PK = USER#<sub>`, paginated, and then the cursor is set to `META#SYNC.seq` read *before* the query |
| A4 | One bake with children (not needed by the app, which reads SQLite; useful for support tooling) | `Query PK = USER#<sub> AND begins_with(SK, 'BAKE#<id>')` |
| A5 | Price history of an item | `Query PK = USER#<sub> AND begins_with(SK, 'PANTRY#<id>#PRICE#')` |
| A6 | Register or refresh a device | `PutItem DEVICE#<id>` |
| A7 | Delete account (App Store 5.1.1(v) requires in-app deletion once accounts exist) | `Query` all keys for the user, then `BatchWriteItem` deletes (25 per call), then `AdminDeleteUser` in Cognito. Run it in a Step Functions or SQS job with a DLQ |

**Why a write-serialized counter instead of a timestamp or an unconditioned counter:** the conditional update on `META#SYNC` in the same transaction makes concurrent pushes for one user conflict and retry. Commit order then equals `seq` order, so a pull can never advance its cursor past a `seq` whose write hasn't committed yet. Per-user push concurrency is tiny (one person, two or three devices), so the retries cost nothing in practice. A server timestamp as the cursor would have the same gap problem and would also need tie handling.

**Cursor on the client:** `app_meta.syncCursor` stores `{seq, issuedAt}` as an opaque base64 token from the server. Because it's in app_meta, it is copied by OS restore, and §5 handles that.

## 7. Schema and code changes: now vs defer

### Do now (v1), cheap now and expensive or impossible later

| ID | Change | Owner | Why now |
|---|---|---|---|
| **N1 (must)** | **Seed rows get deterministic ids and a fixed seed timestamp.** Hard-code a constant UUID per seed row in the seed data: recipe, every seeded ingredient and step, pantry item, and price_history entry. (Generating them once and committing them is simpler than UUID v5 at runtime.) Set `created_at` and `updated_at` of seeded rows to a fixed `SEED_EPOCH` (for example `'2026-12-01T00:00:00.000Z'`) instead of the install time. Keep the existing seed_key and tombstone skip logic | **RN-03** (`apps/mobile/src/db/seed/**`, not built yet), with the rule written into `docs/data-model.md` §5 by **mobile-solutions-architect** (AR-01 follow-up) | With random ids, two installs of one user hold two different copies of each seed. The first sync then duplicates them or aborts on `pantry_item_seed_key_uq` / `recipe_seed_key_uq`. The later fix is an id-remap migration across 6 tables, the rewrite A7 forbids. The fixed timestamp makes any real user edit or delete (on any device) beat an untouched fresh seed under LWW, instead of a newly installed phone overwriting edits with defaults |
| **N2 (should, not sync)** | **`priced_at` must be the *local* calendar date, not the UTC date.** `pantry.create` and `pantry.update` default it with `utcDate(clock.nowIso())` (`repositories/context.ts`). data-model.md §1 defines `priced_at` as a local date. For a US baker after about 4 to 7 pm local time, the stored date is tomorrow. Fix: the service layer passes the local date (the device zone from `expo-localization`), or the repo takes a `today()` from an injectable clock that knows the zone | **RN-02** | Not a sync blocker, but wrong dates written in v1 can't be repaired later because the zone isn't stored with the row |
| **N3 (should)** | **Test the aggregate-version invariant:** any change to `recipe_ingredient` or `step` bumps `recipe.updated_at` in the same transaction (assert it for `update` with a child-only patch, for `softDelete`, and for a child revive). Add a short comment in `sql.ts` that every write must go through these helpers, because v1.1 hooks `dirty` there | **RN-02** (tests); **mobile-solutions-architect** adds one line to ADR 0004 or data-model.md §4 | It's the basis of aggregate LWW (§4.2). A test now stops M3/M4 code from adding a child-only write path that would silently break sync later |
| N4 (optional) | Derive `bake_step.id` deterministically from `(bake_id, step_key)` (UUID v5) when RN-06 materializes the plan | **RN-06** (not built yet) | It makes the non-partial `bake_step_key_uq` unable to collide across devices. It's free now because the bake service isn't written yet. Skip it if inconvenient: bakes are single-device in practice and in-flight bakes are short-lived |
| N5 (optional), **decided: deferred** | Split pantry "archived" from "deleted": add `archived_at`, and keep `deleted_at` for real deletion | **mobile-solutions-architect** decided (ADR 0004): v1 keeps `deleted_at` as "archived", with no schema change. RN-02 has nothing to do in v1 | The meaning is cleaner, and pantry tombstones become purgeable. Safe to defer, because the §3 rule "never purge pantry tombstones" covers it, and later it's a single additive column plus a copy |

### Safe to defer to v1.1 (additive, no rewrite)

| ID | Change | Notes |
|---|---|---|
| D1 | `ALTER TABLE <t> ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1` on the 8 syncable tables, set in `insertRow`, `updateRow`, `writeChildren` and `softDeleteWhere`; clear it only when `updated_at` matches what was pushed | Existing rows default to dirty, so the first sync pushes everything. `STRICT` tables allow `ADD COLUMN` with a constant default |
| D2 | `server_seq INTEGER NULL` per row (diagnostics only), and `app_meta` keys `syncCursor`, `syncDeviceId`, `lastSyncAt` | |
| D3 | `settings.field_clock_json TEXT NOT NULL DEFAULT '{}'` for per-field LWW. A missing key means "use the row's `updated_at`" | Upgraded v1 devices then treat all their fields as edited at their row time. That's correct, because those are the real settings |
| D4 | Monotonic `updated_at` in `updateRow` and `softDeleteWhere` (§2 guard 2) | Matters only once pushes happen |
| D5 | Remote-apply path: writes server timestamps, runs inside a `defer_foreign_keys` transaction, applies aggregate replacement via `writeChildren`, and nulls dangling `bake_item.recipe_id` | Service layer only |
| D6 | Tombstone purge job (client), the server TTL, and the `410 RESYNC` path | §3 |
| D7 | `syncDeviceId` with the SecureStore marker and restored-device detection | §5 |
| D8 | Settings `ensure()` for a fresh v1.1 install: write default rows with `SEED_EPOCH` timestamps | It's v1.1 code on a fresh device, so v1 data isn't affected |
| D9 | Device-local preferences: decide whether `onboarding_completed_at` and `keep_awake_default` should stay synced | Notification permission is per device, so a synced "onboarding done" mustn't skip the permission primer on a new phone. If they move to app_meta, it's a copy-then-ignore migration |

No v1 schema change is needed for: UUID format, timestamp format or precision, the tombstone columns, snapshots, JSON columns, money and weight types, or FKs without `ON DELETE`.

## 8. Rough cost

**Pricing basis:** on-demand us-east-1, about $0.625 per million write request units, about $0.125 per million read request units, and $0.25 per GB-month for storage. AWS halved on-demand prices in late 2024. Transactional writes cost 2×, and an LSI write whose key changes costs about 2× more (delete plus put). Check the official pricing page before quoting these numbers.

### 8.1 One active user (heavy hobby baker)

**Assumptions:**
- 2 devices, 8 bakes a month, each bake 1 to 2 recipes with about 30 to 40 steps
- each bake: about 125 item writes (create, progress taps, about 5 recomputes)
- 20 recipe saves and 20 pantry edits a month
- about 10 pulls a day per device and about 200 pushes a month
- effective cost about 6 WRU per 1 KB synced write (transaction 2× and LSI key change)

| Item | Monthly volume | Cost |
|---|---|---|
| DynamoDB writes | ~12,000 WRU (bakes ~10k: step rows plus 5 to 40 KB snapshot items; recipes and pantry ~1k; counter ~0.4k) | ~$0.008 |
| DynamoDB reads | ~3,000 RRU (empty pulls 1 RRU each, data pulled to the second device, BatchGet before push) | ~$0.0004 |
| DynamoDB storage | ~3 MB of growth a year; ~10 MB after a year including the LSI copy | ~$0.003 |
| API Gateway HTTP API | ~800 requests | ~$0.001 |
| Lambda (arm64, 256 MB, ~150 ms) | ~800 invocations | ~$0.00 (free tier) |
| Cognito (Lite or Essentials) | 1 MAU | $0 (first 10k MAU free) |
| **Total** | | **about 1 cent a month**. For Chris alone, all of this sits inside the free tiers: effectively $0 |

### 8.2 At scale (only to show the shape; v1.1 sizing belongs to its own infra task)

The average user is assumed at about 25% of the heavy profile above.

| MAU | DynamoDB | API GW + Lambda + Logs | Cognito | Rough total |
|---|---|---|---|---|
| 100 | <$1 | <$1 | $0 | **<$2** (plus a ~$1 Budgets/alarms floor) |
| 10k | ~$25 | ~$10 | $0 (at the free threshold) | **~$35** |
| 100k | ~$250 | ~$100 | ~$500 (Lite, ~$0.0055/MAU over 10k; Essentials ~3× that) | **~$850** |

**Biggest drivers:**
- At scale, Cognito MAU pricing dominates, so stay on the Lite tier unless an Essentials feature is needed.
- Within DynamoDB, the drivers are snapshot-bearing `bake_item` rewrites and `bake_step` progress writes, multiplied by the transaction and LSI factors. Keep snapshots out of hot writes (already true, since they're on a separate item) and debounce progress pushes (for example 2 s).
- CloudWatch Logs ingestion. Log at INFO with sampling.

## 9. Open questions for v1.1 (not blocking v1)

These are `docs/open-questions.md` **F1 to F3**. Chris has confirmed they **stay open until v1.1**. The working defaults listed there (F1 not decided, F2 rings on both devices, F3 last save wins) are **not** decisions.

1. **Restore while signed in** (F1): should restoring a backup *replace* the cloud copy (the server tombstones everything not in the backup) or *merge* with it (the default behavior if nothing special is done, §3)?
2. **Notifications on multiple devices** (F2): when a bake syncs to a second phone or tablet, should that device also schedule its local reminders? The default would be yes on all devices, which means double alerts. A per-bake "notify on this device" setting would be an additive, device-local column.
3. **Concurrent recipe edits** (F3): is "last save wins the whole recipe" acceptable, or should a conflicted copy be kept (§4.2)?

## Sources

- [Amazon DynamoDB on-demand pricing](https://aws.amazon.com/dynamodb/pricing/on-demand) (WRU/RRU billing, 2× for transactional writes)
- [Understanding DynamoDB pricing (Bytebase, 2025)](https://www.bytebase.com/blog/understanding-dynamodb-pricing/) ($0.625 per million WRU after the late-2024 cut)
- [Airbyte: DynamoDB pricing](https://airbyte.com/data-engineering-resources/dynamodb-pricing) (late-2024 reduction)
