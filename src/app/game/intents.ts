/** Applies the intents that facilities, NPC options and dialogue produce (they are plain data). */
import { addChat } from '@app/game/chat';
import type { GameState } from '@app/game/types';

export type AppIntent = { type: string; [key: string]: unknown };

/**
 * openPanel 'bankPanel' opens the bank. Other intents are not wired yet (no owner module takes them):
 * they say so in chat instead of silently doing nothing.
 */
export function applyIntent(state: GameState, intent: AppIntent): GameState {
  if (intent.type === 'openPanel' && intent.panel === 'bankPanel')
    return { ...state, bankOpen: true };
  // TODO: startRecipe (smithing/cooking/crafting runners), giveItem, grantXp once an owner exposes them.
  return addChat(state, 'Nothing interesting happens.');
}
