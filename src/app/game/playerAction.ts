/** What the player is doing with fire right now, for the animator (pure). */
import type { GameState } from '@app/game/types';

export type FireAction = 'lighting' | 'cooking';

export function playerAction(g: Pick<GameState, 'firemaking' | 'cooking'>): FireAction | null {
  if (g.firemaking.lighting) return 'lighting';
  if (g.cooking.session) return 'cooking';
  return null;
}
