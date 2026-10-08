import { describe, expect, it } from 'vitest';
import { computePose, defaultGeom, makePose, nextAnimState } from './logic';
import { actPhase } from './act';
import { handFromAngles } from './chop';
import {
  ACT_KEYS,
  ACT_PLAN,
  COOK_KEYS,
  GATHER_STATE_BY_TOOL,
  LIGHT_KEYS,
  LIGHT_TICKS,
  TICKS_PER_COOK,
  TICK_MS,
  TWIST_NARROW,
} from './data';
import type { ActKey } from './data';
import type { Pose } from './types';

const g = defaultGeom();
const LP = LIGHT_TICKS * TICK_MS;
const CP = TICKS_PER_COOK * TICK_MS;
const light = (phase: number, mode: 'on' | 'reduced' | 'off' = 'on', reach = 1) =>
  computePose('lighting', phase * LP, makePose(), 1, LP, mode, 'walk', g, { reach });
const cook = (phase: number, mode: 'on' | 'reduced' | 'off' = 'on', reach = 1) =>
  computePose('cooking', phase * CP, makePose(), 1, CP, mode, 'walk', g, { reach });

/** Hand positions in the torso frame (x forward, y down from the shoulder line), by forward kinematics of the pose. */
function hands(p: Pose) {
  const sx = g.shoulderX * (1 - TWIST_NARROW * p.twist);
  const f = handFromAngles(g, p.armUpperFront, p.armAngle, { x: 0, y: 0 });
  const b = handFromAngles(g, p.armUpperBack, p.armAngleBack, { x: 0, y: 0 });
  return { front: { x: sx + f.x, y: f.y }, back: { x: -sx + b.x, y: b.y } };
}

describe('lighting and cooking states', () => {
  it('map tool kinds to states; walking beats them; unknown kinds do not start one', () => {
    expect(GATHER_STATE_BY_TOOL['lighting']).toBe('lighting');
    expect(GATHER_STATE_BY_TOOL['cooking']).toBe('cooking');
    const base = { moving: false, gathering: true };
    expect(nextAnimState('idle', { ...base, toolKind: 'lighting' })).toBe('lighting');
    expect(nextAnimState('idle', { ...base, toolKind: 'cooking' })).toBe('cooking');
    expect(nextAnimState('lighting', { ...base, moving: true, toolKind: 'lighting' })).toBe('walk');
    expect(nextAnimState('lighting', { ...base, toolKind: 'bogus' })).toBe('idle');
    expect(
      nextAnimState('lighting', { moving: false, gathering: false, toolKind: 'lighting' }),
    ).toBe('idle');
  });
  it('timings come from the tick counts (lighting 3 ticks, cooking 4)', () => {
    expect(ACT_PLAN.lighting.periodMs).toBe(1800);
    expect(ACT_PLAN.cooking.periodMs).toBe(2400);
  });
  it('lighting plays once and holds its last pose; cooking loops', () => {
    expect(actPhase('lighting', LP * 0.5)).toBeCloseTo(0.5, 9);
    expect(actPhase('lighting', LP * 3)).toBe(1);
    expect(actPhase('lighting', -50)).toBe(0);
    expect(actPhase('cooking', CP * 1.25)).toBeCloseTo(1.25, 9);
    const a = cook(0.4);
    const b = cook(1.4);
    expect(b.armAngle).toBeCloseTo(a.armAngle, 9);
    expect(b.bodyBobY).toBeCloseTo(a.bodyBobY, 9);
  });
});

describe('lighting pose', () => {
  it('starts and ends standing with the arms hanging (matches idle, so nothing snaps)', () => {
    for (const ph of [0, 1, 2]) {
      const p = light(ph);
      expect(p.bodyBobY).toBe(0);
      expect(p.thighFront).toBe(0);
      expect(p.kneeBack).toBe(0);
      expect(p.lean).toBe(0);
      expect(Math.abs(p.armUpperFront)).toBeLessThan(5e-3);
      expect(Math.abs(p.armAngleBack)).toBeLessThan(5e-3);
    }
  });
  it('kneels: hips down, front knee bent, back knee on the ground (shin folded back), leaning forward', () => {
    const p = light(0.4);
    expect(p.bodyBobY).toBeGreaterThan(5); // hips drop over half the leg height
    expect(p.bodyBobY).toBeGreaterThanOrEqual(0.5 * -g.hipY);
    expect(p.lean).toBeGreaterThan(0.45); // ~26 deg+: torso clearly toward the logs
    expect(p.kneeFront).toBeGreaterThan(1);
    expect(p.kneeBack).toBeGreaterThan(1.3);
    expect(Math.abs(p.thighBack)).toBeLessThan(0.3);
    expect(p.lean).toBeGreaterThan(0.2);
    expect(p.armsSolved).toBe(true);
    expect(p.axeVisible).toBe(false);
  });
  it('stands back up at the end: hips rise monotonically after the last stroke', () => {
    let prev = Infinity;
    for (let ph = 0.8; ph <= 1.0001; ph += 0.02) {
      const d = light(Math.min(1, ph)).bodyBobY;
      expect(d).toBeLessThanOrEqual(prev + 1e-9);
      prev = d;
    }
    expect(prev).toBe(0);
  });
  it('the front hand holds the box low and still; the back hand strikes it four times', () => {
    const ys: number[] = [];
    for (let ph = 0.2; ph <= 0.78; ph += 0.005) {
      const h = hands(light(ph));
      expect(h.front.y).toBeGreaterThan(8.5); // held low and forward at the logs
      expect(h.front.y).toBeLessThan(9.5);
      ys.push(h.back.y);
    }
    const lowest = Math.min(...ys);
    const highest = Math.max(...ys);
    const mid = (lowest + highest) / 2;
    let strokes = 0; // upward crossings of the mid height = strikes landing
    for (let i = 1; i < ys.length; i++) if (ys[i - 1]! < mid && ys[i]! >= mid) strokes++;
    expect(strokes).toBe(4);
    expect(highest - lowest).toBeGreaterThan(4); // short but visible strokes
    const cock = hands(light(0.34)).back;
    const hit = hands(light(0.42)).back;
    const box = hands(light(0.42)).front;
    expect(hit.y).toBeGreaterThan(cock.y + 4);
    expect(Math.hypot(hit.x - box.x, hit.y - box.y)).toBeLessThan(3); // the striking hand lands on the box
  });
  it('the back elbow stays below the shoulder and the upper arm within 25 deg of straight down in the world, every phase and view', () => {
    const DEG = Math.PI / 180;
    let kneelingSeen = 0;
    let worst = 0;
    for (const reach of [1, 0.5]) {
      // Every key phase exactly (the cock / hit extremes) plus a fine sweep between them.
      const phases = [...LIGHT_KEYS.swing.map((k) => k.phase)];
      for (let ph = 0; ph <= 1.0001; ph += 0.005) phases.push(Math.min(1, ph));
      for (const ph of phases) {
        const p = light(ph, 'on', reach);
        // World angle from straight down = torso-frame angle minus the lean (forward positive).
        const wb = p.armUpperBack - p.lean;
        const wf = p.armUpperFront - p.lean;
        worst = Math.max(worst, Math.abs(wb));
        expect(Math.abs(wb)).toBeLessThanOrEqual(25 * DEG + 1e-9);
        expect(g.elbowY * Math.cos(wb)).toBeGreaterThanOrEqual(5); // back elbow at least 5 px below its shoulder
        expect(g.elbowY * Math.cos(wf)).toBeGreaterThanOrEqual(5); // and the front one
        if (p.kneeBack > 1) kneelingSeen++;
      }
    }
    expect(kneelingSeen).toBeGreaterThan(100);
    expect(worst).toBeGreaterThan(5 * DEG); // the arm does move: this is not passing by being frozen
  });
  it('a back-hand target that would swing the upper arm out like a wing is clamped to the torso', () => {
    // Pin the clamp itself: feed a key whose back hand sits far up and forward (IK alone puts the upper arm near horizontal).
    const keys = ACT_KEYS.lighting as unknown as Record<string, readonly ActKey[]>;
    const saved = keys['static']!;
    const wild: ActKey = { ...LIGHT_KEYS.swing[1]!, bx: 14, by: 1, lean: 32 };
    try {
      keys['static'] = [wild];
      const p = computePose('lighting', 0, makePose(), 1, LP, 'off', 'walk', g, { reach: 1 });
      // Literal 25 deg (not ACT_ARMS) so widening the clamp in data fails here.
      expect(Math.abs(p.armUpperBack - p.lean)).toBeLessThanOrEqual((25 * Math.PI) / 180);
    } finally {
      keys['static'] = saved;
    }
  });
  it('reduced holds one kneeling pose, off stands still with the box held', () => {
    const r0 = light(0.1, 'reduced');
    const r1 = light(0.7, 'reduced');
    expect(r1.armAngleBack).toBe(r0.armAngleBack);
    expect(r1.bodyBobY).toBeGreaterThan(4);
    const o = light(0.5, 'off');
    expect(o.bodyBobY).toBe(0);
    expect(o.kneeBack).toBe(0);
  });
  it('a back view foreshortens the sideways reach', () => {
    expect(Math.abs(light(0.42, 'on', 0.5).gripX)).toBeCloseTo(
      Math.abs(light(0.42).gripX) * 0.5,
      9,
    );
  });
  it('key phases ascend and span 0..1', () => {
    const ph = LIGHT_KEYS.swing.map((k) => k.phase);
    expect(ph[0]).toBe(0);
    expect(ph.at(-1)).toBe(1);
    for (let i = 1; i < ph.length; i++) expect(ph[i]!).toBeGreaterThan(ph[i - 1]!);
  });
});

describe('cooking pose', () => {
  it('crouches facing the fire with the forward arm extended and the food held out over the flames', () => {
    const p = cook(0.1);
    const h = hands(p);
    expect(p.bodyBobY).toBeGreaterThan(1.5);
    expect(p.lean).toBeGreaterThan(0.1);
    expect(h.front.x).toBeGreaterThan(14); // arm reaches well forward of the shoulder (x 6)
    expect(Math.hypot(h.front.x - 6, h.front.y)).toBeGreaterThan(11); // nearly straight
    expect(p.axeAngle).toBeLessThan(-0.9); // skewer points forward-down
    expect(p.armsSolved).toBe(true);
  });
  it('bobs and turns slowly while holding, hand within a couple of px', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let turn = 0;
    for (let ph = 0; ph <= 0.58; ph += 0.01) {
      const p = cook(ph);
      const y = hands(p).front.y;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
      turn = Math.max(turn, Math.abs(p.axeAngle - cook(0).axeAngle));
    }
    expect(hi - lo).toBeGreaterThan(0.8);
    expect(hi - lo).toBeLessThan(2.5);
    expect(turn).toBeGreaterThan(0.05);
  });
  it('holds the hand over the flame (fire one tile ahead): hardcoded reach and height window', () => {
    for (const ph of [0, 0.12, 0.25, 0.37, 0.5, 0.58]) {
      const h = hands(cook(ph)).front;
      expect(h.x).toBeGreaterThan(17); // beyond the shoulder (x 6) by well over an arm segment: over the near flame edge
      expect(h.x).toBeLessThan(23); // but inside the reach, not a stretched arm
      expect(h.y).toBeGreaterThan(5);
      expect(h.y).toBeLessThan(12);
    }
  });
  it('pokes the food into the flames once per tick: the hand dips and the skewer turns, amplitude well above zero', () => {
    for (const [hold, poke] of [
      [0, 0.12],
      [0.25, 0.37],
      [0.5, 0.58],
    ] as const) {
      const a = cook(hold);
      const b = cook(poke);
      expect(hands(b).front.y - hands(a).front.y).toBeGreaterThan(1);
      expect(a.axeAngle - b.axeAngle).toBeGreaterThan(0.15);
      expect(b.bodyBobY).toBeGreaterThan(a.bodyBobY);
    }
  });
  it('the food points forward of the hand (over the flame), not back at the body', () => {
    for (const ph of [0, 0.12, 0.58]) expect(-Math.sin(cook(ph).axeAngle)).toBeGreaterThan(0.6);
  });
  it('lifts the food up and in to check it, then returns', () => {
    const held = hands(cook(0.4)).front;
    const check = hands(cook(0.78)).front;
    expect(check.y).toBeLessThan(held.y - 5);
    expect(check.x).toBeLessThan(held.x - 3);
    const back = hands(cook(0.95)).front;
    expect(Math.abs(back.y - hands(cook(0)).front.y)).toBeLessThan(0.7);
  });
  it('the other hand stays down; reduced and off do not move', () => {
    expect(hands(cook(0.78)).back.y).toBeGreaterThan(10);
    expect(cook(0.2, 'reduced').armAngle).toBe(cook(0.8, 'reduced').armAngle);
    expect(cook(0.2, 'off').armAngle).toBe(cook(0.8, 'off').armAngle);
    expect(cook(0.2, 'off').bodyBobY).toBe(0);
  });
  it('key phases ascend and span 0..1', () => {
    const ph = COOK_KEYS.swing.map((k) => k.phase);
    expect(ph[0]).toBe(0);
    expect(ph.at(-1)).toBe(1);
    for (let i = 1; i < ph.length; i++) expect(ph[i]!).toBeGreaterThan(ph[i - 1]!);
  });
});

describe('other states still do not claim solved arms', () => {
  it('walk and idle leave armsSolved false', () => {
    expect(computePose('walk', 100, makePose()).armsSolved).toBe(false);
    expect(computePose('idle', 0, makePose()).armsSolved).toBe(false);
  });
});
