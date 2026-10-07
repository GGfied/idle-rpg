/** Player intents as pure state changes. The store calls these; the tick does the rest. */
import type { Tile } from '@core/contracts';
import { countItem, deposit, itemIds, swapSlots, withdraw } from '@core/inventory';
import { isDepleted, stopGather } from '@core/skills';
import { facilityDef, optionsFor, reachRuleFor, requirementsFor } from '@features/facilities';
import { getNpcDef, optionsFor as npcOptions } from '@features/npc';
import { findPathToAdjacent, setDestination, setPath } from '@features/movement';
import { NODE_EXAMINE } from '@app/registry';
import type { Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import { dropSlot, takeGround } from '@app/game/ground';
import { findPathToTalk } from '@app/game/reach';
import { meets } from '@app/game/requirements';
import { NOTHING_TO_CHOP } from '@app/game/systems';
import type { GameState } from '@app/game/types';

/** A new click cancels whatever the player was doing. */
function cancelActions(state: GameState): GameState {
  return {
    ...state,
    gathering: stopGather(state.gathering).state,
    pendingInteraction: null,
    pendingFacility: null,
    pendingNpc: null,
    pendingGround: null,
    talk: null,
    bankOpen: false,
  };
}

/** Click on ground: stop chopping and walk there. */
export function walkTo(state: GameState, content: Content, target: Tile): GameState {
  const s = cancelActions(state);
  return { ...s, movement: setDestination(s.movement, content.grid, target) };
}

/** Click on a tree: walk next to it, then the gather system starts chopping. */
export function interactTree(state: GameState, content: Content, nodeId: string): GameState {
  const tree = content.trees.get(nodeId);
  // Tapping the tree you are already chopping (or walking to) must not restart the swing cooldown.
  if (
    tree &&
    (state.gathering.session?.nodeId === nodeId || state.pendingInteraction?.nodeId === nodeId)
  )
    return state;
  const s = cancelActions(state);
  if (!tree) return s;
  const node = s.gathering.nodes[nodeId];
  // A stump: say so now instead of walking all the way there first.
  if (node && isDepleted(node)) return addImportantChat(s, NOTHING_TO_CHOP);
  const path = findPathToAdjacent(content.grid, s.movement.position, tree);
  if (path === null)
    return addImportantChat({ ...s, movement: setPath(s.movement, []) }, "I can't reach that.");
  return { ...s, movement: setPath(s.movement, path), pendingInteraction: { nodeId } };
}

export function examineTree(state: GameState, content: Content, nodeId: string): GameState {
  const defId = content.trees.get(nodeId)?.defId;
  return addChat(state, (defId && NODE_EXAMINE[defId]) || "It's a tree.");
}

export function examineItem(state: GameState, content: Content, slot: number): GameState {
  const stack = state.inventory.slots[slot];
  const def = stack ? content.items.get(stack.itemId) : undefined;
  return def ? addChat(state, def.examine) : state;
}

export { dropSlot };

/** Walk to a ground item and take it (the ground system finishes on arrival). */
export const takeGroundItem = (state: GameState, content: Content, id: string): GameState =>
  takeGround(state, content, id, cancelActions);

/** Drag-and-drop: swap two inventory slots. */
export function swapInventorySlots(state: GameState, a: number, b: number): GameState {
  const inventory = swapSlots(state.inventory, a, b);
  return inventory === state.inventory ? state : { ...state, inventory };
}

/** What an inventory item can be used on. */
export type UseTarget =
  { kind: 'item'; slot: number } | { kind: 'object'; id: string } | { kind: 'npc'; id: string };

/**
 * Use the selected item on a target. No recipe or interaction takes it yet, so every pairing says so;
 * skills add their combinations here later, as data, without branching on item ids.
 */
export function useItemOn(state: GameState, _item: string, _target: UseTarget): GameState {
  return addChat(state, 'Nothing interesting happens.');
}

/**
 * Choose a facility option (default: the first): walk beside it, then the facility system runs the
 * option's intent on arrival. Locked options stay listed but say why instead of walking.
 */
export function interactFacility(
  state: GameState,
  content: Content,
  objectId: string,
  optionId?: string,
): GameState {
  const obj = content.objects.get(objectId);
  const options = obj ? optionsFor(obj.kind) : [];
  const option = optionId ? options.find((o) => o.id === optionId) : options[0];
  if (!obj || !option) return cancelActions(state);
  const pending = state.pendingFacility;
  if (pending?.objectId === objectId && pending.optionId === option.id) return state;
  const s = cancelActions(state);
  if (requirementsFor(obj.kind, option.id).some((r) => !meets(s, r)))
    return addImportantChat(s, "You can't use that yet.");
  if (reachRuleFor(obj.kind) !== 'adjacent4') return s;
  const path = findPathToAdjacent(content.grid, s.movement.position, obj);
  if (path === null)
    return addImportantChat({ ...s, movement: setPath(s.movement, []) }, "I can't reach that.");
  return {
    ...s,
    movement: setPath(s.movement, path),
    pendingFacility: { kind: obj.kind, objectId, optionId: option.id },
  };
}

export function examineFacility(state: GameState, content: Content, objectId: string): GameState {
  const obj = content.objects.get(objectId);
  const def = obj && facilityDef(obj.kind);
  return def ? addChat(state, def.examine) : state;
}

/** Choose an NPC option (default Talk-to): walk into talking reach, then the NPC system runs it. */
export function interactNpc(
  state: GameState,
  content: Content,
  spawnId: string,
  optionId?: string,
): GameState {
  const npc = content.npcs.get(spawnId);
  const options = npc ? npcOptions(npc.npcId) : [];
  const option = optionId ? options.find((o) => o.id === optionId) : options[0];
  if (!npc || !option) return cancelActions(state);
  if (state.pendingNpc?.spawnId === spawnId && state.pendingNpc.optionId === option.id)
    return state;
  const s = cancelActions(state);
  const path = findPathToTalk(content.grid, s.movement.position, npc, content.isCounter);
  if (path === null)
    return addImportantChat({ ...s, movement: setPath(s.movement, []) }, "I can't reach that.");
  return {
    ...s,
    movement: setPath(s.movement, path),
    pendingNpc: { spawnId, optionId: option.id },
  };
}

export function examineNpc(state: GameState, content: Content, spawnId: string): GameState {
  const npc = content.npcs.get(spawnId);
  const def = npc && getNpcDef(npc.npcId);
  return def ? addChat(state, def.examine) : state;
}

export const closeBank = (state: GameState): GameState => ({ ...state, bankOpen: false });

const itemName = (content: Content, id: string): string =>
  (content.items.get(id)?.name ?? id).toLowerCase();

const BANK_ERRORS: Record<string, string> = {
  emptySlot: 'There is nothing in that slot.',
  bankFull: 'Your bank is full.',
  invalidQuantity: 'You cannot move that amount.',
  notInBank: 'That item is not in your bank.',
  inventoryFull: 'Your inventory is full.',
};

/** Deposit from an inventory slot (`quantity` or 'all' of that item). */
export function bankDeposit(
  state: GameState,
  content: Content,
  slot: number,
  quantity: number | 'all',
): GameState {
  const itemId = state.inventory.slots[slot]?.itemId;
  const r = deposit(state.inventory, state.bank, slot, quantity, content.items);
  if (!r.ok) return addImportantChat(state, BANK_ERRORS[r.error] ?? 'You cannot deposit that.');
  const moved = itemId ? countItem(state.inventory, itemId) - countItem(r.value.inv, itemId) : 0;
  const next = { ...state, inventory: r.value.inv, bank: r.value.bank };
  return itemId ? addChat(next, `You deposit ${moved} ${itemName(content, itemId)}.`) : next;
}

/** Withdraw `quantity` (or 'all') of an item from the bank. */
export function bankWithdraw(
  state: GameState,
  content: Content,
  itemId: string,
  quantity: number | 'all',
): GameState {
  const r = withdraw(state.inventory, state.bank, itemId, quantity, content.items);
  if (!r.ok) return addImportantChat(state, BANK_ERRORS[r.error] ?? 'You cannot withdraw that.');
  return addChat(
    { ...state, inventory: r.value.inv, bank: r.value.bank },
    `You withdraw ${r.value.withdrawn} ${itemName(content, itemId)}.`,
  );
}

/**
 * Deposit the whole inventory except tools (there is no equip slot yet, so banking the only axe would
 * stop the player chopping). A single-item deposit still banks a tool.
 */
export function bankDepositAll(state: GameState, content: Content): GameState {
  let inv = state.inventory;
  let bank = state.bank;
  let candidates = 0;
  let moved = 0;
  for (const itemId of itemIds(state.inventory)) {
    if (content.tools.get(itemId)) continue;
    candidates++;
    const slot = inv.slots.findIndex((s) => s?.itemId === itemId);
    const r = deposit(inv, bank, slot, 'all', content.items);
    if (!r.ok) continue;
    inv = r.value.inv;
    bank = r.value.bank;
    moved++;
  }
  if (candidates > 0 && moved === 0) return addImportantChat(state, BANK_ERRORS.bankFull!);
  return addChat({ ...state, inventory: inv, bank }, 'You deposit your inventory.');
}
