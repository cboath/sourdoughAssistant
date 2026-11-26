# ADR 0002: State: TanStack Query over local repositories, Zustand for client state

- Status: Accepted
- Date: 2026-11-26

## Context

v1 has no server. All persistent data lives in on-device SQLite, read and written through typed repositories (ADR 0003). Screens need the following:
- Loading and error states for async SQLite reads.
- Cache invalidation after writes. For example, a pantry price change must update every recipe's cost.
- A few pieces of synchronous, app-wide state: settings, the schedule-bake draft, and permission status.

In v1.1, sync arrives. The same screens will then read local data that a background sync process changes underneath them.

## Options considered

1. **TanStack Query as the async cache over repositories, with Zustand for client state.** Queries call repositories. Mutations call services and invalidate query keys. This uses the stack's standard libraries, and v1.1 sync only needs to invalidate keys after a pull.
2. **Zustand stores that load whole tables into memory.** This is simple, but each store re-implements loading, error and invalidation logic, and the stores drift from the DB.
3. **Drizzle ORM `useLiveQuery` (reactive SQLite).** Re-renders happen automatically on table change. But it ties the UI to Drizzle (see ADR 0003, which rejects the ORM), and it's harder to test in Jest.
4. **Redux Toolkit.** Not warranted for this app's complexity.

## Decision

**Option 1.**

TanStack Query (`@tanstack/react-query` v5) settings:
- `networkMode: 'always'`. Local queries must never pause for "offline".
- `staleTime: Infinity`. Data only changes through our own mutations, which invalidate explicitly.
- `retry: false` for queries and mutations, because local errors are not transient.
- `refetchOnWindowFocus: false`. A focus manager is still wired to `AppState` so that v1.1 can turn it on.
- No persistence plugin. SQLite is the persistence layer.
- A query-key factory lives in `apps/mobile/src/state/query-keys.ts`. Invalidation rules are listed in `docs/architecture.md` section 5.
- Optimistic updates only for cheap toggles (favorite, fold checkbox). Everything else waits for the write, which takes milliseconds.

Zustand holds:
- `useSettings`: hydrated from the `settings` row before the first screen renders, and written through to the repository. Read synchronously by many hooks and by the notification service, outside React.
- `useScheduleDraft`: an ephemeral draft for the schedule screen (recipes, loaves, ready time, kitchen temperature, slider overrides). Not persisted.
- `usePermissions`: the notification, exact-alarm and battery-optimization status, refreshed whenever the app comes to the foreground.

Derived values (cost breakdown, baker's %, plan preview) are **computed in hooks** with `packages/core` and `useMemo`. They are never stored in Zustand or SQLite. The exception is the snapshots taken when a bake is scheduled (ADR 0014).

## Consequences

- RN-04 sets up the `QueryClientProvider` and the stores. RN-05 and later features follow the `features/<f>/hooks` pattern.
- Services (not components) call `queryClient.invalidateQueries` after a write, so non-React callers (the notification reconcile, restore) keep the cache consistent.
- In v1.1, the sync engine writes to SQLite and then invalidates the affected keys. Screens don't change.
