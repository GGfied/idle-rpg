import { afterEach, describe, expect, it } from 'vitest';
import type { Requirement } from '@core/contracts';
import { DIALOGUES, advance, currentView, startDialogue } from './index';
import type { DialogueContext, DialogueDef } from './index';

const allow: DialogueContext = { meets: () => true };
const deny: DialogueContext = { meets: () => false };

const gated: DialogueDef = {
  id: 'test_gated',
  npcId: 'banker',
  npcName: 'Banker',
  start: 'menu',
  nodes: {
    menu: {
      type: 'choice',
      options: [
        {
          text: 'Open',
          next: 'act',
          requirement: { type: 'skillLevel', skill: 'mining', level: 5 },
        },
        { text: 'Leave', next: 'bye' },
      ],
    },
    act: { type: 'action', intent: { type: 'giveItem', itemId: 'x' }, next: 'bye' },
    bye: { type: 'end' },
  },
};

afterEach(() => {
  const i = DIALOGUES.indexOf(gated);
  if (i >= 0) DIALOGUES.splice(i, 1);
});

function successors(def: DialogueDef, id: string): string[] {
  const n = def.nodes[id];
  if (!n) return [];
  if (n.type === 'say') return [n.next];
  if (n.type === 'choice') return n.options.map((o) => o.next);
  if (n.type === 'action') return n.next ? [n.next] : [];
  return [];
}

function reach(def: DialogueDef, from: string): Set<string> {
  const seen = new Set<string>();
  const todo = [from];
  while (todo.length) {
    const id = todo.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    expect(def.nodes[id], `${def.id}: missing node ${id}`).toBeDefined();
    todo.push(...successors(def, id));
  }
  return seen;
}

describe('every dialogue tree', () => {
  for (const def of DIALOGUES) {
    it(`${def.id}: all nodes reachable, every node can reach an end`, () => {
      expect([...reach(def, def.start)].sort()).toEqual(Object.keys(def.nodes).sort());
      for (const id of Object.keys(def.nodes)) {
        const ends = [...reach(def, id)].filter((n) => def.nodes[n]?.type === 'end');
        expect(ends.length, `${def.id}: ${id} cannot end`).toBeGreaterThan(0);
      }
      expect(['say', 'choice']).toContain(def.nodes[def.start]?.type);
    });

    it(`${def.id}: terminates when the player always picks the last option`, () => {
      let s = startDialogue(def.id, allow);
      for (let i = 0; i < 50 && !s.done; i++) {
        const v = currentView(s);
        s = advance(s, v && v.choices.length ? v.choices.length - 1 : undefined).state;
      }
      expect(s.done).toBe(true);
    });
  }

  it('has unique ids', () => {
    const ids = DIALOGUES.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('banker_greeting', () => {
  it('greets, then offers three choices', () => {
    let s = startDialogue('banker_greeting', allow);
    const hello = currentView(s);
    expect(hello?.speaker).toBe('banker');
    expect(hello?.text).toContain('Willowbrook Bank');
    s = advance(s).state;
    expect(currentView(s)?.choices.map((c) => c.text)).toEqual([
      "I'd like to access my bank.",
      'What is this place?',
      'Nothing, thanks.',
    ]);
  });

  it('opening the bank emits openPanel bankPanel and ends', () => {
    const s = advance(startDialogue('banker_greeting', allow)).state;
    const r = advance(s, 0);
    expect(r.intents).toEqual([{ type: 'openPanel', panel: 'bankPanel' }]);
    expect(r.done).toBe(true);
    expect(currentView(r.state)).toBeNull();
  });

  it('"What is this place?" explains then returns to the choice', () => {
    let s = advance(startDialogue('banker_greeting', allow)).state;
    s = advance(s, 1).state;
    expect(currentView(s)?.choices).toEqual([]);
    s = advance(s).state;
    expect(currentView(s)?.choices).toHaveLength(3);
  });

  it('"Nothing, thanks." ends with no intents', () => {
    const s = advance(startDialogue('banker_greeting', allow)).state;
    const r = advance(s, 2);
    expect(r.done).toBe(true);
    expect(r.intents).toEqual([]);
  });

  it('ignores a missing or out-of-range choice', () => {
    const s = advance(startDialogue('banker_greeting', allow)).state;
    expect(advance(s).state).toBe(s);
    expect(advance(s, 9).state).toBe(s);
  });
});

describe('choice requirements', () => {
  it('lists locked choices with requirement text and blocks them', () => {
    DIALOGUES.push(gated);
    const s = startDialogue('test_gated', deny);
    expect(currentView(s)?.choices).toEqual([
      { text: 'Open', locked: true, requirementText: 'Needs Mining level 5' },
      { text: 'Leave', locked: false },
    ]);
    const r = advance(s, 0);
    expect(r.state).toBe(s);
    expect(r.intents).toEqual([]);
    expect(r.done).toBe(false);
  });

  it('unlocks when the context meets the requirement', () => {
    DIALOGUES.push(gated);
    const seen: Requirement[] = [];
    const ctx: DialogueContext = { meets: (r) => (seen.push(r), true) };
    const s = startDialogue('test_gated', ctx);
    expect(currentView(s)?.choices[0]).toEqual({ text: 'Open', locked: false });
    expect(advance(s, 0).intents).toEqual([{ type: 'giveItem', itemId: 'x' }]);
    expect(seen[0]).toEqual({ type: 'skillLevel', skill: 'mining', level: 5 });
  });
});

describe('errors', () => {
  it('unknown dialogue id throws', () => {
    expect(() => startDialogue('nope', allow)).toThrow('Unknown dialogue "nope"');
  });
});
