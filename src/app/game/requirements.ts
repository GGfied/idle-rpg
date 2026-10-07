import type { Requirement } from '@core/contracts';
import { countItem } from '@core/inventory';
import { meetsRequirement as meetsSkill } from '@core/progression';
import type { GameState } from '@app/game/types';

/** Whether the joined game state meets a requirement. Quests and flags do not exist yet: never met. */
export function meets(game: GameState, req: Requirement): boolean {
  if (req.type === 'item') return countItem(game.inventory, req.itemId) >= (req.count ?? 1);
  if (req.type === 'skillLevel') return meetsSkill(game.progression, req);
  return false;
}
