import type { TickContext, TickResult } from '@core/contracts';
import { err, ok, rollTable } from '@core/utils';
import type { Result } from '@core/utils';
import { createNode, depleteNode, isDepleted, tickNode } from './nodeState';
import { successChance } from './successChance';
import type {
  GatherDef,
  GatherEnv,
  GatherEvent,
  GatherSession,
  GatherStopReason,
  GatheringState,
} from './types';

export const createGatheringState = (): GatheringState => ({ session: null, nodes: {} });

/** Why the player can't gather from this def right now, or null if they can. */
function blocker(def: GatherDef, env: GatherEnv): GatherStopReason | null {
  if (env.level(def.skill) < def.requiredLevel) return 'levelTooLow';
  if (def.toolKind !== undefined && env.tool(def.toolKind) === null) return 'noTool';
  return null;
}

/** A gatherStopped event carrying defId, plus the level/tool detail the reason calls for. */
export function gatherStoppedEvent(
  nodeId: string,
  defId: string,
  reason: GatherStopReason,
  def?: GatherDef,
): GatherEvent {
  const e: GatherEvent = { type: 'gatherStopped', nodeId, reason, defId };
  if (def && reason === 'levelTooLow') e.requiredLevel = def.requiredLevel;
  if (def && reason === 'noTool' && def.toolKind !== undefined) e.tool = def.toolKind;
  return e;
}

const attemptTicks = (def: GatherDef, env: GatherEnv): number => {
  const saved = def.toolKind !== undefined ? (env.tool(def.toolKind)?.ticksSaved ?? 0) : 0;
  return Math.max(1, def.baseTicks - saved);
};

/** Begin acting on a node. Fails (without changing state) if the node is gone, or level/tool is missing. */
export function startGather(
  state: GatheringState,
  nodeId: string,
  defId: string,
  env: GatherEnv,
): Result<{ state: GatheringState; events: GatherEvent[] }, GatherStopReason> {
  const def = env.getDef(defId);
  if (!def) return err('cancelled');
  if (isDepleted(state.nodes[nodeId] ?? createNode())) return err('depleted');
  const reason = blocker(def, env);
  if (reason) return err(reason);
  const session: GatherSession = { nodeId, defId, cooldown: attemptTicks(def, env) };
  return ok({
    state: { ...state, session },
    events: [{ type: 'gatherStarted', nodeId, defId }],
  });
}

/** Stop acting (player moved, clicked elsewhere, ...). No-op when idle. */
export function stopGather(state: GatheringState): TickResult<GatheringState, GatherEvent> {
  if (!state.session) return { state, events: [] };
  return {
    state: { ...state, session: null },
    events: [gatherStoppedEvent(state.session.nodeId, state.session.defId, 'cancelled')],
  };
}

function respawnNodes(
  state: GatheringState,
  tick: number,
): TickResult<GatheringState, GatherEvent> {
  const events: GatherEvent[] = [];
  let nodes = state.nodes;
  for (const [id, node] of Object.entries(state.nodes)) {
    const r = tickNode(node, tick);
    if (r.respawned) {
      if (nodes === state.nodes) nodes = { ...state.nodes };
      delete nodes[id]; // missing entry == available
      events.push({ type: 'nodeRespawned', nodeId: id });
    }
  }
  return { state: nodes === state.nodes ? state : { ...state, nodes }, events };
}

/**
 * One game tick of gathering. Respawns due nodes, then (if acting) counts down and rolls an attempt.
 * Successes come back as `itemGathered` / `xpGranted` events for the integrator to apply.
 * Signature matches `System<GatheringState, GatherEvent>` once `env` is bound.
 */
export function tickGathering(
  input: GatheringState,
  ctx: TickContext,
  env: GatherEnv,
): TickResult<GatheringState, GatherEvent> {
  const respawn = respawnNodes(input, ctx.tick);
  const events: GatherEvent[] = [...respawn.events];
  const state = respawn.state;
  const session = state.session;
  if (!session) return { state, events };

  const stop = (reason: GatherStopReason): TickResult<GatheringState, GatherEvent> => {
    events.push(
      gatherStoppedEvent(session.nodeId, session.defId, reason, env.getDef(session.defId)),
    );
    return { state: { ...state, session: null }, events };
  };

  const def = env.getDef(session.defId);
  if (!def) return stop('cancelled');
  if (isDepleted(state.nodes[session.nodeId] ?? createNode())) return stop('depleted');
  const reason = blocker(def, env);
  if (reason) return stop(reason);

  if (session.cooldown > 1) {
    return { state: { ...state, session: { ...session, cooldown: session.cooldown - 1 } }, events };
  }

  // Attempt this tick; schedule the next one.
  const next: GatherSession = { ...session, cooldown: attemptTicks(def, env) };
  if (!ctx.rng.chance(successChance(env.level(def.skill), def.successLow, def.successHigh))) {
    return { state: { ...state, session: next }, events };
  }

  const gained = rollTable(ctx.rng, def.yields);
  if (!env.canFit(gained.itemId, gained.quantity)) return stop('inventoryFull');
  events.push(
    {
      type: 'itemGathered',
      skill: def.skill,
      nodeId: session.nodeId,
      itemId: gained.itemId,
      quantity: gained.quantity,
    },
    { type: 'xpGranted', skill: def.skill, amount: def.xp, source: def.id },
  );

  if (def.depleteChance > 0 && ctx.rng.chance(def.depleteChance)) {
    events.push({ type: 'nodeDepleted', nodeId: session.nodeId });
    events.push(gatherStoppedEvent(session.nodeId, session.defId, 'depleted'));
    return {
      state: {
        session: null,
        nodes: { ...state.nodes, [session.nodeId]: depleteNode(ctx.tick, def.respawnTicks) },
      },
      events,
    };
  }
  return { state: { ...state, session: next }, events };
}
