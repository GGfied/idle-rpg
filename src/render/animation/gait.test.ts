import { describe, expect, it } from 'vitest';
import {
  armDepthGain,
  gainedLength,
  gaitAxis,
  kneeDepthShare,
  legDepthGain,
  computePose,
  defaultGeom,
  makePose,
  projectSwing,
  swingAxis,
} from './logic';
import { GAITS } from './data';
import type { GaitKey, Pose, SwingAxis } from './types';

const P = 2400;
const DEG = Math.PI / 180;

/** Sample one full cycle of a gait, calling `fn` with the pose and the phase (0..1). */
function cycle(gait: GaitKey, fn: (p: Pose, ph: number) => void, n = 360): void {
  const g = GAITS[gait];
  const p = makePose();
  for (let i = 0; i < n; i++) {
    const ph = i / n;
    computePose('walk', ph * g.cycleMs, p, 1, P, 'on', gait);
    fn(p, ph);
  }
}
const peak = (gait: GaitKey, pick: (p: Pose) => number): number => {
  let m = 0;
  cycle(gait, (p) => (m = Math.max(m, Math.abs(pick(p)))));
  return m;
};

describe.each(['walk', 'run'] as const)('%s gait', (gait) => {
  it('arm on a side is in anti-phase with the leg on that side (contralateral)', () => {
    // Zero-lag correlation would be +1 if they swung together; arms lag a little, so test the sign
    // of the correlation and that the best-matching shift is close to half a cycle.
    let dot = 0;
    cycle(gait, (p) => (dot += p.armUpperFront * p.thighFront + p.armUpperBack * p.thighBack));
    expect(dot).toBeLessThan(0);
    // The front arm is exactly at the BACK leg's phase (plus its lag): it peaks when the back leg peaks.
    let dotCross = 0;
    cycle(gait, (p) => (dotCross += p.armUpperFront * p.thighBack));
    expect(dotCross).toBeGreaterThan(0);
  });
  it('forearm runs on the same clock as the upper arm (same zero crossings, opens only while forward)', () => {
    const g = GAITS[gait];
    expect(g.forearmLag).toBe(0);
    cycle(gait, (q) => {
      expect(Math.sign(q.armAngle)).toBe(Math.sign(q.armUpperFront));
      expect(q.armAngle - q.armUpperFront).toBeGreaterThanOrEqual(-1e-9);
    });
  });
  it('upper arm swings opposite to the same-side thigh and less than it', () => {
    // At every instant the front arm and front thigh have opposite sign except the short lag window.
    let opposite = 0;
    let n = 0;
    cycle(gait, (q) => {
      n++;
      if (q.armUpperFront * q.thighFront < 0) opposite++;
    });
    expect(opposite / n).toBeGreaterThan(0.7);
    expect(peak(gait, (q) => q.armUpperBack)).toBeLessThan(peak(gait, (q) => q.thighBack));
  });
  it('legs swing in opposition to each other', () => {
    cycle(gait, (p) => expect(p.thighFront + p.thighBack).toBeCloseTo(0));
  });
  it('upper arms swing less than thighs', () => {
    const thigh = peak(gait, (p) => p.thighFront);
    expect(peak(gait, (p) => p.armUpperFront)).toBeLessThan(thigh);
  });
  it('each arm is in sync with the OPPOSITE leg: same peak frame, same zero crossings (phase difference 0)', () => {
    const N = 720;
    const front: number[] = [];
    const back: number[] = [];
    const thighF: number[] = [];
    const thighB: number[] = [];
    const g = GAITS[gait];
    const p = makePose();
    for (let i = 0; i < N; i++) {
      computePose('walk', (i / N) * g.cycleMs, p, 1, P, 'on', gait);
      front.push(p.armUpperFront);
      back.push(p.armUpperBack);
      thighF.push(p.thighFront);
      thighB.push(p.thighBack);
    }
    const argmax = (a: number[]) => a.indexOf(Math.max(...a));
    const rising = (a: number[]) => a.findIndex((v, i) => v >= 0 && a[(i + N - 1) % N]! < 0);
    expect(Math.abs(argmax(front) - argmax(thighB))).toBeLessThanOrEqual(1);
    expect(Math.abs(argmax(back) - argmax(thighF))).toBeLessThanOrEqual(1);
    expect(Math.abs(rising(front) - rising(thighB))).toBeLessThanOrEqual(1);
    expect(Math.abs(rising(back) - rising(thighF))).toBeLessThanOrEqual(1);
    // Never a quarter cycle apart: arm and opposite leg are proportional sample by sample.
    for (let i = 0; i < N; i++) expect(front[i]! * thighB[i]!).toBeGreaterThanOrEqual(-1e-12);
  });
  it('the sync holds under tick interpolation (late/jittered frame times keep the relation)', () => {
    const g = GAITS[gait];
    const p = makePose();
    for (const t of [0, 599, 600, 1200, 1801, 5000.5, 123456]) {
      computePose('walk', t, p, 1, P, 'on', gait);
      expect(Math.sign(p.armUpperFront)).toBe(Math.sign(p.thighBack));
      expect(Math.sign(p.armUpperBack)).toBe(Math.sign(p.thighFront));
      expect(g.armLag).toBe(0);
    }
  });
  it('knee bends only on the swing leg, straight at heel strike and in stance', () => {
    cycle(gait, (p) => {
      expect(p.kneeFront).toBeGreaterThanOrEqual(0);
      expect(p.kneeBack).toBeGreaterThanOrEqual(0);
      // never both bent
      expect(p.kneeFront * p.kneeBack).toBeCloseTo(0);
    });
    const g = GAITS[gait];
    const p = makePose();
    computePose('walk', 0, p, 1, P, 'on', gait); // front leg passing under the body, swinging
    expect(p.kneeFront).toBeCloseTo(g.kneeDeg * DEG);
    expect(p.kneeBack).toBe(0);
    computePose('walk', g.cycleMs * 0.25, p, 1, P, 'on', gait); // front heel strike
    expect(p.kneeFront).toBeCloseTo(0);
    expect(p.thighFront).toBeGreaterThan(0);
    computePose('walk', g.cycleMs * 0.75, p, 1, P, 'on', gait); // front leg back, in stance
    expect(p.kneeFront).toBe(0);
  });
  it('bobs twice per cycle, lowest at each foot contact', () => {
    const g = GAITS[gait];
    let lows = 0;
    const ys: number[] = [];
    cycle(gait, (p) => ys.push(p.bodyBobY));
    for (let i = 0; i < ys.length; i++) {
      const prev = ys[(i + ys.length - 1) % ys.length]!;
      const next = ys[(i + 1) % ys.length]!;
      if (ys[i]! > prev && ys[i]! >= next) lows++; // y grows downward: a local maximum is the lowest point
    }
    expect(lows).toBe(2);
    const p = makePose();
    computePose('walk', g.cycleMs * 0.25, p, 1, P, 'on', gait);
    expect(p.bodyBobY).toBeCloseTo(0); // contact = lowest
    computePose('walk', 0, p, 1, P, 'on', gait);
    expect(p.bodyBobY).toBeCloseTo(-g.bobPx);
  });
});

describe('run vs walk and other states', () => {
  it('run keeps the relations but is faster, bigger, leans more and bends the knee more', () => {
    expect(GAITS.run.cycleMs).toBeLessThan(GAITS.walk.cycleMs);
    for (const k of ['thighDeg', 'kneeDeg', 'armDeg', 'elbowDeg', 'bobPx', 'leanDeg'] as const)
      expect(GAITS.run[k]).toBeGreaterThan(GAITS.walk[k]);
    expect(GAITS.run.armDeg).toBeLessThan(GAITS.run.thighDeg);
  });
  it('idle has no limb swing, only a tiny breathing bob', () => {
    const p = makePose();
    for (const t of [0, 700, 1400, 2100]) {
      computePose('idle', t, p);
      expect([
        p.thighFront,
        p.thighBack,
        p.kneeFront,
        p.kneeBack,
        p.armAngle,
        p.armAngleBack,
      ]).toEqual([0, 0, 0, 0, 0, 0]);
      expect(Math.abs(p.bodyBobY)).toBeLessThan(0.5);
    }
  });
  it('chop starts planted: legs straight at the ready pose', () => {
    const p = computePose('chop', 0, makePose());
    expect([p.thighFront, p.thighBack, p.kneeFront, p.kneeBack]).toEqual([0, 0, 0, 0]);
  });
  it('reduced walks gently (half amplitude); reduced and off idle perfectly still', () => {
    const on = computePose('walk', 130, makePose(), 1, P, 'on', 'run');
    const red = computePose('walk', 130, makePose(), 1, P, 'reduced', 'run');
    expect(red.thighFront).toBeCloseTo(on.thighFront * 0.5, 9);
    expect(Math.abs(red.thighFront)).toBeGreaterThan(0.05);
    for (const mode of ['reduced', 'off'] as const) {
      expect(Math.abs(computePose('idle', 700, makePose(), 1, P, mode).bodyBobY)).toBe(0);
    }
    for (const mode of ['off'] as const) {
      const p = computePose('walk', 130, makePose(), 1, P, mode, 'run');
      expect(
        Object.values(p)
          .filter((v) => typeof v === 'number')
          .every((v) => Math.abs(v as number) < 1e-9),
      ).toBe(true);
      expect(Math.abs(computePose('idle', 700, makePose(), 1, P, mode).bodyBobY)).toBe(0);
    }
  });
});

/** Screen-y of a limb tip chain (art px, + = down) for the given absolute forward angles, as the animator draws it. */
function tipY(angles: number[], lens: number[], ax: SwingAxis, gain: number): number {
  let y = 0;
  angles.forEach((a, i) => {
    y += lens[i]! * gainedLength(a, ax, gain) * Math.cos(projectSwing(a, ax));
  });
  return y;
}
function corr(a: number[], b: number[]): number {
  const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
  const [ma, mb] = [m(a), m(b)];
  let n = 0;
  let da = 0;
  let db = 0;
  a.forEach((v, i) => {
    n += (v - ma) * (b[i]! - mb);
    da += (v - ma) ** 2;
    db += (b[i]! - mb) ** 2;
  });
  return n / Math.sqrt(da * db);
}

describe('arm swing toward / away from the camera (n, s)', () => {
  const geom = defaultGeom();
  const armLens = [geom.elbowY, geom.handY - geom.elbowY];
  const legLens = [geom.kneeY - geom.hipY, geom.kneeY - geom.hipY];
  function sample(gait: GaitKey, facing: 'n' | 's') {
    const face: SwingAxis = { x: 0, y: 0 };
    swingAxis(facing, face);
    const ax = gaitAxis(gait, face, { x: 0, y: 0 });
    const gain = armDepthGain(gait, face);
    const legGain = legDepthGain(gait, face);
    const knee = kneeDepthShare(gait, face);
    const p = makePose();
    const hand: number[] = [];
    const foot: number[] = [];
    // What qa's gaitB measures: the forearm and shin vectors (elbow/knee to the point 6 px down), screen length.
    const foreVec: number[] = [];
    const shinVec: number[] = [];
    const sign = facing === 'n' ? -1 : 1;
    for (let i = 0; i < 360; i++) {
      computePose('walk', (i / 360) * GAITS[gait].cycleMs, p, 1, P, 'on', gait);
      hand.push(tipY([p.armUpperFront, p.armAngle], armLens, ax, gain));
      foot.push(tipY([p.thighBack, p.thighBack - p.kneeBack * knee], legLens, ax, legGain));
      foreVec.push(sign * 6 * gainedLength(p.armAngle, ax, gain));
      shinVec.push(sign * 6 * gainedLength(p.thighBack - p.kneeBack * knee, ax, legGain));
    }
    return { hand, foot, foreVec, shinVec };
  }
  const range = (a: number[]) => Math.max(...a) - Math.min(...a);

  it.each(['n', 's'] as const)(
    'run %s: arm follows the opposite leg (>= 0.8) and visibly swings',
    (f) => {
      const { hand, foot } = sample('run', f);
      expect(corr(hand, foot)).toBeGreaterThan(0.8);
      expect(range(hand)).toBeGreaterThan(4);
    },
  );
  it.each(['n', 's'] as const)(
    'run %s: the forearm vector follows the opposite shin vector (>= 0.8) and swings >= 2.7 art px',
    (f) => {
      const { foreVec, shinVec } = sample('run', f);
      expect(corr(foreVec, shinVec)).toBeGreaterThanOrEqual(0.8);
      expect(range(foreVec) * 6).toBeGreaterThanOrEqual(2.7);
    },
  );
  it('run leg swings > 2.4 art px at n (it was 1.6 before the depth shaping)', () => {
    const { shinVec } = sample('run', 'n');
    expect(range(shinVec) * 6).toBeGreaterThan(2.4);
  });
  it('walk is unchanged: no depth shaping, side-on or not', () => {
    for (const k of ['armDepth', 'depthSwing', 'kneeDepth', 'legDepth'] as const)
      expect(GAITS.walk[k]).toBe(1);
    for (const f of ['n', 's', 'e', 'ne'] as const) {
      const ax = swingAxis(f, { x: 0, y: 0 });
      expect(armDepthGain('walk', ax)).toBe(1);
      expect(legDepthGain('walk', ax)).toBe(1);
      expect(kneeDepthShare('walk', ax)).toBe(1);
      expect(gaitAxis('walk', ax, { x: 0, y: 0 })).toEqual(ax);
    }
  });
  it('run diagonals get no depth shaping (their sideways travel must stay within the cap)', () => {
    for (const f of ['ne', 'nw', 'se', 'sw', 'e', 'w'] as const) {
      const ax = swingAxis(f, { x: 0, y: 0 });
      expect(armDepthGain('run', ax)).toBe(1);
      expect(legDepthGain('run', ax)).toBe(1);
      expect(kneeDepthShare('run', ax)).toBe(1);
      expect(gaitAxis('run', ax, { x: 0, y: 0 })).toEqual(ax);
    }
  });
  it('run boost is off side-on and on the diagonals, full facing the camera', () => {
    const ax: SwingAxis = { x: 0, y: 0 };
    expect(armDepthGain('run', swingAxis('e', ax))).toBe(1);
    expect(armDepthGain('run', swingAxis('n', ax))).toBeCloseTo(GAITS.run.armDepth);
    expect(armDepthGain('run', swingAxis('s', ax))).toBeCloseTo(GAITS.run.armDepth);
    expect(armDepthGain('run', swingAxis('ne', ax))).toBe(1);
  });
  it('the boost enlarges the on-screen arm swing at n versus no boost', () => {
    const boosted = sample('run', 'n');
    const ax: SwingAxis = { x: 0, y: 0 };
    swingAxis('n', ax);
    const p = makePose();
    const plain: number[] = [];
    for (let i = 0; i < 360; i++) {
      computePose('walk', (i / 360) * GAITS.run.cycleMs, p, 1, P, 'on', 'run');
      plain.push(tipY([p.armUpperFront, p.armAngle], armLens, ax, 1));
    }
    expect(range(boosted.hand)).toBeGreaterThan(range(plain) * 1.3);
  });
});
