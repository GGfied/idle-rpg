import { describe, expect, it } from 'vitest';
import { clientToTile } from './clientToTile';

const bounds = { width: 40, height: 30 };
// Camera 800x600 looking at world (0,0) with zoom 1: canvas px == world px; tile = 32 px.
const cam = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 };

describe('clientToTile', () => {
  it('maps an unscaled canvas offset by the page position', () => {
    const rect = { left: 10, top: 20, width: 800, height: 600 };
    expect(clientToTile(10 + 33, 20 + 65, rect, { width: 800, height: 600 }, cam, bounds)).toEqual({
      x: 1,
      y: 2,
    });
  });

  it('accounts for a CSS-scaled canvas (the 880x728 backing vs 1100x910 box bug)', () => {
    const rect = { left: 0, top: 0, width: 1000, height: 750 }; // 1.25x
    // client (1000*0.5+..): canvas px (400+33, 300+65) -> tile (13, 11) with 32px tiles
    const tile = clientToTile(
      (400 + 33) * 1.25,
      (300 + 65) * 1.25,
      rect,
      { width: 800, height: 600 },
      cam,
      bounds,
    );
    expect(tile).toEqual({ x: 13, y: 11 });
  });

  it('applies camera scroll and zoom about the viewport centre', () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    const z = { scrollX: 100, scrollY: 50, zoom: 2, width: 800, height: 600 };
    // centre pixel (400,300) is world (100+400, 50+300) = (500,350); +64 screen px = +32 world px
    expect(clientToTile(464, 300, rect, { width: 800, height: 600 }, z, bounds)).toEqual({
      x: 16,
      y: 10,
    });
  });

  it('returns null outside the map and for a zero-size rect', () => {
    const rect = { left: 0, top: 0, width: 800, height: 600 };
    const c = { width: 800, height: 600 };
    expect(clientToTile(-5, 10, rect, c, cam, bounds)).toBeNull();
    expect(clientToTile(5, 5, { ...rect, width: 0 }, c, cam, bounds)).toBeNull();
  });
});
