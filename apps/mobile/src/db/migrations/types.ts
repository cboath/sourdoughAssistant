import type { SqlExecutor } from '../adapter';

export interface Migration {
  /** Contiguous from 1. */
  version: number;
  name: string;
  /** Runs inside the runner's transaction. Forward-only: there are no down migrations. */
  up: (tx: SqlExecutor) => Promise<void>;
}
