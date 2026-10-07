import { describe, expect, it } from 'vitest';
import { err, ok } from '@core/utils';
import { createItemRegistry, type ItemDef } from '@core/items';
import { deserializeBank, deserializeInventory } from '@core/inventory';
import { deserializeProgression } from '@core/progression';
import {
  CURRENT_VERSION,
  createSaveManager,
  createMemoryStorage,
  createSaveSchema,
  decodeSave,
  encodeSave,
  migrations,
  SAVE_KEY,
  type SaveSlice,
} from './index';
import fixtureV1 from './fixtures/save-v1.json?raw';
import fixtureV2 from './fixtures/save-v2.json?raw';

/** Pass-through slice: the shape is each feature's concern; here we check what the codec hands over. */
const raw = (key: string): SaveSlice<unknown> => ({
  key,
  serialize: (s) => s,
  deserialize: (d) => (d === undefined ? err('missing') : ok(d)),
});
const v2Schema = createSaveSchema({
  inventory: raw('inventory'),
  progression: raw('progression'),
  movement: raw('movement'),
  meta: raw('meta'),
  bank: raw('bank'),
});
const v3Schema = createSaveSchema({
  inventory: raw('inventory'),
  progression: raw('progression'),
  movement: raw('movement'),
  meta: raw('meta'),
  bank: raw('bank'),
  hp: raw('hp'),
  prayer: raw('prayer'),
});
// What the app schema looks like until the integrator adds the bank slice.
const v1Schema = createSaveSchema({
  inventory: raw('inventory'),
  progression: raw('progression'),
  movement: raw('movement'),
  meta: raw('meta'),
});
interface V1Data {
  inventory: unknown;
  progression: unknown;
  movement: unknown;
  meta: unknown;
}
const v1Data = (JSON.parse(fixtureV1) as { data: V1Data }).data;

describe('save v1 -> v2 migration', () => {
  it('is at version 3 with migrations for 1 and 2', () => {
    expect(CURRENT_VERSION).toBe(3);
    expect(Object.keys(migrations)).toEqual(['1', '2']);
  });

  it('migrates the v1 fixture: empty bank, everything else intact', () => {
    const r = decodeSave(v2Schema, fixtureV1, { version: 2 });
    expect(r).toEqual(ok({ ...v1Data, bank: { items: [] } }));
  });

  it('does not mutate its input and returns a fresh object', () => {
    const input: Record<string, unknown> = { ...v1Data };
    const frozen = Object.freeze(input);
    const out = migrations[1]!(frozen);
    expect(out).not.toBe(input);
    expect('bank' in input).toBe(false);
    expect(out.bank).toEqual({ items: [] });
  });

  it('keeps an existing bank', () => {
    const bank = { items: [{ itemId: 'logs', quantity: 3 }] };
    const json = JSON.stringify({ version: 1, savedAt: 1, data: { ...v1Data, bank } });
    expect(decodeSave(v2Schema, json, { version: 2 })).toEqual(ok({ ...v1Data, bank }));
  });

  it('drops unknown top-level keys instead of copying them', () => {
    const out = migrations[1]!({ ...v1Data, junk: 1 });
    expect(Object.keys(out).sort()).toEqual(
      ['bank', 'inventory', 'meta', 'movement', 'progression'].sort(),
    );
  });

  it('still requires every slice after migration', () => {
    const rest: Record<string, unknown> = { ...v1Data };
    delete rest.meta;
    const json = JSON.stringify({ version: 1, savedAt: 1, data: rest });
    const r = decodeSave(v2Schema, json, { version: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('slice "meta" is missing');
  });

  it('round-trips a v2-shaped save at version 2', () => {
    const state = { ...v1Data, bank: { items: [{ itemId: 'logs', quantity: 99 }] } };
    const json = encodeSave(v2Schema, state, 5, 2);
    expect(JSON.parse(json).version).toBe(2);
    expect(decodeSave(v2Schema, json, { version: 2 })).toEqual(ok(state));
  });

  it('interim: a schema without a bank slice ignores the migrated bank key and still loads', () => {
    expect(decodeSave(v1Schema, fixtureV1, { version: 2 })).toEqual(ok(v1Data));
  });
});

interface V2Data extends V1Data {
  bank: unknown;
}
const v2Data = (JSON.parse(fixtureV2) as { data: V2Data }).data;
const v2Json = (data: Record<string, unknown>, version = 2): string =>
  JSON.stringify({ version, savedAt: 1, data });
const asRecord = (d: V2Data): Record<string, unknown> => ({ ...d });
const xpSave = (xp: unknown): string => v2Json({ ...asRecord(v2Data), progression: { xp } });

describe('save v2 -> v3 migration', () => {
  it('migrates the v2 fixture: hp 10, prayer 1, bank intact', () => {
    const r = decodeSave(v3Schema, fixtureV2);
    expect(r).toEqual(ok({ ...v2Data, hp: { current: 10 }, prayer: { current: 1 } }));
    if (r.ok) expect((r.value as { bank: unknown }).bank).toEqual(v2Data.bank);
  });

  it('migrates v1 through 1 -> 2 -> 3 (no hitpoints xp: default 10; no prayer xp: 1)', () => {
    const r = decodeSave(v3Schema, fixtureV1);
    expect(r).toEqual(
      ok({ ...v1Data, bank: { items: [] }, hp: { current: 10 }, prayer: { current: 1 } }),
    );
  });

  it.each([
    ['hitpoints xp 4470 (level 20)', { hitpoints: 4470, prayer: 0 }, 20, 1],
    ['hitpoints 13034431 (level 99)', { hitpoints: 13_034_431, prayer: 0 }, 99, 1],
    ['prayer xp 1154 (level 10)', { hitpoints: 1154, prayer: 1154 }, 10, 10],
    ['hitpoints absent', { prayer: 0 }, 10, 1],
    ['values are strings', { hitpoints: '5000', prayer: 'x' }, 10, 1],
    ['negative / null', { hitpoints: -5, prayer: null }, 10, 1],
    ['over cap clamps to 99', { hitpoints: 9e15, prayer: 0 }, 99, 1],
  ])('derives defaults from xp: %s', (_n, xp, hp, prayer) => {
    const r = decodeSave(v3Schema, xpSave(xp));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const v = r.value as { hp: unknown; prayer: unknown };
      expect(v.hp).toEqual({ current: hp });
      expect(v.prayer).toEqual({ current: prayer });
    }
  });

  it.each([
    ['progression missing', { ...asRecord(v2Data), progression: undefined }],
    ['progression not an object', { ...asRecord(v2Data), progression: 5 }],
    ['xp not an object', { ...asRecord(v2Data), progression: { xp: 'x' } }],
  ])('falls back to defaults when %s', (_n, data) => {
    const out = migrations[2]!(data);
    expect(out.hp).toEqual({ current: 10 });
    expect(out.prayer).toEqual({ current: 1 });
  });

  it('keeps existing hp and prayer (never overwrites)', () => {
    const data = { ...asRecord(v2Data), hp: { current: 3 }, prayer: { current: 0 } };
    const r = decodeSave(v3Schema, v2Json(data));
    expect(r).toEqual(ok({ ...v2Data, hp: { current: 3 }, prayer: { current: 0 } }));
  });

  it('does not mutate its input, returns a fresh object with known keys only', () => {
    const input = Object.freeze({ ...asRecord(v2Data), junk: 1 });
    const out = migrations[2]!(input);
    expect(out).not.toBe(input);
    expect('hp' in input).toBe(false);
    expect(Object.keys(out).sort()).toEqual(
      ['bank', 'hp', 'inventory', 'meta', 'movement', 'prayer', 'progression'].sort(),
    );
  });

  it('round-trips a v3 save', () => {
    const state = { ...v2Data, hp: { current: 7 }, prayer: { current: 2 } };
    const json = encodeSave(v3Schema, state, 5);
    expect(JSON.parse(json).version).toBe(3);
    expect(decodeSave(v3Schema, json)).toEqual(ok(state));
  });

  it('rejects a future version (current + 1)', () => {
    const data = { ...asRecord(v2Data), hp: { current: 1 }, prayer: { current: 1 } };
    const r = decodeSave(v3Schema, v2Json(data, CURRENT_VERSION + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('newer version');
  });

  it('runs the chain in order across versions', () => {
    const order: number[] = [];
    const chain = {
      1: (d: Record<string, unknown>) => (order.push(1), migrations[1]!(d)),
      2: (d: Record<string, unknown>) => (order.push(2), migrations[2]!(d)),
      3: (d: Record<string, unknown>) => (order.push(3), { ...d, extra: true }),
    };
    const r = decodeSave(v3Schema, fixtureV1, { version: 4, migrations: chain });
    expect(r.ok).toBe(true);
    expect(order).toEqual([1, 2, 3]);
  });

  it('interim hazard: a schema lacking hp/prayer still loads a v2 save (extras ignored)', () => {
    expect(decodeSave(v2Schema, fixtureV2)).toEqual(ok(v2Data));
  });

  it('interim hazard: a v3 save without hp/prayer is rejected once the slices exist', () => {
    const r = decodeSave(v3Schema, v2Json(asRecord(v2Data), 3));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('slice "hp" is missing');
  });

  describe('slice defaults for absent slices', () => {
    const levelOf = (decoded: Readonly<Record<string, unknown>>): number =>
      ((decoded.progression as { xp: { hitpoints?: number } }).xp.hitpoints ?? 0) > 0 ? 10 : 1;
    const withDefault = (key: string): SaveSlice<{ current: number }> => ({
      key,
      serialize: (s) => s,
      deserialize: (d) =>
        typeof d === 'object' &&
        d !== null &&
        typeof (d as { current: unknown }).current === 'number'
          ? ok(d as { current: number })
          : err('bad'),
      defaultValue: (decoded) => ({ current: levelOf(decoded) }),
    });
    const schema = createSaveSchema({
      inventory: raw('inventory'),
      progression: raw('progression'),
      movement: raw('movement'),
      meta: raw('meta'),
      bank: raw('bank'),
      hp: withDefault('hp'),
      prayer: withDefault('prayer'),
    });
    const stamped = (extra: Record<string, unknown>): string =>
      v2Json({ ...asRecord(v2Data), ...extra }, CURRENT_VERSION);

    it('a current-version save without hp/prayer loads with defaults from earlier slices', () => {
      const r = decodeSave(schema, stamped({}));
      expect(r).toEqual(ok({ ...v2Data, hp: { current: 10 }, prayer: { current: 10 } }));
    });

    it('a present hp is kept; a present but invalid hp still fails', () => {
      const kept = decodeSave(schema, stamped({ hp: { current: 4 } }));
      expect(kept.ok && (kept.value as { hp: unknown }).hp).toEqual({ current: 4 });
      const bad = decodeSave(schema, stamped({ hp: { current: 'x' } }));
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.error).toContain('slice "hp"');
    });

    it('a throwing default is an error, not a crash', () => {
      const boom = createSaveSchema({
        progression: raw('progression'),
        hp: {
          ...withDefault('hp'),
          defaultValue: () => {
            throw new Error('x');
          },
        },
      });
      const r = decodeSave(boom, v2Json({ progression: { xp: {} } }, CURRENT_VERSION));
      expect(r.ok).toBe(false);
    });

    it('slices without a default still fail when absent', () => {
      const r = decodeSave(schema, stamped({ meta: undefined }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toContain('slice "meta" is missing');
    });
  });

  it('real-world shape: v2 save with no bank, hp or prayer loads (migration + slice defaults)', () => {
    const real = {
      inventory: {
        slots: [
          { itemId: 'bronze_axe', quantity: 1 },
          { itemId: 'logs', quantity: 4 },
          ...Array<null>(26).fill(null),
        ],
      },
      progression: { xp: { woodcutting: 100 } },
      movement: { position: { x: 12, y: 9 }, running: false },
      meta: { playTimeMs: 1000 },
    };
    const json = v2Json(real);
    // Default-less schema: the migration alone supplies bank/hp/prayer.
    expect(decodeSave(v3Schema, json)).toEqual(
      ok({ ...real, bank: { items: [] }, hp: { current: 10 }, prayer: { current: 1 } }),
    );
    // Schema with slice defaults and no bank key at all in the data: defaults fill in.
    const withDefaults = createSaveSchema({
      inventory: raw('inventory'),
      progression: raw('progression'),
      movement: raw('movement'),
      meta: raw('meta'),
      bank: { ...raw('bank'), defaultValue: () => ({ items: [] }) },
    });
    const noBankV3 = v2Json(real, CURRENT_VERSION);
    expect(decodeSave(withDefaults, noBankV3)).toEqual(ok({ ...real, bank: { items: [] } }));
  });

  it("the user's exact v2 save loads with a default-bearing schema (bank empty, 4 logs kept)", () => {
    const inventory = {
      slots: [
        { itemId: 'bronze_axe', quantity: 1 },
        { itemId: 'logs', quantity: 4 },
        ...Array<null>(26).fill(null),
      ],
    };
    const real = {
      inventory,
      progression: { xp: { woodcutting: 100 } },
      movement: { position: { x: 12, y: 9 }, running: false },
      meta: { playTimeMs: 1000 },
    };
    const withDefault = (key: string, value: unknown): SaveSlice<unknown> => ({
      ...raw(key),
      defaultValue: () => value,
    });
    const schema = createSaveSchema({
      inventory: raw('inventory'),
      progression: raw('progression'),
      movement: raw('movement'),
      meta: raw('meta'),
      bank: withDefault('bank', { items: [] }),
      hp: withDefault('hp', { current: 10 }),
      prayer: withDefault('prayer', { current: 1 }),
    });
    const r = decodeSave(schema, v2Json(real, 2));
    expect(r).toEqual(
      ok({ ...real, bank: { items: [] }, hp: { current: 10 }, prayer: { current: 1 } }),
    );
    expect(() => migrations[2]!(real)).not.toThrow();
  });

  it('a slice sees earlier decoded slices (schema order) and not later ones', () => {
    const seen: Record<string, unknown>[] = [];
    const spy = (key: string): SaveSlice<unknown> => ({
      key,
      serialize: (s) => s,
      deserialize: (d, decoded) => (seen.push({ key, ...decoded }), ok(d)),
    });
    const schema = createSaveSchema({ progression: spy('progression'), hp: spy('hp') });
    const json = v2Json({ progression: { xp: {} }, hp: { current: 4 } }, 3);
    expect(decodeSave(schema, json).ok).toBe(true);
    expect(Object.keys(seen[0]!)).toEqual(['key']);
    expect(Object.keys(seen[1]!)).toEqual(['key', 'progression']);
  });

  it('manager loads v2 and the next save writes v3', () => {
    const storage = createMemoryStorage();
    storage.set(SAVE_KEY, fixtureV2);
    const mgr = createSaveManager({ schema: v3Schema, storage, now: () => 7 });
    const loaded = mgr.load();
    if (!loaded.ok || loaded.value === null) throw new Error('expected a save');
    expect(JSON.parse(String((storage.get(SAVE_KEY) as { value: string }).value)).version).toBe(2);
    expect(mgr.save(loaded.value).ok).toBe(true);
    const written = JSON.parse(String((storage.get(SAVE_KEY) as { value: string }).value));
    expect(written.version).toBe(3);
    expect(written.data.hp).toEqual({ current: 10 });
    expect(written.data.bank).toEqual(v2Data.bank);
  });
});

describe('fixtures decode through the real slice deserializers', () => {
  const def = (id: string, stackable: boolean): ItemDef => ({
    id,
    name: id,
    examine: id,
    value: 1,
    stackable,
  });
  const registry = createItemRegistry([
    def('bronze_axe', false),
    def('logs', false),
    def('oak_logs', false),
  ]);
  const real = <T>(
    key: string,
    f: (d: unknown) => { ok: true; value: T } | { ok: false; error: string },
  ): SaveSlice<T> => ({
    key,
    serialize: (s) => s,
    deserialize: (d) => f(d),
  });
  const realSchema = createSaveSchema({
    inventory: real('inventory', (d) => deserializeInventory(d, registry)),
    progression: real('progression', deserializeProgression),
    movement: raw('movement'),
    meta: raw('meta'),
    bank: real('bank', (d) => deserializeBank(d, registry)),
    hp: raw('hp'),
    prayer: raw('prayer'),
  });

  it.each([
    ['v1', fixtureV1],
    ['v2', fixtureV2],
  ])('%s fixture migrates and passes real inventory/bank/progression validation', (_n, json) => {
    const r = decodeSave(realSchema, json);
    expect(r.ok).toBe(true);
  });

  it('an invalid fixture (non-stackable stacked in one slot) is rejected', () => {
    const bad = JSON.parse(fixtureV2) as { data: { inventory: { slots: unknown[] } } };
    bad.data.inventory.slots[1] = { itemId: 'logs', quantity: 14 };
    expect(decodeSave(realSchema, JSON.stringify(bad)).ok).toBe(false);
  });
});
