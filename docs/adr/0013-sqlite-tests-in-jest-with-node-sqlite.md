# ADR 0013: Repository tests in Jest against in-memory SQLite (`node:sqlite`)

- Status: Accepted
- Date: 2026-11-26

## Context

BUILD_PLAN: "Repository tests against an in-memory SQLite. Each entity round-trips. Migrations run from an empty DB." `expo-sqlite` is a native module and doesn't run in Node or Jest. CI runs on Ubuntu only.

## Options considered

1. **`node:sqlite` (Node built-in `DatabaseSync`).** No flag is needed from Node 22.13 onward, and it ships with Node 24. It needs no native build or install step, and it bundles a recent SQLite with STRICT and JSON functions. Node prints an `ExperimentalWarning` and the API is "release candidate", but it's only used in tests.
2. **`better-sqlite3`.** Mature, but it's a native addon that has to build or download prebuilt binaries on CI and on dev machines, and it can break on Node upgrades.
3. **`sql.js` (WASM).** Slower and async-loaded, and its SQLite version might lack recent features.
4. **Mock expo-sqlite.** Proves nothing about the SQL.

## Decision

**Option 1. `better-sqlite3` is the fallback** if `node:sqlite` causes trouble. The adapter makes switching a one-file change.

- Repositories depend on the `SqlDatabase` interface (ADR 0003):

  ```ts
  interface SqlExecutor {
    run(sql: string, params?: SqlParams): Promise<{ changes: number }>;
    get<T>(sql: string, params?: SqlParams): Promise<T | null>;
    all<T>(sql: string, params?: SqlParams): Promise<T[]>;
    exec(sql: string): Promise<void>;
  }
  interface SqlDatabase extends SqlExecutor {
    transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
    close(): Promise<void>;
  }
  type SqlParams = Record<string, string | number | null> | Array<string | number | null>;
  ```

- `apps/mobile/src/db/adapters/node.ts` (test only, excluded from the app bundle by path) wraps `new DatabaseSync(':memory:')`:
  - Each method is synchronous, wrapped in a resolved Promise.
  - `transaction` runs `BEGIN IMMEDIATE` and then `COMMIT`, or `ROLLBACK` on a throw, behind a promise mutex.
  - PRAGMAs are the same as on device.
  - Named params use the `$name` syntax on both adapters.
- `apps/mobile/src/db/test-utils.ts` exports `createTestDb({ migrate = true, seed = false, clock })`, which returns a fresh in-memory DB per test.
- **Jest config** (`apps/mobile/jest.config.js`) has two projects:
  - `app`: `preset: 'jest-expo'`, RNTL, for `src/**/*.test.tsx` and feature hook tests.
  - `db`: `testEnvironment: 'node'`, `transform` with `babel-jest` (babel-preset-expo), `testMatch: ['<rootDir>/src/db/**/*.test.ts', '<rootDir>/src/features/*/{planner,backup}*.test.ts']`. No React Native preset, so `node:sqlite` resolves normally.
- **Required test suites (M2):**
  - `migrate.test.ts`:
    - An empty DB reaches the current version.
    - A second run is a no-op.
    - A failing migration rolls back and leaves the version unchanged.
    - The downgrade guard works.
    - The schema snapshot matches (`sqlite_master` dump compared with a committed snapshot).
  - `<entity>.repo.test.ts` for each entity: create, read, edit (`updatedAt` changes, `createdAt` doesn't), soft delete (hidden from reads, row kept with `deletedAt`), reload with stable ids.
  - `seed.test.ts`: the first run inserts, the second run inserts nothing, and a deleted seed recipe is not recreated.
- **Clock:** tests inject a fixed clock. No test depends on the machine's `TZ`. The Jest `globalSetup` sets `process.env.TZ = 'UTC'` anyway.
- **Parity risk:** the on-device SQLite version may differ from Node's. Mitigations: use only features that exist in SQLite 3.40 or later (STRICT, partial indexes, `json_valid`), and have a dev-only "self-test" screen action that runs the migration and round-trip smoke test on device. RN-02 adds it behind `__DEV__`.

## Consequences

- RN-01 and RE-01: the CI Node version must be 24 (ADR 0001).
- RN-02 owns the adapters, `test-utils` and the Jest `db` project. QA-03 and QA-05 use the `app` project.
