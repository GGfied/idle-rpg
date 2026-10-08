import { afterEach, describe, expect, it } from 'vitest';
import { attachLabelClamp } from './labelClampHook';
import {
  KEEP_OUT_PAD,
  MAX_SIDE_SHIFT,
  keepOutShift,
  setLabelKeepOuts,
  type KeepOutSet,
} from './labelKeepOut';

const orbs: KeepOutSet = {
  width: 400,
  height: 800,
  rects: [{ left: 300, top: 0, right: 400, bottom: 120 }],
};
const out = { dx: 0, dy: 0 };

describe('keepOutShift', () => {
  it('does not move a label that clears the rect', () => {
    keepOutShift(100, 100, 150, 116, orbs, out);
    expect(out).toEqual({ dx: 0, dy: 0 });
  });
  it('moves the cheapest way out, with the pad', () => {
    keepOutShift(280, 40, 330, 56, orbs, out); // 20px into the rect from the left: go left
    expect(out.dy).toBe(0);
    expect(330 + out.dx).toBe(300 - KEEP_OUT_PAD);
    keepOutShift(310, 100, 360, 116, orbs, out); // near the bottom edge: go down
    expect(out.dx).toBe(0);
    expect(100 + out.dy).toBe(120 + KEEP_OUT_PAD);
  });
  it('is continuous as the label slides (no flips)', () => {
    let prev = 0;
    for (let x = 240; x < 285; x += 1) {
      keepOutShift(x, 60, x + 50, 76, orbs, out);
      const mag = Math.abs(out.dx) + Math.abs(out.dy);
      expect(Math.abs(mag - prev)).toBeLessThanOrEqual(2.01);
      prev = mag;
    }
  });
  it('skips options that leave the canvas', () => {
    // flush right edge: right option invalid; label at the very top-left of rect, left needs room
    keepOutShift(
      310,
      0,
      360,
      16,
      { ...orbs, rects: [{ left: 0, top: 0, right: 400, bottom: 20 }] },
      out,
    );
    expect(out.dx).toBe(0);
    expect(out.dy).toBe(20 + KEEP_OUT_PAD);
  });
  it('resolves several rects', () => {
    const two: KeepOutSet = {
      width: 400,
      height: 800,
      rects: [
        { left: 300, top: 0, right: 400, bottom: 60 },
        { left: 200, top: 0, right: 300, bottom: 60 },
      ],
    };
    keepOutShift(250, 10, 350, 26, two, out);
    const [l, t] = [250 + out.dx, 10 + out.dy];
    const r = l + 100;
    for (const k of two.rects) {
      const overlap = r > k.left && l < k.right && t + 16 > k.top && t < k.bottom;
      expect(overlap).toBe(false);
    }
  });
});

describe('keepOutShift side cap', () => {
  const wide: KeepOutSet = {
    width: 400,
    height: 800,
    rects: [{ left: 100, top: 0, right: 300, bottom: 300 }],
  };
  it('stays sideways under the cap', () => {
    keepOutShift(70, 40, 120, 56, wide, out); // needs ~34 left
    expect(out.dy).toBe(0);
    expect(Math.abs(out.dx)).toBeLessThanOrEqual(MAX_SIDE_SHIFT);
    expect(out.dx).not.toBe(0);
  });
  it('goes below when sideways exceeds the cap', () => {
    keepOutShift(180, 40, 230, 56, wide, out); // dead centre: ~100 sideways
    expect(out.dx).toBe(0);
    expect(40 + out.dy).toBe(300 + KEEP_OUT_PAD);
  });
  it('never moves sideways past the cap and has no oscillation over a 1px sweep', () => {
    let flips = 0;
    let prevSide: boolean | null = null;
    for (let x = 60; x <= 320; x += 1) {
      keepOutShift(x, 40, x + 50, 56, wide, out);
      expect(Math.abs(out.dx)).toBeLessThanOrEqual(MAX_SIDE_SHIFT);
      const side = out.dy === 0;
      if (out.dx === 0 && out.dy === 0) continue;
      if (prevSide !== null && side !== prevSide) flips++;
      prevSide = side;
    }
    expect(flips).toBeLessThanOrEqual(2); // side -> below -> side, once each way
  });
});

describe('attachLabelClamp with keep-outs', () => {
  afterEach(() => setLabelKeepOuts(null));
  function setup() {
    const fns = new Set<() => void>();
    // view = 400x800 world px at zoom 1, so CSS px == world px
    const cam = {
      worldView: { left: 0, right: 400, top: 0, width: 400, height: 800 },
      on: (_e: 'prerender', fn: () => void) => fns.add(fn),
      off: (_e: 'prerender', fn: () => void) => fns.delete(fn),
      frame: () => fns.forEach((f) => f()),
    };
    const body = { x: 340, y: 100 };
    const label = { visible: true, x: 0, y: -40, width: 50, height: 16 };
    attachLabelClamp(cam, body, label, 4);
    return { cam, body, label };
  }
  it('keeps the label out of the orb rect, same frame', () => {
    setLabelKeepOuts(() => orbs);
    const { cam, body, label } = setup();
    cam.frame();
    const l = body.x + label.x - 25;
    const r = l + 50;
    const b = body.y + label.y;
    const t = b - 16;
    const overlap = r > 300 && l < 400 && b > 0 && t < 120;
    expect(overlap).toBe(false);
  });
  it('is identical to before when no keep-outs are published', () => {
    const { cam, label } = setup();
    cam.frame();
    expect(label.y).toBe(-40);
    expect(label.x).toBeLessThanOrEqual(0);
  });
});
