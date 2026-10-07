import { describe, expect, it } from 'vitest';
import { followOffset, hudInsets, withStackedAbove } from './visibleArea';

const canvas = { left: 0, top: 0, right: 390, bottom: 844 };

describe('hudInsets', () => {
  it('phone bottom sheet covers the bottom of the canvas', () => {
    const sheet = { left: 0, top: 500, right: 390, bottom: 844 };
    expect(hudInsets(canvas, sheet)).toEqual({ right: 0, bottom: 344 });
  });
  it('landscape side panel covers the right', () => {
    const c = { left: 0, top: 0, right: 800, bottom: 390 };
    expect(hudInsets(c, { left: 520, top: 0, right: 800, bottom: 390 })).toEqual({
      right: 280,
      bottom: 0,
    });
  });
  it('a desktop sidebar beside the canvas, or no hud, covers nothing', () => {
    const c = { left: 0, top: 0, right: 1100, bottom: 800 };
    expect(hudInsets(c, { left: 1100, top: 0, right: 1400, bottom: 800 })).toEqual({
      right: 0,
      bottom: 0,
    });
    expect(hudInsets(c, null)).toEqual({ right: 0, bottom: 0 });
  });
});

describe('followOffset', () => {
  it('shifts the camera centre down by half the covered height, in world px', () => {
    expect(followOffset({ right: 0, bottom: 300 }, 1.5)).toEqual({ x: -0, y: -100 });
  });
});

describe('withStackedAbove', () => {
  const hud = { left: 0, top: 500, right: 390, bottom: 844 };
  it('extends the HUD over a strip sitting directly on top of it', () => {
    const strip = { left: 0, top: 450, right: 390, bottom: 500 };
    expect(withStackedAbove(hud, strip)?.top).toBe(450);
  });
  it('ignores a strip elsewhere (desktop chatbox) or a missing HUD', () => {
    expect(withStackedAbove(hud, { left: 8, top: 600, right: 400, bottom: 720 })).toBe(hud);
    expect(withStackedAbove(null, hud)).toBeNull();
  });
});
