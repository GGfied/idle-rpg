import { describe, expect, it } from 'vitest';
import {
  CELL,
  figureArmPivots,
  figureLowerArmRects,
  figureUpperArmRects,
  paintFigure,
} from './figureArt';
import type { FigureRect } from './figureArt';
import { NPC_LOOKS, PLAYER_LOOK } from './figureLooks';

const bottom = (rs: FigureRect[]): number => Math.max(...rs.map((r) => r.y + r.h));
const top = (rs: FigureRect[]): number => Math.min(...rs.map((r) => r.y));
const left = (rs: FigureRect[]): number => Math.min(...rs.map((r) => r.x));
const right = (rs: FigureRect[]): number => Math.max(...rs.map((r) => r.x + r.w));

describe('figure upper arm rig', () => {
  const looks = [PLAYER_LOOK, NPC_LOOKS.banker, NPC_LOOKS.villager_f];

  it('upper arm hangs from the shoulder pivot to the elbow, centred on it', () => {
    for (const look of looks) {
      const p = figureArmPivots(look);
      for (const mirror of [false, true]) {
        const r = figureUpperArmRects(look, mirror);
        expect(top(r)).toBeCloseTo(-CELL, 5); // the outline row above the shoulder
        expect(bottom(r)).toBeCloseTo(p.elbowY + CELL, 5); // + the outline row at the seam
        expect(left(r) + right(r)).toBeCloseTo(0, 5);
      }
      expect(p.shoulderX).toBeGreaterThan(0);
      expect(p.elbowY).toBeGreaterThan(0);
    }
  });

  it('lower arm attached at the elbow continues straight down from the upper arm', () => {
    for (const look of looks) {
      const p = figureArmPivots(look);
      const up = figureUpperArmRects(look, false);
      const low = figureLowerArmRects(look, false).map((r) => ({ ...r, y: r.y + p.elbowY }));
      expect(top(low)).toBeCloseTo(p.elbowY, 5);
      expect(top(low)).toBeLessThanOrEqual(bottom(up));
      expect(left(low)).toBeGreaterThanOrEqual(left(up) - 1e-9);
      expect(right(low)).toBeLessThanOrEqual(right(up) + 1e-9);
    }
  });

  it('rigUpperArms removes only the arms: rows above the shoulder and the torso centre stay', () => {
    const base = paintFigure({ ...PLAYER_LOOK, rigUpperArms: false, rigArms: true }, 'front');
    const rigged = paintFigure({ ...PLAYER_LOOK, rigUpperArms: true, rigArms: true }, 'front');
    const count = (d: Int32Array, y0: number, y1: number, x0: number, x1: number): number => {
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (d[y * 36 + x] !== -1) n++;
      return n;
    };
    expect(count(rigged, 0, 18, 0, 36)).toBe(count(base, 0, 18, 0, 36)); // head
    expect(count(rigged, 20, 33, 12, 24)).toBe(count(base, 20, 33, 12, 24)); // torso middle
    expect(count(base, 20, 33, 0, 10)).toBeGreaterThan(0);
    expect(count(rigged, 20, 33, 0, 9)).toBe(0);
    expect(count(rigged, 20, 33, 28, 36)).toBe(0);
  });
});
