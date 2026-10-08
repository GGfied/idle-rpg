import { describe, expect, it } from 'vitest';
import { decodeSave } from '@core/persistence';
import { metaSlice, SAVE_SCHEMA } from '@app/registry';

const fixtures = import.meta.glob('/src/core/persistence/fixtures/save-v*.json', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;
const fixture = (n: string): string => {
  const json = fixtures[`/src/core/persistence/fixtures/${n}.json`];
  if (json === undefined) throw new Error(`missing fixture ${n}`);
  return json;
};
const fixtureV1 = fixture('save-v1');
const fixtureV2 = fixture('save-v2');
const load = (data: unknown) => metaSlice.deserialize(data);
const grantsOf = (data: unknown) => {
  const r = load(data);
  if (!r.ok) throw new Error('expected ok');
  return r.value.grants;
};

describe('meta save slice: grants', () => {
  it.each([
    ['non-array', { playTimeMs: 1, grants: 'fishing_bait_500' }],
    ['object', { playTimeMs: 1, grants: { a: 1 } }],
    ['missing', { playTimeMs: 1 }],
  ])('%s grants gives undefined', (_n, data) => {
    expect(grantsOf(data)).toBeUndefined();
  });

  it('drops non-string entries', () => {
    expect(grantsOf({ playTimeMs: 1, grants: ['a', 1, null, {}, ['x'], 'b'] })).toEqual(['a', 'b']);
  });

  it('caps 5000 entries at 50', () => {
    const grants = Array.from({ length: 5000 }, (_, i) => `g${i}`);
    const out = grantsOf({ playTimeMs: 1, grants });
    expect(out).toHaveLength(50);
    expect(out?.[49]).toBe('g49');
  });

  it('keeps a __proto__ entry as a plain string without polluting', () => {
    const out = grantsOf({ playTimeMs: 1, grants: ['__proto__'] });
    expect(out).toEqual(['__proto__']);
    expect(({} as Record<string, unknown>).grants).toBeUndefined();
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    const r = load(
      JSON.parse('{"playTimeMs":1,"grants":["__proto__"],"__proto__":{"polluted":1}}'),
    );
    expect(r.ok).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('serialize round-trips fishing_bait_500', () => {
    const s = metaSlice.serialize({ playTimeMs: 5, grants: ['fishing_bait_500'] });
    expect(s).toEqual({ playTimeMs: 5, grants: ['fishing_bait_500'] });
    expect(grantsOf(s)).toEqual(['fishing_bait_500']);
  });

  it.each([
    ['v1', fixtureV1],
    ['v2', fixtureV2],
  ])('%s save fixture loads without grants', (_n, json) => {
    const r = decodeSave(SAVE_SCHEMA, json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.meta.grants).toBeUndefined();
  });
});
