import { evaluateRequirement } from '@core/contracts';
import type { Requirement, RequirementContext, RequirementResult } from '@core/contracts';
import { countItem } from '@core/inventory';
import type { ItemRegistry } from '@core/items';
import { SKILLS, getLevel, isSkillId } from '@core/progression';
import type { GameState } from '@app/game/types';

/**
 * The one RequirementContext built from the joined game state. Quests and flags do not exist yet:
 * never done. Names come from the skill registry and (when given) the item registry.
 */
export function requirementContext(game: GameState, items?: ItemRegistry): RequirementContext {
  return {
    skillLevel: (id) => (isSkillId(id) ? getLevel(game.progression, id) : 0),
    itemCount: (id) => countItem(game.inventory, id),
    questDone: () => false,
    flag: () => false,
    name: (kind, id) => {
      if (kind === 'skill') return SKILLS.find((s) => s.id === id)?.name ?? fallback(id);
      if (kind === 'item') return items?.get(id)?.name ?? fallback(id);
      return fallback(id);
    },
  };
}

const fallback = (id: string): string => {
  const spaced = id.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/** Met/unmet plus the reason text and the player's current value. */
export const evaluate = (
  game: GameState,
  req: Requirement,
  items?: ItemRegistry,
): RequirementResult => evaluateRequirement(req, requirementContext(game, items));

/** Whether the joined game state meets a requirement. */
export const meets = (game: GameState, req: Requirement): boolean => evaluate(game, req).met;
