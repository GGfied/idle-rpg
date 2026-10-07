import type { Requirement } from '@core/contracts';
import { DIALOGUES } from './data';
import type {
  AdvanceResult,
  DialogueContext,
  DialogueDef,
  DialogueIntent,
  DialogueNode,
  DialogueState,
  DialogueView,
} from './types';

export function getDialogue(id: string): DialogueDef | undefined {
  return DIALOGUES.find((d) => d.id === id);
}

function titleCase(id: string): string {
  const spaced = id.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Short plain-text label for a requirement, shown next to a locked choice. */
export function requirementText(req: Requirement): string {
  switch (req.type) {
    case 'skillLevel':
      return `Needs ${titleCase(req.skill)} level ${req.level}`;
    case 'item':
      return `Needs ${req.count && req.count > 1 ? `${req.count} x ` : ''}${titleCase(req.itemId)}`;
    case 'quest':
      return `Needs quest: ${titleCase(req.questId)}`;
    case 'flag':
      return `Needs: ${titleCase(req.flag)}`;
  }
}

function node(def: DialogueDef, id: string): DialogueNode {
  const n = def.nodes[id];
  if (!n) throw new Error(`Dialogue "${def.id}" has no node "${id}"`);
  return n;
}

/**
 * Follow action nodes (collecting intents) until a say, choice or end node.
 * Bounded so a malformed cycle of actions cannot hang the game.
 */
function settle(
  def: DialogueDef,
  startId: string,
  ctx: DialogueContext,
): { state: DialogueState; intents: DialogueIntent[] } {
  const intents: DialogueIntent[] = [];
  let id = startId;
  for (let i = 0; i <= Object.keys(def.nodes).length; i++) {
    const n = node(def, id);
    if (n.type === 'action') {
      intents.push(n.intent);
      if (!n.next) break;
      id = n.next;
      continue;
    }
    if (n.type === 'end') break;
    return { state: { dialogueId: def.id, nodeId: id, done: false, ctx }, intents };
  }
  return { state: { dialogueId: def.id, nodeId: '', done: true, ctx }, intents };
}

/** Throws on an unknown dialogue id. */
export function startDialogue(dialogueId: string, ctx: DialogueContext): DialogueState {
  const def = getDialogue(dialogueId);
  if (!def) throw new Error(`Unknown dialogue "${dialogueId}"`);
  const first = node(def, def.start);
  if (first.type !== 'say' && first.type !== 'choice') {
    throw new Error(`Dialogue "${dialogueId}" must start on a say or choice node`);
  }
  return settle(def, def.start, ctx).state;
}

/**
 * Move on from a say node, or pick a choice (by index). A locked or out-of-range
 * choice changes nothing. Intents come from any action nodes passed through.
 */
export function advance(state: DialogueState, choiceIndex?: number): AdvanceResult {
  const stay: AdvanceResult = { state, intents: [], done: state.done };
  if (state.done) return stay;
  const def = getDialogue(state.dialogueId);
  if (!def) throw new Error(`Unknown dialogue "${state.dialogueId}"`);
  const n = node(def, state.nodeId);
  let nextId: string;
  if (n.type === 'say') {
    nextId = n.next;
  } else if (n.type === 'choice') {
    const opt = choiceIndex === undefined ? undefined : n.options[choiceIndex];
    if (!opt || (opt.requirement && !state.ctx.meets(opt.requirement))) return stay;
    nextId = opt.next;
  } else {
    return stay;
  }
  const { state: next, intents } = settle(def, nextId, state.ctx);
  return { state: next, intents, done: next.done };
}

/** What the dialogue box shows now; null when the dialogue is finished. */
export function currentView(state: DialogueState): DialogueView | null {
  if (state.done) return null;
  const def = getDialogue(state.dialogueId);
  if (!def) throw new Error(`Unknown dialogue "${state.dialogueId}"`);
  const n = node(def, state.nodeId);
  if (n.type === 'say') {
    const player = n.speaker === 'player';
    return {
      speaker: player ? 'player' : def.npcId,
      speakerName: player ? 'You' : def.npcName,
      text: n.text,
      choices: [],
    };
  }
  if (n.type !== 'choice') return null;
  return {
    speaker: 'player',
    speakerName: 'You',
    text: '',
    choices: n.options.map((o) => {
      const locked = !!o.requirement && !state.ctx.meets(o.requirement);
      return o.requirement && locked
        ? { text: o.text, locked, requirementText: requirementText(o.requirement) }
        : { text: o.text, locked };
    }),
  };
}
