import { describe, expect, it } from 'vitest';
import { clampScroll, panScroll } from './panCamera';

const world = { width: 1280, height: 960 };
const view = { width: 800, height: 600, zoom: 1 };

describe('panScroll', () => {
  it('moves the scroll opposite to the drag, divided by zoom', () => {
    expect(panScroll({ x: 100, y: 100 }, { dx: 30, dy: -20 }, view, world)).toEqual({
      x: 70,
      y: 120,
    });
    expect(panScroll({ x: 100, y: 100 }, { dx: 30, dy: -20 }, { ...view, zoom: 2 }, world)).toEqual(
      {
        x: 85,
        y: 110,
      },
    );
  });
  it('clamps to the world edges (zoom 1: scroll within 0..world-view)', () => {
    expect(panScroll({ x: 10, y: 10 }, { dx: 500, dy: 500 }, view, world)).toEqual({ x: 0, y: 0 });
    expect(panScroll({ x: 470, y: 350 }, { dx: -500, dy: -500 }, view, world)).toEqual({
      x: 480,
      y: 360,
    });
  });
  it('uses the zoomed range: at zoom 2 the scroll may go negative by half the view', () => {
    const z = { ...view, zoom: 2 };
    expect(clampScroll({ x: -9999, y: -9999 }, z, world)).toEqual({ x: -200, y: -150 });
    expect(clampScroll({ x: 9999, y: 9999 }, z, world)).toEqual({ x: 680, y: 510 });
  });
  it('ignores NaN and a zero zoom', () => {
    const s = { x: 5, y: 5 };
    expect(panScroll(s, { dx: NaN, dy: 0 }, view, world)).toBe(s);
    expect(panScroll(s, { dx: 1, dy: 1 }, { ...view, zoom: 0 }, world)).toBe(s);
  });
});
