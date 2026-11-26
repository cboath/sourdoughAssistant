import * as Crypto from 'expo-crypto';
import type { Ids } from './deps';

/** Production ids: UUID v4 from expo-crypto. Imported only by client.ts, never by tests. */
export const expoIds: Ids = {
  newId: () => Crypto.randomUUID(),
};
