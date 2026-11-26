/** Injected dependencies so tests are deterministic (ADR 0003, ADR 0004). */
export interface Clock {
  /** Current instant as ISO 8601 UTC with milliseconds, from `Date.prototype.toISOString()`. */
  nowIso(): string;
}

export interface Ids {
  /** A new UUID v4. */
  newId(): string;
}

export const systemClock: Clock = {
  nowIso: () => new Date().toISOString(),
};

/**
 * The baker's calendar. Injected so repositories never read the device zone themselves, and
 * tests can pin it. Local dates (`YYYY-MM-DD`) are what `price_history.priced_at` stores.
 */
export interface Zone {
  /** The calendar date of an ISO instant in this zone. */
  localDate(iso: string): string;
}

/** A Zone for an explicit IANA zone, or the device's current zone when `timeZone` is omitted. */
export function createZone(timeZone?: string): Zone {
  return {
    localDate: (iso) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(iso));
      const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
      return `${part('year')}-${part('month')}-${part('day')}`;
    },
  };
}

/** The device zone, resolved on every call so it follows the baker when they travel. */
export const systemZone: Zone = createZone();

export interface RepositoryDeps {
  clock: Clock;
  ids: Ids;
  /** Defaults to the device zone (`systemZone`) when omitted. Tests inject a fixed zone. */
  zone?: Zone;
}

/** Optional overrides for creates, used by seeding for reproducible rows. */
export interface CreateOptions {
  /** Use this id instead of `ids.newId()`. */
  id?: string;
  /** Use this instant for `created_at`/`updated_at` (and the local date of a price) instead of the clock. */
  at?: string;
  /** Pantry only: id of the initial price-history row. */
  priceHistoryId?: string;
}
