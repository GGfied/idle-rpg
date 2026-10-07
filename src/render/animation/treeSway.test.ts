import { describe, expect, it } from 'vitest';
import type { TreeView } from '@render/index';
import { MOTION } from './data';
import { gustEnvelope, idUnit, swayAngle } from './logic';
import { createTreeSway } from './treeSway';
import type { MotionMode } from './types';

const DEG = Math.PI / 180;

function fakeView(x = 0): {
  view: TreeView;
  art: { rotation: number; visible: boolean };
  c: { x: number; active: boolean; visible: boolean };
} {
  const art = { rotation: 0, visible: true };
  const c = { x, active: true, visible: true, list: [art] };
  return { view: { container: c } as unknown as TreeView, art, c };
}

/** Largest |angle| over a long span for one tree. */
function peak(mode: MotionMode, id: string, x: number): number {
  const m = MOTION[mode];
  let max = 0;
  for (let t = 0; t < 60000; t += 50)
    max = Math.max(max, Math.abs(swayAngle(m, t, x, idUnit(id), idUnit(id + '#'))));
  return max;
}

describe('swayAngle amplitude per mode', () => {
  it('on sways a few degrees, never beyond sway + gust', () => {
    const p = peak('on', 'tree_a', 100) / DEG;
    expect(p).toBeGreaterThan(1.5);
    expect(p).toBeLessThanOrEqual(MOTION.on.swayDeg + MOTION.on.gustDeg + 1e-9);
  });
  it('reduced is much subtler than on, with no gusts', () => {
    const p = peak('reduced', 'tree_a', 100) / DEG;
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(MOTION.reduced.swayDeg + 1e-9);
    expect(p).toBeLessThan(peak('on', 'tree_a', 100) / DEG / 2);
    expect(MOTION.reduced.swayPeriodMs).toBeGreaterThan(MOTION.on.swayPeriodMs);
  });
  it('off is exactly still', () => {
    expect(peak('off', 'tree_a', 100)).toBe(0);
  });
});

describe('per-tree variation', () => {
  it('idUnit is deterministic, in [0,1) and differs per id', () => {
    expect(idUnit('tree_1')).toBe(idUnit('tree_1'));
    expect(idUnit('tree_1')).not.toBe(idUnit('tree_2'));
    for (const id of ['a', 'tree_9', 'oak_12', '']) {
      expect(idUnit(id)).toBeGreaterThanOrEqual(0);
      expect(idUnit(id)).toBeLessThan(1);
    }
  });
  it('same time, different ids sway differently; same id is repeatable', () => {
    const m = MOTION.on;
    const a = swayAngle(m, 1234, 0, idUnit('t1'), idUnit('t1#'));
    const b = swayAngle(m, 1234, 0, idUnit('t2'), idUnit('t2#'));
    expect(a).not.toBeCloseTo(b, 4);
    expect(swayAngle(m, 1234, 0, idUnit('t1'), idUnit('t1#'))).toBe(a);
  });
});

describe('gust wave', () => {
  it('is 0..1 and travels: the peak moves with x over time', () => {
    for (let t = 0; t < 20000; t += 500) {
      const g = gustEnvelope(t, 300);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
    let best = 0;
    let bestT = 0;
    for (let t = 0; t < 15000; t += 25) {
      const g = gustEnvelope(t, 0);
      if (g > best) {
        best = g;
        bestT = t;
      }
    }
    expect(best).toBeCloseTo(1, 2);
    expect(gustEnvelope(bestT, 0)).toBeGreaterThan(gustEnvelope(bestT, 400));
  });
});

describe('createTreeSway', () => {
  it('rotates visible standing trees and resets on remove', () => {
    let mode: MotionMode = 'on';
    const sway = createTreeSway(() => mode);
    const t = fakeView();
    sway.add('t1', t.view);
    sway.update(900);
    expect(t.art.rotation).not.toBe(0);
    mode = 'off';
    sway.update(1000);
    expect(t.art.rotation).toBe(0);
    mode = 'on';
    sway.update(900);
    sway.remove('t1');
    expect(t.art.rotation).toBe(0);
    expect(sway.count()).toBe(0);
  });
  it('does not sway stumps (art hidden) or culled containers, and clears a stump lean', () => {
    const sway = createTreeSway(() => 'on');
    const stump = fakeView();
    const culled = fakeView();
    sway.add('s', stump.view);
    sway.add('c', culled.view);
    stump.art.visible = false;
    stump.art.rotation = 0.05;
    culled.c.visible = false;
    sway.update(900);
    expect(stump.art.rotation).toBe(0);
    expect(culled.art.rotation).toBe(0);
  });
  it('drops destroyed views without touching them and keeps the rest', () => {
    const sway = createTreeSway(() => 'on');
    const a = fakeView();
    const b = fakeView();
    sway.add('a', a.view);
    sway.add('b', b.view);
    a.c.active = false;
    sway.update(900);
    expect(sway.count()).toBe(1);
    expect(b.art.rotation).not.toBe(0);
  });
  it('is deterministic per id and re-add replaces', () => {
    const run = (): number => {
      const s = createTreeSway(() => 'on');
      const t = fakeView(50);
      s.add('same', t.view);
      s.add('same', t.view);
      expect(s.count()).toBe(1);
      s.update(777);
      return t.art.rotation;
    };
    expect(run()).toBe(run());
  });
});
