import type { TickContext } from '@core/contracts';
import { runSystems } from '@core/engine';
import { SYSTEMS } from '@app/registry';
import type { AppEvent } from '@app/registry';
import type { GameState } from '@app/game/types';

/** One 600 ms game tick: every registered system in order. Pure; all randomness is ctx.rng. */
export function step(state: GameState, ctx: TickContext): { state: GameState; events: AppEvent[] } {
  return runSystems(SYSTEMS, state, ctx);
}
