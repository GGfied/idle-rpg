import { describe, expect, it, vi } from 'vitest';
import { createMemoryStorage, createPreferencesStore, defaultPreferences } from '@core/persistence';
import type { PreferencesStore } from '@core/persistence';
import { CONTENT } from '@app/registry';
import { addChat, addImportantChat, filterNewChat } from '@app/game/chat';
import { newGame } from '@app/game/newGame';
import { applyVisualPrefs } from '@app/scenes/applyPrefs';
import { createAppStore } from '@app/store';

const setup = (reduced = false) => {
  const prefs = createPreferencesStore({
    storage: createMemoryStorage(),
    prefersReducedMotion: reduced,
  });
  return { prefs, store: createAppStore(newGame(CONTENT), CONTENT, prefs) };
};
const texts = (s: ReturnType<typeof setup>['store']): string[] =>
  s.getState().game.chat.map((l) => l.text);

describe('setPref', () => {
  it('updates prefs, the sound alias and the prefs store', () => {
    const { prefs, store } = setup();
    store.getState().setPref({ hud: { minimap: false }, sound: { volumes: { sfx: 0.4 } } });
    expect(store.getState().prefs.hud.minimap).toBe(false);
    expect(store.getState().sound.volumes.sfx).toBe(0.4);
    expect(prefs.get().hud.minimap).toBe(false);
  });

  it('playerLook reaches the store and the persisted prefs; an invalid look is rejected', () => {
    const storage = createMemoryStorage();
    const prefs = createPreferencesStore({ storage, prefersReducedMotion: false });
    const store = createAppStore(newGame(CONTENT), CONTENT, prefs);
    expect(store.getState().prefs.playerLook).toBe('player');
    store.getState().setPref({ playerLook: 'player_f' });
    expect(store.getState().prefs.playerLook).toBe('player_f');
    expect(createPreferencesStore({ storage, prefersReducedMotion: false }).get().playerLook).toBe(
      'player_f',
    );
    store.getState().setPref({ playerLook: 'dragon' } as never);
    expect(store.getState().prefs.playerLook).toBe('player_f');
  });

  it('an invalid update changes nothing and reports an error line in chat', () => {
    const { store } = setup();
    const before = store.getState().prefs;
    store.getState().setPref({ visuals: { vfx: 'loud' } } as never);
    expect(store.getState().prefs).toBe(before);
    expect(texts(store).at(-1)).toMatch(/Could not change that setting/);
    expect(store.getState().game.chat.at(-1)?.important).toBe(true);
  });

  it('the error line stays even when game messages are off', () => {
    const { store } = setup();
    store.getState().setPref({ notifications: { gameMessages: false } });
    store.getState().setPref({ nope: 1 } as never);
    expect(texts(store).at(-1)).toMatch(/Could not change/);
  });
});

describe('prefs reach audio', () => {
  const audio = () => {
    const calls: unknown[][] = [];
    return {
      calls,
      setMuted: (m: boolean) => calls.push(['mute', m]),
      setVolume: (v: number) => calls.push(['volume', v]),
      setChannelVolume: (c: string, v: number) => calls.push([c, v]),
      play: () => undefined,
    };
  };
  it('pushes only the changed mute and channels', () => {
    const { store } = setup();
    const a = audio();
    store.getState().attachAudio(a as never);
    store.getState().setPref({ sound: { muted: true, volumes: { ui: 0.2 } } });
    expect(a.calls).toEqual([
      ['mute', true],
      ['ui', 0.2],
    ]);
    store.getState().setPref({ hud: { orbs: false } });
    expect(a.calls).toHaveLength(2);
  });
  it('pushes music and ambience volumes', () => {
    const { store } = setup();
    const a = audio();
    store.getState().attachAudio(a as never);
    store.getState().setSoundVolume('music', 0.3);
    store.getState().setSoundVolume('ambience', 0.4);
    expect(a.calls).toEqual([
      ['music', 0.3],
      ['ambience', 0.4],
    ]);
  });
  it('applies a change made directly on the prefs store (e.g. another writer)', () => {
    const { prefs, store } = setup();
    const a = audio();
    store.getState().attachAudio(a as never);
    prefs.set({ sound: { volumes: { master: 0.1 } } });
    expect(a.calls).toEqual([['master', 0.1]]);
  });
});

describe('prefs reach vfx and animation', () => {
  it('applies vfx mode, xp drops and animation mode (including off)', () => {
    const vfx = { setMode: vi.fn(), setXpDrops: vi.fn() };
    const animator = { setMode: vi.fn() };
    const p = defaultPreferences(false);
    applyVisualPrefs(
      {
        ...p,
        visuals: { vfx: 'reduced', animations: 'off' },
        notifications: { ...p.notifications, xpDrops: false },
      },
      { vfx, animator },
    );
    expect(vfx.setMode).toHaveBeenCalledWith('reduced');
    expect(vfx.setXpDrops).toHaveBeenCalledWith(false);
    expect(animator.setMode).toHaveBeenCalledWith('off');
  });
  it('tolerates missing targets', () => {
    expect(() => applyVisualPrefs(defaultPreferences(true), {})).not.toThrow();
  });
  it('reduced-motion device flag does not change the visual defaults', () => {
    expect(setup(true).store.getState().prefs.visuals).toEqual({ vfx: 'on', animations: 'on' });
  });
});

describe('notifications', () => {
  const levelUp = [{ type: 'levelUp', skill: 'woodcutting', level: 2 }] as never;
  it('level-up popup follows notifications.levelUpPopup, and turning it off clears a shown one', () => {
    const { store } = setup();
    store.getState().noteEvents(levelUp);
    expect(store.getState().levelUp).not.toBeNull();
    store.getState().setPref({ notifications: { levelUpPopup: false } });
    expect(store.getState().levelUp).toBeNull();
    store.getState().noteEvents(levelUp);
    expect(store.getState().levelUp).toBeNull();
  });
  it('exposes every hud and notification flag for the hud to read', () => {
    const { store } = setup();
    expect(Object.keys(store.getState().prefs.hud).sort()).toEqual([
      'chatFold',
      'chatbox',
      'hidden',
      'minimap',
      'orbs',
      'sheetFold',
      'skillTracker',
    ]);
    expect(Object.keys(store.getState().prefs.notifications).sort()).toEqual([
      'achievementToasts',
      'areaNames',
      'gameMessages',
      'levelUpPopup',
      'xpDrops',
    ]);
  });
});

describe('game message filter', () => {
  it('keeps everything while gameMessages is on', () => {
    const g = newGame(CONTENT);
    const next = addChat(addImportantChat(g, 'warn'), 'routine');
    expect(filterNewChat(g, next, true)).toBe(next);
  });
  it('drops new routine lines but keeps important lines and earlier history', () => {
    const g = addChat(newGame(CONTENT), 'old routine');
    const next = addChat(addImportantChat(g, 'level up'), 'routine');
    const out = filterNewChat(g, next, false);
    expect(out.chat.map((l) => l.text)).toEqual(['old routine', 'level up']);
  });
  it('works from an empty chat and through the store actions', () => {
    const { store } = setup();
    store.getState().setGame({ ...store.getState().game, chat: [] });
    store.getState().setPref({ notifications: { gameMessages: false } });
    store.getState().examineItem(0);
    store.getState().say('hello');
    expect(texts(store)).toEqual([]);
    store.getState().setGame(addImportantChat(store.getState().game, 'Level up!'));
    expect(texts(store)).toEqual(['Level up!']);
    store.getState().setPref({ notifications: { gameMessages: true } });
    store.getState().say('back');
    expect(texts(store)).toEqual(['Level up!', 'back']);
  });
});

it('createAppStore works without an injected prefs store', () => {
  const s: PreferencesStore | undefined = undefined;
  expect(s).toBeUndefined();
  expect(createAppStore(newGame(CONTENT)).getState().prefs.visuals.vfx).toBe('on');
});
