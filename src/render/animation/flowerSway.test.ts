import { describe, expect, it } from 'vitest';
import type Phaser from 'phaser';
import { FLOWER_SWAY } from './data';
import { createFlowerSway } from './flowerSway';
import type { MotionMode } from './types';

const DEG = Math.PI / 180;
const VIEW = { x: 0, y: 0, right: 1000, bottom: 1000 };

function img(x = 100, y = 100) {
  return { x, y, rotation: 0, visible: true, active: true };
}
const asImage = (i: ReturnType<typeof img>): Phaser.GameObjects.Image =>
  i as unknown as Phaser.GameObjects.Image;

describe('createFlowerSway', () => {
  it('on: leans within the per-mode bound; off: exactly still; reduced: subtler', () => {
    const peak = (mode: MotionMode): number => {
      const s = createFlowerSway(() => mode);
      const f = img();
      s.add(asImage(f));
      let max = 0;
      for (let t = 0; t < 40000; t += 40) {
        s.update(t, VIEW);
        max = Math.max(max, Math.abs(f.rotation));
      }
      return max / DEG;
    };
    const on = peak('on');
    expect(on).toBeGreaterThan(2);
    expect(on).toBeLessThanOrEqual(FLOWER_SWAY.on.swayDeg + FLOWER_SWAY.on.gustDeg + 1e-9);
    expect(peak('off')).toBe(0);
    const reduced = peak('reduced');
    expect(reduced).toBeGreaterThan(0);
    expect(reduced).toBeLessThanOrEqual(FLOWER_SWAY.reduced.swayDeg + 1e-9);
    expect(reduced).toBeLessThan(on / 2);
  });

  it('off clears a leftover lean; mode switches apply live', () => {
    let mode: MotionMode = 'on';
    const s = createFlowerSway(() => mode);
    const f = img();
    s.add(asImage(f));
    s.update(500, VIEW);
    expect(f.rotation).not.toBe(0);
    mode = 'off';
    s.update(600, VIEW);
    expect(f.rotation).toBe(0);
  });

  it('phase is deterministic per position and differs between positions', () => {
    const at = (x: number, y: number): number => {
      const s = createFlowerSway(() => 'on');
      const f = img(x, y);
      s.add(asImage(f));
      s.update(777, VIEW);
      return f.rotation;
    };
    expect(at(120, 340)).toBe(at(120, 340));
    expect(at(120, 340)).not.toBeCloseTo(at(121, 341), 5);
  });

  it('skips pooled-away and off-screen images, prunes destroyed ones', () => {
    const s = createFlowerSway(() => 'on');
    const pooled = img();
    const far = img(5000, 5000);
    const dead = img();
    const live = img();
    for (const f of [pooled, far, dead, live]) s.add(asImage(f));
    pooled.visible = false;
    dead.active = false;
    s.update(900, VIEW);
    expect(pooled.rotation).toBe(0);
    expect(far.rotation).toBe(0);
    expect(dead.rotation).toBe(0);
    expect(live.rotation).not.toBe(0);
    expect(s.count()).toBe(3);
  });

  it('a pooled image that moves gets a new phase', () => {
    const s = createFlowerSway(() => 'on');
    const f = img(100, 100);
    s.add(asImage(f));
    s.update(777, VIEW);
    const a = f.rotation;
    f.x = 333;
    f.y = 222;
    s.update(777, VIEW);
    expect(f.rotation).not.toBeCloseTo(a, 5);
  });
});
