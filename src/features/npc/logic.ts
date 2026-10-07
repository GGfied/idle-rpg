import type { TickContext, TickResult } from '@core/contracts';
import { NPC_DEFS } from './data';
import type {
  BehaviourDef,
  NpcDef,
  NpcEvent,
  NpcInstance,
  NpcIntent,
  NpcOption,
  NpcSpawn,
  NpcState,
} from './types';

const DEFS_BY_ID = new Map(NPC_DEFS.map((d) => [d.id, d]));

export const getNpcDef = (npcId: string): NpcDef | undefined => DEFS_BY_ID.get(npcId);

/** Spawns whose npcId has no definition are skipped. */
export function spawnNpcs(spawns: readonly NpcSpawn[]): NpcInstance[] {
  return spawns
    .filter((s) => DEFS_BY_ID.has(s.npcId))
    .map((s) => ({
      spawnId: s.spawnId,
      npcId: s.npcId,
      x: s.x,
      y: s.y,
      facing: s.facing ?? 'south',
    }));
}

export const createNpcState = (spawns: readonly NpcSpawn[]): NpcState => ({
  instances: spawnNpcs(spawns),
});

export function optionsFor(npcId: string): NpcOption[] {
  return getNpcDef(npcId)?.options ?? [];
}

/** The intent for an option id; default (no id) is the first option (Talk-to). */
export function intentFor(npcId: string, optionId?: string): NpcIntent | undefined {
  const options = optionsFor(npcId);
  const option = optionId === undefined ? options[0] : options.find((o) => o.id === optionId);
  return option?.intent;
}

type BehaviourHandler = (npc: NpcInstance, ctx: TickContext) => NpcEvent[];

/** One handler per behaviour kind. Add `wander` etc. here; handlers return events, not mutations. */
const BEHAVIOUR_HANDLERS: Record<BehaviourDef['kind'], BehaviourHandler> = {
  idle: () => [],
};

export function tickNpcs(state: NpcState, ctx: TickContext): TickResult<NpcState, NpcEvent> {
  const events: NpcEvent[] = [];
  for (const npc of state.instances) {
    const def = getNpcDef(npc.npcId);
    if (def) events.push(...BEHAVIOUR_HANDLERS[def.behaviour.kind](npc, ctx));
  }
  return { state, events };
}
