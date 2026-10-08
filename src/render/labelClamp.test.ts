import { describe, expect, it } from 'vitest';
import { labelClampOffset } from './labelClamp';

const L = 100;
const R = 490; // 390 px wide view
describe('labelClampOffset', () => {
  it('leaves a label alone when it fits', () => {
    expect(labelClampOffset(300, 25, L, R, 4)).toBe(0);
  });
  it('pulls a label at the right edge fully inside', () => {
    const x = 480 + labelClampOffset(480, 25, L, R, 4);
    expect(x + 25).toBeLessThanOrEqual(R - 4);
    expect(x).toBeLessThan(480);
  });
  it('pulls a label past the left edge fully inside', () => {
    const x = 90 + labelClampOffset(90, 25, L, R, 4);
    expect(x - 25).toBeGreaterThanOrEqual(L + 4);
  });
  it('handles an entity far off-screen', () => {
    const x = 2000 + labelClampOffset(2000, 25, L, R, 4);
    expect(x + 25).toBeLessThanOrEqual(R - 4);
  });
  it('centres a label wider than the view', () => {
    expect(labelClampOffset(0, 400, L, R, 4) + 0).toBe(295);
  });
});
