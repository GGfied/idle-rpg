import type { TickContext, TickResult } from '@core/contracts';
import { TICK_MS } from '@core/engine';
import type { System } from '@core/engine';
import { bestTool } from '@core/equipment';
import { addItem, canAdd, itemIds } from '@core/inventory';
import { SKILLS, applyXpGranted, getLevel, isSkillId } from '@core/progression';
import { tickPlayerHp } from '@features/combat';
import { tickPrayer } from '@features/skills/prayer';
import type { ProgressionEvent } from '@core/progression';
import { gatherStoppedEvent, startGather, tickGathering } from '@core/skills';
import type { GatherEnv, GatherEvent, GatheringState } from '@core/skills';
import { NOTHING_TO_CHOP, gatheredLine, nothingLeft, stoppedLine } from '@app/game/gatherMessages';
import { interactionFor } from '@features/facilities';
import { intentFor } from '@features/npc';
import { isAdjacentTo, tickMovement } from '@features/movement';
import { gatherNode } from '@app/game/gatherNode';
import type { AppEvent, Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import { closeTalk, startTalk } from '@app/game/dialogue';
import { applyIntent } from '@app/game/intents';
import { canTalk } from '@app/game/reach';
import type { GameState } from '@app/game/types';

/** Chat line when run energy hits 0 and running switches itself off. */
export const OUT_OF_RUN_ENERGY = "You're out of run energy.";

/** Movement: advance along the path; say so in chat when run energy runs out. */
export function createMovementSystem(content: Content): System<GameState, AppEvent> {
  return (state, ctx) => {
    const r = tickMovement(state.movement, ctx, content.grid);
    let next: GameState = { ...state, movement: r.state };
    if (r.events.some((e) => e.type === 'runDisabled')) {
      next = addImportantChat(next, OUT_OF_RUN_ENERGY);
    }
    return { state: next, events: r.events };
  };
}

/** What the gathering loop needs to know, read from the current game state. */
export function gatherEnv(state: GameState, content: Content): GatherEnv {
  const level = (skill: string): number =>
    isSkillId(skill) ? getLevel(state.progression, skill) : 1;
  return {
    getDef: (id) => content.gatherDefs.get(id),
    level,
    tool: (kind) => {
      const t = bestTool(content.tools, kind, itemIds(state.inventory), level);
      return t ? { ticksSaved: t.def.ticksSaved } : null;
    },
    canFit: (itemId, qty) => canAdd(state.inventory, content.items, itemId, qty),
  };
}

export { NOTHING_TO_CHOP };

const skillName = (id: string): string => SKILLS.find((s) => s.id === id)?.name ?? id;

/** Apply one gather event to the game: inventory, xp, chat. */
function applyGatherEvent(
  state: GameState,
  e: GatherEvent,
  content: Content,
  out: AppEvent[],
): GameState {
  switch (e.type) {
    case 'itemGathered': {
      const r = addItem(state.inventory, content.items, e.itemId, e.quantity);
      const next = r.ok ? { ...state, inventory: r.value } : state;
      return addChat(next, gatheredLine(e.itemId));
    }
    case 'xpGranted':
      return grantXp(state, e.skill, e.amount, out);
    case 'gatherStopped': {
      if (e.reason === 'depleted' || e.reason === 'cancelled') return state;
      return addImportantChat(state, stoppedLine(e.defId, e.reason));
    }
    default:
      return state;
  }
}

/** Add xp to a skill; level-ups become events and chat lines. Shared by every skill's event applier. */
export function grantXp(
  state: GameState,
  skill: string,
  amount: number,
  out: AppEvent[],
): GameState {
  const r = applyXpGranted(state.progression, skill, amount);
  out.push(...r.events);
  const next: GameState = { ...state, progression: r.state };
  return addImportantChat(next, ...r.events.flatMap((p) => levelUpLine(p)));
}

function levelUpLine(p: ProgressionEvent): string[] {
  return p.type === 'levelUp'
    ? [
        `Congratulations, you've just advanced your ${skillName(p.skill)} level. You are now level ${p.level}.`,
      ]
    : [];
}

/**
 * Chopping: when the player has arrived next to the tree they clicked, start gathering and face it;
 * then run one gathering tick and apply its events (logs, xp, level-ups, chat).
 */
export function createGatherSystem(content: Content): System<GameState, AppEvent> {
  return (input: GameState, ctx: TickContext): TickResult<GameState, AppEvent> => {
    let state = input;
    const events: AppEvent[] = [];
    const gathered: GatherEvent[] = [];
    let gathering: GatheringState = state.gathering;

    const pending = state.pendingInteraction;
    if (pending) {
      const tree = gatherNode(content, pending.nodeId);
      const arrived = state.movement.path.length === 0;
      if (!tree || (arrived && !isAdjacentTo(state.movement.position, tree))) {
        state = { ...state, pendingInteraction: null }; // unreachable now (path was blocked)
      } else if (arrived) {
        const r = startGather(gathering, tree.nodeId, tree.defId, gatherEnv(state, content));
        if (r.ok) {
          gathering = r.value.state;
          gathered.push(...r.value.events);
        } else if (r.error === 'depleted') {
          // Clicking a stump: say so. (The normal fall after a log stays silent, see applyGatherEvent.)
          state = addImportantChat(state, nothingLeft(tree.defId));
        } else {
          gathered.push(
            gatherStoppedEvent(
              tree.nodeId,
              tree.defId,
              r.error,
              content.gatherDefs.get(tree.defId),
            ),
          );
        }
        state = { ...state, pendingInteraction: null };
      }
    }

    const tick = tickGathering(gathering, ctx, gatherEnv(state, content));
    state = { ...state, gathering: tick.state };
    gathered.push(...tick.events);

    for (const e of gathered) {
      events.push(withNodeSkill(e, content));
      state = applyGatherEvent(state, e, content, events);
    }
    return { state, events };
  };
}

/** Node events carry the skill of the node's def, so audio can tell a rock crumbling from a tree falling. */
export function withNodeSkill(e: GatherEvent, content: Content): AppEvent {
  if (e.type !== 'nodeDepleted' && e.type !== 'nodeRespawned') return e;
  const defId = gatherNode(content, e.nodeId)?.defId;
  const skill = defId ? content.gatherDefs.get(defId)?.skill : undefined;
  return skill ? ({ ...e, skill } as unknown as AppEvent) : e;
}

/** Counts time played (one tick = TICK_MS). */
export const playTimeSystem: System<GameState, AppEvent> = (state) => ({
  state: { ...state, meta: { ...state.meta, playTimeMs: state.meta.playTimeMs + TICK_MS } },
  events: [],
});

/** Hit points regenerate towards the Hitpoints level. */
export const hpSystem: System<GameState, AppEvent> = (state, ctx) => {
  const r = tickPlayerHp(state.hp, ctx, getLevel(state.progression, 'hitpoints'));
  return { state: r.state === state.hp ? state : { ...state, hp: r.state }, events: r.events };
};

/** Prayer points are kept within the Prayer level. */
export const prayerSystem: System<GameState, AppEvent> = (state, ctx) => {
  const r = tickPrayer(state.prayer, ctx, getLevel(state.progression, 'prayer'));
  return {
    state: r.state === state.prayer ? state : { ...state, prayer: r.state },
    events: r.events,
  };
};

/** Runs the chosen facility option's intent once the player stands beside the facility. */
export function createFacilitySystem(content: Content): System<GameState, AppEvent> {
  return (state) => {
    const p = state.pendingFacility;
    if (p === null || state.movement.path.length > 0) return { state, events: [] };
    const obj = content.objects.get(p.objectId);
    const next = { ...state, pendingFacility: null };
    const here = obj !== undefined && isAdjacentTo(state.movement.position, obj);
    const intent = here ? interactionFor(p.kind, p.optionId) : undefined;
    return { state: intent?.ok ? applyIntent(next, intent.value) : next, events: [] };
  };
}

/**
 * Runs the NPC option the player walked to once they are in talking reach (Talk-to starts the
 * dialogue, Bank opens the panel), and closes a conversation the player is no longer in reach of.
 */
export function createNpcSystem(content: Content): System<GameState, AppEvent> {
  return (input) => {
    let state = input;
    const pos = state.movement.position;
    const speaker = state.talk && content.npcs.get(state.talk.spawnId);
    if (state.talk && !(speaker && canTalk(pos, speaker, content.isCounter)))
      state = closeTalk(state);
    const p = state.pendingNpc;
    if (p === null || state.movement.path.length > 0) return { state, events: [] };
    const npc = content.npcs.get(p.spawnId);
    state = { ...state, pendingNpc: null };
    const intent =
      npc && canTalk(pos, npc, content.isCounter) ? intentFor(npc.npcId, p.optionId) : undefined;
    if (npc && intent?.type === 'talk')
      state = startTalk(
        state,
        npc.spawnId,
        intent.dialogueId,
        content.npcDialogueVars?.get(npc.spawnId),
        content.items,
      );
    else if (intent) state = applyIntent(state, intent);
    return { state, events: [] };
  };
}
