export { SKILLS, FALLBACK_SKILL_COLOR, SKILL_IDS, MAX_LEVEL, MAX_XP } from './data';
export {
  xpForLevel,
  levelForXp,
  isSkillId,
  createProgressionState,
  addXp,
  applyXpGranted,
  getLevel,
  totalLevel,
  meetsRequirement,
  xpToNextLevel,
  levelProgress,
  combatLevel,
  skillColor,
} from './logic';
export type { SkillId, SkillDef, ProgressionState, ProgressionEvent } from './types';
export { serializeProgression, deserializeProgression } from './save';
