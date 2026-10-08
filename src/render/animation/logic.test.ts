import { describe, expect, it } from 'vitest';
import {
  facingFromStep,
  facingIsBack,
  facingIsLeft,
  fallVector,
  computePose,
  makePose,
  nextAnimState,
} from './logic';
import { foreshortenSwing } from './chop';
import { CHOP_SWING_PERIOD_MS, MOTION, REDUCED_FADE_MS, SWING_IMPACT_PHASE } from './data';

describe('nextAnimState', () => {
  const idle = { moving: false, gathering: false };
  it('idles by default', () => expect(nextAnimState('chop', idle)).toBe('idle'));
  it('walks when moving', () =>
    expect(nextAnimState('idle', { ...idle, moving: true })).toBe('walk'));
  it('chops with an axe', () =>
    expect(nextAnimState('idle', { ...idle, gathering: true, toolKind: 'axe' })).toBe('chop'));
  it('does not chop with an unknown or missing tool', () => {
    expect(nextAnimState('idle', { ...idle, gathering: true })).toBe('idle');
    expect(nextAnimState('idle', { ...idle, gathering: true, toolKind: 'spoon' })).toBe('idle');
  });
  it('moving beats gathering', () =>
    expect(nextAnimState('chop', { moving: true, gathering: true, toolKind: 'axe' })).toBe('walk'));
});

describe('computePose', () => {
  it('shows the axe only while chopping', () => {
    const p = makePose();
    expect(computePose('idle', 0, p).axeVisible).toBe(false);
    expect(computePose('walk', 100, p).axeVisible).toBe(false);
    expect(computePose('chop', 0, p).axeVisible).toBe(true);
  });
  it('swings back then strikes forward over one period', () => {
    const ang = (ph: number) => computePose('chop', ph * CHOP_SWING_PERIOD_MS, makePose()).axeAngle;
    const headY = (ph: number) => Math.cos(ang(ph)); // + = head below the hands
    expect(headY(0.5)).toBeLessThan(headY(0)); // axe raised over the shoulder
    expect(headY(SWING_IMPACT_PHASE)).toBeGreaterThan(0.2); // head down at the hit
    expect(Math.sin(ang(1))).toBeCloseTo(Math.sin(ang(0)));
    expect(Math.cos(ang(1))).toBeCloseTo(Math.cos(ang(0)));
  });
  it('is periodic in swingPeriodMs', () => {
    const a = computePose('chop', 300, makePose()).axeAngle;
    const b = computePose('chop', 300 + CHOP_SWING_PERIOD_MS, makePose()).axeAngle;
    expect(b).toBeCloseTo(a);
  });
  it('walk is still with motionScale 0 and reuses the object', () => {
    const p = makePose();
    expect(computePose('walk', 130, p, 0)).toBe(p);
    expect(p.bodyBobY).toBeCloseTo(0);
    expect(p.thighFront).toBeCloseTo(0);
  });
});

describe('motion modes', () => {
  const P = CHOP_SWING_PERIOD_MS;
  it('on: walk bobs and chop swings through a wide arc', () => {
    const w = computePose('walk', 130, makePose(), 1, P, 'on');
    expect(Math.abs(w.thighFront) + Math.abs(w.bodyBobY)).toBeGreaterThan(0.3);
    const angles = [0, 0.3, 0.55, 0.7].map(
      (ph) => computePose('chop', ph * P, makePose(), 1, P, 'on').axeAngle,
    );
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(1.5);
  });
  it('reduced: walk is a visible but gentler gait (half the amplitude of on)', () => {
    const on = computePose('walk', 130, makePose(), 1, P, 'on');
    const w = computePose('walk', 130, makePose(), 1, P, 'reduced');
    expect(Math.abs(w.thighFront)).toBeGreaterThan(0.05);
    expect(w.thighFront).toBeCloseTo(on.thighFront * 0.5, 9);
    expect(MOTION.reduced.walkScale).toBe(0.5);
  });
  it('off: walk is still', () => {
    const w = computePose('walk', 130, makePose(), 1, P, 'off');
    expect(
      [w.bodyBobY, w.thighFront, w.kneeBack, w.armAngle].every((v) => Math.abs(v) < 1e-9),
    ).toBe(true);
  });
  it('reduced: chop is a 2-frame tap, still visible', () => {
    const seen = new Set<number>();
    for (let ph = 0; ph < 1; ph += 0.01) {
      const p = computePose('chop', ph * P, makePose(), 1, P, 'reduced');
      expect(p.axeVisible).toBe(true);
      seen.add(p.axeAngle);
    }
    expect(seen.size).toBe(2);
  });
  it('reduced tree tweens: short fade, no tilt, no pop', () => {
    const r = MOTION.reduced;
    expect(r.fallMs).toBeLessThanOrEqual(120);
    expect(r.regrowMs).toBeLessThanOrEqual(120);
    expect(REDUCED_FADE_MS).toBeLessThanOrEqual(120);
    expect(r.fallTiltDeg).toBe(0);
    expect(r.regrowFromScale).toBe(1);
    expect(MOTION.on.fallTiltDeg).toBeGreaterThan(0);
    expect(MOTION.on.regrowFromScale).toBeLessThan(1);
  });
});

describe('motion mode off', () => {
  const P = CHOP_SWING_PERIOD_MS;
  it('walk is still', () => {
    const w = computePose('walk', 130, makePose(), 1, P, 'off');
    expect(
      [w.bodyBobY, w.thighFront, w.kneeBack, w.armAngle].every((v) => Math.abs(v) < 1e-9),
    ).toBe(true);
  });
  it('chop holds the axe visible in one static pose at every phase', () => {
    const seen = new Set<number>();
    for (let ph = 0; ph < 1; ph += 0.01) {
      const p = computePose('chop', ph * P, makePose(), 1, P, 'off');
      expect(p.axeVisible).toBe(true);
      seen.add(p.axeAngle);
    }
    expect(seen.size).toBe(1);
  });
  it('tree swaps are instant', () => {
    expect(MOTION.off.fallMs).toBe(0);
    expect(MOTION.off.regrowMs).toBe(0);
    expect(MOTION.off.fallTiltDeg).toBe(0);
    expect(MOTION.off.regrowFromScale).toBe(1);
  });
  it('facing flips are unaffected (facingScaleX is independent of mode)', () => {
    expect(MOTION.off.walkScale).toBe(0);
  });
});

describe('iso facing', () => {
  // tile delta -> facing, flip (null = keep), back
  const cases: [string, number, number, string, boolean | null, boolean][] = [
    ['no movement', 0, 0, 's', null, false],
    ['+x tile', 1, 0, 'se', false, false],
    ['+x +y (down screen)', 1, 1, 's', null, false],
    ['+y tile', 0, 1, 'sw', true, false],
    ['-x tile', -1, 0, 'nw', true, true],
    ['-x -y (up screen)', -1, -1, 'n', null, true],
    ['-y tile', 0, -1, 'ne', false, true],
    ['+x -y (right on screen)', 1, -1, 'e', false, false],
    ['-x +y (left on screen)', -1, 1, 'w', true, false],
  ];
  it.each(cases)('%s', (_n, dx, dy, facing, left, back) => {
    const f = facingFromStep(dx, dy);
    expect(f).toBe(facing);
    expect(facingIsBack(f)).toBe(back);
    if (left === null) {
      expect(facingIsLeft(f, true)).toBe(true);
      expect(facingIsLeft(f, false)).toBe(false);
    } else {
      expect(facingIsLeft(f, !left)).toBe(left);
    }
  });
  it('covers all 8 directions', () => {
    expect(new Set(cases.map((c) => c[3]))).toEqual(
      new Set(['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw']),
    );
  });
});

describe('fallVector', () => {
  it('slides away from the player along the screen axis, unit length', () => {
    const v = fallVector(1, -1, { slideX: 0, slideY: 0, tilt: 0 });
    expect(v.tilt).toBeCloseTo(1);
    expect(Math.hypot(v.slideX, v.slideY)).toBeCloseTo(10);
  });
  it('(0,0) is the right-falling default', () => {
    expect(fallVector(0, 0, { slideX: 5, slideY: 5, tilt: 0 })).toEqual({
      slideX: 0,
      slideY: 0,
      tilt: 1,
    });
  });
});

describe('SWING_IMPACT_PHASE', () => {
  it('is where the strike ends: the axe reaches the hit angle there and not before', () => {
    const head = (ph: number) =>
      Math.cos(computePose('chop', ph * CHOP_SWING_PERIOD_MS, makePose()).axeAngle);
    expect(head(SWING_IMPACT_PHASE - 0.02)).toBeLessThan(head(SWING_IMPACT_PHASE) - 0.05);
  });
});

describe('foreshortenSwing', () => {
  it('reach 1 is the identity', () => {
    for (const a of [-2, -1, 0, 0.7]) expect(foreshortenSwing(a, 1)).toBeCloseTo(a);
  });
  it('keeps the vertical part and scales the sideways part', () => {
    const a = -115 * (Math.PI / 180);
    const f = foreshortenSwing(a, 0.5);
    expect(Math.tan(f)).toBeCloseTo(0.5 * Math.tan(a));
    expect(Math.cos(f)).toBeLessThan(0);
    expect(foreshortenSwing(0, 0.5)).toBe(0);
  });
});
