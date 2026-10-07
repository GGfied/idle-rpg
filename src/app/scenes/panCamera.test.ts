import { describe, expect, it } from 'vitest';
import { clampCentreToDiamond, panScroll } from './panCamera';

const view = { width: 800, height: 600, zoom: 1 };

describe('panScroll', () => {
  it('moves the scroll opposite to the drag, divided by zoom', () => {
    expect(panScroll({ x: 100, y: 100 }, { dx: 30, dy: -20 }, view)).toEqual({
      x: 70,
      y: 120,
    });
    expect(panScroll({ x: 100, y: 100 }, { dx: 30, dy: -20 }, { ...view, zoom: 2 })).toEqual({
      x: 85,
      y: 110,
    });
  });
  it('ignores NaN and a zero zoom', () => {
    const s = { x: 5, y: 5 };
    expect(panScroll(s, { dx: NaN, dy: 0 }, view)).toBe(s);
    expect(panScroll(s, { dx: 1, dy: 1 }, { ...view, zoom: 0 })).toBe(s);
  });
});

describe('clampCentreToDiamond', () => {
  const box = { x: -1000, y: 0, width: 2000, height: 1000 };
  const v = { width: 400, height: 300 };
  const centre = (s: { x: number; y: number }) => ({ x: s.x + 200 - 0, y: s.y + 150 - 500 });
  const k = (s: { x: number; y: number }) => {
    const c = centre(s);
    return Math.abs(c.x) / 1000 + Math.abs(c.y) / 500;
  };
  it('leaves a centre inside the diamond alone', () => {
    const s = { x: -200, y: 350 };
    expect(clampCentreToDiamond(s, v, box)).toBe(s);
  });
  it.each([
    ['east corner', { x: 900, y: 350 }],
    ['south corner', { x: -200, y: 900 }],
    ['se edge far out', { x: 2810, y: 215 }],
    ['nw far out', { x: -2758, y: -394 }],
  ])('pulls %s back onto the diamond edge', (_n, s) => {
    expect(k(s)).toBeGreaterThan(1);
    expect(k(clampCentreToDiamond(s, v, box))).toBeCloseTo(1, 6);
  });
  it('ignores a degenerate box', () => {
    const s = { x: 5, y: 5 };
    expect(clampCentreToDiamond(s, v, { x: 0, y: 0, width: 0, height: 0 })).toBe(s);
  });
});
