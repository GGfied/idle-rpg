import { describe, expect, it } from 'vitest';
import { computePose, makePose } from './logic';
import { GAITS } from './data';
import type { GaitKey, Pose } from './types';

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
  it('forearm lags the upper arm by forearmLag of a cycle', () => {
    const g = GAITS[gait];
    const p = makePose();
    const at = (ph: number) => {
      computePose('walk', (((ph % 1) + 1) % 1) * g.cycleMs, p, 1, P, 'on', gait);
      return p.armUpperFront;
    };
    // fore(t) tracks upper(t - lag): correlate against the lagged and the unlagged upper arm.
    let lagged = 0;
    let unlagged = 0;
    const foreAt = (ph: number) => {
      computePose('walk', ph * g.cycleMs, p, 1, P, 'on', gait);
      return p.armAngle;
    };
    for (let i = 0; i < 360; i++) {
      const ph = i / 360;
      const f = foreAt(ph);
      lagged += f * at(ph - g.forearmLag);
      unlagged += f * at(ph);
    }
    expect(g.forearmLag).toBeGreaterThan(0);
    expect(lagged).toBeGreaterThan(unlagged);
    // and the forearm swing is never behind the elbow flex: relative bend only opens while forward
    cycle(gait, (q) =>
      expect(q.armAngle - q.armUpperFront).toBeGreaterThanOrEqual(-g.armDeg * DEG),
    );
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
  it('arm trails the opposite leg by armLag of a cycle', () => {
    const g = GAITS[gait];
    const p = makePose();
    // front arm = sin(a + pi - lag): zero crossing (rising) when a = lag*2pi - pi + 2pi
    const t = ((g.armLag * 2 * Math.PI + Math.PI) / (2 * Math.PI)) * g.cycleMs;
    computePose('walk', t % g.cycleMs, p, 1, P, 'on', gait);
    expect(p.armUpperFront).toBeCloseTo(0, 5);
    expect(g.armLag).toBeGreaterThanOrEqual(0.05);
    expect(g.armLag).toBeLessThanOrEqual(0.1);
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
  it('chop holds the back arm straight (no elbow flex)', () => {
    const p = computePose('chop', 500, makePose());
    expect(p.armAngleBack).toBe(p.armUpperBack);
  });
  it('chop keeps legs planted', () => {
    const p = computePose('chop', 500, makePose());
    expect([p.thighFront, p.thighBack, p.kneeFront, p.kneeBack, p.lean]).toEqual([0, 0, 0, 0, 0]);
  });
  it('reduced and off mode: everything still, including breathing', () => {
    for (const mode of ['reduced', 'off'] as const) {
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
