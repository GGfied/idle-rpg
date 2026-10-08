import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildMinimapImage,
  clampWorldMapScale,
  clearMinimapLabelCache,
  drawWorldMap,
  WORLD_MAP_MAX_PX_PER_TILE,
  worldMapPxToTile,
  worldMapTileToPx,
  type Minimap2D,
  type WorldMapView,
} from './minimap';

function fake() {
  const calls: string[] = [];
  const args: Record<string, unknown[][]> = {};
  const ctx = new Proxy(
    {},
    {
      get: (_t, k: string) =>
        k === 'measureText'
          ? (t: string) => ({ width: t.length * 6 })
          : (...a: unknown[]) => {
              calls.push(k);
              (args[k] ??= []).push(a);
            },
      set: () => true,
    },
  ) as unknown as Minimap2D;
  return { ctx, calls, args };
}

const view: WorldMapView = {
  centre: { x: 50, y: 40 },
  w: 200,
  h: 100,
  pxPerTile: 4,
  bounds: { width: 100, height: 80 },
};
const image = buildMinimapImage(
  { width: 100, height: 80, kindAt: () => 'grass' },
  { pxPerTile: 4 },
);

describe('world map coords', () => {
  it('centre tile maps to the canvas centre', () => {
    expect(worldMapTileToPx({ x: 50, y: 40 }, view)).toEqual({ x: 100, y: 50 });
  });
  it('round-trips tile -> px -> tile, including zoom', () => {
    for (const zoom of [1, 2.5]) {
      const v = { ...view, zoom };
      for (const t of [
        { x: 48, y: 41 },
        { x: 52, y: 38 },
        { x: 50, y: 40 },
      ]) {
        const p = worldMapTileToPx(t, v);
        expect(worldMapPxToTile(p.x, p.y, v)).toEqual(t);
      }
    }
  });
  it('is rectangular: far corners of a wide canvas are inside, outside it is null', () => {
    expect(worldMapPxToTile(1, 1, view)).not.toBeNull();
    expect(worldMapPxToTile(199, 99, view)).not.toBeNull();
    expect(worldMapPxToTile(201, 50, view)).toBeNull();
    expect(worldMapPxToTile(100, -1, view)).toBeNull();
    expect(worldMapPxToTile(NaN, 5, view)).toBeNull();
  });
  it('returns null outside world bounds', () => {
    expect(worldMapPxToTile(0, 0, { ...view, centre: { x: 0, y: 0 } })).toBeNull();
  });
});

describe('drawWorldMap', () => {
  beforeEach(() => clearMinimapLabelCache());

  it('clips to a rectangle (no arc) and fills the full w x h', () => {
    const { ctx, calls, args } = fake();
    drawWorldMap(ctx, {} as CanvasImageSource, image, view, []);
    expect(calls).not.toContain('arc');
    expect(calls).toContain('clip');
    expect(args.lineTo).toEqual([
      [200, 0],
      [200, 100],
      [0, 100],
    ]);
    expect(args.fillRect![0]).toEqual([0, 0, 200, 100]);
  });

  it('culls markers outside the rectangle, keeps those in the far corners of the wide side', () => {
    const { ctx, args } = fake();
    // 4 px/tile: x in [25,75], y in [27.5,52.5] visible. (74,40) is inside, circle of r=50 would not hold it.
    drawWorldMap(ctx, {} as CanvasImageSource, image, view, [
      { kind: 'bank', tile: { x: 74, y: 40 } },
      { kind: 'bank', tile: { x: 80, y: 40 } },
      { kind: 'bank', tile: { x: 50, y: 60 } },
    ]);
    expect(args.fillRect!.slice(1)).toHaveLength(1); // only the in-view bank
    expect(args.fillRect![1]![0]).toBeCloseTo(100 + 24 * 4 - 2.5);
  });

  it('draws the player marker last and labels whole inside the rectangle', () => {
    const { ctx, args } = fake();
    drawWorldMap(
      ctx,
      {} as CanvasImageSource,
      image,
      view,
      [
        { kind: 'player', tile: { x: 50, y: 40 } },
        { kind: 'npc', tile: { x: 52, y: 40 } },
      ],
      [
        { text: 'Edge', x: 24, y: 40, kind: 'region' },
        { text: 'Wide', x: 70, y: 38, kind: 'region' },
      ],
    );
    const texts = args.fillText!.map((a) => a[0]);
    expect(texts).toContain('Wide'); // x=70 is 80px right of centre: outside a 50px circle
    expect(texts).not.toContain('Edge'); // box would cross the left edge? 26 -> x=4, half-width 13
    const arcs = args.arc!;
    const last = arcs[arcs.length - 1]!;
    expect(last[0]).toBe(100); // player dot (centre) is the last arc
  });
});

describe('clampWorldMapScale', () => {
  it('min fits the whole world, max is 12', () => {
    expect(clampWorldMapScale(0.1, view)).toBeCloseTo(1.25); // min(200/100, 100/80)
    expect(clampWorldMapScale(5, view)).toBe(5);
    expect(clampWorldMapScale(99, view)).toBe(WORLD_MAP_MAX_PX_PER_TILE);
    expect(clampWorldMapScale(NaN, view)).toBeCloseTo(1.25);
    expect(clampWorldMapScale(0.1, { ...view, bounds: undefined })).toBe(1);
    expect(clampWorldMapScale(3, { ...view, bounds: { width: 4, height: 4 } })).toBe(12);
  });
});
