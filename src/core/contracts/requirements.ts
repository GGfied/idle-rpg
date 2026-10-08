import type { Requirement } from './types';

/** Narrow read-only view of the game that requirements are checked against. */
export interface RequirementContext {
  skillLevel(skillId: string): number;
  itemCount(itemId: string): number;
  questDone(questId: string): boolean;
  flag(flagId: string): boolean;
  /** Display name for an id; defaults to the id in Title case ("oak_logs" -> "Oak logs"). */
  name?(kind: 'skill' | 'item' | 'quest' | 'flag', id: string): string;
}

export interface RequirementResult {
  met: boolean;
  /** Plain text for the UI, e.g. "Requires Woodcutting 15 (you: 5)". */
  text: string;
  /** The player's current value; absent for hidden unmet requirements. */
  current?: number | string;
}

function titleCase(id: string): string {
  const spaced = id.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The one generic requirement evaluator: met/unmet, the reason text and the current value. */
export function evaluateRequirement(req: Requirement, ctx: RequirementContext): RequirementResult {
  const name = (kind: 'skill' | 'item' | 'quest' | 'flag', id: string): string =>
    ctx.name?.(kind, id) ?? titleCase(id);
  let met: boolean;
  let current: number | string;
  let text: string;
  switch (req.type) {
    case 'skillLevel':
      current = ctx.skillLevel(req.skill);
      met = current >= req.level;
      text = `Requires ${name('skill', req.skill)} ${req.level} (you: ${current})`;
      break;
    case 'item': {
      const need = req.count ?? 1;
      current = ctx.itemCount(req.itemId);
      met = current >= need;
      text = `Requires ${need} ${name('item', req.itemId)} (you: ${current})`;
      break;
    }
    case 'quest':
      met = ctx.questDone(req.questId);
      current = met ? 'complete' : 'not complete';
      text = `Requires ${name('quest', req.questId)} (you: ${current})`;
      break;
    case 'flag':
      met = ctx.flag(req.flag);
      current = met ? 'yes' : 'no';
      text = `Requires ${name('flag', req.flag)} (you: ${current})`;
      break;
  }
  if (req.hidden && !met) return { met, text: req.hint ?? '???' };
  return { met, text, current };
}
