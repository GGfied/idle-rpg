import { describe, expect, it } from 'vitest';
import {
  buildMinimapImage,
  drawMinimap,
  MINIMAP_MARKERS,
  MINIMAP_PALETTE,
  minimapPxToTile,
  minimapTileToPx,
  type Minimap2D,
  type MinimapView,
} from './minimap';

const src = {
  width: 4,
  height: 3,
  kindAt: (x: number, y: number) => (x === 0 && y === 0 ? 'water' : x === 3 ? undefined : 'grass'),
};

function px(img: { width: number; data: Uint8ClampedArray }, x: number, y: number) {
  const i = (y * img.width + x) * 4;
  return Array.from(img.data.slice(i, i + 4));
}

describe('buildMinimapImage', () => {
  it('sizes by pxPerTile (default 3) and fills flat colours', () => {
    const img = buildMinimapImage(src);
    expect([img.width, img.height, img.data.length]).toEqual([12, 9, 12 * 9 * 4]);
    const w = MINIMAP_PALETTE.water!;
    expect(px(img, 2, 2)).toEqual([(w >> 16) & 255, (w >> 8) & 255, w & 255, 255]);
    expect(px(img, 3, 0)).not.toEqual(px(img, 2, 2)); // next tile is grass
    expect(px(img, 10, 1)[3]).toBe(0); // undefined kind transparent
  });
  it('honours pxPerTile option', () => {
    expect(buildMinimapImage(src, { pxPerTile: 2 }).width).toBe(8);
  });
});

const view: MinimapView = {
  centre: { x: 10, y: 10 },
  radiusPx: 50,
  pxPerTile: 4,
  bounds: { width: 20, height: 20 },
};

describe('minimap coords', () => {
  it('centre tile maps to the canvas centre and back', () => {
    expect(minimapTileToPx({ x: 10, y: 10 }, view)).toEqual({ x: 50, y: 50 });
    expect(minimapPxToTile(50, 50, view)).toEqual({ x: 10, y: 10 });
  });
  it('offsets by pxPerTile and zoom', () => {
    expect(minimapTileToPx({ x: 12, y: 9 }, view)).toEqual({ x: 58, y: 46 });
    expect(minimapTileToPx({ x: 12, y: 9 }, { ...view, zoom: 2 })).toEqual({ x: 66, y: 42 });
  });
  it('returns null outside the circle (corner) but not at the edge', () => {
    expect(minimapPxToTile(1, 1, view)).toBeNull();
    const open = { ...view, bounds: undefined };
    expect(minimapPxToTile(100, 50, open)).not.toBeNull();
    expect(minimapPxToTile(100.5, 50, open)).toBeNull();
  });
  it('returns null outside world bounds', () => {
    const edge = { ...view, centre: { x: 1, y: 1 } };
    expect(minimapPxToTile(50 - 4 * 2, 50, edge)).toBeNull(); // x = -1
    expect(minimapPxToTile(50 - 4, 50, edge)).toEqual({ x: 0, y: 1 });
    expect(minimapPxToTile(50, 50, { ...edge, bounds: undefined })).toEqual({ x: 1, y: 1 });
  });
  it('rejects non-finite input', () => {
    expect(minimapPxToTile(NaN, 5, view)).toBeNull();
  });
  it('handles a fractional centre and round-trips integer tiles', () => {
    const f = { ...view, centre: { x: 10.4, y: 9.6 } };
    for (const t of [
      { x: 8, y: 9 },
      { x: 12, y: 12 },
      { x: 10, y: 10 },
    ]) {
      const p = minimapTileToPx(t, f);
      expect(minimapPxToTile(p.x, p.y, f)).toEqual(t);
    }
    expect(minimapPxToTile(50, 50, f)).toEqual({ x: 10, y: 10 });
  });
});

describe('drawMinimap', () => {
  function fake() {
    const calls: string[] = [];
    const args: Record<string, unknown[][]> = {};
    const rec =
      (n: string) =>
      (...a: unknown[]) => {
        calls.push(n);
        (args[n] ??= []).push(a);
      };
    const ctx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      imageSmoothingEnabled: true,
      save: rec('save'),
      restore: rec('restore'),
      beginPath: rec('beginPath'),
      arc: rec('arc'),
      clip: rec('clip'),
      fill: rec('fill'),
      stroke: rec('stroke'),
      fillRect: rec('fillRect'),
      strokeRect: rec('strokeRect'),
      drawImage: rec('drawImage'),
    } as unknown as Minimap2D;
    return { ctx, calls, args };
  }
  const img = buildMinimapImage({ width: 20, height: 20, kindAt: () => 'grass' }, { pxPerTile: 4 });

  it('clips, draws terrain, then markers, then restores', () => {
    const { ctx, calls, args } = fake();
    drawMinimap(ctx, {} as CanvasImageSource, img, view, [
      { kind: 'bank', tile: { x: 12, y: 10 } },
      { kind: 'player', tile: { x: 10, y: 10 } },
    ]);
    expect(calls.indexOf('clip')).toBeLessThan(calls.indexOf('drawImage'));
    expect(calls.indexOf('drawImage')).toBeLessThan(calls.indexOf('fill'));
    expect(calls[0]).toBe('save');
    expect(calls[calls.length - 1]).toBe('restore');
    expect(ctx.imageSmoothingEnabled).toBe(false);
    // view spans 12.5 tiles each side of 10.5 -> clamped to image; whole image drawn at 1:1
    expect(args.drawImage![0]!.slice(1)).toEqual([
      0,
      0,
      80,
      80,
      50 - 10.5 * 4,
      50 - 10.5 * 4,
      80,
      80,
    ]);
    expect(args.fillRect!.length).toBe(2); // background + bank square
  });
  it('skips markers outside the circle', () => {
    const { ctx, args } = fake();
    drawMinimap(ctx, {} as CanvasImageSource, img, view, [
      { kind: 'tree', tile: { x: 30, y: 10 } },
    ]);
    expect(args.arc!.length).toBe(1); // only the clip arc
  });
});

describe('npc and bank markers', () => {
  it('npc is a small yellow dot, bank a larger gold square', () => {
    expect(MINIMAP_MARKERS.npc).toMatchObject({ shape: 'dot', color: '#ffe135' });
    expect(MINIMAP_MARKERS.npc.size).toBeLessThan(MINIMAP_MARKERS.bank.size);
    expect(MINIMAP_MARKERS.bank.shape).toBe('square');
  });
  it('minimap palette knows floor', () => {
    expect(MINIMAP_PALETTE['floor']).toBeDefined();
  });
});
