import { err, ok, type Result } from '@core/utils';
import { CURRENT_VERSION, FORBIDDEN_KEYS, MAX_DEPTH, MAX_SAVE_BYTES, migrations } from './data';
import type { Migrations, SaveEnvelope, SaveSchema, SliceMap, StateOf } from './types';

export function createSaveSchema<M extends SliceMap>(slices: M): SaveSchema<M> {
  for (const name of Object.keys(slices)) {
    if (FORBIDDEN_KEYS.includes(name)) throw new Error(`forbidden slice name: ${name}`);
    if (slices[name]?.key !== name) throw new Error(`slice key mismatch: ${name}`);
  }
  return { slices };
}

export interface CodecOptions {
  version?: number;
  migrations?: Migrations;
}

export function encodeSave<M extends SliceMap>(
  schema: SaveSchema<M>,
  state: StateOf<M>,
  now: number,
  version: number = CURRENT_VERSION,
): string {
  const data: Record<string, unknown> = {};
  for (const name of Object.keys(schema.slices)) {
    data[name] = schema.slices[name]?.serialize(state[name]);
  }
  const envelope: SaveEnvelope = { version, savedAt: now, data };
  return JSON.stringify(envelope);
}

export function decodeSave<M extends SliceMap>(
  schema: SaveSchema<M>,
  json: string,
  options: CodecOptions = {},
): Result<StateOf<M>, string> {
  const target = options.version ?? CURRENT_VERSION;
  const chain = options.migrations ?? migrations;
  // string length is a cheap lower bound of bytes; check before parsing.
  if (typeof json !== 'string' || json.length > MAX_SAVE_BYTES) return err('save too large');
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return err('save is not valid JSON');
  }
  const forbidden = findForbiddenKey(parsed, 0);
  if (forbidden !== null) return err(`save rejected: ${forbidden}`);
  const envelope = readEnvelope(parsed);
  if (!envelope.ok) return envelope;
  let { version, data } = envelope.value;
  if (version > target) return err(`save is from a newer version (${version} > ${target})`);
  while (version < target) {
    const step = Object.hasOwn(chain, version) ? chain[version] : undefined;
    if (!step) return err(`no migration from version ${version}`);
    try {
      data = step(data);
    } catch {
      return err(`migration from version ${version} failed`);
    }
    version += 1;
  }
  return hydrate(schema, data);
}

function hydrate<M extends SliceMap>(
  schema: SaveSchema<M>,
  data: Record<string, unknown>,
): Result<StateOf<M>, string> {
  const out: Record<string, unknown> = {};
  // Slices decode in schema key order; `out` (earlier slices only) is passed to each deserializer.
  for (const name of Object.keys(schema.slices)) {
    const slice = schema.slices[name];
    if (!Object.hasOwn(data, name)) {
      if (!slice?.defaultValue) return err(`slice "${name}" is missing`);
      try {
        out[name] = slice.defaultValue(Object.freeze({ ...out }));
      } catch {
        return err(`slice "${name}" default failed`);
      }
      continue;
    }
    let result;
    try {
      result = schema.slices[name]?.deserialize(data[name], Object.freeze({ ...out }));
    } catch {
      return err(`slice "${name}" failed to load`);
    }
    if (!result) return err(`slice "${name}" failed to load`);
    if (!result.ok) return err(`slice "${name}": ${result.error}`);
    out[name] = result.value;
  }
  return ok(out as StateOf<M>);
}

function readEnvelope(value: unknown): Result<SaveEnvelope, string> {
  if (!isPlainObject(value)) return err('save envelope is not an object');
  const { version, savedAt, data } = value as Record<string, unknown>;
  if (
    !Object.hasOwn(value, 'version') ||
    typeof version !== 'number' ||
    !Number.isInteger(version) ||
    version < 0
  ) {
    return err('save version is invalid');
  }
  if (
    !Object.hasOwn(value, 'savedAt') ||
    typeof savedAt !== 'number' ||
    !Number.isFinite(savedAt)
  ) {
    return err('save timestamp is invalid');
  }
  if (!Object.hasOwn(value, 'data') || !isPlainObject(data)) return err('save data is invalid');
  return ok({ version, savedAt, data: data as Record<string, unknown> });
}

function isPlainObject(v: unknown): v is object {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Returns a description of the first forbidden key (or excessive depth), else null. */
function findForbiddenKey(value: unknown, depth: number): string | null {
  if (typeof value !== 'object' || value === null) return null;
  if (depth > MAX_DEPTH) return 'nested too deeply';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findForbiddenKey(item, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.includes(key)) return `forbidden key "${key}"`;
    const found = findForbiddenKey((value as Record<string, unknown>)[key], depth + 1);
    if (found !== null) return found;
  }
  return null;
}
