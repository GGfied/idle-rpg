import type Phaser from 'phaser';
import { faceMap, shadeColor, type BlockGeom } from './block';
import type { WallPattern } from './buildingModel';

type G = Phaser.GameObjects.Graphics;
type Face = 'left' | 'right';

const GOLD = 0xffd23f;
const GOLD_DARK = 0x7a5a00;

/** 3x5 pixel glyphs for the plaque ("BANK" is all it needs). */
const GLYPHS: Record<string, string[]> = {
  B: ['110', '101', '110', '101', '110'],
  A: ['010', '101', '111', '101', '101'],
  N: ['101', '111', '111', '111', '101'],
  K: ['101', '101', '110', '101', '101'],
};

function quad(g: G, face: Face, geom: BlockGeom, s0: number, s1: number, v0: number, v1: number) {
  const m = faceMap(face, geom);
  g.fillPoints([m(s0, v0), m(s1, v0), m(s1, v1), m(s0, v1)], true);
}

function line(g: G, face: Face, geom: BlockGeom, s0: number, v0: number, s1: number, v1: number) {
  const m = faceMap(face, geom);
  const a = m(s0, v0);
  const b = m(s1, v1);
  g.lineBetween(a.x, a.y, b.x, b.y);
}

/** Surface detail on both faces: dressed-stone courses with staggered joints, or vertical planks. */
export function paintWallPattern(
  pattern: WallPattern,
  color: number,
): ((g: G, geom: BlockGeom) => void) | undefined {
  if (pattern === 'plain') return undefined;
  return (g, geom) => {
    for (const face of ['left', 'right'] as const) {
      if (pattern === 'dressed') {
        const rows = Math.floor(geom.hh / 8);
        g.lineStyle(1, shadeColor(color, 0.62), 0.55);
        for (let r = 1; r < rows; r++) {
          line(g, face, geom, 0, r * 8, 1, r * 8);
          const off = r % 2 ? 0.25 : 0.75;
          line(g, face, geom, off, (r - 1) * 8, off, r * 8);
        }
        quad2(g, face, geom, 0, 1, 0, 5, shadeColor(color, 0.82)); // plinth
        quad2(g, face, geom, 0, 1, geom.hh - 4, geom.hh, shadeColor(color, 1.08)); // cornice
      } else {
        g.lineStyle(1, shadeColor(color, 0.55), 0.7);
        for (let i = 1; i < 8; i++) line(g, face, geom, i / 8, 0, i / 8, geom.hh);
        g.lineStyle(1, shadeColor(color, 0.45), 0.5);
        line(g, face, geom, 0, geom.hh * 0.5, 1, geom.hh * 0.5);
      }
    }
  };
}

function quad2(
  g: G,
  face: Face,
  geom: BlockGeom,
  s0: number,
  s1: number,
  v0: number,
  v1: number,
  c: number,
) {
  g.fillStyle(c, 1);
  quad(g, face, geom, s0, s1, v0, v1);
}

/** Bank doorway dressing: two pilasters, a raised step, a "BANK" plaque and the gold coin emblem. */
export function paintBankFront(stone: number): (g: G, geom: BlockGeom, face: Face) => void {
  return (g, geom, face) => {
    const m = faceMap(face, geom);
    const top = geom.hh - 6;
    // pilasters with capitals and bases
    for (const [s0, s1] of [
      [0.04, 0.17],
      [0.83, 0.96],
    ] as const) {
      quad2(g, face, geom, s0, s1, 0, top, shadeColor(stone, 1.12));
      quad2(g, face, geom, s0 + 0.03, s0 + 0.05, 2, top - 2, shadeColor(stone, 0.8));
      quad2(g, face, geom, s0 - 0.015, s1 + 0.015, top - 2, top + 1, shadeColor(stone, 0.9));
      quad2(g, face, geom, s0 - 0.015, s1 + 0.015, 0, 2, shadeColor(stone, 0.9));
    }
    // raised step in front of the door (outward = down-left on the left face, down-right on the right)
    const dx = face === 'left' ? -7 : 7;
    const dy = 3.5;
    const a = m(0.15, 0);
    const b = m(0.85, 0);
    const a4 = m(0.15, 4);
    const b4 = m(0.85, 4);
    const off = (p: { x: number; y: number }) => ({ x: p.x + dx, y: p.y + dy });
    g.fillStyle(shadeColor(stone, 0.7), 1).fillPoints([off(a), off(b), off(b4), off(a4)], true);
    g.fillStyle(shadeColor(stone, 1.1), 1).fillPoints([a4, b4, off(b4), off(a4)], true);
    // plaque
    const v0 = geom.hh - 34;
    const v1 = v0 + 9.5;
    g.fillStyle(0x3b2a1a, 1);
    quad(g, face, geom, 0.1, 0.9, v0, v1);
    g.lineStyle(1, GOLD, 1).strokePoints([m(0.1, v0), m(0.9, v0), m(0.9, v1), m(0.1, v1)], true);
    const ds = 0.052;
    const dv = 1.4;
    let s = 0.5 - (15 * ds) / 2;
    g.fillStyle(GOLD, 1);
    for (const ch of 'BANK') {
      GLYPHS[ch]!.forEach((row, ri) => {
        for (let ci = 0; ci < 3; ci++) {
          if (row[ci] !== '1') continue;
          const vb = v0 + 1 + (4 - ri) * dv;
          quad(g, face, geom, s + ci * ds, s + (ci + 1) * ds, vb, vb + dv);
        }
      });
      s += 4 * ds;
    }
    // coin emblem, foreshortened onto the face
    const cv = geom.hh - 17.5;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      pts.push(m(0.5 + Math.cos(t) * 0.17, cv + Math.sin(t) * 5.5));
    }
    g.fillStyle(GOLD, 1).fillPoints(pts, true);
    g.lineStyle(1, GOLD_DARK, 1).strokePoints(pts, true);
    const dollar = [
      m(0.57, cv + 3),
      m(0.43, cv + 3),
      m(0.43, cv),
      m(0.57, cv),
      m(0.57, cv - 3),
      m(0.43, cv - 3),
    ];
    g.strokePoints(dollar, false);
    g.strokePoints([m(0.5, cv + 4.5), m(0.5, cv - 4.5)], false);
  };
}
