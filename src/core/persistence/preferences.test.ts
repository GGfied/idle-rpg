import { describe, expect, it, vi } from 'vitest';
import {
  PREFS_CORRUPT_KEY,
  PREFS_KEY,
  createMemoryStorage,
  createPreferencesStore,
  defaultPreferences,
} from './index';

const make = (reduced = false, seed?: Record<string, string>) => {
  const storage = createMemoryStorage();
  for (const [k, v] of Object.entries(seed ?? {})) storage.set(k, v);
  return { storage, store: createPreferencesStore({ storage, prefersReducedMotion: reduced }) };
};
const stored = (s: ReturnType<typeof createMemoryStorage>) => {
  const r = s.get(PREFS_KEY);
  return r.ok && r.value ? JSON.parse(r.value) : null;
};

describe('preferences defaults', () => {
  it('has the contract defaults', () => {
    const p = make().store.get();
    expect(p.sound).toEqual({
      muted: false,
      volumes: { master: 0.7, sfx: 1, ui: 1, music: 0.6, ambience: 0.8 },
    });
    expect(p.hud).toEqual({
      minimap: true,
      orbs: true,
      skillTracker: true,
      chatbox: true,
      hidden: false,
    });
    expect(p.notifications).toEqual({
      levelUpPopup: true,
      xpDrops: true,
      achievementToasts: true,
      gameMessages: true,
      areaNames: true,
    });
    expect(p.visuals).toEqual({ vfx: 'on', animations: 'on' });
  });
  it('defaults visuals to reduced when the caller prefers reduced motion', () => {
    expect(make(true).store.get().visuals).toEqual({ vfx: 'reduced', animations: 'reduced' });
    expect(defaultPreferences(true).visuals.vfx).toBe('reduced');
  });
  it('get returns a copy', () => {
    const { store } = make();
    store.get().hud.minimap = false;
    expect(store.get().hud.minimap).toBe(true);
  });
});

describe('preferences set', () => {
  it('applies a partial update, keeps siblings, persists and round-trips', () => {
    const { store, storage } = make();
    expect(store.set({ hud: { minimap: false }, sound: { volumes: { sfx: 0.2 } } }).ok).toBe(true);
    const p = store.get();
    expect(p.hud).toEqual({
      minimap: false,
      orbs: true,
      skillTracker: true,
      chatbox: true,
      hidden: false,
    });
    expect(p.sound.volumes).toEqual({ master: 0.7, sfx: 0.2, ui: 1, music: 0.6, ambience: 0.8 });
    expect(stored(storage).version).toBe(1);
    expect(createPreferencesStore({ storage, prefersReducedMotion: false }).get()).toEqual(p);
  });
  it.each([
    ['wrong type', { hud: { minimap: 'yes' } }],
    ['bad enum', { visuals: { vfx: 'max' } }],
    ['NaN', { sound: { volumes: { master: NaN } } }],
    ['unknown key', { hud: { nope: true } }],
    ['unknown section', { extra: {} }],
    ['section not object', { hud: true }],
    ['forbidden key', JSON.parse('{"hud":{"__proto__":{"minimap":false}}}')],
  ])('rejects %s and changes nothing', (_n, update) => {
    const { store } = make();
    const before = store.get();
    const cb = vi.fn();
    store.subscribe(cb);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(store.set(update as any).ok).toBe(false);
    expect(store.get()).toEqual(before);
    expect(cb).not.toHaveBeenCalled();
  });
  it('clamps numbers to 0..1', () => {
    const { store } = make();
    store.set({ sound: { volumes: { master: 5, sfx: -2 } } });
    expect(store.get().sound.volumes).toMatchObject({ master: 1, sfx: 0 });
  });
  it('mixed valid + invalid update is all-or-nothing', () => {
    const { store } = make();
    expect(store.set({ hud: { minimap: false, orbs: 3 as unknown as boolean } }).ok).toBe(false);
    expect(store.get().hud.minimap).toBe(true);
  });
  it('reports a storage write failure but keeps the in-memory change', () => {
    const storage = createMemoryStorage();
    const store = createPreferencesStore({ storage, prefersReducedMotion: false });
    storage.set = () => ({ ok: false, error: 'full' });
    expect(store.set({ hud: { hidden: true } }).ok).toBe(false);
    expect(store.get().hud.hidden).toBe(true);
  });
});

describe('preferences subscribe / reset', () => {
  it('fires once per change, not for no-ops, and unsubscribes', () => {
    const { store } = make();
    const cb = vi.fn();
    const off = store.subscribe(cb);
    store.set({ hud: { hidden: true }, notifications: { xpDrops: false } });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0]![0].hud.hidden).toBe(true);
    store.set({ hud: { hidden: true } });
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    store.set({ hud: { hidden: false } });
    expect(cb).toHaveBeenCalledTimes(1);
  });
  it('reset restores defaults, notifies once, persists', () => {
    const { store, storage } = make(true);
    store.set({ visuals: { vfx: 'off' }, hud: { orbs: false } });
    const cb = vi.fn();
    store.subscribe(cb);
    store.reset();
    store.reset();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(store.get()).toEqual(defaultPreferences(true));
    expect(stored(storage).prefs.visuals.vfx).toBe('reduced');
  });
});

describe('preferences loading', () => {
  const env = (prefs: unknown, version = 1) => JSON.stringify({ version, prefs });
  it('replaces wrong types with field defaults, drops unknown keys, clamps', () => {
    const { store } = make(false, {
      [PREFS_KEY]: env({
        sound: { muted: 'x', volumes: { master: 9, sfx: 'loud', ui: 0.5 }, extra: 1 },
        hud: { minimap: false, orbs: 1 },
        visuals: { vfx: 'bogus', animations: 'reduced' },
        junk: true,
      }),
    });
    const p = store.get();
    expect(p.sound).toEqual({
      muted: false,
      volumes: { master: 1, sfx: 1, ui: 0.5, music: 0.6, ambience: 0.8 },
    });
    expect(p.hud).toMatchObject({ minimap: false, orbs: true });
    expect(p.visuals).toEqual({ vfx: 'on', animations: 'reduced' });
    expect('junk' in p).toBe(false);
  });
  it('old stored prefs without areaNames load with true; false persists', () => {
    const { store, storage } = make(false, {
      [PREFS_KEY]: env({ notifications: { levelUpPopup: false, xpDrops: true } }),
    });
    expect(store.get().notifications.areaNames).toBe(true);
    expect(store.get().notifications.levelUpPopup).toBe(false);
    expect(store.set({ notifications: { areaNames: false } }).ok).toBe(true);
    expect(stored(storage).prefs.notifications.areaNames).toBe(false);
    const again = createPreferencesStore({ storage, prefersReducedMotion: false });
    expect(again.get().notifications.areaNames).toBe(false);
  });
  it("accepts animations 'off' via set and persists it", () => {
    const { store, storage } = make();
    expect(store.set({ visuals: { animations: 'off' } }).ok).toBe(true);
    expect(store.get().visuals).toEqual({ vfx: 'on', animations: 'off' });
    expect(stored(storage).prefs.visuals.animations).toBe('off');
  });
  it("accepts animations 'off' on load", () => {
    const { store } = make(false, { [PREFS_KEY]: env({ visuals: { animations: 'off' } }) });
    expect(store.get().visuals.animations).toBe('off');
  });
  it.each([false, true])('unknown animations value falls back to the default (reduced=%s)', (r) => {
    const { store } = make(r, { [PREFS_KEY]: env({ visuals: { animations: 'bogus' } }) });
    expect(store.get().visuals.animations).toBe(r ? 'reduced' : 'on');
  });
  it.each([
    ['not json', '{oops'],
    ['array', '[]'],
    ['no version', JSON.stringify({ prefs: {} })],
    ['future version', env({}, 99)],
    ['oversized', 'x'.repeat(20_000)],
  ])('corrupt (%s): defaults, raw value backed up, not blocked', (_n, raw) => {
    const { store, storage } = make(false, { [PREFS_KEY]: raw });
    expect(store.get()).toEqual(defaultPreferences(false));
    const b = storage.get(PREFS_CORRUPT_KEY);
    expect(b.ok && b.value).toBe(raw);
    expect(store.set({ hud: { hidden: true } }).ok).toBe(true);
  });
  it('unreadable storage falls back to defaults', () => {
    const storage = createMemoryStorage();
    storage.get = () => ({ ok: false, error: 'nope' });
    expect(createPreferencesStore({ storage, prefersReducedMotion: false }).get()).toEqual(
      defaultPreferences(false),
    );
  });
  it('is safe against __proto__ / constructor / prototype payloads', () => {
    const raw = `{"version":1,"prefs":{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"hud":{"__proto__":{"minimap":false},"orbs":false}}}`;
    const { store } = make(false, { [PREFS_KEY]: raw });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(store.get().hud).toMatchObject({ minimap: true, orbs: false });
    expect(Object.hasOwn(store.get(), 'constructor')).toBe(false);
  });
});

describe('legacy idle-rpg:audio migration', () => {
  it.each([
    ['volume+muted', { volume: 0.3, muted: true }, { master: 0.3, muted: true }],
    ['out of range', { volume: 4, muted: false }, { master: 1, muted: false }],
    ['partial', { muted: true }, { master: 0.7, muted: true }],
    ['bad types', { volume: 'a', muted: 'b' }, { master: 0.7, muted: false }],
  ])('%s seeds sound, persists prefs, leaves the old key', (_n, legacy, want) => {
    const raw = JSON.stringify(legacy);
    const { store, storage } = make(false, { audio: raw });
    expect(store.get().sound.volumes.master).toBe(want.master);
    expect(store.get().sound.muted).toBe(want.muted);
    expect(store.get().sound.volumes).toMatchObject({ sfx: 1, ui: 1 });
    expect(stored(storage).prefs.sound.muted).toBe(want.muted);
    const a = storage.get('audio');
    expect(a.ok && a.value).toBe(raw);
  });
  it('ignores a corrupt legacy value and does not use it once prefs exist', () => {
    expect(make(false, { audio: '{bad' }).store.get()).toEqual(defaultPreferences(false));
    const { store } = make(false, {
      audio: JSON.stringify({ volume: 0.1 }),
      [PREFS_KEY]: JSON.stringify({ version: 1, prefs: {} }),
    });
    expect(store.get().sound.volumes.master).toBe(0.7);
  });
});

describe('preferences additive fields (no version bump)', () => {
  it('a stored prefs value without music/ambience loads with defaults and keeps other values', () => {
    const old = {
      version: 1,
      prefs: {
        sound: { muted: true, volumes: { master: 0.3, sfx: 0.5, ui: 0.2 } },
        hud: { minimap: false },
      },
    };
    const p = make(false, { [PREFS_KEY]: JSON.stringify(old) }).store.get();
    expect(p.sound).toEqual({
      muted: true,
      volumes: { master: 0.3, sfx: 0.5, ui: 0.2, music: 0.6, ambience: 0.8 },
    });
    expect(p.hud.minimap).toBe(false);
    expect(p.hud.orbs).toBe(true);
  });
  it('clamps music and ambience to 0..1', () => {
    const { store } = make();
    store.set({ sound: { volumes: { music: 9, ambience: -1 } } });
    expect(store.get().sound.volumes).toMatchObject({ music: 1, ambience: 0 });
  });
});
