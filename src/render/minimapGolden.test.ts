import { describe, expect, it } from 'vitest';
import {
  clearMinimapLabelCache,
  drawMinimap,
  type Minimap2D,
  type MinimapImage,
  type MinimapLabel,
  type MinimapMarker,
  type MinimapView,
} from './minimap';

/** Records every property write and method call (with args) into one string, then hashes it. */
function recorder() {
  const log: string[] = [];
  const store: Record<string, unknown> = {};
  const ctx = new Proxy(
    {},
    {
      get(_t, k: string) {
        if (k === 'measureText')
          return (t: string) => (log.push(`measure ${t}`), { width: t.length * 6 });
        if (k in store) return store[k];
        return (...a: unknown[]) =>
          void log.push(
            `${k}(${a.map((x) => (typeof x === 'object' ? 'img' : String(x))).join(',')})`,
          );
      },
      set(_t, k: string, v) {
        store[k] = v;
        log.push(`${k}=${String(v)}`);
        return true;
      },
    },
  ) as unknown as Minimap2D;
  return { ctx, log };
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

describe('circular minimap output is unchanged by the shared-painter refactor', () => {
  it.each([
    // Small circle: recorded BEFORE the refactor (labels mostly do not fit).
    ['small', 60, 1.5, 2, 'a4485639', undefined],
    // Large circle where labels fit and the player keep-out matters: recorded after the refactor.
    ['large', 130, 2, 1.5, 'c5a4cf37', undefined],
    // Same scene with the player drawn as a facing arrow (south-east): only the player marker differs.
    ['large, player arrow', 130, 2, 1.5, '186475e5', Math.PI / 4],
  ])(
    'matches the golden call-log checksum (%s)',
    (_n, radiusPx, zoom, pixelRatio, golden, facing) => {
      clearMinimapLabelCache();
      const image: MinimapImage = {
        width: 120,
        height: 120,
        pxPerTile: 3,
        data: new Uint8ClampedArray(120 * 120 * 4),
      };
      const view: MinimapView = {
        centre: { x: 20.4, y: 18 },
        radiusPx,
        pxPerTile: 3,
        zoom,
        pixelRatio,
      };
      const markers: MinimapMarker[] = [
        { kind: 'player', tile: { x: 20.4, y: 18 }, facing },
        { kind: 'tree_oak', tile: { x: 22, y: 19 } },
        { kind: 'bank', tile: { x: 25, y: 18 } },
        { kind: 'rock_copper', tile: { x: 18, y: 15 }, depleted: true },
        { kind: 'npc', tile: { x: 300, y: 5 } },
        { kind: 'destination', tile: { x: 60, y: 18 } },
        { kind: 'destination', tile: { x: 21, y: 20 } },
      ];
      const labels: MinimapLabel[] = [
        { text: 'Bank', x: 25, y: 18, kind: 'facility', icon: 'bank' },
        { text: 'Lumber Glade', x: 17, y: 22, kind: 'region' },
        { text: 'Far', x: 200, y: 200, kind: 'region' },
        { text: 'Near Player', x: 20, y: 18, kind: 'region' },
      ];
      const { ctx, log } = recorder();
      drawMinimap(ctx, {} as CanvasImageSource, image, view, markers, labels);
      expect(log.length).toBeGreaterThan(40);
      expect(hash(log.join('\n'))).toBe(golden);
    },
  );
});
