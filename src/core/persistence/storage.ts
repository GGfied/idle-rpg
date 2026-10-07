import { err, ok } from '@core/utils';
import type { StorageAdapter } from './types';

export function createLocalStorageAdapter(
  storage: Storage | undefined = globalThis.localStorage,
  prefix = 'idle-rpg:',
): StorageAdapter {
  return {
    get(key) {
      try {
        if (!storage) return err('storage unavailable');
        return ok(storage.getItem(prefix + key));
      } catch {
        return err('storage unavailable');
      }
    },
    set(key, value) {
      try {
        if (!storage) return err('storage unavailable');
        storage.setItem(prefix + key, value);
        return ok(undefined);
      } catch {
        return err('could not write save (storage full or unavailable)');
      }
    },
    remove(key) {
      try {
        storage?.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    get: (key) => ok(map.get(key) ?? null),
    set(key, value) {
      map.set(key, value);
      return ok(undefined);
    },
    remove(key) {
      map.delete(key);
    },
  };
}
