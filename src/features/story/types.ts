import type { Requirement } from '@core/contracts';

/** What the integrator should do; the story module never touches other modules' state. */
export type DialogueIntent =
  | { type: 'openPanel'; panel: string }
  | { type: 'giveItem'; itemId: string; count?: number }
  | { type: 'grantXp'; skill: string; amount: number }
  | { type: 'setFlag'; flag: string }
  | { type: 'startCombat'; npcId: string };

export interface ChoiceOption {
  text: string;
  next: string;
  /** Locked options stay listed, with the requirement shown. */
  requirement?: Requirement;
}

export type DialogueNode =
  | { type: 'say'; speaker: 'npc' | 'player'; text: string; next: string }
  | { type: 'choice'; options: ChoiceOption[] }
  | { type: 'action'; intent: DialogueIntent; next?: string }
  | { type: 'end' };

export interface DialogueDef {
  id: string;
  /** Speaker id, owned by `npc`. */
  npcId: string;
  /** Shown above npc lines. */
  npcName: string;
  /** Must be a say or choice node. */
  start: string;
  /** Fallback values for `{name}` placeholders in text. */
  vars?: Record<string, string>;
  nodes: Record<string, DialogueNode>;
}

/** Narrow read-only view of the game the interpreter needs. */
export interface DialogueContext {
  meets(req: Requirement): boolean;
}

export interface DialogueState {
  readonly dialogueId: string;
  /** Current say/choice node id; '' once done. */
  readonly nodeId: string;
  readonly done: boolean;
  readonly ctx: DialogueContext;
  /** Values for `{name}` placeholders (e.g. place), from the talked-to npc. */
  readonly vars: Readonly<Record<string, string>>;
}

export interface DialogueChoiceView {
  text: string;
  locked: boolean;
  requirementText?: string;
}

export interface DialogueView {
  /** 'player' or the npc id. */
  speaker: string;
  speakerName: string;
  /** Empty for a choice node (the player is picking). */
  text: string;
  choices: DialogueChoiceView[];
}

export interface AdvanceResult {
  state: DialogueState;
  intents: DialogueIntent[];
  done: boolean;
}
