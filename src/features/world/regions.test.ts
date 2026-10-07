import { describe, expect, it } from 'vitest';

import { AREA_ZONES, BUILDINGS, DEFAULT_AREA } from './data';
import {
  LABEL_MIN_GAP,
  LABEL_MIN_PART,
  WORLD_DEF,
  areaAt,
  regionBoundaryAt,
  regionEdges,
} from './logic';

const { widthTiles: W, heightTiles: H } = WORLD_DEF;
const regionLabels = WORLD_DEF.labels.filter((l) => l.kind === 'region');
const buildingIds = new Set(BUILDINGS.map((b) => b.id));

describe('derived region labels', () => {
  it('labels only named areas (building zones excluded), and every area has at least one', () => {
    const names = new Set(
      [DEFAULT_AREA, ...AREA_ZONES].filter((z) => !buildingIds.has(z.id)).map((z) => z.name),
    );
    expect(new Set(regionLabels.map((l) => l.text))).toEqual(names);
  });

  it('labels every 4-connected part of at least LABEL_MIN_PART tiles, or one within LABEL_MIN_GAP', () => {
    const seen = new Set<number>();
    for (let s = 0; s < W * H; s++) {
      if (seen.has(s)) continue;
      const name = areaAt(s % W, Math.floor(s / W)).name;
      const part = [s];
      seen.add(s);
      for (let k = 0; k < part.length; k++) {
        const x = part[k]! % W;
        const y = Math.floor(part[k]! / W);
        for (const [nx, ny] of [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const) {
          const j = ny * W + nx;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(j)) continue;
          if (areaAt(nx, ny).name !== name) continue;
          seen.add(j);
          part.push(j);
        }
      }
      if (part.length < LABEL_MIN_PART || buildingIds.has(areaAt(s % W, Math.floor(s / W)).id))
        continue;
      const inPart = new Set(part);
      const mine = regionLabels.filter((l) => l.text === name);
      const own = mine.some((l) => inPart.has(l.y * W + l.x));
      const near = part.some((i) =>
        mine.some((l) => Math.hypot(l.x - (i % W), l.y - Math.floor(i / W)) < LABEL_MIN_GAP),
      );
      expect(own || near).toBe(true);
    }
  });

  it('keeps same-name labels at least LABEL_MIN_GAP tiles apart', () => {
    for (const a of regionLabels) {
      for (const b of regionLabels) {
        if (a !== b && a.text === b.text) {
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(LABEL_MIN_GAP);
        }
      }
    }
  });

  it('includes the areas players see in banners', () => {
    const texts = regionLabels.map((l) => l.text);
    for (const n of ['The Wilds', 'Mirror Lake', 'West Copse', 'Oak Grove', 'Southern Shore']) {
      expect(texts).toContain(n);
    }
  });

  it('places each label inside the world, on a tile of its own area', () => {
    for (const l of regionLabels) {
      expect(l.x).toBeGreaterThanOrEqual(0);
      expect(l.x).toBeLessThan(W);
      expect(l.y).toBeGreaterThanOrEqual(0);
      expect(l.y).toBeLessThan(H);
      expect(areaAt(l.x, l.y).name).toBe(l.text);
    }
  });

  it('keeps the facility labels', () => {
    expect(WORLD_DEF.labels.filter((l) => l.kind === 'facility').map((l) => l.text)).toEqual([
      'Willowbrook Bank',
      'Fernhaven Bank',
    ]);
  });
});

describe('region boundaries', () => {
  const differs = (x: number, y: number, nx: number, ny: number): boolean =>
    nx < W && ny < H && areaAt(x, y).name !== areaAt(nx, ny).name;

  it('matches the area rule on every tile', () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(regionBoundaryAt(x, y)).toBe(differs(x, y, x + 1, y) || differs(x, y, x, y + 1));
      }
    }
  });

  it('is true on area edges and false inside an area', () => {
    expect(regionBoundaryAt(39, 10)).toBe(true); // Mirror Lake | next area
    expect(regionBoundaryAt(36, 10)).toBe(false); // inside Mirror Lake
    expect(regionBoundaryAt(20, 20)).toBe(false);
  });

  it('never marks the world right/bottom edge, nor out-of-bounds tiles', () => {
    const { edges } = regionEdges();
    for (let y = 0; y < H; y++) expect(edges[y * W + W - 1]! & 1).toBe(0);
    for (let x = 0; x < W; x++) expect(edges[(H - 1) * W + x]! & 2).toBe(0);
    expect(regionBoundaryAt(-1, 0)).toBe(false);
    expect(regionBoundaryAt(W, 0)).toBe(false);
    expect(regionBoundaryAt(0, H)).toBe(false);
  });
});
