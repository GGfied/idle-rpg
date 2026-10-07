import { describe, expect, it, vi } from 'vitest';
import { createPlayerAnimator } from './playerAnimator';
import { GAITS } from './data';
import type { Facing8 } from '@render/index';

const SCALE = 1.5;

function fakeNode() {
  const n: Record<string, unknown> = {};
  for (const k of ['fillStyle', 'fillRect', 'fillCircle', 'clear', 'add', 'setPosition']) {
    n[k] = vi.fn(() => n);
  }
  n.setVisible = vi.fn(() => n);
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
    expect(find(nodes, 'armFrontFore').add).toHaveBeenCalledTimes(2); // arm art + axe
  });
  it('walking: shoulder = upper swing, elbow = forearm relative to it, arm opposite the thigh', () => {
    const { a, nodes } = setup();
    a.setState('walk', { facing: 'e' });
    a.update(0);
    a.update(GAITS.walk.cycleMs * 0.3);
    const last = (n: ReturnType<typeof fakeNode>) => n.setRotation.mock.calls.at(-1)![0] as number;
    const upper = last(find(nodes, 'armFrontUpper'));
    const fore = last(find(nodes, 'armFrontFore'));
    expect(Number.isFinite(upper) && Number.isFinite(fore)).toBe(true);
    expect(fore).not.toBe(0); // the elbow moves on its own
    expect(Math.abs(upper)).toBeGreaterThan(0);
  });
  it('chopping swings the straight arm from the shoulder (elbow 0) and shows the axe', () => {
    const { a, nodes } = setup();
    a.setState('chop', { facing: 'e' });
    a.update(0);
    a.update(900);
    const last = (n: ReturnType<typeof fakeNode>) => n.setRotation.mock.calls.at(-1)![0] as number;
    expect(last(find(nodes, 'armFrontFore'))).toBe(0);
    expect(last(find(nodes, 'armFrontUpper'))).not.toBe(0);
  });
});

describe('chop in the back view (QA A1: axe floated beside the head, no raised arm)', () => {
  const P = 2400;
  const lastRot = (n: Record<string, any>) => n.setRotation.mock.calls.at(-1)![0] as number; // eslint-disable-line @typescript-eslint/no-explicit-any
  function armAt(facing: Facing8, phase: number) {
    const { a, nodes } = setup();
    const arm = nodes.find((n) => n.name === 'armFrontUpper')!;
    a.setState('chop', { facing });
    a.update(0);
    a.update(phase * P);
    return lastRot(arm);
  }
  it.each([0.3, 0.55, 0.68])(
    'phase %d: the back-view arm reaches sideways at most half as far',
    (ph) => {
      const front = armAt('se', ph);
      const back = armAt('ne', ph);
      expect(Math.abs(Math.tan(back))).toBeCloseTo(Math.abs(Math.tan(front)) * 0.5, 5);
      expect(Math.sign(Math.cos(back))).toBe(Math.sign(Math.cos(front))); // same up/down half
    },
  );
  it('wind-up in the back view keeps the arm raised (hand above the shoulder)', () => {
    expect(Math.cos(armAt('nw', 0.55))).toBeLessThan(0);
  });
  it('the front view swing is unchanged', () => {
    expect(armAt('se', 0.55)).toBeCloseTo(armAt('e', 0.55));
  });
  it('the axe is gripped in the fist: the handle passes through it and the head is at the far end', () => {
    const { nodes } = setup();
    const axe = nodes.find((n) =>
      (n.fillRect.mock.calls as number[][]).some((r) => r[2] === 2 && r[3] === 15),
    )!;
    const rects = axe.fillRect.mock.calls as number[][];
    const handle = rects.find((r) => r[2] === 2 && r[3] === 15)!;
    const blade = rects.find((r) => r[2] === 6)!;
    expect(handle[1]).toBeLessThan(0);
    expect(handle[1]! + handle[3]!).toBeGreaterThan(0);
    expect(handle[1]).toBeGreaterThan(-6); // never reaches back towards the shoulder
    expect(blade[1]).toBeGreaterThan(0); // beyond the fist, not beside the head
  });
  it('the cutting edge leads the top-to-bottom strike at every phase (never trails)', () => {
    const { nodes } = setup();
    const axe = nodes.find((n) =>
      (n.fillRect.mock.calls as number[][]).some((r) => r[2] === 2 && r[3] === 15),
    )!;
    const blade = (axe.fillRect.mock.calls as number[][]).find((r) => r[2] === 6)!;
    const edgeSide = Math.sign(blade[0]! + blade[2]! / 2); // local x side the head is on
    // The strike turns the arm clockwise (rotation grows); the tip moves along local -x, so the edge side must be -x.
    for (const ph of [0.56, 0.6, 0.64, 0.66]) {
      const d = armAt('se', ph + 0.01) - armAt('se', ph);
      expect(d).toBeGreaterThan(0);
      expect(-edgeSide * Math.sign(d)).toBeGreaterThan(0);
    }
  });
  it('Animations Off keeps the static axe identical in front and back view', () => {
    const rot = (facing: Facing8) => {
      const { a, nodes } = setup();
      a.setMode('off');
      const arm = nodes.find((n) => n.name === 'armFrontUpper')!;
      a.setState('chop', { facing });
      a.update(0);
      return lastRot(arm);
    };
    expect(rot('ne')).toBeCloseTo(rot('se'));
  });
});
