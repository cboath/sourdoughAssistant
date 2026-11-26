import { migration0001 } from './0001_init';
import type { Migration } from './types';

/** Registry. Append new migrations; never edit or reorder shipped ones. */
export const MIGRATIONS: readonly Migration[] = [migration0001];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;
