import { describe, expect, it } from 'vitest';
import { figureArmPivots, figureLegPivots, paintFigure } from './figureArt';
import { PLAYER_LOOK, PLAYER_LOOKS, asPlayerLookId } from './figureLooks';
import { portraitLook, portraitUrl } from './portrait';

describe('player looks', () => {
  const m = PLAYER_LOOKS.player;
  const f = PLAYER_LOOKS.player_f;

  it('player_f keeps the player outfit and rig, only hair and skin differ', () => {
    expect(PLAYER_LOOK).toBe(m);
    const { skin, hair, hairStyle, ...outfit } = f;
    const { skin: s2, hair: h2, hairStyle: hs2, ...outfit2 } = m;
    expect(outfit).toEqual(outfit2);
    expect([skin !== s2, hair !== h2, hairStyle !== hs2]).toEqual([true, true, true]);
    expect([f.rigArms, f.rigUpperArms, f.rigLegs]).toEqual([true, true, true]);
    expect(figureArmPivots(f)).toEqual(figureArmPivots(m));
    expect(figureLegPivots(f)).toEqual(figureLegPivots(m));
  });

  it('paints a different figure from both sides', () => {
    for (const view of ['front', 'back'] as const) {
      const a = paintFigure(f, view);
      expect(a.some((c) => c >= 0)).toBe(true);
      expect(a.some((c, i) => c !== paintFigure(m, view)[i])).toBe(true);
    }
  });

  it('portrait works for player_f and differs from player', () => {
    expect(portraitLook('player_f')).toBe(f);
    expect(portraitUrl('player_f', 48)).not.toBe(portraitUrl('player', 48));
    expect(portraitUrl('player_f', 48).startsWith('data:image/png;base64,')).toBe(true);
  });

  it('asPlayerLookId falls back to player', () => {
    expect(asPlayerLookId('player_f')).toBe('player_f');
    expect(asPlayerLookId('toString')).toBe('player');
    expect(asPlayerLookId(undefined)).toBe('player');
  });
});
