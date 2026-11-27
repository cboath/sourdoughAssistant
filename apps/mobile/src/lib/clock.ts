/**
 * The wall clock and the baker's zone behind one seam (ADR 0005). Screens and services read time
 * through `clock`, so tests can pin both. Core never reads either: callers pass them in.
 */
import { useEffect, useState } from 'react';

export const clock = {
  /** Current instant, epoch milliseconds. */
  now: (): number => Date.now(),
  /** The device's current IANA zone, resolved on every call so it follows the baker. */
  zone: (): string => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
};

/** Re-renders every `intervalMs` with the current instant (30 s on the plan screen). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => clock.now());
  useEffect(() => {
    setNow(clock.now());
    const timer = setInterval(() => setNow(clock.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
