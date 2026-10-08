import { describe, expect, it } from 'vitest';
import { keepOutSet } from '@app/scenes/keepOutRects';

const canvas = { left: 10, top: 20, right: 410, bottom: 820 };

describe('keepOutSet', () => {
  it('shifts boxes into canvas space and reports the canvas size', () => {
    const s = keepOutSet(canvas, [{ left: 310, top: 30, right: 410, bottom: 130 }]);
    expect(s.width).toBe(400);
    expect(s.height).toBe(800);
    expect(s.rects).toEqual([{ left: 300, top: 10, right: 400, bottom: 110 }]);
  });
  it('clips boxes to the canvas and drops ones outside it or collapsed', () => {
    const s = keepOutSet(canvas, [
      { left: 400, top: 700, right: 600, bottom: 900 },
      { left: 420, top: 0, right: 700, bottom: 900 },
      { left: 50, top: 50, right: 52, bottom: 90 },
    ]);
    expect(s.rects).toEqual([{ left: 390, top: 680, right: 400, bottom: 800 }]);
  });
});
