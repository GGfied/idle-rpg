import { describe, expect, it } from 'vitest';
import { minZoomForWindow } from './zoomLimit';

describe('minZoomForWindow', () => {
  it('lets a laptop viewport zoom out to about 0.7', () => {
    const z = minZoomForWindow({ width: 1200, height: 800 }, 1, 32);
    expect(z).toBeGreaterThan(0.65);
    expect(z).toBeLessThan(0.72);
  });
  it('grows with the view and shrinks with a wider window', () => {
    const small = minZoomForWindow({ width: 800, height: 600 }, 1, 32);
    const big = minZoomForWindow({ width: 1920, height: 1080 }, 1, 32);
    expect(big).toBeGreaterThan(small);
    expect(minZoomForWindow({ width: 1920, height: 1080 }, 2, 32)).toBeCloseTo(big / 2, 5);
  });
  it('a view exactly that zoomed out just touches the loaded diamond', () => {
    const view = { width: 1000, height: 700 };
    const z = minZoomForWindow(view, 1, 32);
    // corner of the visible rectangle sits on the diamond edge: |x|/2048 + |y|/1024 = 1
    expect(view.width / 2 / z / 2048 + view.height / 2 / z / 1024).toBeCloseTo(1, 5);
  });
  it('returns 0 for a window with no radius', () => {
    expect(minZoomForWindow({ width: 100, height: 100 }, 0, 32)).toBe(0);
  });
});
