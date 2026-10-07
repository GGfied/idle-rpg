import type { Projection } from './projection';
import { shadeColor } from './block';

/** Structural input: `map`'s BuildingDef satisfies this, so render never imports features. */
export interface BuildingSource {
  id: string;
  name?: string;
  /** Global tiles including the outer walls. */
  rect: { x: number; y: number; w: number; h: number };
  doors: readonly { x: number; y: number }[];
  roof: string;
  /** Facade look; default 'house'. */
  style?: string;
}

export interface RoofStyle {
  /** Base roof colour. */
  roof: number;
  /** Wall plaster/stone colour. */
  wall: number;
}

export const ROOF_STYLES: Record<'slate' | 'thatch' | 'tile', RoofStyle> = {
  slate: { roof: 0x5d6675, wall: 0x9a9aa0 },
  thatch: { roof: 0xc2a24f, wall: 0xd9c9a0 },
  tile: { roof: 0xb4513a, wall: 0xd8bfa6 },
};

export function roofStyleOf(roof: string): RoofStyle & { key: keyof typeof ROOF_STYLES } {
  const key = roof in ROOF_STYLES ? (roof as keyof typeof ROOF_STYLES) : 'slate';
  return { key, ...ROOF_STYLES[key] };
}

/** Wall height in px above the ground diamond (the 'house' look). */
export const BUILDING_WALL_HEIGHT = 44;
/** Eaves overhang the footprint by this many tiles. */
export const EAVES = 0.3;

export type BuildingStyleKey = 'bank' | 'house' | 'hut';
export type WallPattern = 'plain' | 'dressed' | 'planks';

/** Everything that differs between facade styles. Data, not branches in the drawing code. */
export interface BuildingLook {
  style: BuildingStyleKey;
  wallHeight: number;
  eaves: number;
  pattern: WallPattern;
  /** Overrides the roof-kind wall colour. */
  wallColor?: number;
  /** Overrides the roof-kind roof colour. */
  roofColor?: number;
  /** Gold trim along the ridge and hips. */
  trimColor?: number;
  /** Shingle/straw bands per roof face. */
  bands: number;
  /** Door height in px (default: derived from the wall height). */
  doorHeight?: number;
  /** Door tile gets pilasters, a step, a coin emblem and a BANK plaque. */
  bankFront: boolean;
}

export const BUILDING_LOOKS: Record<BuildingStyleKey, BuildingLook> = {
  house: {
    style: 'house',
    wallHeight: BUILDING_WALL_HEIGHT,
    eaves: EAVES,
    pattern: 'plain',
    bands: 3,
    bankFront: false,
  },
  hut: {
    style: 'hut',
    wallHeight: 36,
    eaves: 0.4,
    pattern: 'planks',
    wallColor: 0x8c6a3f,
    bands: 6,
    bankFront: false,
  },
  bank: {
    style: 'bank',
    wallHeight: 62,
    eaves: EAVES,
    pattern: 'dressed',
    wallColor: 0xe6dfcc,
    roofColor: 0x3a404c,
    trimColor: 0xe0b43a,
    bands: 3,
    doorHeight: 26,
    bankFront: true,
  },
};

export function lookOf(b: Pick<BuildingSource, 'style'>): BuildingLook {
  return BUILDING_LOOKS[(b.style ?? 'house') as BuildingStyleKey] ?? BUILDING_LOOKS.house;
}
/** Front walls stay faintly visible while the player is inside, so the footprint still reads. */
export const FRONT_WALL_INSIDE_ALPHA = 0.2;
/** Full fade (1 -> 0) time. */
export const FADE_MS = 200;
/** Door blocks sort just behind the tile's own occupants so you can stand in the doorway. */
const DOOR_DEPTH_BIAS = -0.5;

export interface WallPart {
  x: number;
  y: number;
  /** Faces the camera (east or south edge): fades when the player is inside. */
  front: boolean;
  door: 'left' | 'right' | null;
  /** True when this tile is a door on a back edge: no block is drawn (an open gap). */
  gap: boolean;
  depth: number;
}

export interface BuildingPlan {
  walls: WallPart[];
  roofDepth: number;
}

/** True when tile (x,y) is inside the building's outer ring (the walkable interior). */
export function isInside(b: BuildingSource, x: number, y: number): boolean {
  const r = b.rect;
  return x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1;
}

/** Perimeter tiles with their depth, front/back class and door face. Pure. */
export function planBuilding(b: BuildingSource, proj: Projection): BuildingPlan {
  const { x: x0, y: y0, w, h } = b.rect;
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  const walls: WallPart[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x !== x0 && x !== x1 && y !== y0 && y !== y1) continue;
      const isDoor = b.doors.some((d) => d.x === x && d.y === y);
      const door = isDoor ? (y === y1 ? 'left' : x === x1 ? 'right' : null) : null;
      walls.push({
        x,
        y,
        front: x === x1 || y === y1,
        door,
        gap: isDoor && door === null,
        depth: proj.depthFor(x, y) + (isDoor ? DOOR_DEPTH_BIAS : 0),
      });
    }
  }
  return { walls, roofDepth: proj.depthFor(x1 + 0.4, y1 + 0.4) };
}

export interface RoofFace {
  points: { x: number; y: number }[];
  color: number;
  /** Shingle/straw lines as [x0,y0,x1,y1]. */
  lines: [number, number, number, number][];
}

type Pt = { x: number; y: number };

interface RoofGeometry {
  A: Pt;
  B: Pt;
  C: Pt;
  D: Pt;
  R1: Pt;
  R2: Pt;
  xLong: boolean;
}

/** Corner and ridge points of the hip roof: ridge along the longer axis (one point when square). */
function roofGeometry(b: BuildingSource, proj: Projection): RoofGeometry {
  const { x: x0, y: y0, w, h } = b.rect;
  const look = lookOf(b);
  const minX = x0 - 0.5 - look.eaves;
  const maxX = x0 + w - 0.5 + look.eaves;
  const minY = y0 - 0.5 - look.eaves;
  const maxY = y0 + h - 0.5 + look.eaves;
  const L = maxX - minX;
  const S = maxY - minY;
  const rise = Math.min(Math.min(L, S) * 12, 40);
  const P = (tx: number, ty: number, up: number) => {
    const p = proj.tileToWorld(tx, ty);
    return { x: p.x, y: p.y - look.wallHeight - up };
  };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const xLong = L >= S;
  const d = Math.abs(L - S) / 2;
  return {
    A: P(minX, minY, 0), // north
    B: P(maxX, minY, 0), // east
    C: P(maxX, maxY, 0), // south
    D: P(minX, maxY, 0), // west
    R1: xLong ? P(cx - d, cy, rise) : P(cx, cy - d, rise),
    R2: xLong ? P(cx + d, cy, rise) : P(cx, cy + d, rise),
    xLong,
  };
}

/** Hip roof over the footprint: ridge along the longer axis (a pyramid when square). Pure. */
export function roofFaces(b: BuildingSource, proj: Projection): RoofFace[] {
  const look = lookOf(b);
  const base = look.roofColor ?? roofStyleOf(b.roof).roof;
  const { A, B, C, D, R1, R2, xLong } = roofGeometry(b, proj);
  const faces: { pts: Pt[]; f: number }[] = xLong
    ? [
        { pts: [A, B, R2, R1], f: 1.12 }, // north slope
        { pts: [A, D, R1], f: 1.0 }, // west hip
        { pts: [B, C, R2], f: 0.72 }, // east hip
        { pts: [D, C, R2, R1], f: 0.86 }, // south slope
      ]
    : [
        { pts: [A, B, R1], f: 1.12 }, // north hip
        { pts: [A, D, R2, R1], f: 1.0 }, // west slope
        { pts: [D, C, R2], f: 0.86 }, // south hip
        { pts: [B, C, R2, R1], f: 0.72 }, // east slope
      ];
  return faces.map(({ pts, f }) => ({
    points: pts,
    color: shadeColor(base, f),
    lines: bandLines(pts, look.bands),
  }));
}

/** Trim segments [x0,y0,x1,y1] along the ridge and hips; empty for styles without trim. Pure. */
export function roofTrim(
  b: BuildingSource,
  proj: Projection,
): { color: number; lines: [number, number, number, number][] } | null {
  const color = lookOf(b).trimColor;
  if (color === undefined) return null;
  const { A, B, C, D, R1, R2, xLong } = roofGeometry(b, proj);
  const seg = (p: Pt, q: Pt): [number, number, number, number] => [p.x, p.y, q.x, q.y];
  const hips = xLong
    ? [seg(A, R1), seg(D, R1), seg(B, R2), seg(C, R2)]
    : [seg(A, R1), seg(B, R1), seg(D, R2), seg(C, R2)];
  return { color, lines: [seg(R1, R2), ...hips] };
}

/** `bands` lines parallel to the face's eave edge (pts[0] -> pts[1] side): shingle rows or straw courses. */
function bandLines(pts: Pt[], bands: number): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  if (pts.length < 4) return out;
  const [p0, p1, p2, p3] = pts as [Pt, Pt, Pt, Pt];
  for (let i = 1; i <= bands; i++) {
    const t = i / (bands + 1);
    const a = lerp(p0, p3, t);
    const c = lerp(p1, p2, t);
    out.push([a.x, a.y, c.x, c.y]);
  }
  return out;
}
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Linear alpha fade with an instant mode, stepped by the frame delta. */
export interface Fade {
  value: number;
  target: number;
  /** Set the goal; `instant` jumps there. */
  set(target: number, instant: boolean): void;
  /** Advance by dtMs; returns true when the value changed. */
  step(dtMs: number): boolean;
}

export function createFade(initial: number, fullMs = FADE_MS): Fade {
  const f: Fade = {
    value: initial,
    target: initial,
    set(target, instant) {
      f.target = target;
      if (instant) f.value = target;
    },
    step(dtMs) {
      if (f.value === f.target) return false;
      const d = Math.max(0, dtMs) / fullMs;
      f.value =
        f.value < f.target ? Math.min(f.target, f.value + d) : Math.max(f.target, f.value - d);
      return true;
    },
  };
  return f;
}
