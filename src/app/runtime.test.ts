import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addItem } from '@core/inventory';
import { SAVE_KEY, createMemoryStorage } from '@core/persistence';
import type { Preferences } from '@core/persistence';
import { CONTENT } from '@app/registry';
import { createRuntime } from '@app/runtime';
import type { RuntimeEnv } from '@app/runtime';

function fakeEnv(): RuntimeEnv & { hide(): void; show(): void } {
  const hidden: (() => void)[] = [];
  const visible: (() => void)[] = [];
  return {
    onHidden: (cb) => {
      hidden.push(cb);
      return () => undefined;
    },
    onVisible: (cb) => {
      visible.push(cb);
      return () => undefined;
    },
    show: () => visible.forEach((cb) => cb()),
    hide: () => hidden.forEach((cb) => cb()),
  };
}

const savedLogs = (storage: ReturnType<typeof createMemoryStorage>): number => {
  const raw = storage.get(SAVE_KEY);
  if (!raw.ok || raw.value === null) return -1;
  const slots = JSON.parse(raw.value).data.inventory.slots as ({ itemId: string } | null)[];
  return slots.filter((s) => s?.itemId === 'logs').length;
};

const giveLogs = (rt: ReturnType<typeof createRuntime>): void => {
  const g = rt.store.getState().game;
  const r = addItem(g.inventory, CONTENT.items, 'logs', 1);
  if (r.ok) rt.store.getState().setGame({ ...g, inventory: r.value });
};

describe('runtime saving', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('saves soon after the inventory changes, not only every 30 s', () => {
    const storage = createMemoryStorage();
    const rt = createRuntime(storage, fakeEnv());
    const stop = rt.start();
    giveLogs(rt);
    vi.advanceTimersByTime(1500);
    expect(savedLogs(storage)).toBe(1);
    stop();
  });

  it('flushes the CURRENT state when the page is hidden', () => {
    const storage = createMemoryStorage();
    const env = fakeEnv();
    const rt = createRuntime(storage, env);
    const stop = rt.start();
    giveLogs(rt);
    env.hide();
    expect(savedLogs(storage)).toBe(1);
    stop();
  });

  it('a stale older runtime cannot overwrite the newer runtime save', () => {
    const storage = createMemoryStorage();
    const oldEnv = fakeEnv();
    const oldRt = createRuntime(storage, oldEnv);
    const stopOld = oldRt.start();
    const newRt = createRuntime(storage, fakeEnv()); // a reload / second tab boots later
    const stopNew = newRt.start();
    giveLogs(newRt);
    vi.advanceTimersByTime(1500);
    expect(savedLogs(storage)).toBe(1);
    oldEnv.hide(); // the stale copy flushes its fresh-looking state
    vi.advanceTimersByTime(60_000);
    expect(savedLogs(storage)).toBe(1);
    expect(oldRt.store.getState().banner?.text).toMatch(/another tab/);
    stopOld();
    stopNew();
  });
});

describe('runtime sound', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const savedPrefs = (storage: ReturnType<typeof createMemoryStorage>): Preferences =>
    JSON.parse(String((storage.get('prefs') as { value: string }).value)).prefs;

  it('persists the mute choice in prefs; hiding then showing the tab never changes it', () => {
    const storage = createMemoryStorage();
    const env = fakeEnv();
    const rt = createRuntime(storage, env);
    const stop = rt.start();
    rt.store.getState().toggleMute();
    expect(savedPrefs(storage).sound.muted).toBe(true);
    expect(rt.audio.isMuted()).toBe(true);
    rt.store.getState().toggleMute();
    expect(savedPrefs(storage).sound.muted).toBe(false);
    env.hide();
    expect(rt.audio.isMuted()).toBe(false);
    env.show();
    expect(rt.audio.isMuted()).toBe(false);
    expect(rt.store.getState().sound.muted).toBe(false);
    stop();
  });

  it('a user mute survives hide/show, and no longer writes the old audio key', () => {
    const storage = createMemoryStorage();
    const env = fakeEnv();
    const rt = createRuntime(storage, env);
    const stop = rt.start();
    rt.store.getState().toggleMute();
    rt.store.getState().setSoundVolume('master', 0.4);
    env.hide();
    env.show();
    expect(rt.audio.isMuted()).toBe(true);
    expect(savedPrefs(storage).sound).toMatchObject({
      muted: true,
      volumes: { master: 0.4, sfx: 1, ui: 1 },
    });
    expect(storage.get('audio')).toEqual({ ok: true, value: null });
    stop();
  });

  it('migrates the legacy audio key once and starts audio from it', () => {
    const storage = createMemoryStorage();
    storage.set('audio', JSON.stringify({ volume: 0.2, muted: true }));
    const rt = createRuntime(storage, fakeEnv());
    expect(rt.audio.isMuted()).toBe(true);
    expect(rt.store.getState().sound).toMatchObject({
      muted: true,
      volumes: { master: 0.2, sfx: 1, ui: 1 },
    });
  });

  it('never auto-picks reduced visuals, even when the device prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    try {
      const rt = createRuntime(createMemoryStorage(), fakeEnv());
      expect(rt.store.getState().prefs.visuals).toEqual({ vfx: 'on', animations: 'on' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a saved explicit choice (reduced or off) is respected on reload', () => {
    const storage = createMemoryStorage();
    const first = createRuntime(storage, fakeEnv());
    first.store.getState().setPref({ visuals: { vfx: 'reduced', animations: 'off' } });
    const again = createRuntime(storage, fakeEnv());
    expect(again.store.getState().prefs.visuals).toEqual({ vfx: 'reduced', animations: 'off' });
  });

  it('forwards tick events to subscribers', () => {
    const storage = createMemoryStorage();
    const rt = createRuntime(storage, fakeEnv());
    const seen: unknown[] = [];
    rt.onEvents((e) => seen.push(e));
    rt.ticker.update(0);
    rt.ticker.update(700);
    expect(seen).toHaveLength(1);
  });
});

describe('runtime area audio', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const move = (rt: ReturnType<typeof createRuntime>, x: number, y: number): void => {
    const g = rt.store.getState().game;
    rt.store.getState().setGame({ ...g, movement: { ...g.movement, position: { x, y } } });
  };

  it('calls setArea once per area change (not per tick) and announces the new area', () => {
    const rt = createRuntime(createMemoryStorage(), fakeEnv());
    const spy = vi.spyOn(rt.audio, 'setArea');
    const stop = rt.start();
    move(rt, 20, 20); // Oak Grove (the start tile is in the village; the spy sees only changes)
    vi.advanceTimersByTime(3000); // several ticks in the same area
    expect(spy.mock.calls.filter((c) => c[0] === 'forest')).toHaveLength(1);
    move(rt, 36, 5); // Mirror Lake
    vi.advanceTimersByTime(3000);
    expect(spy.mock.calls.filter((c) => c[0] === 'lake')).toHaveLength(1);
    const chat = rt.store.getState().game.chat.map((l) => l.text);
    expect(chat).toContain('You enter Mirror Lake.');
    expect(rt.store.getState().areaBanner?.name).toBe('Mirror Lake');
    vi.advanceTimersByTime(4100);
    expect(rt.store.getState().areaBanner).toBeNull();
    stop();
  });

  it('shows no banner at boot, and none when areaNames is off', () => {
    const rt = createRuntime(createMemoryStorage(), fakeEnv());
    const stop = rt.start();
    expect(rt.store.getState().areaBanner).toBeNull();
    expect(rt.store.getState().showAreaBanner('X')).not.toBeNull();
    rt.store.getState().clearAreaBanner(rt.store.getState().areaBanner!.shownAt);
    rt.store.setState((s) => ({
      prefs: { ...s.prefs, notifications: { ...s.prefs.notifications, areaNames: false } },
    }));
    move(rt, 36, 5);
    vi.advanceTimersByTime(1300);
    expect(rt.store.getState().areaBanner).toBeNull();
    stop();
  });

  it('hidden suspends audio without touching mute or prefs', () => {
    const env = fakeEnv();
    const rt = createRuntime(createMemoryStorage(), env);
    const suspend = vi.spyOn(rt.audio, 'suspend');
    const stop = rt.start();
    const prefs = rt.store.getState().prefs;
    env.hide();
    expect(suspend).toHaveBeenCalledTimes(1);
    expect(rt.store.getState().prefs).toBe(prefs);
    stop();
  });
});

describe('runtime saves position, run energy and hp', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const savedData = (storage: ReturnType<typeof createMemoryStorage>) => {
    const raw = storage.get(SAVE_KEY);
    if (!raw.ok || raw.value === null) return null;
    return JSON.parse(raw.value).data as Record<string, unknown>;
  };

  it('writes the new tile soon after a walk ends, and the new hp', () => {
    const storage = createMemoryStorage();
    const rt = createRuntime(storage, fakeEnv());
    const stop = rt.start();
    const g = rt.store.getState().game;
    const to = { x: g.movement.position.x + 1, y: g.movement.position.y };
    rt.store.getState().setGame({ ...g, movement: { ...g.movement, position: to } });
    vi.advanceTimersByTime(1500);
    expect(JSON.stringify(savedData(storage))).toContain(`"x":${to.x}`);
    const g2 = rt.store.getState().game;
    rt.store.getState().setGame({ ...g2, hp: { ...g2.hp, current: g2.hp.current - 3 } });
    vi.advanceTimersByTime(1500);
    expect(JSON.stringify(savedData(storage)?.hp)).toContain(String(g2.hp.current - 3));
    stop();
  });
});
