import { describe, expect, it } from 'vitest';
import {
  CELL,
  FIG_H,
  FIG_ORIGIN,
  figureLegPivots,
  figureLegRects,
  figureLowerLegRects,
  figureUpperLegRects,
  paintFigure,
} from './figureArt';
import type { FigureRect } from './figureArt';
import { NPC_LOOKS, PLAYER_LOOK } from './figureLooks';

const bottom = (rs: FigureRect[]): number => Math.max(...rs.map((r) => r.y + r.h));
const top = (rs: FigureRect[]): number => Math.min(...rs.map((r) => r.y));
const area = (rs: FigureRect[]): number => rs.reduce((s, r) => s + r.w * r.h, 0);

describe('figure legs rig', () => {
  const looks = [PLAYER_LOOK, NPC_LOOKS.banker, NPC_LOOKS.villager_f];

  it('legs hang from the hip pivot down to the ground', () => {
    for (const look of looks) {
      const p = figureLegPivots(look);
      const rects = figureLegRects(look, false);
      expect(top(rects)).toBeCloseTo(0, 5);
      expect(bottom(rects)).toBeCloseTo(p.legLength, 5);
      expect(p.hipY + p.legLength).toBeCloseTo(0, 5); // feet are the container origin
      expect(p.kneeY).toBeGreaterThan(p.hipY);
      expect(p.kneeY).toBeLessThan(0);
    }
  });

  it('thigh + shin cover the whole leg and meet at the knee', () => {
    for (const look of looks) {
      const p = figureLegPivots(look);
      const up = figureUpperLegRects(look, true);
      const low = figureLowerLegRects(look, true);
      expect(area(up) + area(low)).toBeCloseTo(area(figureLegRects(look, true)), 5);
      expect(bottom(up)).toBeCloseTo(p.kneeY - p.hipY, 5);
      expect(top(low)).toBeCloseTo(0, 5);
      expect(bottom(low)).toBeCloseTo(-p.kneeY, 5);
    }
  });

  it('rigLegs removes the body legs and keeps the torso', () => {
    const base = paintFigure({ ...PLAYER_LOOK, rigLegs: false }, 'front');
    const rigged = paintFigure({ ...PLAYER_LOOK, rigLegs: true }, 'front');
    const filled = (d: Int32Array, y0: number, y1: number): number => {
      let n = 0;
      for (let i = y0 * 36; i < y1 * 36; i++) if (d[i] !== -1) n++;
      return n;
    };
    expect(filled(rigged, 46, FIG_H)).toBe(0);
    expect(filled(base, 46, FIG_H)).toBeGreaterThan(0);
    expect(filled(rigged, 0, 40)).toBe(filled(base, 0, 40));
    expect(FIG_ORIGIN.y).toBe(FIG_H * CELL);
  });
});
