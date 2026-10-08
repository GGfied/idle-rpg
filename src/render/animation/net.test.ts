import { describe, expect, it, vi } from 'vitest';
import { computePose, defaultGeom, makePose, nextAnimState } from './logic';
import { handFromAngles } from './chop';
import { createPlayerAnimator } from './playerAnimator';
import {
  AXE_HAND_GAP,
  BACK_VIEW_SWING_REACH,
  CHOP_SWING_PERIOD_MS,
  GATHER_STATE_BY_TOOL,
  NET_KEYS,
  TWIST_NARROW,
  netRects,
} from './data';
import type { Pose } from './types';

const P = CHOP_SWING_PERIOD_MS;
const g = defaultGeom();
const at = (phase: number, reach = 1, mode: 'on' | 'reduced' | 'off' = 'on') =>
  computePose('fishNet', phase * P, makePose(), 1, P, mode, 'walk', g, { reach });
const PHASES = Array.from({ length: 101 }, (_, i) => i / 100);
const KEY_PHASES = NET_KEYS.swing.map((k) => k.phase);

function limbs(p: Pose) {
  const sx = g.shoulderX * (1 - TWIST_NARROW * p.twist);
  const f = handFromAngles(g, p.armUpperFront, p.armAngle, { x: 0, y: 0 });
  const b = handFromAngles(g, p.armUpperBack, p.armAngleBack, { x: 0, y: 0 });
  return {
    sx,
    lead: { x: sx + f.x, y: f.y },
    rear: { x: -sx + b.x, y: b.y },
    head: { x: -Math.sin(p.axeAngle), y: Math.cos(p.axeAngle) },
  };
}

describe('fishNet state', () => {
  it('toolKind net maps to fishNet; walking beats it; chop and mine are unchanged', () => {
    expect(GATHER_STATE_BY_TOOL['net']).toBe('fishNet');
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'net' })).toBe(
      'fishNet',
    );
    expect(nextAnimState('fishNet', { moving: true, gathering: true, toolKind: 'net' })).toBe(
      'walk',
    );
    expect(nextAnimState('fishNet', { moving: false, gathering: false, toolKind: 'net' })).toBe(
      'idle',
    );
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'spear' })).toBe(
      'idle',
    );
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'axe' })).toBe('chop');
  });
});

describe('two-handed net pole', () => {
  it('both hands sit on the pole at every keyframe and between them', () => {
    for (const ph of [...KEY_PHASES, ...PHASES]) {
      const { lead, rear, head } = limbs(at(ph));
      const dx = rear.x - lead.x;
      const dy = rear.y - lead.y;
      expect(Math.abs(dx * head.y - dy * head.x), `off the pole @${ph}`).toBeLessThan(0.25);
      expect(dx * head.x + dy * head.y, `gap @${ph}`).toBeCloseTo(-AXE_HAND_GAP, 0);
    }
  });
  it('the hands are reachable at every phase (no clamped, floating hand)', () => {
    for (const ph of PHASES) {
      const { sx, lead, rear } = limbs(at(ph));
      expect(Math.hypot(lead.x - sx, lead.y)).toBeLessThan(g.elbowY + g.handY - 0.01);
      expect(Math.hypot(lead.x - sx, lead.y)).toBeGreaterThan(Math.abs(g.elbowY - g.handY) + 0.01);
      expect(Math.hypot(rear.x + sx, rear.y)).toBeLessThan(g.elbowY + g.handY - 0.01);
    }
  });
});

describe('cast and haul loop', () => {
  it('casts the hoop forward and down, holds, then hauls back slower than it cast', () => {
    const out = limbs(at(0.46));
    expect(out.head.x).toBeGreaterThan(0.7); // hoop far forward
    expect(out.head.y).toBeGreaterThan(0.3); // and low, toward the water
    expect(limbs(at(0.12)).head.y).toBeLessThan(-0.5); // wound up behind
    const castMs = (0.3 - 0.12) * P;
    const haulMs = (1 - 0.46) * P;
    expect(haulMs).toBeGreaterThan(2 * castMs);
  });
  it('loops: phase 1 equals phase 0, and the cycle moves', () => {
    expect(at(1).axeAngle).toBeCloseTo(at(0).axeAngle);
    expect(at(1).gripY).toBeCloseTo(at(0).gripY);
    expect(Math.abs(at(0.46).axeAngle - at(0).axeAngle)).toBeGreaterThan(0.4);
  });
  it('leans (not topples) and the pose is a pure function of time', () => {
    for (const ph of PHASES) expect(Math.abs(at(ph).lean)).toBeLessThan(0.2);
    expect(at(0.37)).toEqual(at(0.37));
  });
});

describe('Animations Off and reduced', () => {
  it('off: one static pose in every view and phase', () => {
    const ref = at(0, 1, 'off');
    for (const reach of [1, BACK_VIEW_SWING_REACH])
      for (const ph of PHASES) expect(at(ph, reach, 'off')).toEqual(ref);
  });
  it('reduced: a small tap with no body movement and hands on the pole', () => {
    let moved = 0;
    for (const ph of PHASES) {
      const q = at(ph, 1, 'reduced');
      expect([q.lean, q.bodyBobY, q.twist, q.kneeFront]).toEqual([0, 0, 0, 0]);
      const { lead, rear, head } = limbs(q);
      expect(Math.abs((rear.x - lead.x) * head.y - (rear.y - lead.y) * head.x)).toBeLessThan(0.25);
      moved = Math.max(moved, Math.abs(q.axeAngle - at(0, 1, 'reduced').axeAngle));
    }
    expect(moved).toBeGreaterThan(0.1);
    expect(moved).toBeLessThan(0.6);
  });
});

describe('netRects', () => {
  it('is a 22px pole with a round hoop (rim and mesh) at the far end', () => {
    const r = netRects();
    expect(r[0]!.h).toBe(22);
    const hoop = r.slice(1);
    expect(hoop.some((x) => x.alpha < 1)).toBe(true); // mesh
    expect(hoop.some((x) => x.alpha === 1)).toBe(true); // rim
    const xs = hoop.map((x) => x.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(10);
    expect(Math.min(...hoop.map((x) => x.y))).toBeGreaterThan(10); // beyond the lead hand
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
  const scene = { add: { container: mk, graphics: mk } };
  const view = { container: { addAt: vi.fn() }, body: fakeNode(), setBackView: vi.fn() };
  const a = createPlayerAnimator(
    scene as unknown as Parameters<typeof createPlayerAnimator>[0],
    view as unknown as Parameters<typeof createPlayerAnimator>[1],
  );
  return { a, nodes };
}
/** The two graphics named 'net': [in the forearm, in the layer below the body]. */
const nets = (nodes: ReturnType<typeof setup>['nodes']) => nodes.filter((n) => n.name === 'net');

describe('net in the animator', () => {
  const run = (facing: 'se' | 'ne', phase: number) => {
    const s = setup();
    s.a.setState('fishNet', { facing });
    s.a.update(0);
    s.a.update(phase * P);
    return s;
  };
  it('front view: both arms and only the net in hand', () => {
    for (const ph of [0, 0.3, 0.46, 0.8]) {
      const { nodes } = run('se', ph);
      const [inHand, layer] = nets(nodes);
      expect(inHand!.visible).toBe(true);
      expect(layer!.visible).toBe(false);
      expect(nodes.find((n) => n.name === 'armFrontUpper')!.visible).toBe(true);
      for (const other of ['axe', 'pick'])
        for (const n of nodes.filter((x) => x.name === other)) expect(n.visible).toBe(false);
    }
  });
  it('back view: no arms at any phase; the net shows in the layer behind the body', () => {
    for (let i = 0; i < 20; i++) {
      const { nodes } = run('ne', i / 20);
      expect(nodes.find((n) => n.name === 'armFrontUpper')!.visible).toBe(false);
      expect(nodes.find((n) => n.name === 'armBackUpper')!.visible).toBe(false);
      const [inHand, layer] = nets(nodes);
      expect(inHand!.visible).toBe(false);
      expect(layer!.visible).toBe(true);
    }
  });
  it('never fires onImpact, and idle hides the net', () => {
    const { a, nodes } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    a.setState('fishNet');
    for (let t = 0; t < 3 * P; t += 16) a.update(t);
    expect(hit).not.toHaveBeenCalled();
    a.setState('idle');
    a.update(3 * P + 16);
    for (const n of nets(nodes)) expect(n.visible).toBe(false);
  });
});
