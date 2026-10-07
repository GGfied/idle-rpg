import { describe, expect, it } from 'vitest';
import { cameraRect, CULL_MARGIN, isNearView } from './viewCull';

describe('viewCull', () => {
  it('cameraRect shrinks around the centre when zoomed in', () => {
    const r = cameraRect({ scrollX: 100, scrollY: 50, zoom: 2, width: 400, height: 200 });
    expect(r).toEqual({ left: 200, top: 100, right: 400, bottom: 200 });
  });
  it('cameraRect at zoom 1 is scroll..scroll+size', () => {
    expect(cameraRect({ scrollX: 10, scrollY: 20, zoom: 1, width: 300, height: 100 })).toEqual({
      left: 10,
      top: 20,
      right: 310,
      bottom: 120,
    });
  });
  it('keeps things inside the view and within the margin, hides the rest', () => {
    const v = { left: 0, top: 0, right: 100, bottom: 100 };
    expect(isNearView(50, 50, v)).toBe(true);
    expect(isNearView(100 + CULL_MARGIN.right, 100 + CULL_MARGIN.top, v)).toBe(true);
    expect(isNearView(100 + CULL_MARGIN.right + 1, 50, v)).toBe(false);
    expect(isNearView(50, 100 + CULL_MARGIN.top + 1, v)).toBe(false);
    expect(isNearView(50, -CULL_MARGIN.bottom - 1, v)).toBe(false);
    expect(isNearView(-CULL_MARGIN.left - 1, 50, v)).toBe(false);
  });
});
