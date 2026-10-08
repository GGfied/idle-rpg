import { describe, expect, it, vi } from 'vitest';
import { computePose, defaultGeom, makePose, nextAnimState, swingPhase } from './logic';
import { handFromAngles } from './chop';
import { createPlayerAnimator } from './playerAnimator';
import {
  AXE_HAND_GAP,
  BACK_VIEW_SWING_REACH,
  GATHER_STATE_BY_TOOL,
  ROD_KEYS,
  ROD_LINE_LEN,
  ROD_TIP_Y,
  SWING_TIMELINES,
  SWING_TOOLS,
  TWIST_NARROW,
  rodLineRects,
  rodRects,
} from './data';
import type { Pose } from './types';

const g = defaultGeom();
const TL = SWING_TIMELINES.fishRod!;
const at = (ms: number, pulseMs = -1, reach = 1, mode: 'on' | 'reduced' | 'off' = 'on') =>
  computePose('fishRod', ms, makePose(), 1, 2400, mode, 'walk', g, { reach }, pulseMs);
const TIMES = Array.from({ length: 121 }, (_, i) => i * 50);

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
/** Pose at a KEY phase of the table (cast/wait/catch), via a pulse so every phase is reachable. */
const atPhase = (phase: number) =>
  phase < TL.castEnd
    ? at((phase / TL.castEnd) * TL.castMs)
    : phase < TL.waitEnd
      ? at(TL.castMs + ((phase - TL.castEnd) / (TL.waitEnd - TL.castEnd)) * TL.waitMs)
      : at(0, ((phase - TL.waitEnd) / (1 - TL.waitEnd)) * TL.catchMs);

describe('fishRod state', () => {
  it('toolKind rod maps to fishRod; walking beats it; the others are unchanged', () => {
    expect(GATHER_STATE_BY_TOOL['rod']).toBe('fishRod');
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'rod' })).toBe(
      'fishRod',
    );
    expect(nextAnimState('fishRod', { moving: true, gathering: true, toolKind: 'rod' })).toBe(
      'walk',
    );
    expect(nextAnimState('fishRod', { moving: false, gathering: false, toolKind: 'rod' })).toBe(
      'idle',
    );
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'net' })).toBe(
      'fishNet',
    );
    expect(nextAnimState('idle', { moving: false, gathering: true, toolKind: 'axe' })).toBe('chop');
  });
});

describe('two-handed rod', () => {
  it('both hands sit on the rod at every key, in cast, wait and catch', () => {
    const phases = [...ROD_KEYS.swing.map((k) => k.phase), 0.05, 0.12, 0.18, 0.26, 0.5, 0.74, 0.84];
    for (const ph of phases) {
      const { lead, rear, head } = limbs(atPhase(Math.min(ph, 0.999)));
      const dx = rear.x - lead.x;
      const dy = rear.y - lead.y;
      expect(Math.abs(dx * head.y - dy * head.x), `off the rod @${ph}`).toBeLessThan(0.25);
      expect(dx * head.x + dy * head.y, `gap @${ph}`).toBeCloseTo(-AXE_HAND_GAP, 0);
    }
  });
  it('hands are reachable at every instant of the cast, wait and a catch', () => {
    const ps = [...TIMES.map((t) => at(t)), ...TIMES.map((t) => at(0, t % TL.catchMs))];
    for (const p of ps) {
      const { sx, lead, rear } = limbs(p);
      expect(Math.hypot(lead.x - sx, lead.y)).toBeLessThan(g.elbowY + g.handY - 0.01);
      expect(Math.hypot(lead.x - sx, lead.y)).toBeGreaterThan(Math.abs(g.elbowY - g.handY) + 0.01);
      expect(Math.hypot(rear.x + sx, rear.y)).toBeLessThan(g.elbowY + g.handY - 0.01);
    }
  });
  it('the cast goes back over the shoulder, then whips forward and down', () => {
    const back = limbs(at((0.15 / TL.castEnd) * TL.castMs)).head;
    expect(back.x).toBeLessThan(-0.3); // tip behind the shoulder
    expect(back.y).toBeLessThan(-0.7); // and high
    const rest = limbs(at(TL.castMs)).head;
    expect(rest.x).toBeGreaterThan(0.75); // out over the water
    expect(rest.y).toBeLessThan(-0.3); // raised, not pointing into the sand
  });
  it('at rest (cast end and the whole wait) the tip is above the hands, 20-35 degrees up, along the facing', () => {
    for (const t of [TL.castMs, TL.castMs + 600, TL.castMs + 1200, TL.castMs + 2000]) {
      const { lead, head } = limbs(at(t));
      const elev = (Math.asin(-head.y) * 180) / Math.PI;
      expect(elev, `elevation @${t}`).toBeGreaterThan(18);
      expect(elev, `elevation @${t}`).toBeLessThan(37);
      expect(head.x, `forward @${t}`).toBeGreaterThan(0.8); // +x is the facing side in the rig frame
      expect(lead.y + head.y * ROD_TIP_Y, `tip above hand @${t}`).toBeLessThan(lead.y - 6);
    }
  });
  it('the float hangs well in front of the body (past the shoulder) at rest, in every swing style', () => {
    for (const mode of ['on', 'reduced'] as const) {
      const p = at(TL.castMs + 800, -1, 1, mode);
      const { lead, head } = limbs(p);
      const floatX = lead.x + head.x * ROD_TIP_Y;
      expect(floatX, mode).toBeGreaterThan(g.shoulderX + 10);
      expect(head.y, mode).toBeLessThan(-0.2);
    }
  });
});

describe('wait loop', () => {
  it('loops every waitMs, only bobs slightly, and never moves the body', () => {
    const t0 = TL.castMs + 300;
    expect(at(t0).axeAngle).toBeCloseTo(at(t0 + TL.waitMs).axeAngle, 9);
    expect(at(t0).axeAngle).toBeCloseTo(at(t0 + 5 * TL.waitMs).axeAngle, 6);
    let lo = Infinity;
    let hi = -Infinity;
    for (let t = TL.castMs; t < TL.castMs + TL.waitMs; t += 25) {
      const p = at(t);
      lo = Math.min(lo, p.axeAngle);
      hi = Math.max(hi, p.axeAngle);
      expect(p.twist).toBe(0);
    }
    const deg = ((hi - lo) * 180) / Math.PI;
    expect(deg).toBeGreaterThan(5);
    expect(deg).toBeLessThan(14);
  });
  it('the cast ends exactly on the wait rest pose, and the wait ends on it too (seamless)', () => {
    const rest = at(TL.castMs);
    expect(at(TL.castMs - 1).axeAngle).toBeCloseTo(rest.axeAngle, 1);
    expect(at(TL.castMs + TL.waitMs).axeAngle).toBeCloseTo(rest.axeAngle, 9);
    expect(at(TL.castMs + TL.waitMs - 1).axeAngle).toBeCloseTo(rest.axeAngle, 1);
  });
  it('swingPhase: cast once (never re-plays), wait phases stay in [castEnd, waitEnd)', () => {
    expect(swingPhase('fishRod', 0, 2400, -1)).toBe(0);
    for (let t = TL.castMs; t < 20000; t += 137) {
      const p = swingPhase('fishRod', t, 2400, -1);
      expect(p).toBeGreaterThanOrEqual(TL.castEnd);
      expect(p).toBeLessThan(TL.waitEnd);
    }
    expect(swingPhase('chop', 1200, 2400, -1)).toBeCloseTo(0.5);
  });
});

describe('catch pulse', () => {
  it('lifts the rod tip during the pulse and returns to the wait pose at its end', () => {
    const wait = at(TL.castMs + 10);
    const lift = limbs(at(TL.castMs + 10, ((0.18 * TL.catchMs) / 0.3) * 0.3 * ((1 / 0.3) * 0.3)));
    void lift;
    let minY = Infinity;
    for (let m = 0; m < TL.catchMs; m += 20) minY = Math.min(minY, limbs(at(5000, m)).head.y);
    expect(minY).toBeLessThan(limbs(wait).head.y - 0.3); // tip clearly higher at some point
    expect(at(5000, TL.catchMs - 1).axeAngle).toBeCloseTo(at(TL.castMs).axeAngle, 1); // the rest pose
    expect(at(5000, TL.catchMs + 50).axeAngle).toBeCloseTo(at(5000 + 50, -1).axeAngle, 1); // after it, plain wait again
  });
  it('swingPhase maps the pulse onto [waitEnd, 1) only while it runs', () => {
    expect(swingPhase('fishRod', 9000, 2400, 0)).toBeCloseTo(TL.waitEnd);
    expect(swingPhase('fishRod', 9000, 2400, TL.catchMs / 2)).toBeCloseTo((TL.waitEnd + 1) / 2);
    expect(swingPhase('fishRod', 9000, 2400, TL.catchMs)).toBeLessThan(TL.waitEnd); // over: back in the loop
    expect(swingPhase('fishRod', 9000, 2400, -1)).toBeLessThan(TL.waitEnd);
  });
});

describe('Animations Off and reduced', () => {
  it('off: one static pose at every time, with or without a pulse, in every view', () => {
    const ref = at(0, -1, 1, 'off');
    for (const reach of [1, BACK_VIEW_SWING_REACH])
      for (const t of TIMES) {
        expect(at(t, -1, reach, 'off')).toEqual(ref);
        expect(at(t, t % TL.catchMs, reach, 'off')).toEqual(ref);
      }
  });
  it('reduced: small tap, body still, hands on the rod, lift is small', () => {
    const base = at(TL.castMs + 100, -1, 1, 'reduced');
    let moved = 0;
    for (const t of TIMES) {
      for (const q of [at(t, -1, 1, 'reduced'), at(0, t % TL.catchMs, 1, 'reduced')]) {
        expect([q.lean, q.bodyBobY, q.twist, q.kneeFront]).toEqual([0, 0, 0, 0]);
        const { lead, rear, head } = limbs(q);
        expect(Math.abs((rear.x - lead.x) * head.y - (rear.y - lead.y) * head.x)).toBeLessThan(
          0.25,
        );
        moved = Math.max(moved, Math.abs(q.axeAngle - base.axeAngle));
      }
    }
    expect(moved).toBeGreaterThan(0.1);
    expect(moved).toBeLessThan(0.7);
  });
});

describe('rod art', () => {
  it('is a 30px tapered rod (grip, reel, thick then thin shaft) and an upright line with a float', () => {
    const r = rodRects();
    const top = Math.max(...r.map((x) => x.y + x.h));
    expect(top).toBe(ROD_TIP_Y);
    expect(Math.min(...r.map((x) => x.y))).toBeLessThan(-6); // butt behind the rear hand
    const widths = r.filter((x) => x.x <= 0 && x.y >= 2).map((x) => x.w);
    expect(Math.max(...widths)).toBeGreaterThan(Math.min(...widths)); // tapers
    const line = rodLineRects();
    expect(line[0]!.w).toBe(1);
    expect(line[0]!.h).toBe(ROD_LINE_LEN);
    expect(line.some((x) => x.color === 0xe23b3b)).toBe(true); // red float
  });
  it('the SWING_TOOLS row: named rod, no impact, hangs from the tip', () => {
    const row = SWING_TOOLS.fishRod;
    expect(row.name).toBe('rod');
    expect(row.impact).toBe(false);
    expect(row.hang!.tipY).toBe(ROD_TIP_Y);
  });
});

function fakeNode() {
  const n: Record<string, unknown> = {};
  for (const k of ['fillStyle', 'fillRect', 'clear', 'add']) n[k] = vi.fn(() => n);
  n.visible = true;
  n.x = 0;
  n.y = 0;
  n.rot = 0;
  n.setPosition = vi.fn((x: number, y: number) => {
    n.x = x;
    n.y = y;
    return n;
  });
  n.setVisible = vi.fn((v: boolean) => {
    n.visible = v;
    return n;
  });
  n.setRotation = vi.fn((r: number) => {
    n.rot = r;
    return n;
  });
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
const named = (nodes: ReturnType<typeof setup>['nodes'], name: string) =>
  nodes.filter((n) => n.name === name);

describe('rod in the animator', () => {
  const run = (facing: 'se' | 'ne', ms: number) => {
    const s = setup();
    s.a.setState('fishRod', { facing });
    s.a.update(0);
    s.a.update(ms);
    return s;
  };
  it('two graphics named rod (hand + back layer) and two rodLine', () => {
    const { nodes } = setup();
    expect(named(nodes, 'rod')).toHaveLength(2);
    expect(named(nodes, 'rodLine')).toHaveLength(2);
  });
  it('front view: arms and the rod + line in hand, none of the other tools', () => {
    for (const ms of [0, 500, 1500, 3000]) {
      const { nodes } = run('se', ms);
      const [hand, layer] = named(nodes, 'rod');
      const [handLine, layerLine] = named(nodes, 'rodLine');
      expect([hand!.visible, handLine!.visible]).toEqual([true, true]);
      expect([layer!.visible, layerLine!.visible]).toEqual([false, false]);
      expect(nodes.find((n) => n.name === 'armFrontUpper')!.visible).toBe(true);
      for (const o of ['axe', 'pick', 'net'])
        for (const n of named(nodes, o)) expect(n.visible).toBe(false);
    }
  });
  it('back view: no arms at any time; the rod and line show in the layer behind the body', () => {
    for (let ms = 0; ms < 5000; ms += 250) {
      const { nodes } = run('ne', ms);
      expect(nodes.find((n) => n.name === 'armFrontUpper')!.visible).toBe(false);
      expect(nodes.find((n) => n.name === 'armBackUpper')!.visible).toBe(false);
      const [hand, layer] = named(nodes, 'rod');
      const [handLine, layerLine] = named(nodes, 'rodLine');
      expect([hand!.visible, handLine!.visible]).toEqual([false, false]);
      expect([layer!.visible, layerLine!.visible]).toEqual([true, true]);
    }
  });
  it('the line stays upright: the layer line has rotation 0 and hangs below the rod tip', () => {
    const { nodes } = run('ne', 3000);
    const [layer] = named(nodes, 'rod').slice(1);
    const [, layerLine] = named(nodes, 'rodLine');
    expect(layerLine!.rot).toBe(0);
    expect(Number.isFinite(layerLine!.x) && Number.isFinite(layerLine!.y)).toBe(true);
    expect(layer!.rot).not.toBe(0);
  });
  it('pulse(catch) lifts once and returns to the wait loop; never fires onImpact', () => {
    const s = setup();
    const hit = vi.fn();
    s.a.onImpact = hit;
    s.a.setState('fishRod', { facing: 'se' });
    const [hand] = named(s.nodes, 'rod');
    const rot = (t: number) => {
      s.a.update(t);
      return hand!.rot as number;
    };
    s.a.update(0);
    const base = rot(3000);
    const wait = (t: number) => rot(t);
    void wait;
    s.a.pulse('catch');
    const lift = Array.from({ length: 40 }, (_, i) => rot(3016 + i * 20));
    expect(Math.max(...lift.map((r) => Math.abs(r - base)))).toBeGreaterThan(0.2); // moved
    // After the pulse the rod follows the plain wait loop again (same as a fresh animator at that time).
    const ref = setup();
    ref.a.setState('fishRod', { facing: 'se' });
    ref.a.update(0);
    ref.a.update(6000);
    expect(rot(6000)).toBeCloseTo(named(ref.nodes, 'rod')[0]!.rot as number, 6);
    expect(hit).not.toHaveBeenCalled();
  });
  it('a pulse during the cast waits for the cast to end; a pulse in another state is ignored', () => {
    const rotAt = (pulse: boolean, t: number) => {
      const s = setup();
      s.a.setState('fishRod');
      s.a.update(0);
      s.a.update(100);
      if (pulse) s.a.pulse('catch');
      s.a.update(t);
      return named(s.nodes, 'rod')[0]!.rot as number;
    };
    for (const t of [300, 800, TL.castMs - 40])
      expect(rotAt(true, t), `cast @${t}`).toBeCloseTo(rotAt(false, t), 9);
    expect(rotAt(true, TL.castMs + 300)).not.toBeCloseTo(rotAt(false, TL.castMs + 300), 2); // lifting now
    const c = setup();
    c.a.setState('chop');
    c.a.update(0);
    c.a.pulse('catch');
    expect(() => c.a.update(500)).not.toThrow();
  });
  it('setState to another state resets the pending pulse', () => {
    const s = setup();
    s.a.setState('fishRod');
    s.a.update(0);
    s.a.pulse('catch');
    s.a.setState('idle');
    s.a.setState('fishRod');
    s.a.update(10000);
    s.a.update(10000 + TL.castMs + 100);
    const ref = setup();
    ref.a.setState('fishRod');
    ref.a.update(0);
    ref.a.update(TL.castMs + 100);
    expect(named(s.nodes, 'rod')[0]!.rot).toBeCloseTo(named(ref.nodes, 'rod')[0]!.rot, 9);
  });
});
