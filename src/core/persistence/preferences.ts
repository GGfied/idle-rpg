import { err, ok } from '@core/utils';
import type { Result } from '@core/utils';
import {
  FORBIDDEN_KEYS,
  LEGACY_AUDIO_KEY,
  MAX_PREFS_BYTES,
  PREFS_CORRUPT_KEY,
  PREFS_KEY,
  PREFS_VERSION,
  PREF_ENUMS,
  prefsMigrations,
} from './data';
import type { DeepPartial, Preferences, PreferencesStore, StorageAdapter } from './types';

export function defaultPreferences(prefersReducedMotion: boolean): Preferences {
  const mode = prefersReducedMotion ? 'reduced' : 'on';
  return {
    sound: { muted: false, volumes: { master: 0.7, sfx: 1, ui: 1, music: 0.6, ambience: 0.8 } },
    hud: { minimap: true, orbs: true, skillTracker: true, chatbox: true, hidden: false },
    notifications: {
      levelUpPopup: true,
      xpDrops: true,
      achievementToasts: true,
      gameMessages: true,
      areaNames: true,
    },
    visuals: { vfx: mode, animations: mode },
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: Obj, k: string): unknown => (Object.hasOwn(o, k) ? o[k] : undefined);

/** Validates one leaf against its default's type. undefined = invalid. */
function leaf(def: unknown, v: unknown, path: string): unknown {
  if (typeof def === 'boolean') return typeof v === 'boolean' ? v : undefined;
  if (typeof def === 'number') {
    return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
  }
  return typeof v === 'string' && PREF_ENUMS[path]?.includes(v) ? v : undefined;
}

/** Lenient (load): builds a fresh object from `defaults`; unknown keys dropped, bad leaves default. */
function normalize(defaults: Obj, input: unknown, path = ''): Obj {
  const src = isObj(input) ? input : {};
  const out: Obj = {};
  for (const [k, def] of Object.entries(defaults)) {
    const p = path ? `${path}.${k}` : k;
    const v = own(src, k);
    out[k] = isObj(def) ? normalize(def, v, p) : (leaf(def, v, p) ?? def);
  }
  return out;
}

/** Strict (set): returns an error message for any unknown key or wrong type; else the merged patch. */
function validateUpdate(defaults: Obj, update: unknown, path = ''): Result<Obj, string> {
  if (!isObj(update)) return err(`${path || 'update'} must be an object`);
  const out: Obj = {};
  for (const k of Object.keys(update)) {
    const p = path ? `${path}.${k}` : k;
    if (FORBIDDEN_KEYS.includes(k) || !Object.hasOwn(defaults, k))
      return err(`unknown preference "${p}"`);
    const def = defaults[k];
    if (isObj(def)) {
      const sub = validateUpdate(def, update[k], p);
      if (!sub.ok) return sub;
      out[k] = sub.value;
    } else {
      const v = leaf(def, update[k], p);
      if (v === undefined) return err(`invalid value for "${p}"`);
      out[k] = v;
    }
  }
  return ok(out);
}

function merge(base: Obj, patch: Obj): Obj {
  const out: Obj = {};
  for (const [k, v] of Object.entries(base)) {
    const pv = own(patch, k);
    out[k] = isObj(v) && isObj(pv) ? merge(v, pv) : pv !== undefined ? pv : v;
  }
  return out;
}

const clone = (p: Preferences): Preferences => structuredClone(p);

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Old `{ volume, muted }` (optionally with channel volumes) -> a partial Preferences. */
function fromLegacyAudio(raw: string): Obj | null {
  const v = parseJson(raw);
  if (!isObj(v)) return null;
  const volumes: Obj = {};
  const master = own(v, 'volume');
  if (typeof master === 'number') volumes.master = master;
  const ch = own(v, 'volumes');
  if (isObj(ch))
    for (const k of ['master', 'sfx', 'ui']) if (own(ch, k) !== undefined) volumes[k] = own(ch, k);
  const sound: Obj = { volumes };
  if (typeof own(v, 'muted') === 'boolean') sound.muted = own(v, 'muted');
  return { sound };
}

export function createPreferencesStore(opts: {
  storage: StorageAdapter;
  prefersReducedMotion: boolean;
}): PreferencesStore {
  const { storage } = opts;
  const defaults = defaultPreferences(opts.prefersReducedMotion);
  const listeners = new Set<(p: Preferences) => void>();

  const encode = (p: Preferences): string => JSON.stringify({ version: PREFS_VERSION, prefs: p });

  /** Never blocked by the save lock: a corrupt value is backed up raw, then defaults are used. */
  function load(): Preferences {
    const read = storage.get(PREFS_KEY);
    if (!read.ok) return clone(defaults);
    if (read.value === null) return seedFromLegacy();
    const env = read.value.length <= MAX_PREFS_BYTES ? parseJson(read.value) : undefined;
    const version = isObj(env) ? own(env, 'version') : undefined;
    const body = isObj(env) ? own(env, 'prefs') : undefined;
    if (!isObj(body) || typeof version !== 'number' || version < 1 || version > PREFS_VERSION) {
      storage.set(PREFS_CORRUPT_KEY, read.value);
      return clone(defaults);
    }
    let data: Obj = body;
    for (let v = version; v < PREFS_VERSION; v++) data = prefsMigrations[v]?.(data) ?? data;
    return normalize(defaults as unknown as Obj, data) as unknown as Preferences;
  }

  function seedFromLegacy(): Preferences {
    const legacy = storage.get(LEGACY_AUDIO_KEY);
    const patch = legacy.ok && legacy.value !== null ? fromLegacyAudio(legacy.value) : null;
    const prefs = patch
      ? (normalize(
          defaults as unknown as Obj,
          merge(defaults as unknown as Obj, patch),
        ) as unknown as Preferences)
      : clone(defaults);
    if (patch) storage.set(PREFS_KEY, encode(prefs)); // legacy key is left untouched
    return prefs;
  }

  let current = load();

  function commit(next: Preferences): Result<Preferences, string> {
    current = next;
    const w = storage.set(PREFS_KEY, encode(next));
    for (const cb of [...listeners]) cb(clone(next));
    return w.ok ? ok(clone(next)) : err(w.error);
  }

  return {
    get: () => clone(current),
    set(update) {
      const v = validateUpdate(defaults as unknown as Obj, update as DeepPartial<Preferences>);
      if (!v.ok) return v;
      const next = merge(current as unknown as Obj, v.value) as unknown as Preferences;
      if (JSON.stringify(next) === JSON.stringify(current)) return ok(clone(current));
      return commit(next);
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    reset() {
      if (JSON.stringify(current) === JSON.stringify(defaults)) return ok(clone(current));
      return commit(clone(defaults));
    },
  };
}
