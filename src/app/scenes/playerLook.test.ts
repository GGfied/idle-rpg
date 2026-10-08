import { describe, expect, it, vi } from 'vitest';
import { PLAYER_LOOKS } from '@render/index';
import { applyPlayerLook, lookIdFromPrefs } from '@app/scenes/playerLook';

function targets() {
  return { view: { setLook: vi.fn() }, rebuildAnimator: vi.fn() };
}

describe('player look pref -> live view', () => {
  it('maps the pref to a look id, falling back to male for unknown or missing', () => {
    expect(lookIdFromPrefs({ playerLook: 'player_f' })).toBe('player_f');
    expect(lookIdFromPrefs({ playerLook: 'player' })).toBe('player');
    expect(lookIdFromPrefs({ playerLook: 'dragon' })).toBe('player');
    expect(lookIdFromPrefs({})).toBe('player');
    expect(lookIdFromPrefs({ playerLook: '__proto__' })).toBe('player');
  });

  it('a switch calls setLook and rebuilds the animator with the same look', () => {
    const t = targets();
    const now = applyPlayerLook({ playerLook: 'player_f' }, 'player', t);
    expect(now).toBe('player_f');
    expect(t.view.setLook).toHaveBeenCalledExactlyOnceWith(PLAYER_LOOKS.player_f);
    expect(t.rebuildAnimator).toHaveBeenCalledExactlyOnceWith(PLAYER_LOOKS.player_f);
  });

  it('an unchanged pref touches nothing (every other pref change passes through here)', () => {
    const t = targets();
    expect(applyPlayerLook({ playerLook: 'player' }, 'player', t)).toBe('player');
    expect(applyPlayerLook({ playerLook: 'bogus' }, 'player', t)).toBe('player');
    expect(t.view.setLook).not.toHaveBeenCalled();
    expect(t.rebuildAnimator).not.toHaveBeenCalled();
  });

  it('switching back to male works', () => {
    const t = targets();
    expect(applyPlayerLook({ playerLook: 'player' }, 'player_f', t)).toBe('player');
    expect(t.view.setLook).toHaveBeenCalledWith(PLAYER_LOOKS.player);
  });
});
