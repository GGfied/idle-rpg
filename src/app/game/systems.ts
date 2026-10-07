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
import { WOODCUTTING_MESSAGES, levelTooLowMessage } from '@features/skills/woodcutting';
import { interactionFor } from '@features/facilities';
import { intentFor } from '@features/npc';
import { isAdjacentTo, tickMovement } from '@features/movement';
import type { AppEvent, Content } from '@app/registry';
import { addChat, addImportantChat } from '@app/game/chat';
import { closeTalk, startTalk } from '@app/game/dialogue';
import { applyIntent } from '@app/game/intents';
import { canTalk } from '@app/game/reach';
import type { GameState } from '@app/game/types';

/** Movement: advance along the path. */
export function createMovementSystem(content: Content): System<GameState, AppEvent> {
  return (state, ctx) => {
    const r = tickMovement(state.movement, ctx, content.grid);
    return { state: { ...state, movement: r.state }, events: r.events };
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

/** Chat line for clicking a tree that is already a stump. */
export const NOTHING_TO_CHOP = "There's nothing left to chop.";

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
      return addChat(next, WOODCUTTING_MESSAGES.gathered[e.itemId] ?? '');
    }
    case 'xpGranted': {
      const r = applyXpGranted(state.progression, e.skill, e.amount);
      out.push(...r.events);
      let next: GameState = { ...state, progression: r.state };
      next = addImportantChat(next, ...r.events.flatMap((p) => levelUpLine(p)));
      return next;
    }
    case 'gatherStarted':
      return addChat(state, WOODCUTTING_MESSAGES.started);
    case 'gatherStopped': {
      if (e.reason === 'depleted' || e.reason === 'cancelled') return state;
      if (e.reason === 'levelTooLow') {
        return addImportantChat(state, levelTooLowMessage(e.defId ?? '') ?? '');
      }
      return addImportantChat(state, WOODCUTTING_MESSAGES.stopped[e.reason]);
    }
    default:
      return state;
  }
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
      const tree = content.trees.get(pending.nodeId);
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
          state = addImportantChat(state, NOTHING_TO_CHOP);
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
      events.push(e);
      state = applyGatherEvent(state, e, content, events);
    }
    return { state, events };
  };
}

/** Counts time played (one tick = TICK_MS). */
export const playTimeSystem: System<GameState, AppEvent> = (state) => ({
  state: { ...state, meta: { playTimeMs: state.meta.playTimeMs + TICK_MS } },
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
    if (npc && intent?.type === 'talk') state = startTalk(state, npc.spawnId, intent.dialogueId);
    else if (intent) state = applyIntent(state, intent);
    return { state, events: [] };
  };
}
