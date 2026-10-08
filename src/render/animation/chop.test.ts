import { describe, expect, it } from 'vitest';
import { computePose, defaultGeom, makePose } from './logic';
import { ELBOW_BLEND_HAND_DRIFT_PX, handFromAngles, handGapAt, solveArm } from './chop';
import {
  AXE_HAND_GAP,
  BACK_VIEW_SWING_REACH,
  CHOP_KEYS,
  CHOP_SWING_PERIOD_MS,
  ELBOW_TUCK_MIN_Y,
  SWING_IMPACT_PHASE,
  TWIST_NARROW,
} from './data';
import type { Pose } from './types';

const P = CHOP_SWING_PERIOD_MS;
const DEG = Math.PI / 180;
const g = defaultGeom();
/** Hands and elbows in the torso frame (x forward, y down, origin between the shoulders). */
function limbs(p: Pose) {
  const sx = g.shoulderX * (1 - TWIST_NARROW * p.twist);
  const f = handFromAngles(g, p.armUpperFront, p.armAngle, { x: 0, y: 0 });
  const b = handFromAngles(g, p.armUpperBack, p.armAngleBack, { x: 0, y: 0 });
  const elbow = (sx0: number, u: number) => ({
    x: sx0 + g.elbowY * Math.sin(u),
    y: g.elbowY * Math.cos(u),
  });
  return {
    lead: { x: sx + f.x, y: f.y },
    rear: { x: -sx + b.x, y: b.y },
    elbowFront: elbow(sx, p.armUpperFront),
    elbowBack: elbow(-sx, p.armUpperBack),
    head: { x: -Math.sin(p.axeAngle), y: Math.cos(p.axeAngle) },
  };
}
const at = (phase: number, reach = 1) =>
  computePose('chop', phase * P, makePose(), 1, P, 'on', 'walk', g, { reach });

const PHASES = Array.from({ length: 101 }, (_, i) => i / 100);
const KEY_PHASES = [...CHOP_KEYS.swing.map((k) => k.phase), SWING_IMPACT_PHASE, 0.3, 0.6];

describe.each([
  ['front', 1],
  ['back', BACK_VIEW_SWING_REACH],
])('two-handed grip, %s view', (_name, reach) => {
  // The back view hides the arms and the axe follows the grip target, so the arm FK only has to match in front.
  const drawn = reach === 1;
  it.skipIf(!drawn)('both hands sit on the handle line at every keyframe and between them', () => {
    for (const ph of [...KEY_PHASES, ...PHASES]) {
      const p = at(ph, reach);
      const { lead, rear, head } = limbs(p);
      const dx = rear.x - lead.x;
      const dy = rear.y - lead.y;
      const across = dx * head.y - dy * head.x; // distance from the handle line through the lead hand
      const along = dx * head.x + dy * head.y; // position of the rear hand along it (towards the butt = negative)
      expect(Math.abs(across), `off the handle @${ph}`).toBeLessThan(
        KEY_PHASES.includes(ph) ? 0.25 : ELBOW_BLEND_HAND_DRIFT_PX,
      );
      const gap = handGapAt('swing', ph);
      const tol = KEY_PHASES.includes(ph) ? 0.25 : ELBOW_BLEND_HAND_DRIFT_PX;
      expect(Math.abs(along + gap), `rear hand gap @${ph}`).toBeLessThan(tol);
    }
  });
  it('at impact the head is below the hands and the cutting edge faces down', () => {
    const p = at(SWING_IMPACT_PHASE, reach);
    const { head } = limbs(p);
    expect(head.y).toBeGreaterThan(0.2); // head on the lower side of the handle
    // The blade sits on the leading (-x local) side; its world direction is (-cos, -sin).
    const edgeY = -Math.sin(p.axeAngle);
    expect(edgeY).toBeGreaterThan(0.2);
  });
});

describe('wind-up: two distinct fists on the handle, both above the shoulders', () => {
  it('the hands are spread along the handle (>= 8 px) and both above the shoulders', () => {
    for (const ph of [0.44, 0.5, 0.54]) {
      const { lead, rear, head } = limbs(at(ph));
      const dx = rear.x - lead.x;
      const dy = rear.y - lead.y;
      expect(Math.abs(dx * head.y - dy * head.x), `off the handle @${ph}`).toBeLessThan(0.25);
      expect(-(dx * head.x + dy * head.y), `fist spacing @${ph}`).toBeGreaterThanOrEqual(8);
      expect(lead.y).toBeLessThan(0);
      expect(rear.y).toBeLessThan(0);
    }
  });
  it('the lean stays within 12 degrees', () => {
    for (const ph of PHASES) expect(Math.abs(at(ph).lean)).toBeLessThanOrEqual(12 * DEG + 1e-9);
  });
});

describe('impact pose in the front view: a V of nearly straight arms, hands together and low', () => {
  const p = at(SWING_IMPACT_PHASE);
  const { lead, rear, elbowFront, elbowBack } = limbs(p);
  it('both hands are together on the handle, low in front of the body', () => {
    expect(Math.hypot(lead.x - rear.x, lead.y - rear.y)).toBeCloseTo(AXE_HAND_GAP, 0);
    expect(lead.y).toBeGreaterThan(g.hipY - g.kneeY + 10); // below the chest, at belt height
    expect(Math.abs(lead.x)).toBeLessThan(g.shoulderX); // in front of the body, not beside it
  });
  it('the arms converge from the two shoulders (V) and are nearly straight', () => {
    expect(lead.x).toBeLessThan(g.shoulderX);
    expect(rear.x).toBeGreaterThan(-g.shoulderX);
    expect(Math.hypot(lead.x - g.shoulderX, lead.y)).toBeGreaterThan(0.85 * (g.elbowY + g.handY));
  });
  it('the elbows stay inside the body silhouette (no arm poking outside the shoulders)', () => {
    expect(elbowFront.x).toBeLessThan(g.shoulderX + 1.5);
    expect(elbowBack.x).toBeGreaterThan(-g.shoulderX - 1.5);
    expect(elbowFront.x).toBeGreaterThan(-g.shoulderX);
  });
  it('each forearm bends forward at the elbow, except a low grip that tucks the elbow inward', () => {
    for (const ph of PHASES) {
      const q = at(ph);
      const { lead, rear } = limbs(q);
      if (lead.y < ELBOW_TUCK_MIN_Y)
        expect(q.armAngle - q.armUpperFront).toBeGreaterThanOrEqual(-1e-9);
      if (rear.y < ELBOW_TUCK_MIN_Y)
        expect(q.armAngleBack - q.armUpperBack).toBeGreaterThanOrEqual(-1e-9);
    }
  });
});

describe('body movement', () => {
  it('winds up overhead: axe raised above the head, leaning back, rising, shoulders turned', () => {
    const top = at(0.5);
    const { lead, head } = limbs(top);
    expect(lead.y).toBeLessThan(-g.elbowY * 0.5); // hands above the shoulders
    expect(head.y).toBeLessThan(-0.7); // head up in the air
    expect(top.lean).toBeLessThan(0);
    expect(top.bodyBobY).toBeLessThan(0);
    expect(top.twist).toBeGreaterThan(0.9);
  });
  it('leans and twists into the strike: forward at impact, shoulders back to square', () => {
    const hit = at(SWING_IMPACT_PHASE);
    expect(hit.lean).toBeGreaterThan(7 * DEG);
    expect(hit.lean).toBeLessThanOrEqual(12 * DEG); // a lean, not a topple
    for (const ph of PHASES) expect(Math.abs(at(ph).lean)).toBeLessThanOrEqual(12 * DEG);
    expect(hit.twist).toBeLessThan(0.05);
  });
  it('dips the knees at impact with the feet staying on the ground', () => {
    const hit = at(SWING_IMPACT_PHASE);
    expect(hit.bodyBobY).toBeGreaterThan(0.3);
    expect(hit.kneeFront).toBeGreaterThan(0.2);
    expect(hit.kneeBack).toBeCloseTo(hit.kneeFront);
    // foot = hip + thigh + shin, forward-positive thigh t and shin t - knee, must land under the hip at the drop.
    const l1 = g.kneeY - g.hipY;
    const l2 = -g.kneeY;
    const t = hit.thighFront;
    const footX = l1 * Math.sin(t) + l2 * Math.sin(t - hit.kneeFront);
    const footY = l1 * Math.cos(t) + l2 * Math.cos(t - hit.kneeFront);
    expect(footX).toBeCloseTo(0, 3);
    expect(footY).toBeCloseTo(l1 + l2 - hit.bodyBobY, 3);
  });
  it('recoils after the hit (body overshoots, axe bites back) and settles before the next swing', () => {
    const hit = at(SWING_IMPACT_PHASE);
    const recoil = at(0.74);
    const settled = at(0.97);
    expect(recoil.lean).toBeGreaterThan(hit.lean);
    expect(recoil.bodyBobY).toBeGreaterThan(hit.bodyBobY);
    expect(settled.lean).toBeLessThan(hit.lean);
    expect(settled.bodyBobY).toBeLessThan(hit.bodyBobY);
  });
  it('the cycle loops: phase 1 equals phase 0 and the impact stays on the chop event phase', () => {
    const a = at(0);
    const b = at(1);
    expect(b.lean).toBeCloseTo(a.lean);
    expect(b.axeAngle).toBeCloseTo(a.axeAngle);
    expect(CHOP_KEYS.swing.some((k) => k.phase === SWING_IMPACT_PHASE)).toBe(true);
  });
  it('never snaps: every step of 1/200 cycle moves the axe and the hands by a small amount', () => {
    let prev = limbs(at(0));
    for (let i = 1; i <= 200; i++) {
      const cur = limbs(at(i / 200));
      expect(Math.hypot(cur.lead.x - prev.lead.x, cur.lead.y - prev.lead.y)).toBeLessThan(2.5);
      prev = cur;
    }
  });
});

describe('Animations Off and reduced', () => {
  it('off: one static pose, identical in every view and phase', () => {
    const ref = computePose('chop', 0, makePose(), 1, P, 'off', 'walk', g, { reach: 1 });
    for (const reach of [1, BACK_VIEW_SWING_REACH])
      for (const ph of PHASES) {
        const q = computePose('chop', ph * P, makePose(), 1, P, 'off', 'walk', g, { reach });
        expect(q).toEqual(ref);
      }
    expect(ref.lean).toBe(0);
    expect(ref.bodyBobY).toBe(0);
  });
  it('reduced: a two-frame tap with no bob/twist/knee movement and both hands still on the handle', () => {
    for (const ph of PHASES) {
      const q = computePose('chop', ph * P, makePose(), 1, P, 'reduced', 'walk', g, { reach: 1 });
      expect([q.bodyBobY, q.twist, q.kneeFront]).toEqual([0, 0, 0]);
      const { lead, rear, head } = limbs(q);
      expect(Math.abs((rear.x - lead.x) * head.y - (rear.y - lead.y) * head.x)).toBeLessThan(0.25);
    }
  });
});

describe.each(['chop', 'mine'] as const)(
  '%s: elbows stay over the torso while the hands are low',
  (state) => {
    // The solved pose is the same on every non-back facing (front, 3/4, side; only the flip differs), so one
    // check covers them. The arm hangs from x = +-shoulderX, so |elbow x| <= shoulderX is "inside the torso line".
    const pose = (ph: number) =>
      computePose(state, ph * P, makePose(), 1, P, 'on', 'walk', g, { reach: 1 });
    it('impact and the whole strike-to-recoil run', () => {
      for (let i = 62; i <= 100; i++) {
        const p = pose(i / 100);
        const { lead, rear, elbowFront, elbowBack } = limbs(p);
        for (const e of [elbowFront, elbowBack])
          expect(Math.abs(e.x), `${state} elbow @${i / 100}`).toBeLessThanOrEqual(
            g.shoulderX + 1e-6,
          );
        // the hands stay on the handle while the elbows tuck
        const d = { x: rear.x - lead.x, y: rear.y - lead.y };
        const head = limbs(p).head;
        expect(Math.abs(d.x * head.y - d.y * head.x)).toBeLessThan(ELBOW_BLEND_HAND_DRIFT_PX);
      }
    });
    it('both arms form a V at impact: hands closer together than the shoulders', () => {
      const { lead, rear, elbowFront, elbowBack } = limbs(pose(SWING_IMPACT_PHASE));
      expect(lead.x - rear.x).toBeLessThan(2 * g.shoulderX);
      expect(elbowFront.x).toBeLessThan(g.shoulderX);
      expect(elbowBack.x).toBeGreaterThan(-g.shoulderX);
    });
  },
);

describe.each(['chop', 'mine'] as const)('%s: elbows inside the LEANED silhouette', (state) => {
  // What the player sees: the elbow x relative to the shoulder midpoint after the body lean, against the torso
  // half-width (6 art px, hardcoded on purpose: widening the rig or the keys must go red here).
  const worldElbows = (ph: number) => {
    const p = computePose(state, ph * P, makePose(), 1, P, 'on', 'walk', g, { reach: 1 });
    const sx = 6 * (1 - TWIST_NARROW * p.twist);
    const w = (s: number, u: number) =>
      (s + g.elbowY * Math.sin(u)) * Math.cos(p.lean) - g.elbowY * Math.cos(u) * Math.sin(p.lean);
    return {
      f: Math.abs(w(sx, p.armUpperFront)),
      b: Math.abs(w(-sx, p.armUpperBack)),
      half: sx * Math.cos(p.lean),
    };
  };
  it('impact and the strike-to-recoil run stay within half-width + 0.33 art px', () => {
    expect(g.shoulderX).toBe(6);
    for (let i = 66; i <= 100; i++) {
      const e = worldElbows(i / 100);
      expect(e.f, `${state} front elbow @${i / 100}`).toBeLessThanOrEqual(e.half + 0.33);
      expect(e.b, `${state} back elbow @${i / 100}`).toBeLessThanOrEqual(e.half + 0.33);
    }
  });
});

describe('solveArm mirror solution', () => {
  it('side -1 reaches the same hand with the elbow on the other side', () => {
    for (const [tx, ty] of [
      [-2, 14],
      [3, 12],
    ] as const) {
      const a = solveArm(g.elbowY, g.handY, tx, ty, 1);
      const ua = -a.upper;
      const fa = -a.fore;
      const b = solveArm(g.elbowY, g.handY, tx, ty, -1);
      const ub = -b.upper;
      const fb = -b.fore;
      const ha = handFromAngles(g, ua, fa, { x: 0, y: 0 });
      const hb = handFromAngles(g, ub, fb, { x: 0, y: 0 });
      expect(hb.x).toBeCloseTo(ha.x, 6);
      expect(hb.y).toBeCloseTo(ha.y, 6);
      expect(Math.sin(ub)).not.toBeCloseTo(Math.sin(ua), 2);
    }
  });
});

describe.each(['chop', 'mine'] as const)('%s: Reduced tap-down matches On strike pose', (state) => {
  it('tool angle (axe + lean) within 4 degrees and same grip height at 0.70 and impact', () => {
    for (const ph of [0.7, SWING_IMPACT_PHASE]) {
      const on = computePose(state, ph * P, makePose(), 1, P, 'on', 'walk', g, { reach: 1 });
      const red = computePose(state, ph * P, makePose(), 1, P, 'reduced', 'walk', g, { reach: 1 });
      const tool = (q: Pose) => (q.axeAngle + q.lean) / DEG;
      expect(Math.abs(tool(red) - tool(on)), `${state} @${ph}`).toBeLessThan(4);
      expect(Math.abs(red.gripY - on.gripY)).toBeLessThan(1);
      expect(Math.abs(red.lean - on.lean) / DEG).toBeLessThan(3);
    }
  });
});

describe.each(['chop', 'mine'] as const)('%s: the elbows never snap', (state) => {
  // Elbow positions (torso frame) swept in 0.5% phase steps. The fastest legitimate strike step is ~6.4 art px (mine,
  // 0.60-0.61); the old hard switch between the trailing and the tucked elbow jumped 7.3 (chop 0.065), 9.9 (chop 0.645),
  // 7.8 (mine 0.075) and 10.5 (mine 0.64). The limit is a literal on purpose: widening it must go red.
  const MAX_ELBOW_STEP_PX = 7;
  it(`no elbow moves more than ${MAX_ELBOW_STEP_PX} art px in one 0.5% step, over the whole cycle`, () => {
    let prev = limbs(computePose(state, 0, makePose(), 1, P, 'on', 'walk', g, { reach: 1 }));
    let worst = 0;
    for (let i = 1; i <= 200; i++) {
      const cur = limbs(
        computePose(state, (i / 200) * P, makePose(), 1, P, 'on', 'walk', g, { reach: 1 }),
      );
      for (const [a, b] of [
        [prev.elbowFront, cur.elbowFront],
        [prev.elbowBack, cur.elbowBack],
      ] as const)
        worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
      prev = cur;
    }
    expect(worst).toBeLessThan(MAX_ELBOW_STEP_PX);
    expect(worst).toBeGreaterThan(1); // the sweep really moved the arms
  });
});
