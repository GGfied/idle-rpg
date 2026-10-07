import type { GroundItemsState } from '@core/items';
import type { BankState, InventoryState } from '@core/inventory';
import type { ProgressionState } from '@core/progression';
import type { GatheringState } from '@core/skills';
import type { DialogueState } from '@features/story';
import type { PlayerHpState } from '@features/combat';
import type { MovementState } from '@features/movement';
import type { PrayerPointsState } from '@features/skills/prayer';

export interface ChatLine {
  /** Increasing id, so React keys stay stable while old lines scroll off. */
  id: number;
  text: string;
  /** Error, warning or level-up: kept when game messages are switched off (see game/chat.ts). */
  important?: true;
}

export interface MetaState {
  playTimeMs: number;
}

/** A facility option the player has chosen and is walking to. */
export interface PendingFacility {
  kind: string;
  objectId: string;
  optionId: string;
}

/** The whole game, joined from every feature's slice. Plain data. */
export interface GameState {
  inventory: InventoryState;
  bank: BankState;
  hp: PlayerHpState;
  prayer: PrayerPointsState;
  progression: ProgressionState;
  movement: MovementState;
  gathering: GatheringState;
  /** The tree the player is walking to so they can chop it. */
  pendingInteraction: { nodeId: string } | null;
  /** The facility (bank booth, ...) the player is walking to; its option's intent runs on arrival. */
  pendingFacility: PendingFacility | null;
  /** The NPC option the player is walking to; its intent (talk, bank) runs on arrival. */
  pendingNpc: { spawnId: string; optionId: string } | null;
  /** The open conversation (not saved). `spawnId` is who is talking, for the reach check. */
  talk: { spawnId: string; dialogue: DialogueState } | null;
  /** Items lying on the ground (not saved: a reload clears them, they also despawn on a tick timer). */
  ground: GroundItemsState;
  /** The ground item the player is walking to take (not saved). */
  pendingGround: { id: string } | null;
  /** Latest game tick number, so intents can stamp drops (not saved). */
  tick: number;
  /** Whether the bank panel is open (not saved). */
  bankOpen: boolean;
  chat: ChatLine[];
  meta: MetaState;
}

/** The save slices (what survives a reload). */
export type SavedGame = Pick<
  GameState,
  'inventory' | 'bank' | 'hp' | 'prayer' | 'progression' | 'movement' | 'meta'
>;
