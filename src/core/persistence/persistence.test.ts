import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '@core/utils';
import {
  CORRUPT_KEY,
  CURRENT_VERSION,
  MAX_SAVE_BYTES,
  SAVE_KEY,
  createAutosave,
  createLocalStorageAdapter,
  createMemoryStorage,
  createSaveManager,
  createSaveSchema,
  decodeSave,
  encodeSave,
  type SaveSlice,
  type StorageAdapter,
} from './index';

const numSlice = (key: string): SaveSlice<number> => ({
  key,
  serialize: (n) => ({ n }),
  deserialize: (d) => {
    const n = (d as { n?: unknown } | null)?.n;
    return typeof n === 'number' ? ok(n) : err('bad number');
  },
});
const schema = createSaveSchema({ inventory: numSlice('inventory'), meta: numSlice('meta') });
const state = { inventory: 5, meta: 9 };
const env = (o: object) => JSON.stringify({ version: CURRENT_VERSION, savedAt: 1, data: {}, ...o });

describe('codec', () => {
  it('round-trips', () => {
    const r = decodeSave(schema, encodeSave(schema, state, 100));
    expect(r).toEqual(ok(state));
    expect(JSON.parse(encodeSave(schema, state, 100)).version).toBe(CURRENT_VERSION);
  });

  const good = { inventory: { n: 1 }, meta: { n: 2 } };
  it.each([
    ['not json', '{nope', 'not valid JSON'],
    ['array envelope', '[]', 'not an object'],
    ['string version', env({ version: '1', data: good }), 'version is invalid'],
    ['fractional version', env({ version: 1.5, data: good }), 'version is invalid'],
    ['missing savedAt', JSON.stringify({ version: 1, data: good }), 'timestamp'],
    ['data array', env({ data: [] }), 'data is invalid'],
    ['future version', env({ version: CURRENT_VERSION + 1, data: good }), 'newer version'],
    ['missing slice', env({ data: { inventory: { n: 1 } } }), 'slice "meta" is missing'],
    ['slice error', env({ data: { inventory: { n: 'x' }, meta: { n: 2 } } }), 'slice "inventory"'],
    ['proto in envelope', '{"version":1,"savedAt":1,"data":{},"__proto__":{"x":1}}', 'forbidden'],
    [
      'proto in data',
      '{"version":1,"savedAt":1,"data":{"inventory":{"n":1,"__proto__":{}},"meta":{"n":1}}}',
      'forbidden',
    ],
    [
      'constructor deep',
      '{"version":1,"savedAt":1,"data":{"inventory":[{"constructor":1}],"meta":{"n":1}}}',
      'forbidden',
    ],
    ['oversize', 'x'.repeat(MAX_SAVE_BYTES + 1), 'too large'],
  ])('rejects %s', (_n, json, msg) => {
    const r = decodeSave(schema, json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });

  it('does not pollute prototypes', () => {
    decodeSave(schema, '{"version":1,"savedAt":1,"data":{},"__proto__":{"polluted":1}}');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('applies the migration chain in order', () => {
    const old = JSON.stringify({ version: 0, savedAt: 1, data: { a: 1 } });
    const migrations = {
      0: (d: Record<string, unknown>) => ({ ...d, inventory: { n: d.a } }),
      1: (d: Record<string, unknown>) => ({ ...d, meta: { n: 7 } }),
    };
    expect(decodeSave(schema, old, { version: 2, migrations })).toEqual(
      ok({ inventory: 1, meta: 7 }),
    );
    const gap = decodeSave(schema, old, { version: 2, migrations: { 0: migrations[0] } });
    expect(gap.ok).toBe(false);
    const boom = decodeSave(schema, old, {
      version: 1,
      migrations: {
        0: () => {
          throw new Error('x');
        },
      },
    });
    expect(boom.ok).toBe(false);
  });

  it('rejects forbidden slice names and key mismatch', () => {
    expect(() => createSaveSchema({ constructor: numSlice('constructor') })).toThrow();
    expect(() => createSaveSchema({ a: numSlice('b') })).toThrow();
  });
});

describe('save manager', () => {
  const make = (storage: StorageAdapter = createMemoryStorage()) => ({
    storage,
    mgr: createSaveManager({ schema, storage, now: () => 42 }),
  });

  it('returns null with no save, then round-trips', () => {
    const { mgr } = make();
    expect(mgr.load()).toEqual(ok(null));
    expect(mgr.save(state).ok).toBe(true);
    expect(mgr.load()).toEqual(ok(state));
    mgr.clear();
    expect(mgr.load()).toEqual(ok(null));
  });

  it('keeps a corrupt save as a backup and reports an error', () => {
    const { mgr, storage } = make();
    storage.set(SAVE_KEY, '{broken');
    const r = mgr.load();
    expect(r.ok).toBe(false);
    expect(storage.get(CORRUPT_KEY)).toEqual(ok('{broken'));
    expect(storage.get(SAVE_KEY)).toEqual(ok('{broken'));
    expect(mgr.save(state).ok).toBe(false);
    expect(storage.get(SAVE_KEY)).toEqual(ok('{broken'));
    expect(mgr.startFresh().ok).toBe(true);
    expect(mgr.save(state).ok).toBe(true);
    expect(storage.get(CORRUPT_KEY)).toEqual(ok('{broken'));
    expect(mgr.load()).toEqual(ok(state));
  });

  it('refuses save before any load', () => {
    expect(make().mgr.save(state).ok).toBe(false);
  });

  it('read failure is an error, never "no save", and locks saving', () => {
    const mem = createMemoryStorage();
    const flaky: StorageAdapter = { ...mem, get: () => err('denied') };
    const { mgr } = make(flaky);
    const r = mgr.load();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('storage unavailable');
    expect(mgr.save(state).ok).toBe(false);
    expect(mgr.startFresh().ok).toBe(false);
    expect(mgr.save(state).ok).toBe(false);
    expect(mem.get(SAVE_KEY)).toEqual(ok(null));
  });

  it('returns an error on quota failure and keeps the old save', () => {
    const mem = createMemoryStorage();
    const { mgr } = make(mem);
    mgr.load();
    mgr.save(state);
    const failing: StorageAdapter = { ...mem, set: () => err('quota') };
    const bad = createSaveManager({ schema, storage: failing, now: () => 1 });
    bad.load();
    expect(bad.save({ inventory: 1, meta: 1 }).ok).toBe(false);
    expect(mgr.load()).toEqual(ok(state));
  });

  it('fails verification when the write does not read back', () => {
    const mem = createMemoryStorage();
    const lying: StorageAdapter = { ...mem, set: () => ok(undefined) };
    const { mgr } = make(lying);
    mgr.load();
    expect(mgr.save(state).ok).toBe(false);
  });
});

describe('localStorage adapter', () => {
  it('prefixes keys and survives throwing storage', () => {
    const store = new Map<string, string>();
    const fake = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as unknown as Storage;
    const a = createLocalStorageAdapter(fake);
    a.set('x', '1');
    expect(store.get('idle-rpg:x')).toBe('1');
    expect(a.get('x')).toEqual(ok('1'));
    a.remove('x');
    expect(a.get('x')).toEqual(ok(null));
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage;
    const b = createLocalStorageAdapter(throwing);
    expect(b.get('x').ok).toBe(false);
    expect(b.set('x', '1').ok).toBe(false);
    expect(() => b.remove('x')).not.toThrow();
    expect(createLocalStorageAdapter(undefined).set('x', '1').ok).toBe(false);
    expect(createLocalStorageAdapter(undefined).get('x').ok).toBe(false);
  });
});

describe('autosave', () => {
  it('saves on interval, flush, and stops', () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const a = createAutosave({ intervalMs: 1000, save });
    a.start();
    a.start();
    vi.advanceTimersByTime(3000);
    expect(save).toHaveBeenCalledTimes(3);
    a.flush();
    expect(save).toHaveBeenCalledTimes(4);
    a.stop();
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('accepts an injected scheduler', () => {
    const set = vi.fn(() => 'h');
    const clear = vi.fn();
    const a = createAutosave({
      save: () => {},
      scheduler: { setInterval: set, clearInterval: clear },
    });
    a.start();
    expect(set).toHaveBeenCalledWith(expect.any(Function), 30_000);
    a.stop();
    expect(clear).toHaveBeenCalledWith('h');
  });
});
