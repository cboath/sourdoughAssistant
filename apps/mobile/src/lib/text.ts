/** Case- and accent-insensitive text for search ("jalapeno" finds "Jalapeño"). */
export function foldText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

export function matchesQuery(haystack: readonly string[], query: string): boolean {
  const needle = foldText(query.trim());
  if (needle === '') return true;
  return haystack.some((h) => foldText(h).includes(needle));
}
