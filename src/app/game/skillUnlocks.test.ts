import { describe, expect, it } from 'vitest';
import { CONTENT } from '@app/registry';
import { COOKING_RECIPES } from '@features/skills/cooking';
import { FISHING_SPOTS, FISHING_TOOLS } from '@features/skills/fishing';
import { MINING_NODES, MINING_TOOLS } from '@features/skills/mining';
import { WOODCUTTING_NODES, WOODCUTTING_TOOLS } from '@features/skills/woodcutting';
import { skillUnlocks, unlockRequirement } from './skillUnlocks';

const lowestLevel = (u: ReturnType<typeof skillUnlocks>, itemId: string, kind: string) =>
  u.find((x) => x.itemId === itemId && x.kind === kind)?.level;

describe('skillUnlocks', () => {
  it.each(['woodcutting', 'mining', 'fishing', 'cooking'])(
    '%s: non-empty, sorted, ids resolve',
    (skill) => {
      const u = skillUnlocks(skill);
      expect(u.length).toBeGreaterThan(0);
      for (let i = 1; i < u.length; i++) {
        const [a, b] = [u[i - 1]!, u[i]!];
        expect(
          a.level < b.level || (a.level === b.level && a.label.localeCompare(b.label) <= 0),
        ).toBe(true);
      }
      for (const x of u) {
        expect(CONTENT.items.get(x.itemId), x.itemId).toBeDefined();
        expect(x.label).toBe(CONTENT.items.get(x.itemId)!.name);
      }
      expect(new Set(u.map((x) => `${x.kind}:${x.itemId}`)).size).toBe(u.length);
    },
  );

  it('woodcutting levels match trees and axes', () => {
    const u = skillUnlocks('woodcutting');
    for (const n of WOODCUTTING_NODES) {
      expect(lowestLevel(u, n.yields[0]!.value.itemId, 'tree')).toBeLessThanOrEqual(
        n.requiredLevel,
      );
    }
    for (const [id, d] of WOODCUTTING_TOOLS)
      expect(lowestLevel(u, id, 'tool')).toBe(d.levelRequired);
  });

  it('mining levels match rocks and pickaxes', () => {
    const u = skillUnlocks('mining');
    for (const n of MINING_NODES) {
      expect(lowestLevel(u, n.yields[0]!.value.itemId, 'rock')).toBeLessThanOrEqual(
        n.requiredLevel,
      );
    }
    for (const [id, d] of MINING_TOOLS) expect(lowestLevel(u, id, 'tool')).toBe(d.levelRequired);
  });

  it('fishing: each fish once at its lowest level, plus tools', () => {
    const u = skillUnlocks('fishing');
    const lows = new Map<string, number>();
    for (const s of FISHING_SPOTS)
      for (const m of Object.values(s.methods))
        for (const c of m.catches)
          lows.set(c.itemId, Math.min(lows.get(c.itemId) ?? 99, c.requiredLevel));
    for (const [id, lvl] of lows) expect(lowestLevel(u, id, 'fish')).toBe(lvl);
    expect(u.filter((x) => x.kind === 'fish')).toHaveLength(lows.size);
    for (const [id, d] of FISHING_TOOLS) expect(lowestLevel(u, id, 'tool')).toBe(d.levelRequired);
  });

  it('cooking: every cooked item once as food at its level', () => {
    const u = skillUnlocks('cooking');
    const lows = new Map<string, number>();
    for (const r of COOKING_RECIPES)
      lows.set(r.cookedId, Math.min(lows.get(r.cookedId) ?? 99, r.levelRequired));
    for (const [id, lvl] of lows) expect(lowestLevel(u, id, 'food')).toBe(lvl);
    expect(u.filter((x) => x.kind === 'food')).toHaveLength(lows.size);
    expect(u).toHaveLength(lows.size);
  });

  it.each(['attack', 'nonsense', 'constructor', '__proto__'])('%s -> []', (skill) => {
    expect(skillUnlocks(skill)).toEqual([]);
  });

  it('builds a skillLevel requirement', () => {
    const u = skillUnlocks('mining').at(-1)!;
    expect(unlockRequirement(u, 'mining')).toEqual({
      type: 'skillLevel',
      skill: 'mining',
      level: u.level,
    });
  });
});
