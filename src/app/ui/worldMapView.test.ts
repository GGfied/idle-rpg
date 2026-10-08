import { describe, expect, it } from 'vitest';
import { WORLD_MAP_MAX_PX_PER_TILE } from '@render/index';
import {
  centreOn,
  initialView,
  panView,
  wheelZoomFactor,
  worldMapKeyIntent,
  zoomView,
} from '@app/ui/worldMapView';

const bounds = { width: 200, height: 100 };
const start = () => initialView(400, 400, bounds);
// frame 400x400, world 200x100 fits at 2px/tile -> world is 400x200: wider fits, height is smaller.

describe('world map view', () => {
  it('opens fitted and centred on the world (not on the player)', () => {
    const v = start();
    expect(v.pxPerTile).toBe(2);
    expect(v.centre).toEqual({ x: 100, y: 50 });
  });

  it('opens centred in a wide frame too (world narrower than frame)', () => {
    const v = initialView(1000, 400, bounds);
    expect(v.pxPerTile).toBe(4);
    expect(v.centre).toEqual({ x: 100, y: 50 });
  });

  it('zoom clamps to fit-min and the max', () => {
    expect(zoomView(start(), 0.01).pxPerTile).toBe(2);
    expect(zoomView(start(), 1000).pxPerTile).toBe(WORLD_MAP_MAX_PX_PER_TILE);
  });

  it('smaller world: panning cannot move it off-centre', () => {
    expect(panView(start(), 500, 500).centre).toEqual({ x: 100, y: 50 });
    expect(panView(start(), -500, -500).centre).toEqual({ x: 100, y: 50 });
  });

  describe('larger world (zoomed in 4x: 800x400 px world vs 400x400 frame)', () => {
    const zoomed = () => ({ ...start(), pxPerTile: 8 }); // half-frame = 25 tiles x, 25 y
    it('clamps all four edges so the frame stays filled', () => {
      const z = zoomed();
      expect(panView(z, 1e6, 0).centre.x).toBe(25); // drag right -> left edge
      expect(panView(z, -1e6, 0).centre.x).toBe(175); // drag left -> right edge
      expect(panView(z, 0, 1e6).centre.y).toBe(25); // drag down -> top edge
      expect(panView(z, 0, -1e6).centre.y).toBe(75); // drag up -> bottom edge
    });
    it('pans freely inside the allowed range', () => {
      const v = panView(zoomed(), 80, -40);
      expect(v.centre).toEqual({ x: 90, y: 55 });
    });
  });

  it('mixed axes: wide world fills x while tall axis stays centred', () => {
    const v = panView({ ...start(), pxPerTile: 4 }, 1e6, 1e6); // 800x400 world, frame 400
    expect(v.centre).toEqual({ x: 50, y: 50 });
  });

  it('zooms toward the pointer, keeping that tile fixed when the clamp allows', () => {
    const v = { ...start(), pxPerTile: 4, centre: { x: 100, y: 50 } };
    const ax = 300;
    const ay = 200;
    const tile = (w: typeof v) => ({
      x: w.centre.x + (ax - w.w / 2) / w.pxPerTile,
      y: w.centre.y + (ay - w.h / 2) / w.pxPerTile,
    });
    const z = zoomView(v, 2, ax, ay);
    expect(tile(z).x).toBeCloseTo(tile(v).x);
    expect(tile(z).y).toBeCloseTo(tile(v).y);
  });

  it('zoom anchored at a corner is clamped, never exposing empty space', () => {
    const z = zoomView(start(), 4, 0, 0); // anchor top-left of the frame
    expect(z.pxPerTile).toBe(8);
    expect(z.centre.x).toBeGreaterThanOrEqual(25);
    expect(z.centre.y).toBeGreaterThanOrEqual(25);
    const out = zoomView({ ...start(), pxPerTile: 8, centre: { x: 25, y: 25 } }, 0.01);
    expect(out.pxPerTile).toBe(2);
    expect(out.centre).toEqual({ x: 100, y: 50 });
  });

  it('centre on me at zoom: exact when inside, clamped near a corner, zoom unchanged', () => {
    const z = { ...start(), pxPerTile: 8 };
    expect(centreOn(z, { x: 90, y: 60 }).centre).toEqual({ x: 90, y: 60 });
    const c = centreOn(z, { x: 3, y: 98 });
    expect(c.centre).toEqual({ x: 25, y: 75 });
    expect(c.pxPerTile).toBe(8);
  });

  it('wheel up zooms in, down zooms out; Escape closes', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(worldMapKeyIntent('Escape')).toBe('close');
    expect(worldMapKeyIntent('a')).toBeNull();
  });
});
