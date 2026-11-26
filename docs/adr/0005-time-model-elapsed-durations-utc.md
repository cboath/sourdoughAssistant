# ADR 0005: Time model: elapsed durations, UTC instants, local display

- Status: Accepted (A1; Chris to agree)
- Date: 2026-11-26

## Context

Bakes run 18 to 36 hours, and many of them cross midnight. Some will cross a DST transition (S-6). Fermentation is a physical process, so a 12 h cold ferment means 12 real hours no matter what the wall clock does. BUILD_PLAN: times are stored as UTC ISO strings, shown in local time, using `date-fns-tz`.

## Decision

1. **Durations are elapsed minutes** (integers). The scheduler works only with instants (`EpochMs`, UTC milliseconds). It adds and subtracts `minutes * 60_000` and never does calendar arithmetic. That makes it DST-proof by construction.
2. **User input is converted to an instant once,** at the edge. The ready date and time are picked as local wall-clock time in the device's current IANA zone (`expo-localization` `getCalendars()[0].timeZone`), then converted with `localToUtc()` in core, which wraps `fromZonedTime` from date-fns-tz.
   - **Nonexistent local time** (spring-forward gap, for example 02:30 on 2026-03-08 in `America/New_York`): move forward by the gap (to 03:30 EDT) and return `adjustment: 'shiftedForward'` so the UI can say so.
   - **Ambiguous local time** (fall-back, 01:30 on 2026-11-01): pick the **earlier** instant (EDT, the first occurrence) and return `adjustment: 'ambiguousEarlier'`.
   - **AMB-04:** a gap time is **normalized forward, never rejected**. A repeated time resolves to the **first occurrence**. The elapsed-time model itself (A1) still awaits Chris's agreement, but QA can write final values against it.
3. **Storage:** every instant is stored as an ISO UTC string. Each bake also stores the IANA `time_zone` it was scheduled in, for the record and for debugging.
4. **Display and quiet hours use the device's current zone** at render time (`formatInTimeZone`, `isInQuietHours(at, quiet, zone)`). If the user travels, the steps stay at the same real instants and simply show new clock times. The zone is always passed into core functions as a parameter; core never reads the device zone.
5. **Consequences of DST for the user:** a step that spans a transition shows a clock span of 11 or 13 h for a 12 h step. The timeline shows a small "clocks change tonight" note on any step that spans a transition, using `zoneTransitionsBetween()` in core.
6. **Clock injection:** core functions take `now: EpochMs` as a parameter and never call `Date.now()`. App code gets time from `src/lib/clock.ts`, which tests can replace.

### Worked examples (QA-02 should lock these in)

Default template total = 1,855 min (30 h 55 m). Zone `America/New_York`.

| Case | Ready (local) | Ready (UTC) | Feeding starts (UTC) | Feeding shows (local) | Naive wall-clock math would say |
|---|---|---|---|---|---|
| PRD baseline, no DST | Sat 2026-11-28 10:00 EST | 15:00Z | Fri 08:05Z | **Fri 03:05** | Fri 03:05 |
| Spring forward (Sun 2026-03-08) | Sun 10:00 EDT | 14:00Z | Sat 07:05Z | **Sat 02:05 EST** | Sat 03:05 (an hour too late) |
| Fall back (Sun 2026-11-01) | Sun 10:00 EST | 15:00Z | Sat 08:05Z | **Sat 04:05 EDT** | Sat 03:05 (an hour too early) |

In the spring case, the cold ferment runs Sat 19:15 EST to Sun 08:15 EDT: 12 elapsed hours, 13 clock hours.

## Options considered

- **Wall-clock durations** (an "8 h" step ends at the same clock time plus 8 regardless of DST). Rejected: the dough would ferment an hour more or less than intended.
- **Store local time plus zone, compute in local time.** Rejected: it's error-prone and conflicts with the BUILD_PLAN convention.

## Consequences

- Notifications are scheduled with absolute `Date` triggers. When the zone changes, the reconcile runs again (ADR 0011).
- QA-02 runs tests with explicit zones. Core tests never depend on the machine's `TZ`.
- `date-fns` v4 and `date-fns-tz` v3 are dependencies of `packages/core`. They are pure JS that uses `Intl`, and Hermes ships full `Intl` time-zone support.
