import type { SqlExecutor, SqlValue } from './adapter';
import { RepositoryError } from './errors';

/** Domain key -> column, optionally with an encoder for values that are not plain SQL values. */
export type FieldMap = Readonly<
  Record<string, string | { col: string; enc: (value: unknown) => SqlValue }>
>;

export const bit = (value: boolean): number => (value ? 1 : 0);
export const asBool = (value: number): boolean => value === 1;
export const toJson = (value: unknown): string => JSON.stringify(value);

function encodePlain(key: string, value: unknown): SqlValue {
  if (typeof value === 'boolean') return bit(value);
  if (value === null || typeof value === 'string' || typeof value === 'number') return value;
  throw new RepositoryError('invalid', `Field "${key}" has an unsupported value type.`);
}

/** Maps the defined keys of `input` to column values. `undefined` keys are skipped. */
export function toColumns(input: object, map: FieldMap): Record<string, SqlValue> {
  const source = input as Record<string, unknown>;
  const out: Record<string, SqlValue> = {};
  for (const [key, def] of Object.entries(map)) {
    const value = source[key];
    if (value === undefined) continue;
    if (typeof def === 'string') out[def] = encodePlain(key, value);
    else out[def.col] = def.enc(value);
  }
  return out;
}

const named = (columns: Record<string, SqlValue>): Record<string, SqlValue> =>
  Object.fromEntries(Object.entries(columns).map(([col, value]) => [`$${col}`, value]));

// Column names come from the code-owned FieldMaps above, never from user input.
export async function insertRow(
  q: SqlExecutor,
  table: string,
  columns: Record<string, SqlValue>,
): Promise<void> {
  const cols = Object.keys(columns);
  await q.run(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map((c) => `$${c}`).join(', ')})`,
    named(columns),
  );
}

/** Updates the given columns (plus `updated_at`) on a row. Returns the number of rows changed. */
export async function updateRow(
  q: SqlExecutor,
  table: string,
  where: Record<string, SqlValue>,
  columns: Record<string, SqlValue>,
  now: string,
): Promise<number> {
  const set = { ...columns, updated_at: now };
  const params: Record<string, SqlValue> = named(set);
  const conditions = Object.entries(where).map(([col, value]) => {
    if (value === null) return `${col} IS NULL`;
    params[`$w_${col}`] = value;
    return `${col} = $w_${col}`;
  });
  const result = await q.run(
    `UPDATE ${table} SET ${Object.keys(set)
      .map((c) => `${c} = $${c}`)
      .join(', ')} WHERE ${conditions.join(' AND ')}`,
    params,
  );
  return result.changes;
}

export interface ChildWrite {
  id: string;
  columns: Record<string, SqlValue>;
}

/**
 * Makes the live children of `parentId` equal to `writes`: rows with a known id (live or
 * tombstoned) are updated and revived, new ids are inserted, and live rows not listed are
 * soft-deleted. Writes happen in the given order (matters for self-referencing foreign keys).
 */
export async function writeChildren(
  q: SqlExecutor,
  table: string,
  parentColumn: string,
  parentId: string,
  writes: readonly ChildWrite[],
  now: string,
): Promise<void> {
  const existing = await q.all<Record<string, SqlValue> & { id: string }>(
    `SELECT * FROM ${table} WHERE ${parentColumn} = $p`,
    { $p: parentId },
  );
  const byId = new Map(existing.map((row) => [row.id, row]));
  const keep = new Set(writes.map((w) => w.id));

  for (const write of writes) {
    const current = byId.get(write.id);
    if (current) {
      // Skip unchanged live rows so editing one child does not bump every sibling's updated_at.
      const unchanged =
        current.deleted_at === null &&
        Object.entries(write.columns).every(([col, value]) => current[col] === value);
      if (unchanged) continue;
      await updateRow(
        q,
        table,
        { id: write.id, [parentColumn]: parentId },
        { ...write.columns, deleted_at: null },
        now,
      );
    } else {
      await insertRow(q, table, {
        ...write.columns,
        id: write.id,
        [parentColumn]: parentId,
        created_at: now,
        updated_at: now,
      });
    }
  }
  for (const row of existing) {
    if (row.deleted_at === null && !keep.has(row.id)) {
      await updateRow(q, table, { id: row.id }, { deleted_at: now }, now);
    }
  }
}

/** Soft-deletes every live row of `table` where `column = value`. */
export async function softDeleteWhere(
  q: SqlExecutor,
  table: string,
  column: string,
  value: string,
  now: string,
): Promise<void> {
  await q.run(
    `UPDATE ${table} SET deleted_at = $now, updated_at = $now WHERE ${column} = $v AND deleted_at IS NULL`,
    { $now: now, $v: value },
  );
}

export const liveClause = (alias: string, includeDeleted: boolean | undefined): string =>
  includeDeleted ? '1 = 1' : `${alias}.deleted_at IS NULL`;
