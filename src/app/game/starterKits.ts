/**
 * Starter kits per skill, granted once: to new games, and to existing saves that have no tool of the
 * skill anywhere (inventory or bank) and a level-1 skill. Needs no save slice: "none held, level 1"
 * is the memory of "not granted yet", and a kit that does not fit is retried on the next load.
 */
import { addItem, bankCount, countItem } from '@core/inventory';
import { getLevel, isSkillId } from '@core/progression';
import { MINING_STARTING_ITEMS, MINING_TOOLS } from '@features/skills/mining';
import {
  BAIT_ITEM_ID,
  FISHING_TOOLS,
  STARTING_ITEMS as FISHING_KIT,
} from '@features/skills/fishing';
import type { Content } from '@app/registry';
import type { GameState } from '@app/game/types';

interface StarterKit {
  skill: string;
  /** If the player holds any of these (inventory or bank) the kit counts as already granted. */
  tools: readonly string[];
  grant: readonly { itemId: string; quantity: number }[];
}

/** Bait in the fishing kit until a shop exists (user, 2026-10-08). */
export const BAIT_STACK = 500;
/** One-time top-up marker kept in `meta.grants`. */
export const BAIT_TOPUP_ID = 'fishing_bait_500';

/** Rod and bait join the fishing net: the main session's call, so both spots are playable without a shop. */
export const STARTER_KITS: readonly StarterKit[] = [
  { skill: 'mining', tools: [...MINING_TOOLS.keys()], grant: MINING_STARTING_ITEMS },
  {
    skill: 'fishing',
    tools: [...FISHING_TOOLS.keys()],
    grant: [
      ...FISHING_KIT,
      { itemId: 'fishing_rod', quantity: 1 },
      { itemId: BAIT_ITEM_ID, quantity: BAIT_STACK },
    ],
  },
];

const held = (g: GameState, itemId: string): number =>
  countItem(g.inventory, itemId) + bankCount(g.bank, itemId);

/** Old saves got 50 bait: once, bring them up to BAIT_STACK (difference only, never repeats). */
function topUpBait(game: GameState, content: Content): GameState {
  if (game.meta.grants?.includes(BAIT_TOPUP_ID)) return game;
  const missing = BAIT_STACK - held(game, BAIT_ITEM_ID);
  let inventory = game.inventory;
  if (missing > 0) {
    const r = addItem(inventory, content.items, BAIT_ITEM_ID, missing);
    if (!r.ok) return game; // bag full: retry on the next load
    inventory = r.value;
  }
  const meta = { ...game.meta, grants: [...(game.meta.grants ?? []), BAIT_TOPUP_ID] };
  return { ...game, inventory, meta };
}

export function applyStarterKits(game: GameState, content: Content): GameState {
  const kitted = grantKits(game, content);
  return topUpBait(kitted, content);
}

function grantKits(game: GameState, content: Content): GameState {
  let inventory = game.inventory;
  for (const kit of STARTER_KITS) {
    const level = isSkillId(kit.skill) ? getLevel(game.progression, kit.skill) : 1;
    if (level > 1 || kit.tools.some((t) => held(game, t) > 0)) continue;
    let next = inventory;
    let fits = true;
    for (const g of kit.grant) {
      const r = addItem(next, content.items, g.itemId, g.quantity);
      if (r.ok) next = r.value;
      else fits = false;
    }
    if (fits) inventory = next;
  }
  return inventory === game.inventory ? game : { ...game, inventory };
}
