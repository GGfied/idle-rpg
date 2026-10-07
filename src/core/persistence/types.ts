import type { Result } from '@core/utils';

/** One persisted slice of game state. Features expose these through the integrator. */
export interface SaveSlice<T> {
  key: string;
  serialize(state: T): unknown;
  /**
   * `decoded` holds the already-decoded slices that come EARLIER in the schema's key order
   * (e.g. hp can read progression). Optional, so slices that ignore it are unaffected.
   */
  deserialize(data: unknown, decoded?: Readonly<Record<string, unknown>>): Result<T, string>;
  /**
   * Optional. Used ONLY when the slice key is absent from the (migrated) save, e.g. a save stamped
   * with the current version by an app schema that did not have this slice yet. A present but
   * invalid slice still fails. `decoded` = earlier slices in schema order. Without it, an absent
   * slice is an error.
   */
  defaultValue?(decoded: Readonly<Record<string, unknown>>): T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SliceMap = Record<string, SaveSlice<any>>;

export type StateOf<M extends SliceMap> = {
  [K in keyof M]: M[K] extends SaveSlice<infer T> ? T : never;
};

export interface SaveSchema<M extends SliceMap> {
  slices: M;
}

export interface SaveEnvelope {
  version: number;
  savedAt: number;
  data: Record<string, unknown>;
}

export type MigrationFn = (data: Record<string, unknown>) => Record<string, unknown>;
/** `migrations[n]` upgrades a save from version n to n + 1. */
export type Migrations = Record<number, MigrationFn>;

export interface StorageAdapter {
  /** ok(null) = key absent; err = storage threw (unavailable), which is NOT "no save". */
  get(key: string): Result<string | null, string>;
  set(key: string, value: string): Result<void, string>;
  remove(key: string): void;
}

/** Player preferences: a contract shared with hud, integrator, vfx, animation and sound. */
export interface Preferences {
  sound: {
    muted: boolean;
    volumes: { master: number; sfx: number; ui: number; music: number; ambience: number };
  };
  hud: {
    minimap: boolean;
    orbs: boolean;
    skillTracker: boolean;
    chatbox: boolean;
    hidden: boolean;
  };
  notifications: {
    levelUpPopup: boolean;
    xpDrops: boolean;
    achievementToasts: boolean;
    gameMessages: boolean;
    areaNames: boolean;
  };
  visuals: { vfx: 'on' | 'reduced' | 'off'; animations: 'on' | 'reduced' | 'off' };
}

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

export interface PreferencesStore {
  get(): Preferences;
  /** Validates the whole update first; on err nothing changes. Persists, then notifies once. */
  set(update: DeepPartial<Preferences>): Result<Preferences, string>;
  subscribe(cb: (prefs: Preferences) => void): () => void;
  reset(): Result<Preferences, string>;
}
