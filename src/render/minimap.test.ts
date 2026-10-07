import { DEFAULT_PALETTE } from './palette';
import { describe, expect, it } from 'vitest';
import {
  buildMinimapImage,
  buildMinimapWindow,
  minimapWindowCovers,
  drawMinimap,
  MINIMAP_MARKERS,
  MINIMAP_PALETTE,
  minimapPxToTile,
  minimapRimArrow,
  minimapTileToPx,
  type Minimap2D,
  type MinimapView,
  type MinimapLabel,
  layoutMinimapLabels,
  clearMinimapLabelCache,
  MINIMAP_LABEL_FONT_PX,
  minimapLabelFontPx,
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

describe('minimap window across chunks', () => {
  // Chunk border at x = 32: west is water, east is grass.
  const world = (x: number, y: number) =>
    x < 0 || y < 0 || x >= 128 || y >= 96 ? undefined : x < 32 ? 'water' : 'grass';
  it('reads both sides of a chunk border and keeps global origin', () => {
    const img = buildMinimapWindow(world, { x: 32, y: 10 }, 4, { pxPerTile: 1 });
    expect(img.origin).toEqual({ x: 28, y: 6 });
    expect(px(img, 3, 4)).toEqual(
      px(buildMinimapImage({ width: 1, height: 1, kindAt: () => 'water' }, { pxPerTile: 1 }), 0, 0),
    );
    expect(px(img, 4, 4)).not.toEqual(px(img, 3, 4)); // tile 32 is grass
  });
  it('draws the window cropped by global centre', () => {
    const img = buildMinimapWindow(world, { x: 32, y: 10 }, 8, { pxPerTile: 1 });
    const calls: number[][] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, k) => (k === 'drawImage' ? (...a: number[]) => calls.push(a.slice(1)) : () => {}),
        set: () => true,
      },
    ) as never;
    drawMinimap(
      ctx,
      {} as CanvasImageSource,
      img,
      { centre: { x: 32, y: 10 }, radiusPx: 4, pxPerTile: 1 },
      [],
    );
    // view spans global x 28.5..36.5; window origin 24 -> source x 4.5
    expect(calls[0]![0]).toBeCloseTo(4.5, 5);
  });
  it('reports when the view leaves the window', () => {
    const img = buildMinimapWindow(world, { x: 64, y: 40 }, 20, { pxPerTile: 1 });
    expect(minimapWindowCovers(img, { x: 64, y: 40 }, 10)).toBe(true);
    expect(minimapWindowCovers(img, { x: 75, y: 40 }, 10)).toBe(false);
    expect(minimapWindowCovers(img, { x: 64, y: 28 }, 10)).toBe(false);
  });
});

describe('minimap labels', () => {
  // 6 px per char; fake ctx records text/arc calls.
  function textCtx() {
    const texts: string[] = [];
    const arcs: number[][] = [];
    const ctx = {
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      lineJoin: 'miter',
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      measureText: (t: string) => ({ width: t.length * 6 }),
      fillText: (t: string, x: number, y: number) => texts.push(`${t}@${x},${y}`),
      strokeText: () => {},
      beginPath: () => {},
      arc: (...a: number[]) => arcs.push(a),
      fill: () => {},
      stroke: () => {},
      moveTo: () => {},
      lineTo: () => {},
      save: () => {},
      restore: () => {},
      clip: () => {},
      fillRect: () => {},
      drawImage: () => {},
    } as unknown as Minimap2D;
    return { ctx, texts, arcs };
  }
  const v: MinimapView = { centre: { x: 1000, y: 500 }, radiusPx: 60, pxPerTile: 4 };
  const region = (text: string, x: number, y: number): MinimapLabel => ({
    text,
    x,
    y,
    kind: 'region',
  });

  it('places by global tile with the view centre (no origin needed)', () => {
    const { ctx } = textCtx();
    const [p] = layoutMinimapLabels(ctx, [region('Hill', 1005, 498)], v);
    expect([p!.x, p!.y]).toEqual([80, 52]); // 60 + 5*4, 60 - 2*4
    expect(p!.left).toBeCloseTo(80 - (4 * 6 + 2) / 2);
  });
  it('culls labels whose box leaves the circle', () => {
    const { ctx } = textCtx();
    expect(layoutMinimapLabels(ctx, [region('Far', 1030, 500)], v)).toHaveLength(0);
    // anchor inside, but the box pokes out of the circle edge
    expect(layoutMinimapLabels(ctx, [region('Longname', 1027, 500)], v)).toHaveLength(0);
    expect(layoutMinimapLabels(ctx, [region('Ok', 1000, 500)], v)).toHaveLength(1);
  });
  it('nudges an overlapping region instead of dropping it (first keeps its anchor)', () => {
    const { ctx } = textCtx();
    const out = layoutMinimapLabels(ctx, [region('Aaaa', 1000, 500), region('Bbbb', 1001, 500)], v);
    expect(out.map((p) => p.label.text)).toEqual(['Aaaa', 'Bbbb']);
    expect(out[0]!.y).toBe(60);
    expect(out[1]!.y).not.toBe(60);
    expect(out[1]!.top >= out[0]!.top + out[0]!.h || out[1]!.top + out[1]!.h <= out[0]!.top).toBe(
      true,
    );
  });
  it('drops a region when every nudge still overlaps or leaves the circle', () => {
    const { ctx } = textCtx();
    const tiny: MinimapView = { centre: { x: 1000, y: 500 }, radiusPx: 12, pxPerTile: 4 };
    expect(
      layoutMinimapLabels(ctx, [region('Aa', 1000, 500), region('Bb', 1000, 500)], tiny),
    ).toHaveLength(1);
  });
  it('places facilities before regions so icons win overlaps', () => {
    const { ctx } = textCtx();
    const out = layoutMinimapLabels(
      ctx,
      [
        region('Town', 1000, 500),
        { text: 'Bank', x: 1000, y: 500, kind: 'facility', icon: 'bank' },
      ],
      v,
    );
    expect(out.map((p) => p.label.kind)).toEqual(['facility', 'region']);
    const [f, g] = out as [(typeof out)[0], (typeof out)[0]];
    expect(
      f.left < g.left + g.w && f.left + f.w > g.left && f.top < g.top + g.h && f.top + f.h > g.top,
    ).toBe(false);
  });
  it('facility name moves to the free side when the right overlaps', () => {
    const { ctx } = textCtx();
    const out = layoutMinimapLabels(
      ctx,
      [
        { text: 'Bank', x: 1005, y: 500, kind: 'facility', icon: 'bank' },
        { text: 'Shop', x: 1001, y: 500, kind: 'facility', icon: 'bank' },
      ],
      v,
    );
    expect(out.map((p) => p.side)).toEqual(['right', 'left']);
    expect(out.every((p) => p.showName)).toBe(true);
  });
  it('the region the player stands in always wins its label over neighbours listed first', () => {
    const { ctx } = textCtx();
    // Circle just big enough for one anchor-position box: no nudge fits, so order decides.
    const small: MinimapView = { centre: { x: 1000, y: 500 }, radiusPx: 13, pxPerTile: 2 };
    const out = layoutMinimapLabels(
      ctx,
      [region('Aa', 1000.5, 500), region('Bb', 999.5, 500), region('Hm', 1000, 500)],
      small,
    );
    expect(out.map((p) => p.label.text)).toContain('Hm');
  });
  it('spawn case: bank name and overlapping region both get placed without overlap', () => {
    const { ctx } = textCtx();
    const view: MinimapView = { centre: { x: 18, y: 15 }, radiusPx: 68.5, pxPerTile: 1 };
    const out = layoutMinimapLabels(
      ctx,
      [
        region('Willowbrook', 28.5, 1.5),
        { text: 'Willowbrook Bank', x: 0.5, y: -5.5, kind: 'facility', icon: 'bank' },
      ],
      view,
    );
    expect(out.map((p) => [p.label.text, p.showName])).toEqual([
      ['Willowbrook Bank', false], // 16-char name fits nowhere: coin only
      ['Willowbrook', true], // region nudged clear of the coin instead of dropped
    ]);
    const [a, b] = out as [(typeof out)[0], (typeof out)[0]];
    expect(
      a.left < b.left + b.w && a.left + a.w > b.left && a.top < b.top + b.h && a.top + a.h > b.top,
    ).toBe(false);
    for (const p of out) {
      for (const cx of [p.left, p.left + p.w]) {
        for (const cy of [p.top, p.top + p.h]) {
          expect((cx - 68.5) ** 2 + (cy - 68.5) ** 2).toBeLessThanOrEqual(68.5 ** 2);
        }
      }
    }
  });
  it('facility falls back to icon only when its name fits nowhere', () => {
    const { ctx } = textCtx();
    const [p] = layoutMinimapLabels(
      ctx,
      [{ text: 'A very long facility name', x: 1000, y: 500, kind: 'facility', icon: 'bank' }],
      v,
    );
    expect([p!.showName, p!.w]).toEqual([false, 10]);
  });
  it('measures each text once across frames', () => {
    clearMinimapLabelCache();
    const { ctx } = textCtx();
    let n = 0;
    const measure = ctx.measureText.bind(ctx);
    ctx.measureText = (t: string) => (n++, measure(t));
    for (let i = 0; i < 5; i++) layoutMinimapLabels(ctx, [region('Hill', 1000, 500)], v);
    expect(n).toBe(1);
  });
  it('drawMinimap draws a bank coin (arc) and white region text inside the clip', () => {
    const { ctx, texts, arcs } = textCtx();
    const img = buildMinimapImage({ width: 1, height: 1, kindAt: () => 'grass' }, { pxPerTile: 1 });
    drawMinimap(
      ctx,
      {} as CanvasImageSource,
      img,
      v,
      [],
      [
        region('Hill', 1000, 508),
        { text: 'Bank', x: 1000, y: 500, kind: 'facility', icon: 'bank' },
      ],
    );
    expect(texts.some((t) => t.startsWith('Hill@'))).toBe(true);
    expect(texts.some((t) => t.startsWith('Bank@'))).toBe(true);
    expect(arcs.length).toBe(2); // clip circle + bank coin
    expect(arcs[1]!.slice(0, 3)).toEqual([60, 60, 4.5]);
  });
  it('font is at least 10px', () => {
    expect(MINIMAP_LABEL_FONT_PX).toBeGreaterThanOrEqual(10);
    const { ctx } = textCtx();
    const img = buildMinimapImage({ width: 1, height: 1, kindAt: () => 'grass' }, { pxPerTile: 1 });
    drawMinimap(ctx, {} as CanvasImageSource, img, v, [], [region('Hill', 1000, 500)]);
    expect(ctx.font).toContain(`${MINIMAP_LABEL_FONT_PX}px`);
  });
  it.each([1, 2, 3])('scales text, icon and boxes with pixelRatio %i', (dpr) => {
    clearMinimapLabelCache();
    const { ctx, arcs } = textCtx();
    const big: MinimapView = { ...v, radiusPx: 60 * dpr, pixelRatio: dpr };
    const [p] = layoutMinimapLabels(ctx, [region('Hill', 1000, 500)], big);
    expect(p!.h).toBe(10 * dpr + 2 * dpr);
    const img = buildMinimapImage({ width: 1, height: 1, kindAt: () => 'grass' }, { pxPerTile: 1 });
    drawMinimap(ctx, {} as CanvasImageSource, img, big, [], [region('Hill', 1000, 508)]);
    expect(ctx.font).toBe(`bold ${10 * dpr}px sans-serif`);
    expect(minimapLabelFontPx(dpr)).toBe(10 * dpr);
    arcs.length = 0;
    drawMinimap(
      ctx,
      {} as CanvasImageSource,
      img,
      big,
      [],
      [{ text: 'B', x: 1000, y: 500, kind: 'facility', icon: 'bank' }],
    );
    expect(arcs[1]![2]).toBe(5 * dpr - 0.5 * dpr);
  });
  it('width cache is keyed by font size', () => {
    clearMinimapLabelCache();
    const { ctx } = textCtx();
    let n = 0;
    const m = ctx.measureText.bind(ctx);
    ctx.measureText = (t: string) => (n++, m(t));
    layoutMinimapLabels(ctx, [region('Hill', 1000, 500)], v);
    layoutMinimapLabels(ctx, [region('Hill', 1000, 500)], { ...v, pixelRatio: 2 });
    expect(n).toBe(2);
  });
});

describe('destination marker placement', () => {
  const win = buildMinimapWindow(() => 'grass', { x: 500, y: 300 }, 20, { pxPerTile: 4 });
  for (const dpr of [1, 2, 3]) {
    it(`draws the red dot at the tile px, sized by pixelRatio ${dpr}, with a windowed image origin`, () => {
      const arcs: number[][] = [];
      const fills: string[] = [];
      let fillStyle = '';
      let lw = 0;
      const lws: number[] = [];
      const ctx = {
        get fillStyle() {
          return fillStyle;
        },
        set fillStyle(v: string) {
          fillStyle = v;
        },
        strokeStyle: '',
        get lineWidth() {
          return lw;
        },
        set lineWidth(v: number) {
          lw = v;
        },
        imageSmoothingEnabled: true,
        save() {},
        restore() {},
        beginPath() {},
        clip() {},
        fillRect() {},
        strokeRect() {},
        drawImage() {},
        stroke() {
          lws.push(lw);
        },
        arc: (...a: number[]) => arcs.push(a),
        fill: () => fills.push(fillStyle),
      } as unknown as Minimap2D;
      const v: MinimapView = {
        centre: { x: 500, y: 300 },
        radiusPx: 60 * dpr,
        pxPerTile: 4,
        zoom: dpr,
        pixelRatio: dpr,
      };
      drawMinimap(ctx, {} as CanvasImageSource, win, v, [
        { kind: 'destination', tile: { x: 504, y: 297 } },
      ]);
      const i = fills.lastIndexOf('#ff2a2a');
      expect(i).toBeGreaterThanOrEqual(0);
      const a = arcs[arcs.length - 1]!;
      const want = minimapTileToPx({ x: 504, y: 297 }, v);
      expect(a[0]).toBeCloseTo(want.x, 5);
      expect(a[1]).toBeCloseTo(want.y, 5);
      expect(a[2]).toBeCloseTo((5 * dpr) / 2, 5);
      expect(lws[lws.length - 1]).toBe(dpr);
    });
  }
});

describe('region boundaries', () => {
  const px = (img: { data: Uint8ClampedArray; width: number }, x: number, y: number) =>
    img.data[(y * img.width + x) * 4]!;
  // 6x2 world; tile 2 has bit 1 (right differs), tile 9 (x3,y1) has bit 2 (bottom differs).
  const edges = { width: 6, height: 2, edges: new Uint8Array(12) };
  edges.edges[2] = 1;
  edges.edges[6 + 3] = 2;
  const src = { width: 6, height: 2, kindAt: () => 'grass' };
  it('bakes a faint line on the flagged edges only', () => {
    const plain = buildMinimapImage(src, { pxPerTile: 4 });
    const img = buildMinimapImage(src, { pxPerTile: 4, edges });
    expect(px(img, 2 * 4 + 3, 0)).toBeGreaterThan(px(plain, 2 * 4 + 3, 0));
    expect(px(img, 2 * 4 + 2, 0)).toBe(px(plain, 2 * 4 + 2, 0));
    expect(px(img, 4 * 4 + 3, 0)).toBe(px(plain, 4 * 4 + 3, 0));
    expect(px(img, 3 * 4 + 1, 7)).toBeGreaterThan(px(plain, 3 * 4 + 1, 7));
    expect(px(img, 3 * 4 + 1, 6)).toBe(px(plain, 3 * 4 + 1, 6));
  });
  it('windowed images read edges at global tile coords', () => {
    const e = { width: 200, height: 100, edges: new Uint8Array(200 * 100) };
    e.edges[50 * 200 + 99] = 1; // global (99,50) -> window-local (2,3), origin (97,47)
    const img = buildMinimapWindow(() => 'grass', { x: 100, y: 50 }, 3, { pxPerTile: 4, edges: e });
    const plain = buildMinimapWindow(() => 'grass', { x: 100, y: 50 }, 3, { pxPerTile: 4 });
    expect(px(img, 2 * 4 + 3, 3 * 4)).toBeGreaterThan(px(plain, 2 * 4 + 3, 3 * 4));
    expect(px(img, 3 * 4 + 3, 3 * 4)).toBe(px(plain, 3 * 4 + 3, 3 * 4));
  });
});

describe('minimapRimArrow', () => {
  const v: MinimapView = { centre: { x: 50, y: 50 }, radiusPx: 40, pxPerTile: 4, zoom: 1 };
  it('null when inside the circle', () => {
    expect(minimapRimArrow({ x: 55, y: 50 }, v)).toBeNull();
    expect(minimapRimArrow({ x: 50, y: 50 }, v)).toBeNull();
  });
  it('points N/E/S/W/diagonal when outside', () => {
    const ang = (x: number, y: number) => minimapRimArrow({ x, y }, v)!.angle;
    expect(ang(150, 50)).toBeCloseTo(0, 5);
    expect(ang(50, 150)).toBeCloseTo(Math.PI / 2, 5);
    expect(Math.abs(ang(-50, 50))).toBeCloseTo(Math.PI, 5);
    expect(ang(50, -50)).toBeCloseTo(-Math.PI / 2, 5);
    expect(ang(150, 150)).toBeCloseTo(Math.PI / 4, 5);
  });
  it('drawMinimap draws the arrow (red fill) only for an outside destination', () => {
    for (const [tile, want] of [
      [{ x: 200, y: 50 }, true],
      [{ x: 52, y: 50 }, false],
    ] as const) {
      const lines: number[][] = [];
      const fills: string[] = [];
      let fs = '';
      const ctx = {
        get fillStyle() {
          return fs;
        },
        set fillStyle(x: string) {
          fs = x;
        },
        strokeStyle: '',
        lineWidth: 1,
        imageSmoothingEnabled: true,
        save() {},
        restore() {},
        beginPath() {},
        clip() {},
        arc() {},
        closePath() {},
        moveTo() {},
        stroke() {},
        fillRect() {},
        strokeRect() {},
        drawImage() {},
        lineTo: (...a: number[]) => lines.push(a),
        fill: () => fills.push(fs),
      } as unknown as Minimap2D;
      drawMinimap(
        ctx,
        {} as CanvasImageSource,
        buildMinimapImage({ width: 4, height: 4, kindAt: () => 'grass' }),
        { ...v, bounds: { width: 400, height: 400 } },
        [{ kind: 'destination', tile }],
      );
      expect(lines.length === 2).toBe(want);
      if (want) {
        expect(fills).toContain('#ff2a2a');
        // tip on the rim side: all points to the east of centre (x > radius)
        expect(lines.every(([x]) => x! > 40)).toBe(true);
      }
    }
  });
});

describe('minimap palette', () => {
  it('has a colour for every terrain kind the tile palette knows (no magenta fallback)', () => {
    for (const kind of Object.keys(DEFAULT_PALETTE)) expect(MINIMAP_PALETTE).toHaveProperty(kind);
  });
});
