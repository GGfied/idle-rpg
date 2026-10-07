import { err, ok, type Result } from '@core/utils';
import { decodeSave, encodeSave } from './logic';
import type { SaveSchema, SliceMap, StateOf, StorageAdapter } from './types';

export const SAVE_KEY = 'save:1';
export const CORRUPT_KEY = 'save:1:corrupt';

export interface SaveManager<S> {
  /**
   * Refuses (err) unless the last load() returned ok (ok(null) or ok(state)) or startFresh()
   * succeeded. So call load() first, and never overwrite a save that could not be read.
   */
  save(state: S): Result<void, string>;
  /** ok(null) means there is no save. A storage read failure is an err, never ok(null). */
  load(): Result<S | null, string>;
  /**
   * Explicitly give up on an unreadable save and allow saving again. The unreadable raw save is
   * first kept under CORRUPT_KEY. Errs (and keeps saving locked) if storage can't be read or the
   * backup can't be written.
   */
  startFresh(): Result<void, string>;
  clear(): void;
}

export function createSaveManager<M extends SliceMap>(opts: {
  schema: SaveSchema<M>;
  storage: StorageAdapter;
  now: () => number;
}): SaveManager<StateOf<M>> {
  const { schema, storage, now } = opts;
  let canSave = false;
  return {
    save(state) {
      if (!canSave) return err('save refused: the last load failed or load() was not called');
      let json: string;
      try {
        json = encodeSave(schema, state, now());
      } catch {
        return err('could not encode save');
      }
      const written = storage.set(SAVE_KEY, json);
      if (!written.ok) return written;
      // Verify the write; the previous value is only replaced by a readable one.
      const back = storage.get(SAVE_KEY);
      if (!back.ok || back.value !== json) return err('save verification failed');
      return ok(undefined);
    },
    load() {
      canSave = false;
      const read = storage.get(SAVE_KEY);
      if (!read.ok) return err(`storage unavailable: ${read.error}`);
      const raw = read.value;
      if (raw === null) {
        canSave = true;
        return ok(null);
      }
      const decoded = decodeSave(schema, raw);
      if (decoded.ok) {
        canSave = true;
        return ok(decoded.value);
      }
      // Keep the unreadable save so progress is never silently lost.
      storage.set(CORRUPT_KEY, raw);
      return err(`${decoded.error} (the unreadable save was kept as a backup)`);
    },
    startFresh() {
      const read = storage.get(SAVE_KEY);
      if (!read.ok) return err(`storage unavailable: ${read.error}`);
      if (read.value !== null) {
        const backup = storage.set(CORRUPT_KEY, read.value);
        if (!backup.ok) return backup;
      }
      canSave = true;
      return ok(undefined);
    },
    clear() {
      storage.remove(SAVE_KEY);
      canSave = true;
    },
  };
}
