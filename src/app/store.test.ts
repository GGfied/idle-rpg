import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { newGame } from '@app/game/newGame';
import { TRACKER_MS, createAppStore } from '@app/store';

describe('store escape', () => {
  it('closes the bank panel', () => {
    const g = newGame(CONTENT);
    const store = createAppStore({ ...g, bankOpen: true });
    store.getState().escape();
    expect(store.getState().game.bankOpen).toBe(false);
  });

  it('does nothing when no bank is open (and leaves settings to their own panel)', () => {
    const store = createAppStore(newGame(CONTENT));
    store.getState().openSettings();
    const before = store.getState().game;
    store.getState().escape();
    expect(store.getState().game).toBe(before);
    expect(store.getState().settingsOpen).toBe(true);
  });
});

describe('store notices', () => {
  it('tracks the trained skill and raises a level-up notice from tick events', () => {
    const store = createAppStore(newGame(CONTENT));
    store.getState().noteEvents([
      { type: 'xpGranted', skill: 'woodcutting', amount: 25, source: 'tree' },
      { type: 'levelUp', skill: 'woodcutting', level: 2 },
    ]);
    const s = store.getState();
    expect(s.tracker).toEqual({ skill: 'woodcutting', untilMs: TRACKER_MS });
    expect(s.levelUp).toMatchObject({ skill: 'woodcutting', level: 2 });
    s.dismissLevelUp();
    expect(store.getState().levelUp).toBeNull();
  });

  it('ignores unrelated events and unknown skills', () => {
    const store = createAppStore(newGame(CONTENT));
    store.getState().noteEvents([{ type: 'xpGranted', skill: 'nope', amount: 1, source: 'x' }]);
    expect(store.getState().tracker).toBeNull();
  });
});
