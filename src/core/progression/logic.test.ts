import type { SkillId } from './index';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_SKILL_COLOR,
  MAX_XP,
  SKILLS,
  skillColor,
  addXp,
  combatLevel,
  levelProgress,
  xpToNextLevel,
  applyXpGranted,
  createProgressionState,
  getLevel,
  isSkillId,
  levelForXp,
  meetsRequirement,
  totalLevel,
  xpForLevel,
} from './index';

describe('xp curve', () => {
  it.each([
    [1, 0],
    [2, 83],
    [10, 1154],
    [50, 101333],
    [92, 6517253],
    [99, 13034431],
  ])('xpForLevel(%i) = %i', (l, xp) => expect(xpForLevel(l)).toBe(xp));

  it.each([
    [0, 1],
    [-5, 1],
    [NaN, 1],
    [82, 1],
    [83, 2],
    [1153, 9],
    [1154, 10],
    [13034430, 98],
    [13034431, 99],
    [200_000_000, 99],
  ])('levelForXp(%f) = %i', (xp, l) => expect(levelForXp(xp)).toBe(l));

  it('is consistent for every level', () => {
    for (let l = 2; l <= 99; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l) - 1)).toBe(l - 1);
    }
  });
});

describe('state and addXp', () => {
  it('starts with hitpoints 10, others 1', () => {
    const s = createProgressionState();
    expect(getLevel(s, 'hitpoints')).toBe(10);
    expect(getLevel(s, 'attack')).toBe(1);
    expect(totalLevel(s)).toBe(12 + 10);
  });

  it('emits xpGained and one levelUp per level crossed, purely', () => {
    const s = createProgressionState();
    const r = addXp(s, 'mining', 300);
    expect(s.xp.mining).toBe(0);
    expect(r.state.xp.mining).toBe(300);
    expect(r.events).toEqual([
      { type: 'xpGained', skill: 'mining', amount: 300, total: 300 },
      { type: 'levelUp', skill: 'mining', level: 2 },
      { type: 'levelUp', skill: 'mining', level: 3 },
      { type: 'levelUp', skill: 'mining', level: 4 },
    ]);
  });

  it('exact boundary levels up, one below does not', () => {
    const s = createProgressionState();
    expect(addXp(s, 'fishing', 82).events.map((e) => e.type)).toEqual(['xpGained']);
    expect(addXp(s, 'fishing', 83).events.map((e) => e.type)).toEqual(['xpGained', 'levelUp']);
  });

  it('caps at MAX_XP and reports the clamped amount', () => {
    let s = addXp(createProgressionState(), 'attack', MAX_XP - 10).state;
    const r = addXp(s, 'attack', 1000);
    expect(r.state.xp.attack).toBe(MAX_XP);
    expect(r.events[0]).toEqual({ type: 'xpGained', skill: 'attack', amount: 10, total: MAX_XP });
    s = r.state;
    const again = addXp(s, 'attack', 5);
    expect(again.state).toBe(s);
    expect(again.events).toEqual([]);
  });

  it.each([0, -3, NaN, Infinity])('ignores amount %f', (a) => {
    const s = createProgressionState();
    const r = addXp(s, 'magic', a);
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });

  it('applyXpGranted rejects unknown skills', () => {
    const s = createProgressionState();
    expect(applyXpGranted(s, 'basketweaving', 100)).toEqual({ state: s, events: [] });
    expect(applyXpGranted(s, '__proto__', 100).state).toBe(s);
    expect(applyXpGranted(s, 'cooking', 100).state.xp.cooking).toBe(100);
  });

  it('isSkillId', () => {
    expect(isSkillId('crafting')).toBe(true);
    expect(isSkillId('toString')).toBe(false);
    expect(isSkillId(3)).toBe(false);
  });
});

describe('meetsRequirement', () => {
  const s = addXp(createProgressionState(), 'mining', 83).state;
  it.each([
    [{ type: 'skillLevel', skill: 'mining', level: 2 }, true],
    [{ type: 'skillLevel', skill: 'mining', level: 3 }, false],
    [{ type: 'skillLevel', skill: 'nope', level: 1 }, false],
    [{ type: 'quest', questId: 'q' }, false],
  ] as const)('%j -> %s', (req, ok) => expect(meetsRequirement(s, req)).toBe(ok));
});

describe('combatLevel', () => {
  const build = (levels: Partial<Record<SkillId, number>>) => {
    let s = createProgressionState();
    for (const [id, l] of Object.entries(levels) as [SkillId, number][]) {
      s = { xp: { ...s.xp, [id]: xpForLevel(l) } };
    }
    return s;
  };
  const all99 = Object.fromEntries(Object.keys(createProgressionState().xp).map((k) => [k, 99]));

  it.each([
    ['fresh character', {}, 3],
    ['all 99', all99, 126],
    // base 0.25*(50+60+15)=31.25, melee 0.325*130=42.25 -> 73.5
    ['melee-heavy', { attack: 60, strength: 70, defence: 50, hitpoints: 60, prayer: 31 }, 73],
    // base 0.25*(40+45)=21.25, range 0.325*floor(120)=39 -> 60.25
    ['ranged-heavy', { defence: 40, hitpoints: 45, ranged: 80 }, 60],
    // base 0.25*(30+40+10)=20, mage 0.325*floor(112.5)=36.4 -> 56.4
    ['magic-heavy', { defence: 30, hitpoints: 40, prayer: 20, magic: 75 }, 56],
    // fresh stats + prayer: base 0.25*(11+floor(p/2)) + 0.65
    ['prayer 5 (floor 2)', { prayer: 5 }, 3],
    ['prayer 6 (3)', { prayer: 6 }, 4],
    ['prayer 7 (floor 3)', { prayer: 7 }, 4],
    ['prayer 8 (4)', { prayer: 8 }, 4],
  ] as [string, Partial<Record<SkillId, number>>, number][])('%s', (_n, lv, expected) =>
    expect(combatLevel(build(lv))).toBe(expected),
  );

  it('ignores non-combat skills', () => {
    expect(combatLevel(build({ woodcutting: 99, mining: 99, cooking: 99 }))).toBe(3);
  });
});

describe('xpToNextLevel / levelProgress', () => {
  it.each([
    [0, 83, 0],
    [82, 1, 82 / 83],
    [83, 91, 0],
    [13034430, 1, (13034430 - xpForLevel(98)) / (13034431 - xpForLevel(98))],
    [13034431, 0, 1],
    [200_000_000, 0, 1],
    [-5, 83, 0],
  ])('xp %f -> next %i, progress %f', (xp, next, prog) => {
    expect(xpToNextLevel(xp)).toBe(next);
    expect(levelProgress(xp)).toBeCloseTo(prog, 10);
  });
});

describe('skill colours', () => {
  it('every skill has a valid hex colour', () => {
    expect(SKILLS).toHaveLength(13);
    for (const s of SKILLS) expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('colours are distinct', () => {
    expect(new Set(SKILLS.map((s) => s.color)).size).toBe(SKILLS.length);
  });
  it('skillColor returns the def colour, fallback for unknown ids', () => {
    expect(skillColor('hitpoints')).toBe('#e23b3b');
    expect(skillColor('nope')).toBe(FALLBACK_SKILL_COLOR);
    expect(skillColor('toString')).toBe(FALLBACK_SKILL_COLOR);
  });
});
