import { describe, expect, it, vi } from 'vitest';
import { createPlayerAnimator } from './playerAnimator';
import { computePose, makePose, projectSwing, swingAxis, swingLength } from './logic';
import { GAITS, axeRects } from './data';
const HANDLE_H = axeRects(0)[0]!.h;
import { PLAYER_LOOK, figureArmPivots } from '@render/index';
import type { Facing8 } from '@render/index';

const SCALE = 1.5;

function fakeNode() {
  const n: Record<string, unknown> = {};
  for (const k of ['fillStyle', 'fillRect', 'fillCircle', 'clear', 'add', 'setPosition']) {
    n[k] = vi.fn(() => n);
  }
  n.visible = true;
  n.setVisible = vi.fn((v: boolean) => {
    n.visible = v;
    return n;
  });
  n.setRotation = vi.fn(() => n);
  n.scaleX = 1;
  n.scaleY = 1;
  n.y = 0;
  n.setScale = vi.fn((x: number, y?: number) => {
    n.scaleX = x;
    n.scaleY = y ?? x;
    return n;
  });
  n.destroy = vi.fn();
  n.moveTo = vi.fn(() => n);
  n.length = 4;
  return n as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function setup() {
  const nodes: ReturnType<typeof fakeNode>[] = [];
  const mk = (...args: number[]) => {
    const n = fakeNode();
    n.args = args;
    nodes.push(n);
    return n;
  };
  const scene = { add: { container: mk, graphics: mk } };
  const body = fakeNode();
  body.scaleX = SCALE;
  body.scaleY = SCALE;
  const setBackView = vi.fn();
  const view = { container: { addAt: vi.fn() }, body, setBackView };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const a = createPlayerAnimator(scene as any, view as any);
  const rig = nodes[0]!;
  return { a, body, rig, nodes, setBackView };
}

describe('player animator scale and facing', () => {
  it('the rig starts at the body scale (never 1)', () => {
    expect(setup().rig.scaleY).toBe(SCALE);
  });
  const cases: [Facing8, number][] = [
    ['e', 1],
    ['se', 1],
    ['sw', -1],
    ['w', -1],
    ['nw', -1],
    ['ne', 1],
  ];
  it.each(cases)('%s flips to %d and keeps ART_SCALE on body and rig', (f, sign) => {
    const { a, body, rig } = setup();
    a.setState('idle', { facing: f });
    expect(body.scaleX).toBe(sign * SCALE);
    expect(body.scaleY).toBe(SCALE);
    expect(rig.scaleX).toBe(sign * SCALE);
    expect(rig.scaleY).toBe(SCALE);
  });
  it('straight up/down the screen keeps the last side', () => {
    const { a, body } = setup();
    a.setState('idle', { facing: 'w' });
    a.setState('idle', { facing: 's' });
    expect(body.scaleX).toBe(-SCALE);
  });
  it('legacy facingLeft still works', () => {
    const { a, body } = setup();
    a.setState('idle', { facingLeft: true });
    expect(body.scaleX).toBe(-SCALE);
  });
  it('back view is delegated to the body (redrawn on change only), no flat overlay', () => {
    const { a, setBackView, nodes } = setup();
    const before = nodes.length;
    a.setState('idle', { facing: 'n' });
    a.setState('idle', { facing: 'n' });
    expect(setBackView).toHaveBeenCalledTimes(1);
    expect(setBackView).toHaveBeenLastCalledWith(true);
    a.setState('idle', { facing: 'se' });
    expect(setBackView).toHaveBeenCalledTimes(2);
    expect(setBackView).toHaveBeenLastCalledWith(false);
    expect(nodes.length).toBe(before);
  });
  it('walk bob is multiplied by ART_SCALE', () => {
    const { a, body } = setup();
    a.setState('walk');
    a.update(0);
    a.update(0);
    expect(body.y).toBeCloseTo(-GAITS.walk.bobPx * SCALE, 1);
  });
});

describe('axe impact callback', () => {
  const P = 2400;
  const IMPACT = 0.68 * P;

  it('fires once per swing cycle, when the strike ends', () => {
    const { a } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    a.setState('chop');
    for (let t = 0; t < IMPACT - 10; t += 16) a.update(t);
    expect(hit).not.toHaveBeenCalled();
    for (let t = IMPACT - 10; t < P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(1);
    for (let t = P; t < 3 * P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(3);
    a.update(3 * P + IMPACT + 5);
    expect(hit).toHaveBeenCalledTimes(4);
  });

  it('does not fire outside chop', () => {
    const { a } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    for (const s of ['idle', 'walk'] as const) {
      a.setState(s);
      for (let t = 0; t < 3 * P; t += 16) a.update(t);
    }
    expect(hit).not.toHaveBeenCalled();
  });

  it('resets on re-entry: a new chop session fires in its first cycle', () => {
    const { a } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    a.setState('chop');
    for (let t = 0; t <= P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(1);
    a.setState('idle');
    a.update(P + 100);
    a.setState('chop');
    a.update(P + 200); // new startedAt
    a.update(P + 200 + IMPACT + 5);
    expect(hit).toHaveBeenCalledTimes(2);
  });

  it.each(['off', 'reduced'] as const)('still fires in %s mode (sound, not motion)', (mode) => {
    const { a } = setup();
    const hit = vi.fn();
    a.onImpact = hit;
    a.setMode(mode);
    a.setState('chop');
    for (let t = 0; t <= P; t += 16) a.update(t);
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('works with no handler set', () => {
    const { a } = setup();
    a.setState('chop');
    expect(() => a.update(0) ?? a.update(IMPACT + 1)).not.toThrow();
  });
});

describe('player animator arm chain', () => {
  const find = (nodes: ReturnType<typeof setup>['nodes'], name: string) =>
    nodes.find((n) => n.name === name)!;
  it('builds shoulder and elbow containers, with the axe on the front forearm', () => {
    const { nodes } = setup();
    for (const n of ['armBackUpper', 'armBackFore', 'armFrontUpper', 'armFrontFore'])
      expect(find(nodes, n)).toBeDefined();
    expect(find(nodes, 'armFrontUpper').add).toHaveBeenCalledWith(find(nodes, 'armFrontFore'));
    expect(find(nodes, 'armFrontFore').add).toHaveBeenCalledTimes(6); // arm art + axe, pick, net, rod, rodLine
  });
  it('walking: shoulder = upper swing, elbow = forearm relative to it, arm opposite the thigh', () => {
    const { a, nodes } = setup();
    a.setState('walk', { facing: 'e' });
    a.update(0);
    a.update(GAITS.walk.cycleMs * 0.8); // arm forward: the elbow opens
    const last = (n: ReturnType<typeof fakeNode>) => n.setRotation.mock.calls.at(-1)![0] as number;
    const upper = last(find(nodes, 'armFrontUpper'));
    const fore = last(find(nodes, 'armFrontFore'));
    expect(Number.isFinite(upper) && Number.isFinite(fore)).toBe(true);
    expect(fore).not.toBe(0); // the elbow moves on its own
    expect(Math.abs(upper)).toBeGreaterThan(0);
  });
  it('chopping solves both arms onto the handle: the axe turns relative to the forearm, the elbow flexes', () => {
    const { a, nodes } = setup();
    a.setState('chop', { facing: 'e' });
    a.update(0);
    a.update(0.68 * 2400);
    const last = (n: ReturnType<typeof fakeNode>) => n.setRotation.mock.calls.at(-1)![0] as number;
    expect(last(find(nodes, 'armFrontFore'))).not.toBe(0);
    expect(last(find(nodes, 'armBackFore'))).not.toBe(0);
    const axe = axeNode(nodes);
    expect(axe.visible).toBe(true);
    expect(Number.isFinite(last(axe))).toBe(true);
  });
  it('each forearm hangs off its upper arm at the elbow: attached, never detached', () => {
    const { nodes } = setup();
    const elbowY = figureArmPivots(PLAYER_LOOK).elbowY;
    for (const n of ['armFrontFore', 'armBackFore']) {
      expect(find(nodes, n).args).toEqual([0, elbowY]);
    }
    for (const [u, f] of [
      ['armFrontUpper', 'armFrontFore'],
      ['armBackUpper', 'armBackFore'],
    ] as const)
      expect(find(nodes, u).add).toHaveBeenCalledWith(find(nodes, f));
  });
});

/** The drawn axe in the forearm (handle 2 wide, HANDLE_H long). */
function axeNode(nodes: ReturnType<typeof setup>['nodes']) {
  return nodes.find((n) =>
    (n.fillRect.mock.calls as number[][]).some((r) => r[2] === 2 && r[3] === HANDLE_H),
  )!;
}

describe('chop in the back view: the arms are hidden, only the axe shows', () => {
  const P = 2400;
  const find = (nodes: ReturnType<typeof setup>['nodes'], name: string) =>
    nodes.find((n) => n.name === name)!;
  const PHASES = Array.from({ length: 20 }, (_, i) => i / 20);
  function at(facing: Facing8, phase: number) {
    const s = setup();
    s.a.setState('chop', { facing });
    s.a.update(0);
    s.a.update(phase * P);
    return s;
  }
  it.each(['n', 'ne', 'nw'] as const)('%s: no arm segment is drawn at any phase', (facing) => {
    for (const ph of PHASES) {
      const { nodes } = at(facing, ph);
      expect(find(nodes, 'armFrontUpper').visible, `front upper @${ph}`).toBe(false);
      expect(find(nodes, 'armBackUpper').visible, `back upper @${ph}`).toBe(false);
      expect(axeNode(nodes).visible, `forearm axe @${ph}`).toBe(false);
    }
  });
  it('the axe is still drawn, in a layer behind the body (the torso covers it in front of the chest)', () => {
    const { nodes } = at('ne', 0.68);
    const layered = nodes.filter(
      (n) =>
        n !== axeNode(nodes) &&
        (n.fillRect.mock.calls as number[][]).some((r) => r[2] === 2 && r[3] === HANDLE_H),
    );
    expect(layered).toHaveLength(1);
    expect(layered[0]!.visible).toBe(true);
  });
  it('front views keep both arms and the axe in hand at every phase', () => {
    for (const ph of PHASES) {
      const { nodes } = at('se', ph);
      expect(find(nodes, 'armFrontUpper').visible).toBe(true);
      expect(find(nodes, 'armBackUpper').visible).toBe(true);
      expect(axeNode(nodes).visible).toBe(true);
    }
  });
  it('walking in the back view shows the arms again', () => {
    const { a, nodes } = at('ne', 0.5);
    a.setState('walk', { facing: 'ne' });
    a.update(1000);
    expect(find(nodes, 'armFrontUpper').visible).toBe(true);
    expect(find(nodes, 'armBackUpper').visible).toBe(true);
  });
  it('the body still leans and dips in the back view (hips dip at impact)', () => {
    const { body } = at('ne', 0.68);
    expect(body.setRotation.mock.calls.at(-1)![0]).not.toBe(0);
    expect(body.y).toBeGreaterThan(0);
  });
  it('Animations Off keeps the static pose identical in front and back view', () => {
    const rot = (facing: Facing8) => {
      const { a, nodes } = setup();
      a.setMode('off');
      a.setState('chop', { facing });
      a.update(0);
      return find(nodes, 'armFrontUpper').setRotation.mock.calls.at(-1)![0] as number;
    };
    expect(rot('ne')).toBe(rot('se'));
    expect(rot('n')).toBe(rot('e'));
  });
});

describe('walk swing runs along the facing (rotations the animator really sets)', () => {
  const lastRot = (n: Record<string, any>) => n.setRotation.mock.calls.at(-1)![0] as number; // eslint-disable-line @typescript-eslint/no-explicit-any
  function sweep(facing: Facing8, name: string) {
    const { a, nodes } = setup();
    const n = nodes.find((x) => x.name === name) ?? nodes[0]!;
    a.setState('walk', { facing });
    a.update(0);
    let max = 0;
    for (let t = 0; t < GAITS.walk.cycleMs; t += 20) {
      a.update(t);
      max = Math.max(max, Math.abs(lastRot(n)));
    }
    return max;
  }
  it('facing e: arms swing through a clear arc; facing s/n: the arms stay on the centre line (no sideways swing)', () => {
    expect(sweep('e', 'armFrontUpper')).toBeGreaterThan(0.2);
    expect(sweep('s', 'armFrontUpper')).toBeLessThan(0.05);
    expect(sweep('n', 'armBackUpper')).toBeLessThan(0.05);
  });
  it('legs: thigh and shin follow the same axis (no sideways stride facing s/n)', () => {
    const legs = (facing: Facing8) => {
      const { a, nodes } = setup();
      a.setState('walk', { facing });
      a.update(0);
      let max = 0;
      for (let t = 0; t < GAITS.walk.cycleMs; t += 20) {
        a.update(t);
        // containers 1,3 = back thigh/shin, 5,7 = front thigh/shin (each leg also builds a graphics between)
        for (const k of [1, 3, 5, 7]) max = Math.max(max, Math.abs(lastRot(nodes[k]!)));
      }
      return max;
    };
    expect(legs('e')).toBeGreaterThan(0.25);
    expect(legs('s')).toBeLessThan(0.05);
    expect(legs('n')).toBeLessThan(0.05);
  });
  it('toward the camera a swung limb is drawn longer (foreshortening), sideways it is not', () => {
    const lens = (facing: Facing8) => {
      const { a, nodes } = setup();
      const up = nodes.find((x) => x.name === 'armFrontUpper')!;
      a.setState('walk', { facing });
      a.update(0);
      let min = 9;
      let max = 0;
      for (let t = 0; t < GAITS.walk.cycleMs; t += 20) {
        a.update(t);
        min = Math.min(min, up.scaleY);
        max = Math.max(max, up.scaleY);
      }
      return max - min;
    };
    expect(lens('s')).toBeGreaterThan(0.1);
    expect(lens('e')).toBeLessThan(1e-9);
  });
});

describe('the animator applies the facing projection to every limb in every facing', () => {
  const FACINGS: Facing8[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
  const lastRot = (n: Record<string, any>) => n.setRotation.mock.calls.at(-1)![0] as number; // eslint-disable-line @typescript-eslint/no-explicit-any
  it.each(FACINGS)(
    'facing %s: arm and leg rotations and lengths equal the projected pose',
    (facing) => {
      for (const t of [130, 260, 390]) {
        const { a, nodes } = setup();
        a.setState('walk', { facing });
        a.update(0);
        a.update(t);
        const axis = swingAxis(facing, { x: 0, y: 0 });
        const p = computePose('walk', t, makePose(), 1, 2400, 'on', 'walk');
        const named = (n: string) => nodes.find((x) => x.name === n)!;
        // containers 1,3 = back thigh/shin, 5,7 = front thigh/shin
        const legs: [number, number, number, number][] = [
          [1, 3, p.thighBack, p.kneeBack],
          [5, 7, p.thighFront, p.kneeFront],
        ];
        for (const [ti, si, th, kn] of legs) {
          const rt = projectSwing(th, axis);
          expect(lastRot(nodes[ti]!)).toBeCloseTo(rt, 9);
          expect(lastRot(nodes[si]!)).toBeCloseTo(projectSwing(th - kn, axis) - rt, 9);
          expect(nodes[ti]!.scaleY).toBeCloseTo(swingLength(th, axis), 9);
        }
        const ru = projectSwing(p.armUpperFront, axis);
        expect(lastRot(named('armFrontUpper'))).toBeCloseTo(ru + p.lean, 9);
        expect(lastRot(named('armFrontFore'))).toBeCloseTo(projectSwing(p.armAngle, axis) - ru, 9);
        expect(lastRot(named('armBackUpper'))).toBeCloseTo(
          projectSwing(p.armUpperBack, axis) + p.lean,
          9,
        );
        expect(named('armFrontUpper').scaleY).toBeCloseTo(swingLength(p.armUpperFront, axis), 9);
      }
    },
  );
});

describe('two-handed grip draw order', () => {
  it('the rear arm is drawn over the lead arm while gripping a tool, and back under it after', () => {
    const { a, rig, nodes } = setup();
    const frontUpper = nodes.find((n) => n.name === 'armFrontUpper')!;
    const backUpper = nodes.find((n) => n.name === 'armBackUpper')!;
    a.setState('mine');
    a.update(0);
    a.update(100);
    expect(rig.moveTo).toHaveBeenLastCalledWith(backUpper, rig.length - 1);
    const calls = rig.moveTo.mock.calls.length;
    a.update(200);
    expect(rig.moveTo.mock.calls.length).toBe(calls); // change-gated, not per frame
    a.setState('walk');
    a.update(300);
    expect(rig.moveTo).toHaveBeenLastCalledWith(frontUpper, rig.length - 1);
  });
});

describe('walk to gather transition (CJ2)', () => {
  const frames = (from: 'walk' | 'idle', to: 'chop' | 'idle', running: boolean) => {
    const { a, body, rig } = setup();
    a.setState(from, { facing: 'e', running });
    const t0 = 1000;
    let t = t0;
    for (; t < t0 + 700; t += 16) a.update(t);
    const pts: number[][] = [[body.x, body.y, rig.y]];
    a.setState(to, { facing: 'e', running: false });
    for (let i = 0; i < 20; i++, t += 16) {
      a.update(t);
      pts.push([body.x, body.y, rig.y]);
    }
    return pts;
  };
  const worst = (p: number[][]) => {
    let m = 0;
    for (let i = 1; i < p.length; i++)
      m = Math.max(m, Math.hypot(p[i]![0]! - p[i - 1]![0]!, p[i]![1]! - p[i - 1]![1]!));
    return m;
  };
  it('the body offset never jumps in one frame when a run ends into a chop', () => {
    expect(worst(frames('walk', 'chop', true))).toBeLessThan(0.8);
  });
  it('ends exactly on the new pose after the blend', () => {
    const p = frames('walk', 'chop', true);
    expect(Number.isFinite(p[p.length - 1]![0]!)).toBe(true);
  });
});
