import { describe, expect, it, vi } from 'vitest';
import { computePose, defaultGeom, makePose, nextAnimState } from './logic';
import { ELBOW_BLEND_HAND_DRIFT_PX, handFromAngles, handGapAt } from './chop';
import { createPlayerAnimator } from './playerAnimator';
import {
  BACK_VIEW_SWING_REACH,
  CHOP_KEYS,
  CHOP_SWING_PERIOD_MS,
  GATHER_STATE_BY_TOOL,
  MINE_KEYS,
  SWING_IMPACT_PHASE,
  TWIST_NARROW,
  pickRects,
} from './data';
import type { Pose } from './types';

const P = CHOP_SWING_PERIOD_MS;
const g = defaultGeom();
const at = (phase: number, reach = 1, mode: 'on' | 'reduced' | 'off' = 'on') =>
  computePose('mine', phase * P, makePose(), 1, P, mode, 'walk', g, { reach });
const chopAt = (phase: number) => computePose('chop', phase * P, makePose(), 1, P, 'on', 'walk', g);
const PHASES = Array.from({ length: 101 }, (_, i) => i / 100);
const KEY_PHASES = [...MINE_KEYS.swing.map((k) => k.phase), SWING_IMPACT_PHASE];

function limbs(p: Pose) {
  const sx = g.shoulderX * (1 - TWIST_NARROW * p.twist);
  const f = handFromAngles(g, p.armUpperFront, p.armAngle, { x: 0, y: 0 });
  const b = handFromAngles(g, p.armUpperBack, p.armAngleBack, { x: 0, y: 0 });
  return {
    sx,
    lead: { x: sx + f.x, y: f.y },
    rear: { x: -sx + b.x, y: b.y },
    head: { x: -Math.sin(p.axeAngle), y: Math.cos(p.axeAngle) },
    /** Leading tip direction: local -x of the head bar, rotated by the handle angle. */
    tip: { x: -Math.cos(p.axeAngle), y: -Math.sin(p.axeAngle) },
  };
}

describe('mine state', () => {
  it('toolKind pickaxe maps to the mine state; the machine picks it and walking still beats it', () => {
    expect(GATHER_STATE_BY_TOOL['pickaxe']).toBe('mine');
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'pickaxe' })).toBe(
      'mine',
    );
    expect(nextAnimState('mine', { moving: true, gathering: true, toolKind: 'pickaxe' })).toBe(
      'walk',
    );
    expect(nextAnimState('mine', { moving: false, gathering: false, toolKind: 'pickaxe' })).toBe(
      'idle',
    );
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'axe' })).toBe('chop');
  });
});

describe('two-handed pickaxe grip', () => {
  it('both hands sit on the haft at every keyframe and between them (front view)', () => {
    for (const ph of [...KEY_PHASES, ...PHASES]) {
      const { lead, rear, head } = limbs(at(ph));
      const dx = rear.x - lead.x;
      const dy = rear.y - lead.y;
      expect(Math.abs(dx * head.y - dy * head.x), `off the haft @${ph}`).toBeLessThan(
        KEY_PHASES.includes(ph) ? 0.25 : ELBOW_BLEND_HAND_DRIFT_PX,
      );
      expect(
        Math.abs(dx * head.x + dy * head.y + handGapAt('swing', ph, 'mine')),
        `gap @${ph}`,
      ).toBeLessThan(KEY_PHASES.includes(ph) ? 0.5 : ELBOW_BLEND_HAND_DRIFT_PX);
    }
  });
  it('at the top of the wind-up two distinct fists are on the haft, both above the shoulders', () => {
    for (const ph of [0.44, 0.5, 0.54]) {
      const { lead, rear, head } = limbs(at(ph));
      const along = (rear.x - lead.x) * head.x + (rear.y - lead.y) * head.y;
      expect(-along, `fist spacing @${ph}`).toBeGreaterThanOrEqual(8);
      expect(lead.y).toBeLessThan(0);
      expect(rear.y).toBeLessThan(0);
    }
  });
});

describe('strike', () => {
  const hit = at(SWING_IMPACT_PHASE);
  it('winds up overhead like the chop', () => {
    const top = limbs(at(0.5));
    expect(top.lead.y).toBeLessThan(-g.elbowY * 0.5);
    expect(top.head.y).toBeLessThan(-0.5);
  });
  it('at impact the head end points down and the leading tip points down into the rock', () => {
    const { head, tip } = limbs(hit);
    expect(head.y).toBeGreaterThan(0.3);
    expect(tip.y).toBeGreaterThan(0.6);
  });
  it('lands lower than the chop (rock on the ground): hands lower, deeper dip', () => {
    expect(limbs(hit).lead.y).toBeGreaterThan(limbs(chopAt(SWING_IMPACT_PHASE)).lead.y);
    expect(hit.bodyBobY).toBeGreaterThan(chopAt(SWING_IMPACT_PHASE).bodyBobY);
  });
  it('leans (not topples), recoils briefly and settles before the next swing', () => {
    for (const ph of PHASES)
      expect(Math.abs(at(ph).lean)).toBeLessThanOrEqual(14 * (Math.PI / 180));
    expect(at(0.74).bodyBobY).toBeGreaterThan(hit.bodyBobY);
    expect(at(0.97).bodyBobY).toBeLessThan(hit.bodyBobY);
  });
  it('loops and keeps the impact on the shared impact phase', () => {
    expect(at(1).axeAngle).toBeCloseTo(at(0).axeAngle);
    expect(MINE_KEYS.swing.some((k) => k.phase === SWING_IMPACT_PHASE)).toBe(true);
    expect(MINE_KEYS.swing).not.toEqual(CHOP_KEYS.swing);
  });
});

describe('Animations Off and reduced', () => {
  it('off: one static pose in every view and phase', () => {
    const ref = at(0, 1, 'off');
    for (const reach of [1, BACK_VIEW_SWING_REACH])
      for (const ph of PHASES) expect(at(ph, reach, 'off')).toEqual(ref);
  });
  it('reduced: a tap with no body movement, hands on the haft, tip down at the hit', () => {
    for (const ph of PHASES) {
      const q = at(ph, 1, 'reduced');
      expect([q.bodyBobY, q.twist, q.kneeFront]).toEqual([0, 0, 0]);
      const { lead, rear, head } = limbs(q);
      expect(Math.abs((rear.x - lead.x) * head.y - (rear.y - lead.y) * head.x)).toBeLessThan(0.25);
    }
    expect(limbs(at(SWING_IMPACT_PHASE, 1, 'reduced')).tip.y).toBeGreaterThan(0.6);
  });
});

describe('pickRects', () => {
  it('is a T-head with pointed tips on a wooden haft, tinted by tier', () => {
    const r = pickRects(0x123456);
    expect(r.filter((x) => x.color === 0x123456).length).toBeGreaterThanOrEqual(5);
    expect(r[0]!.h).toBe(23);
    const widest = r.reduce((m, x) => Math.min(m, x.x), 0);
    expect(widest).toBeLessThanOrEqual(-8); // tips reach well past the haft on both sides
  });
});

function fakeNode() {
  const n: Record<string, unknown> = {};
  for (const k of ['fillStyle', 'fillRect', 'clear', 'add', 'setPosition']) n[k] = vi.fn(() => n);
  n.visible = true;
  n.setVisible = vi.fn((v: boolean) => {
    n.visible = v;
    return n;
  });
  n.setRotation = vi.fn(() => n);
  n.setScale = vi.fn(() => n);
  n.destroy = vi.fn();
  n.moveTo = vi.fn(() => n);
  n.length = 4;
  return n as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}
function setup() {
  const nodes: ReturnType<typeof fakeNode>[] = [];
  const mk = () => {
    const n = fakeNode();
    nodes.push(n);
    return n;
  };
  const body = fakeNode();
  const scene = { add: { container: mk, graphics: mk } };
  const view = { container: { addAt: vi.fn() }, body, setBackView: vi.fn() };
  const a = createPlayerAnimator(
    scene as unknown as Parameters<typeof createPlayerAnimator>[0],
    view as unknown as Parameters<typeof createPlayerAnimator>[1],
  );
  return { a, nodes };
}
const pickNodes = (nodes: ReturnType<typeof setup>['nodes']) =>
  nodes.filter((n) => (n.fillRect.mock.calls as number[][]).some((r) => r[2] === 2 && r[3] === 23));
const named = (nodes: ReturnType<typeof setup>['nodes'], name: string) =>
  nodes.find((n) => n.name === name)!;

describe('pickaxe in the animator', () => {
  const swing = (facing: 'se' | 'ne', phase: number) => {
    const s = setup();
    s.a.setState('mine', { facing });
    s.a.update(0);
    s.a.update(phase * P);
    return s;
  };
  it('front view: both arms and the pickaxe in hand, no axe', () => {
    for (const ph of [0, 0.3, 0.68, 0.9]) {
      const { nodes } = swing('se', ph);
      const [inHand, layer] = pickNodes(nodes);
      expect(inHand!.visible).toBe(true);
      expect(layer!.visible).toBe(false);
      expect(named(nodes, 'armFrontUpper').visible).toBe(true);
    }
  });
  it('back view: no arm is drawn at any phase; the pickaxe shows in the layer behind the body', () => {
    for (let i = 0; i < 20; i++) {
      const { nodes } = swing('ne', i / 20);
      expect(named(nodes, 'armFrontUpper').visible).toBe(false);
      expect(named(nodes, 'armBackUpper').visible).toBe(false);
      const [inHand, layer] = pickNodes(nodes);
      expect(inHand!.visible).toBe(false);
      expect(layer!.visible).toBe(true);
    }
  });
  it('onImpact fires once per swing, at the shared impact phase', () => {
    const { a } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    a.setState('mine');
    for (let t = 0; t < SWING_IMPACT_PHASE * P - 10; t += 16) a.update(t);
    expect(hit).not.toHaveBeenCalled();
    for (let t = SWING_IMPACT_PHASE * P - 10; t < P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(1);
    for (let t = P; t < 3 * P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(3);
  });
});
