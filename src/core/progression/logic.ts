import type { Requirement } from '@core/contracts';
import { FALLBACK_SKILL_COLOR, MAX_LEVEL, SKILLS, MAX_XP, SKILL_IDS, STARTING_XP } from './data';
import type { ProgressionEvent, ProgressionState, SkillId } from './types';

/** XP needed for each level; index 1..99 (index 0 unused). OSRS formula. */
const XP_TABLE: readonly number[] = (() => {
  const t = [0, 0];
  let points = 0;
  for (let l = 1; l < MAX_LEVEL; l++) {
    points += Math.floor(l + 300 * Math.pow(2, l / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function xpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return XP_TABLE[l] ?? 0;
}

export function levelForXp(xp: number): number {
  if (!(xp > 0)) return 1;
  let lo = 1;
  let hi = MAX_LEVEL;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((XP_TABLE[mid] ?? 0) <= xp) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function isSkillId(x: unknown): x is SkillId {
  return typeof x === 'string' && (SKILL_IDS as readonly string[]).includes(x);
}

export function createProgressionState(): ProgressionState {
  const xp = {} as Record<SkillId, number>;
  for (const id of SKILL_IDS) xp[id] = STARTING_XP[id] ?? 0;
  return { xp };
}

/**
 * Pure. Clamps to MAX_XP; ignores non-positive/NaN/non-finite amounts.
 * Emits `xpGained` (amount actually added, new total) then one `levelUp`
 * per level crossed (so a big grant yields several, in ascending order).
 * At the cap, nothing is added and no events are emitted.
 */
export function addXp(
  state: ProgressionState,
  skill: SkillId,
  amount: number,
): { state: ProgressionState; events: ProgressionEvent[] } {
  if (!Number.isFinite(amount) || amount <= 0) return { state, events: [] };
  const before = state.xp[skill];
  const total = Math.min(MAX_XP, before + amount);
  const gained = total - before;
  if (gained <= 0) return { state, events: [] };
  const events: ProgressionEvent[] = [{ type: 'xpGained', skill, amount: gained, total }];
  for (let l = levelForXp(before) + 1; l <= levelForXp(total); l++) {
    events.push({ type: 'levelUp', skill, level: l });
  }
  return { state: { xp: { ...state.xp, [skill]: total } }, events };
}

/** For `xpGranted` events from core/skills (skill is a plain string). Unknown skill: unchanged. */
export function applyXpGranted(
  state: ProgressionState,
  skill: string,
  amount: number,
): { state: ProgressionState; events: ProgressionEvent[] } {
  if (!isSkillId(skill)) return { state, events: [] };
  return addXp(state, skill, amount);
}

export function getLevel(state: ProgressionState, skill: SkillId): number {
  return levelForXp(state.xp[skill]);
}

export function totalLevel(state: ProgressionState): number {
  return SKILL_IDS.reduce((sum, id) => sum + getLevel(state, id), 0);
}

/**
 * Only 'skillLevel' is evaluated here (unknown skill id => false).
 * Other requirement types belong to their owners and return false.
 */
export function meetsRequirement(state: ProgressionState, req: Requirement): boolean {
  if (req.type !== 'skillLevel' || !isSkillId(req.skill)) return false;
  return getLevel(state, req.skill) >= req.level;
}

/** XP still needed for the next level; 0 at level 99 (or at/over the cap). */
export function xpToNextLevel(xp: number): number {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return 0;
  return xpForLevel(level + 1) - Math.max(0, xp);
}

/** Fraction 0..1 through the current level; 1 at level 99. */
export function levelProgress(xp: number): number {
  const level = levelForXp(xp);
  if (level >= MAX_LEVEL) return 1;
  const start = xpForLevel(level);
  return (Math.max(0, xp) - start) / (xpForLevel(level + 1) - start);
}

/** OSRS combat level from base levels (boosts never count). */
export function combatLevel(state: ProgressionState): number {
  const lv = (id: SkillId): number => getLevel(state, id);
  const base = 0.25 * (lv('defence') + lv('hitpoints') + Math.floor(lv('prayer') / 2));
  const melee = 0.325 * (lv('attack') + lv('strength'));
  const range = 0.325 * Math.floor((3 * lv('ranged')) / 2);
  const mage = 0.325 * Math.floor((3 * lv('magic')) / 2);
  return Math.floor(base + Math.max(melee, range, mage));
}

/** Display colour for a skill ('#rrggbb'). Unknown ids return FALLBACK_SKILL_COLOR, never throw. */
export function skillColor(id: string): string {
  return SKILLS.find((s) => s.id === id)?.color ?? FALLBACK_SKILL_COLOR;
}
