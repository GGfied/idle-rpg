import type { SkillDef, SkillId } from './types';

export const SKILLS: readonly SkillDef[] = [
  { id: 'attack', name: 'Attack', color: '#b5533c' },
  { id: 'strength', name: 'Strength', color: '#4caf50' },
  { id: 'defence', name: 'Defence', color: '#7f9bb8' },
  { id: 'hitpoints', name: 'Hitpoints', color: '#e23b3b' },
  { id: 'ranged', name: 'Ranged', color: '#2e8b4a' },
  { id: 'prayer', name: 'Prayer', color: '#e8d48a' },
  { id: 'magic', name: 'Magic', color: '#7b6cf0' },
  { id: 'cooking', name: 'Cooking', color: '#9a5a8a' },
  { id: 'woodcutting', name: 'Woodcutting', color: '#8a7a3a' },
  { id: 'fishing', name: 'Fishing', color: '#6ec6f0' },
  { id: 'mining', name: 'Mining', color: '#9a8878' },
  { id: 'smithing', name: 'Smithing', color: '#b0b8c0' },
  { id: 'crafting', name: 'Crafting', color: '#d2b48c' },
];

export const SKILL_IDS: readonly SkillId[] = SKILLS.map((s) => s.id);

export const MAX_LEVEL = 99;
export const MAX_XP = 200_000_000;
/** Hitpoints starts at level 10. */
export const STARTING_XP: Partial<Record<SkillId, number>> = { hitpoints: 1154 };

/** Colour used for unknown skill ids (neutral grey). */
export const FALLBACK_SKILL_COLOR = '#9ca3af';
