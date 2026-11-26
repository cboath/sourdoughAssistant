import type { SqlExecutor } from '../adapter';
import type { Clock, Ids, Zone } from '../deps';
import { RepositoryError } from '../errors';
import type { ReadOptions } from '../types';

/** What every repository needs. `atomic` joins the surrounding transaction, or opens one. */
export interface RepoContext {
  q: SqlExecutor;
  atomic: <T>(fn: (q: SqlExecutor) => Promise<T>) => Promise<T>;
  clock: Clock;
  ids: Ids;
  zone: Zone;
}

export async function getRowById<R>(
  q: SqlExecutor,
  table: string,
  id: string,
  options?: ReadOptions,
): Promise<R | null> {
  const live = options?.includeDeleted ? '' : ' AND deleted_at IS NULL';
  return q.get<R>(`SELECT * FROM ${table} WHERE id = $id${live}`, { $id: id });
}

export async function requireRow<R>(
  q: SqlExecutor,
  table: string,
  id: string,
  label: string,
): Promise<R> {
  const row = await getRowById<R>(q, table, id);
  if (!row) throw new RepositoryError('notFound', `${label} ${id} not found.`);
  return row;
}
