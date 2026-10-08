import { addItem, createBank, createInventory } from '@core/inventory';
import type { InventoryState } from '@core/inventory';
import { emptyGroundItems } from '@core/items';
import { createProgressionState, getLevel } from '@core/progression';
import { createGatheringState } from '@core/skills';
import { createFishingState } from '@features/skills/fishing';
import { createCookingState } from '@features/skills/cooking';
import { applyStarterKits } from '@app/game/starterKits';
import { createPlayerHp } from '@features/combat';
import { createMovementState } from '@features/movement';
import { createPrayerPoints } from '@features/skills/prayer';
import { STARTING_ITEMS } from '@features/skills/woodcutting';
import type { Content } from '@app/registry';
import type { GameState, SavedGame } from '@app/game/types';

function startingInventory(content: Content): InventoryState {
  let inv = createInventory();
  for (const s of STARTING_ITEMS) {
    const r = addItem(inv, content.items, s.itemId, s.quantity);
    if (r.ok) inv = r.value;
  }
  return inv;
}

/** Fresh game: starting items, level 1 skills, standing at the spawn tile. */
export function newGame(content: Content): GameState {
  const progression = createProgressionState();
  return applyStarterKits(baseGame(content, progression), content);
}

function baseGame(content: Content, progression: GameState['progression']): GameState {
  return {
    inventory: startingInventory(content),
    bank: createBank(),
    progression,
    hp: createPlayerHp(getLevel(progression, 'hitpoints')),
    prayer: createPrayerPoints(getLevel(progression, 'prayer')),
    movement: createMovementState(content.spawn),
    gathering: createGatheringState(),
    fishing: createFishingState(),
    pendingFishing: null,
    firemaking: { fires: [], nextId: 1, lighting: null },
    cooking: createCookingState(),
    pendingCook: null,
    pendingInteraction: null,
    pendingFacility: null,
    pendingNpc: null,
    ground: emptyGroundItems(),
    pendingGround: null,
    tick: 0,
    talk: null,
    bankOpen: false,
    bankMode: 'full',
    chat: [],
    meta: { playTimeMs: 0 },
  };
}

/** Resume from a save. Everything not saved (path, gather session, node state) starts empty. */
export function fromSave(saved: SavedGame, content: Content): GameState {
  return applyStarterKits({ ...newGame(content), ...saved }, content);
}
