import { describe, expect, it } from 'vitest';
import { isOpenWater, shoreField, waterCornerColor } from './waterShade';

/** Water column x=5..9 between sand/grass, bridge at (7,3). */
const kinds = (x: number, y: number) => {
  if (x < 0 || y < 0 || x >= 16 || y >= 8) return undefined;
  if (x === 7 && y === 3) return 'bridge';
  return x >= 5 && x <= 9 ? 'water' : 'sand';
};
const lum = (c: number) => ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.6 + (c & 255) * 0.1;

describe('water shading', () => {
  it('treats water, bridge and unknown as open water, everything else as land', () => {
    expect([undefined, 'water', 'bridge'].every(isOpenWater)).toBe(true);
    expect(['sand', 'grass', 'path', 'wall', 'floor'].some(isOpenWater)).toBe(false);
  });

  it('distance field: 0 on land, 1 beside it, growing towards the middle, bridge counts as water', () => {
    const f = shoreField(kinds, 0, 0, 16, 8);
    expect(f.at(3, 3)).toBe(0);
    expect(f.at(5, 3)).toBe(1);
    expect(f.at(6, 3)).toBe(2);
    expect(f.at(7, 3)).toBe(3);
    expect(f.at(7, 3)).toBeGreaterThan(f.at(6, 3));
    expect(f.at(-100, 0)).toBeGreaterThan(5); // far outside the padded grid = deep
  });

  it('colour: lighter turquoise in the shallows, deeper blue mid-lake, same colour on both sides of a tile edge', () => {
    const f = shoreField(kinds, 0, 0, 16, 8);
    const shore = waterCornerColor(f, 4.5, 4.5);
    const mid = waterCornerColor(f, 7.5, 4.5);
    expect(lum(shore)).toBeGreaterThan(lum(mid) + 25);
    expect(mid & 255).toBeGreaterThan((mid >> 16) & 255); // blue-dominant
    // a corner is one value no matter which tile asks (continuity => no tile grid)
    expect(waterCornerColor(f, 7.5, 4.5)).toBe(mid);
    // gradient steps are small between adjacent corners
    const a = waterCornerColor(f, 5.5, 4.5);
    const b = waterCornerColor(f, 6.5, 4.5);
    expect(Math.abs(lum(a) - lum(b))).toBeLessThan(60);
  });
});
