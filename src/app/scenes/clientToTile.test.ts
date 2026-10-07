import { describe, expect, it } from 'vitest';
import { isoProjection } from '@render/index';
import { clientToTile } from './clientToTile';

const bounds = { width: 40, height: 30 };
const cam = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 };
const canvas = { width: 800, height: 600 };
const rect = { left: 10, top: 20, width: 800, height: 600 };
/** Client px of a tile's diamond centre for a camera at scroll (0,0), zoom 1, no CSS scale. */
const centreOf = (x: number, y: number) => {
  const w = isoProjection.tileToWorld(x, y);
  return { x: rect.left + w.x, y: rect.top + w.y };
};

describe('clientToTile', () => {
  it('maps the centre of an iso tile back to that tile (offset canvas)', () => {
    const c = centreOf(12, 9);
    expect(clientToTile(c.x, c.y, rect, canvas, cam, bounds)).toEqual({ x: 12, y: 9 });
  });

  it('accounts for a CSS-scaled canvas (the 880x728 backing vs 1100x910 box bug)', () => {
    const scaled = { left: 0, top: 0, width: 1000, height: 750 }; // 1.25x
    const w = isoProjection.tileToWorld(14, 11);
    const tile = clientToTile(w.x * 1.25, w.y * 1.25, scaled, canvas, cam, bounds);
    expect(tile).toEqual({ x: 14, y: 11 });
  });

  it('applies camera scroll and zoom about the viewport centre', () => {
    const z = { scrollX: 100, scrollY: 50, zoom: 2, width: 800, height: 600 };
    const w = isoProjection.tileToWorld(10, 7);
    // world -> canvas px: centre + (w - (scroll + centre)) * zoom
    const cx = 400 + (w.x - (100 + 400)) * 2;
    const cy = 300 + (w.y - (50 + 300)) * 2;
    expect(clientToTile(rect.left + cx, rect.top + cy, rect, canvas, z, bounds)).toEqual({
      x: 10,
      y: 7,
    });
  });

  it('returns null outside the map and for a zero-size rect', () => {
    expect(clientToTile(-500, 10, rect, canvas, cam, bounds)).toBeNull();
    expect(clientToTile(5, 5, { ...rect, width: 0 }, canvas, cam, bounds)).toBeNull();
  });
});
