/**
 * Banners announce themselves once per condition per session (components.md 3.23, DR2-05):
 * coming back to a screen must not read the same warning again.
 */
const announced = new Set<string>();

/** True the first time `key` is seen. */
export function firstAnnouncement(key: string): boolean {
  if (announced.has(key)) return false;
  announced.add(key);
  return true;
}

export function resetAnnounced(): void {
  announced.clear();
}
