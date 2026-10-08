import { describe, expect, it } from 'vitest';
import { computePose, defaultGeom, makePose, projectSwing, swingAxis, swingLength } from './logic';
import { DIAGONAL_LATERAL_CAP, FACING_SWING, GAITS } from './data';
import { PLAYER_LOOK, figureLegPivots } from '@render/index';
import type { Facing8 } from '@render/index';
import type { GaitKey, SwingAxis } from './types';

const g = defaultGeom();
const FACINGS = Object.keys(FACING_SWING) as Facing8[];
const DIAGONALS: Facing8[] = ['se', 'sw', 'ne', 'nw'];
/** Facings whose swing is the plain arc (e/w) or up/down on the centre line (s/n): the travel must lie ON the facing vector. */
const AXIS_FACINGS = FACINGS.filter((f) => !DIAGONALS.includes(f));
const P = 2400;

/** End of a two-segment limb in the flipped rig (x = along the facing on screen, y down), from forward-positive angles. */
function tip(
  l1: number,
  l2: number,
  a1: number,
  a2: number,
  ax: SwingAxis,
): { x: number; y: number } {
  const r1 = projectSwing(a1, ax);
  const r2 = projectSwing(a2, ax);
  const s1 = swingLength(a1, ax);
  const s2 = swingLength(a2, ax);
  return {
    x: -l1 * s1 * Math.sin(r1) - l2 * s2 * Math.sin(r2),
    y: l1 * s1 * Math.cos(r1) + l2 * s2 * Math.cos(r2),
  };
}
/** Angle (rad) between the line of d and the facing line (0..pi/2); sign of travel is checked separately. */
function offAxis(d: { x: number; y: number }, f: SwingAxis): number {
  const cross = Math.abs(d.x * f.y - d.y * f.x);
  return Math.asin(Math.min(1, cross / (Math.hypot(d.x, d.y) * Math.hypot(f.x, f.y))));
}
const axisOf = (f: Facing8): SwingAxis => swingAxis(f, { x: 0, y: 0 });
const facingVec = (f: Facing8): SwingAxis => ({
  x: Math.abs(FACING_SWING[f].x),
  y: FACING_SWING[f].y,
});
/** Which way the facing points on screen (+ = toward the camera): the diagonal swing keeps that vertical sign. */
const FACING_SCREEN_Y: Record<Facing8, number> = {
  n: -1,
  ne: -1,
  e: 0,
  se: 1,
  s: 1,
  sw: 1,
  w: 0,
  nw: -1,
};
const TOL = 0.3; // rad (~17 degrees)

describe.each(['walk', 'run'] as const)(
  '%s: hands and feet swing along the facing',
  (gait: GaitKey) => {
    const gt = GAITS[gait];
    const rest = (l1: number, l2: number) => ({ x: 0, y: l1 + l2 });
    const armL1 = g.elbowY;
    const armL2 = g.handY;
    const legL1 = g.kneeY - g.hipY;
    const legL2 = -g.kneeY;

    it.each(AXIS_FACINGS)(
      'facing %s: the hand travels along the facing vector, forward = along it',
      (f) => {
        const ax = axisOf(f);
        const fv = facingVec(f);
        const p = makePose();
        let peakFwd = -1;
        let peak = { x: 0, y: 0 };
        // Sample the whole cycle; the extreme hand positions are the forward and backward ends of the swing.
        for (let i = 0; i < 360; i++) {
          computePose('walk', (i / 360) * gt.cycleMs, p, 1, P, 'on', gait);
          if (p.armUpperFront > peakFwd) {
            peakFwd = p.armUpperFront;
            peak = tip(armL1, armL2, p.armUpperFront, p.armUpperFront, ax); // the swing itself: straight arm
          }
        }
        const d = { x: peak.x - rest(armL1, armL2).x, y: peak.y - rest(armL1, armL2).y };
        expect(offAxis(d, fv), `${f} hand axis`).toBeLessThan(TOL);
        expect(d.x * fv.x + d.y * fv.y).toBeGreaterThan(0); // forward swing goes WITH the facing
      },
    );

    it.each(AXIS_FACINGS)(
      'facing %s: the foot strides along the facing vector (heel strike front and back)',
      (f) => {
        const ax = axisOf(f);
        const fv = facingVec(f);
        const p = makePose();
        computePose('walk', gt.cycleMs * 0.25, p, 1, P, 'on', gait); // front thigh at its forward extreme, knee straight
        const fwd = tip(legL1, legL2, p.thighFront, p.thighFront - p.kneeFront, ax);
        computePose('walk', gt.cycleMs * 0.75, p, 1, P, 'on', gait); // back extreme
        const back = tip(legL1, legL2, p.thighFront, p.thighFront - p.kneeFront, ax);
        const stride = { x: fwd.x - back.x, y: fwd.y - back.y };
        expect(offAxis(stride, fv), `${f} foot axis`).toBeLessThan(TOL);
        expect(stride.x * fv.x + stride.y * fv.y).toBeGreaterThan(0);
      },
    );
  },
);

describe('side-on facings keep the plain swing; front/back facings never swing sideways', () => {
  it('e and w: the projected rotation equals the raw swing angle', () => {
    for (const f of ['e', 'w'] as const)
      for (const a of [-0.5, -0.2, 0.3, 0.6]) expect(projectSwing(a, axisOf(f))).toBeCloseTo(-a);
  });
  it('s and n: a swung limb stays on the centre line (no sideways rotation at all)', () => {
    for (const f of ['s', 'n'] as const)
      for (const a of [-0.5, -0.2, 0.3, 0.6]) expect(projectSwing(a, axisOf(f))).toBeCloseTo(0);
  });
  it('s and n: forward swing is longer toward the camera and shorter away from it', () => {
    expect(swingLength(0.4, axisOf('s'))).toBeGreaterThan(1);
    expect(swingLength(-0.4, axisOf('s'))).toBeLessThan(1);
    expect(swingLength(0.4, axisOf('n'))).toBeLessThan(1);
  });
  it('the lengths stay inside the clamp for any swing', () => {
    for (const f of FACINGS)
      for (let a = -1.5; a <= 1.5; a += 0.1) {
        const l = swingLength(a, axisOf(f));
        expect(l).toBeGreaterThanOrEqual(0.85);
        expect(l).toBeLessThanOrEqual(1.2);
      }
  });
  it('every facing has a unit screen vector', () => {
    for (const f of FACINGS)
      expect(Math.hypot(FACING_SWING[f].x, FACING_SWING[f].y)).toBeCloseTo(1, 2);
  });
});

describe.each(['walk', 'run'] as const)(
  '%s on the diagonals: foreshortening, not a sideways swing',
  (gait) => {
    const gt = GAITS[gait];
    const armL1 = g.elbowY;
    const armL2 = g.handY;
    const legL1 = g.kneeY - g.hipY;
    const legL2 = -g.kneeY;
    const hipX = figureLegPivots(PLAYER_LOOK).hipX;
    const MAX_HAND_LATERAL = 5; // px of sideways travel over a whole cycle
    const MAX_FOOT_LATERAL = 3.5;

    function cycleTips(f: Facing8) {
      const ax = axisOf(f);
      const p = makePose();
      const hands: { x: number; y: number }[] = [];
      const feet: { x: number; y: number }[] = [];
      for (let i = 0; i < 360; i++) {
        computePose('walk', (i / 360) * gt.cycleMs, p, 1, P, 'on', gait);
        hands.push(tip(armL1, armL2, p.armUpperFront, p.armAngle, ax));
        feet.push(tip(legL1, legL2, p.thighFront, p.thighFront - p.kneeFront, ax));
      }
      return { hands, feet };
    }
    const range = (a: number[]) => Math.max(...a) - Math.min(...a);

    it.each(DIAGONALS)(
      'facing %s: sideways travel is small and the vertical swing dominates',
      (f) => {
        const { hands, feet } = cycleTips(f);
        expect(range(hands.map((t) => t.x))).toBeLessThanOrEqual(MAX_HAND_LATERAL);
        expect(range(feet.map((t) => t.x))).toBeLessThanOrEqual(MAX_FOOT_LATERAL);
        expect(range(hands.map((t) => t.y))).toBeGreaterThan(range(hands.map((t) => t.x)) * 1.3);
        expect(range(feet.map((t) => t.y))).toBeGreaterThan(range(feet.map((t) => t.x)) * 1.3);
      },
    );
    it.each(DIAGONALS)('facing %s: a hand never crosses the body centre line, nor a foot', (f) => {
      const { hands, feet } = cycleTips(f);
      // The front arm hangs from +shoulderX and the front leg from +hipX (the back ones mirror), in the facing-flipped rig.
      for (const h of hands) expect(g.shoulderX + h.x, `hand ${f}`).toBeGreaterThan(0.5);
      for (const t of feet) expect(hipX + t.x, `foot ${f}`).toBeGreaterThan(0);
    });
    it.each(DIAGONALS)('facing %s: the lateral share is the capped diagonal share', (f) => {
      expect(Math.abs(FACING_SWING[f].x)).toBeCloseTo(DIAGONAL_LATERAL_CAP);
      expect(Math.abs(FACING_SWING[f].x)).toBeLessThan(Math.abs(FACING_SWING[f].y));
      expect(Math.sign(FACING_SWING[f].y)).toBe(Math.sign(FACING_SCREEN_Y[f]));
    });
  },
);
