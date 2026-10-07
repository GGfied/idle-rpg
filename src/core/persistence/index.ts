export { createAutosave } from './autosave';
export type { Autosave, Scheduler } from './autosave';
export { CURRENT_VERSION, MAX_SAVE_BYTES, migrations } from './data';
export { createSaveSchema, decodeSave, encodeSave } from './logic';
export type { CodecOptions } from './logic';
export { CORRUPT_KEY, SAVE_KEY, createSaveManager } from './manager';
export type { SaveManager } from './manager';
export { createLocalStorageAdapter, createMemoryStorage } from './storage';
export type {
  MigrationFn,
  Migrations,
  SaveEnvelope,
  SaveSchema,
  SaveSlice,
  SliceMap,
  StateOf,
  StorageAdapter,
} from './types';
export { LEGACY_AUDIO_KEY, PREFS_CORRUPT_KEY, PREFS_KEY, PREFS_VERSION } from './data';
export { createPreferencesStore, defaultPreferences } from './preferences';
export type { DeepPartial, Preferences, PreferencesStore } from './types';
