import { addItem, createBank, createInventory } from '@core/inventory';
import type { InventoryState } from '@core/inventory';
import { createProgressionState, getLevel } from '@core/progression';
import { createGatheringState } from '@core/skills';
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
  return {
    inventory: startingInventory(content),
    bank: createBank(),
    progression,
    hp: createPlayerHp(getLevel(progression, 'hitpoints')),
    prayer: createPrayerPoints(getLevel(progression, 'prayer')),
    movement: createMovementState(content.spawn),
    gathering: createGatheringState(),
    pendingInteraction: null,
    pendingFacility: null,
    pendingNpc: null,
    talk: null,
    bankOpen: false,
    chat: [],
    meta: { playTimeMs: 0 },
  };
}

/** Resume from a save. Everything not saved (path, gather session, node state) starts empty. */
export function fromSave(saved: SavedGame, content: Content): GameState {
  return { ...newGame(content), ...saved };
}
