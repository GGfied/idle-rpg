import { levelForXp } from '@core/progression';
import type { Migrations } from './types';

/**
 * Save format version. Bump it, add `migrations[old]` and a fixture test in the same change
 * whenever the persisted shape changes.
 *
 * v1 persists: inventory, progression, movement (position + running) and meta { playTimeMs }.
 * v2 adds `bank` ({ items: [] } by default). Older saves are migrated on load and are only
 * rewritten as v2 by the next save (the manager always encodes at CURRENT_VERSION), so a v1
 * save in storage stays v1 until the player's next autosave.
 * v3 adds `hp` ({ current }) and `prayer` ({ current }) for the status orbs. The migration derives
 * defaults from the save's own progression XP (Hitpoints level, default 10; Prayer level,
 * default 1) so a migrated player starts full. Never overwrites an existing hp/prayer.
 * Also in v3 (NO migration needed): the movement slice persists `runEnergy`; movement's
 * deserializer defaults it when absent, so v1/v2 movement data loads unchanged.
 * Deliberately NOT persisted: gathering node state (trees are all standing on load), an
 * in-progress action, and rng state (the rng reseeds on load).
 */
export const CURRENT_VERSION = 3;

const V1_KEYS = ['inventory', 'progression', 'movement', 'meta', 'bank'] as const;
const V2_KEYS = V1_KEYS;
const V3_KEYS = [...V2_KEYS, 'hp', 'prayer'] as const;

/**
 * v1 -> v2: adds an empty bank. Returns a fresh object holding only the known slice keys (own
 * properties only, never spreading the untrusted input) and never overwrites an existing bank.
 */
function migrateV1toV2(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of V1_KEYS) {
    if (Object.hasOwn(data, key)) out[key] = data[key];
  }
  if (!Object.hasOwn(out, 'bank')) out.bank = { items: [] };
  return out;
}

const DEFAULT_HITPOINTS_LEVEL = 10;
const DEFAULT_PRAYER_LEVEL = 1;

/** Level for a skill from the save's own (untrusted) progression data, or `fallback` if unusable. */
function levelFromSave(data: Record<string, unknown>, skill: string, fallback: number): number {
  const progression = Object.hasOwn(data, 'progression') ? data.progression : undefined;
  if (typeof progression !== 'object' || progression === null) return fallback;
  const xp = Object.hasOwn(progression, 'xp') ? (progression as { xp: unknown }).xp : undefined;
  if (typeof xp !== 'object' || xp === null) return fallback;
  const value = Object.hasOwn(xp, skill) ? (xp as Record<string, unknown>)[skill] : undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback;
  return levelForXp(value);
}

/**
 * v2 -> v3: adds hp and prayer at full, from the save's own XP. Fresh object, known keys only,
 * never spreads the untrusted input, never overwrites an existing hp/prayer.
 */
function migrateV2toV3(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of V3_KEYS) {
    if (Object.hasOwn(data, key)) out[key] = data[key];
  }
  // v2 saves written by an app schema without the bank slice have no bank key.
  if (!Object.hasOwn(out, 'bank')) out.bank = { items: [] };
  if (!Object.hasOwn(out, 'hp')) {
    out.hp = { current: levelFromSave(data, 'hitpoints', DEFAULT_HITPOINTS_LEVEL) };
  }
  if (!Object.hasOwn(out, 'prayer')) {
    out.prayer = { current: levelFromSave(data, 'prayer', DEFAULT_PRAYER_LEVEL) };
  }
  return out;
}

/** `migrations[n]` upgrades version n to n + 1. */
export const migrations: Migrations = { 1: migrateV1toV2, 2: migrateV2toV3 };

export const MAX_SAVE_BYTES = 1_000_000;
export const MAX_DEPTH = 32;
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** Adapter keys (the local adapter adds the `idle-rpg:` prefix, so these are `idle-rpg:prefs`...). */
export const PREFS_KEY = 'prefs';
export const PREFS_CORRUPT_KEY = 'prefs:corrupt';
/** Legacy sound key `{ volume, muted }`; read once to seed prefs, never modified or removed. */
export const LEGACY_AUDIO_KEY = 'audio';
export const PREFS_VERSION = 1;
export const MAX_PREFS_BYTES = 16_000;

/** Allowed values for string-enum preference fields, by dotted path. */
export const PREF_ENUMS: Readonly<Record<string, readonly string[]>> = {
  'visuals.vfx': ['on', 'reduced', 'off'],
  'visuals.animations': ['on', 'reduced', 'off'],
};

/** `prefsMigrations[n]` upgrades the stored prefs object from version n to n + 1 (none yet). */
export const prefsMigrations: Record<
  number,
  (prefs: Record<string, unknown>) => Record<string, unknown>
> = {};
