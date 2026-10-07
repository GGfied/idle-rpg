import { describe, expect, it } from 'vitest';
import { findDuplicates, isValidId } from '@core/utils';
import { NPC_DEFS, REFERENCED_DIALOGUE_IDS, REFERENCED_PANEL_IDS } from './data';
import type { NpcSpriteKey } from './types';

// Ids other modules provide (mirror of story's dialogue ids and the HUD's panel ids).
const KNOWN_DIALOGUE_IDS = ['banker_greeting'];
const KNOWN_PANEL_IDS = ['bankPanel'];
const SPRITE_KEYS: NpcSpriteKey[] = ['banker', 'banker_f'];

describe('npc definitions', () => {
  it('has unique snake_case ids', () => {
    expect(findDuplicates(NPC_DEFS.map((d) => d.id))).toEqual([]);
    expect(NPC_DEFS.filter((d) => !isValidId(d.id))).toEqual([]);
  });

  it.each(NPC_DEFS.map((d) => [d.id, d] as const))('%s is well formed', (_id, def) => {
    expect(def.name).not.toBe('');
    expect(def.examine).not.toBe('');
    expect(def.spriteKey).not.toBe('');
    expect(def.size).toBe(1);
    expect(def.options.length).toBeGreaterThan(0);
    expect(findDuplicates(def.options.map((o) => o.id))).toEqual([]);
    for (const o of def.options) expect(o.label).not.toBe('');
  });

  it('every option intent references a known dialogue or panel', () => {
    const intents = NPC_DEFS.flatMap((d) => d.options.map((o) => o.intent));
    for (const i of intents) {
      if (i.type === 'talk') expect(KNOWN_DIALOGUE_IDS).toContain(i.dialogueId);
      else expect(KNOWN_PANEL_IDS).toContain(i.panel);
    }
  });

  it('exported reference lists match what the defs use', () => {
    const intents = NPC_DEFS.flatMap((d) => d.options.map((o) => o.intent));
    const dialogues = new Set(intents.flatMap((i) => (i.type === 'talk' ? [i.dialogueId] : [])));
    const panels = new Set(intents.flatMap((i) => (i.type === 'openPanel' ? [i.panel] : [])));
    expect([...dialogues].sort()).toEqual([...REFERENCED_DIALOGUE_IDS].sort());
    expect([...panels].sort()).toEqual([...REFERENCED_PANEL_IDS].sort());
  });

  it('every spriteKey is in the NpcSpriteKey list', () => {
    const keys: readonly string[] = SPRITE_KEYS;
    for (const d of NPC_DEFS) expect(keys).toContain(d.spriteKey);
  });

  it.each(['banker', 'banker_f'])('%s matches the contract', (id) => {
    const banker = NPC_DEFS.find((d) => d.id === id);
    expect(banker?.spriteKey).toBe(id);
    expect(banker?.behaviour.kind).toBe('idle');
    expect(banker?.options.map((o) => o.label)).toEqual(['Talk-to', 'Bank']);
  });

  it('banker_f has the same options as banker', () => {
    const get = (id: string) => NPC_DEFS.find((d) => d.id === id);
    expect(get('banker_f')?.options).toEqual(get('banker')?.options);
    expect(get('banker_f')?.examine).not.toBe(get('banker')?.examine);
  });
});
