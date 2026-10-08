import { describe, expect, it, vi } from 'vitest';
import { createFlameFlicker, flameSample, glowSample } from './flame';
import type { FlameLayer, FlameSample, FlameTarget } from './flame';
import { FLAME_DYING, FLAME_DYING_BLEND_MS, FLAME_MOTION } from './data';
import { idUnit } from './logic';

const ON = FLAME_MOTION.on;
const s = (): FlameSample => ({ scaleX: 1, scaleY: 1, dx: 0, alpha: 1 });

function layer(baseScale = 1, baseAlpha = 1): FlameLayer & { calls: Record<string, number[][]> } {
  const calls: Record<string, number[][]> = { pos: [], scale: [], alpha: [] };
  return {
    node: {
      setPosition: vi.fn((x: number, y?: number) => calls.pos!.push([x, y ?? x])),
      setScale: vi.fn((x: number, y?: number) => calls.scale!.push([x, y ?? x])),
      setAlpha: vi.fn((a: number) => calls.alpha!.push([a])),
    },
    baseX: 10,
    baseY: 20,
    baseScaleX: baseScale,
    baseScaleY: baseScale,
    baseAlpha,
    calls,
  };
}
const fire = (n = 3) => ({ layers: Array.from({ length: n }, () => layer()), glow: layer(1, 0.5) });
const last = (a: number[][]) => a.at(-1)!;

/** Peak-to-peak of scaleY for a layer over 10 s. */
function range(i: number, n: number, phase: number, dying: number): number {
  let lo = Infinity;
  let hi = -Infinity;
  const o = s();
  for (let t = 0; t < 10000; t += 20) {
    flameSample(i, n, t, phase, dying, ON, o);
    lo = Math.min(lo, o.scaleY);
    hi = Math.max(hi, o.scaleY);
  }
  return hi - lo;
}

describe('flameSample', () => {
  it('is deterministic: same fire, layer and time give the same flicker', () => {
    const a = flameSample(1, 3, 1234, 0.3, 0, ON, s());
    const b = flameSample(1, 3, 1234, 0.3, 0, ON, s());
    expect(a).toEqual(b);
  });
  it('different phases (fire ids) do not sync', () => {
    const a = flameSample(2, 3, 800, 0.1, 0, ON, s());
    const b = flameSample(2, 3, 800, 0.6, 0, ON, s());
    expect(a.scaleY).not.toBeCloseTo(b.scaleY, 3);
  });
  it('layers flicker at different rates and inner layers move more', () => {
    const outer = range(0, 3, 0.2, 0);
    const inner = range(2, 3, 0.2, 0);
    expect(inner).toBeGreaterThan(outer);
    expect(outer).toBeGreaterThan(0.02);
    const o0 = flameSample(0, 3, 500, 0.2, 0, ON, s());
    const o2 = flameSample(2, 3, 500, 0.2, 0, ON, s());
    expect(o0.scaleY).not.toBeCloseTo(o2.scaleY, 3);
  });
  it('a taller flame is narrower (scaleX moves against scaleY) and alpha/scale stay sane', () => {
    const o = s();
    for (let t = 0; t < 5000; t += 37) {
      flameSample(2, 3, t, 0.4, 0, ON, o);
      expect((o.scaleY - 1) * (o.scaleX - 1)).toBeLessThanOrEqual(1e-12);
      expect(o.scaleY).toBeGreaterThan(0.7);
      expect(o.scaleY).toBeLessThan(1.3);
      expect(o.alpha).toBeGreaterThan(0.7);
    }
  });
  it('dying lowers the amplitude and shrinks the flame', () => {
    expect(range(2, 3, 0.2, 1)).toBeLessThan(range(2, 3, 0.2, 0) * (FLAME_DYING.amp + 0.1));
    const o = flameSample(0, 1, 0, 0, 1, FLAME_MOTION.off, s());
    expect(o.scaleY).toBeCloseTo(FLAME_DYING.scale, 9);
  });
  it('sways slowly sideways, more at the upper layers; reduced has no sway; off is exactly still', () => {
    let maxTop = 0;
    let maxBottom = 0;
    for (let t = 0; t < 6000; t += 50) {
      maxTop = Math.max(maxTop, Math.abs(flameSample(2, 3, t, 0.2, 0, ON, s()).dx));
      maxBottom = Math.max(maxBottom, Math.abs(flameSample(0, 3, t, 0.2, 0, ON, s()).dx));
    }
    expect(maxTop).toBeGreaterThan(maxBottom);
    expect(maxTop).toBeGreaterThan(0.3);
    expect(flameSample(2, 3, 777, 0.2, 0, FLAME_MOTION.reduced, s()).dx).toBe(0);
    expect(flameSample(2, 3, 777, 0.2, 0, FLAME_MOTION.off, s())).toEqual({
      scaleX: 1,
      scaleY: 1,
      dx: 0,
      alpha: 1,
    });
  });
});

describe('glowSample', () => {
  it('pulses slowly around 1; dying dims it', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let loD = Infinity;
    let hiD = -Infinity;
    const o = s();
    for (let t = 0; t < 4000; t += 20) {
      glowSample(t, 0.2, 0, ON, o);
      lo = Math.min(lo, o.alpha);
      hi = Math.max(hi, o.alpha);
      glowSample(t, 0.2, 1, ON, o);
      loD = Math.min(loD, o.alpha);
      hiD = Math.max(hiD, o.alpha);
    }
    expect(hi - lo).toBeGreaterThan(0.1);
    expect(hiD).toBeLessThan(FLAME_DYING.glow * 1.1);
    expect(hiD - loD).toBeLessThan(hi - lo);
  });
});

describe('createFlameFlicker', () => {
  it('drives every layer and the glow from their base pose each update', () => {
    const f = createFlameFlicker(() => 'on');
    const t = fire();
    f.add('fire_1', t as FlameTarget);
    f.update(1000);
    for (const l of t.layers) {
      expect(l.calls.scale!.length).toBe(1);
      const [x, y] = last(l.calls.scale!);
      expect(x).not.toBe(1);
      expect(y).not.toBe(1);
      expect(last(l.calls.pos!)[1]).toBe(20); // sway is horizontal only
    }
    expect(t.glow.calls.alpha!.length).toBe(1);
    expect(last(t.glow.calls.alpha!)[0]).toBeLessThan(0.5 * 1.2);
  });
  it('is the same on a replay (deterministic per fire id) and differs between fires', () => {
    const run = (id: string) => {
      const f = createFlameFlicker(() => 'on');
      const t = fire(1);
      f.add(id, t as FlameTarget);
      f.update(2500);
      return last(t.layers[0]!.calls.scale!)[0];
    };
    expect(run('fire_7')).toBe(run('fire_7'));
    expect(run('fire_7')).not.toBe(run('fire_8'));
  });
  it('off mode writes the base pose and stays on it', () => {
    const f = createFlameFlicker(() => 'off');
    const t = fire(1);
    f.add('a', t as FlameTarget);
    f.update(100);
    f.update(900);
    const l = t.layers[0]!;
    expect(last(l.calls.scale!)).toEqual([1, 1]);
    expect(last(l.calls.pos!)).toEqual([10, 20]);
  });
  it('setDying eases the amplitude down over the blend time, not at once', () => {
    const amp = (dyingAt: number) => {
      const f = createFlameFlicker(() => 'on');
      const t = fire(3);
      f.add('z', t as FlameTarget);
      f.update(0);
      f.setDying('z', true);
      f.update(dyingAt);
      return last(t.layers[2]!.calls.scale!)[1];
    };
    const phase = idUnit('z');
    // 100 ms into an 800 ms blend: 1/8 of the way; long after: fully dying. Exactly the sampled values.
    expect(amp(100)).toBeCloseTo(
      flameSample(2, 3, 100, phase, 100 / FLAME_DYING_BLEND_MS, ON, s()).scaleY,
      9,
    );
    expect(amp(5000)).toBeCloseTo(flameSample(2, 3, 5000, phase, 1, ON, s()).scaleY, 9);
  });
  it('remove restores the base pose and stops driving; replacing an id keeps one entry', () => {
    const f = createFlameFlicker(() => 'on');
    const t = fire(2);
    f.add('x', t as FlameTarget);
    f.add('x', t as FlameTarget);
    expect(f.count()).toBe(1);
    f.update(300);
    f.remove('x');
    expect(f.count()).toBe(0);
    const l = t.layers[0]!;
    expect(last(l.calls.scale!)).toEqual([1, 1]);
    const n = l.calls.scale!.length;
    f.update(900);
    expect(l.calls.scale!.length).toBe(n);
  });
  it('skips invisible hosts and drops inactive ones', () => {
    const f = createFlameFlicker(() => 'on');
    const host = { active: true, visible: false };
    const t = { ...fire(1), host };
    f.add('h', t as FlameTarget);
    f.update(500);
    expect(t.layers[0]!.calls.scale!.length).toBe(0);
    host.visible = true;
    f.update(600);
    expect(t.layers[0]!.calls.scale!.length).toBe(1);
    host.active = false;
    f.update(700);
    expect(f.count()).toBe(0);
  });
});
