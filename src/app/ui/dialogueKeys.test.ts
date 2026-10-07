import { describe, expect, it } from 'vitest';
import { dialogueKeyAction, tapAdvances } from './dialogueKeys';

const say = { choices: [] };
const choice = { choices: [{ locked: false }, { locked: true }, { locked: false }] };

describe('dialogueKeyAction', () => {
  it('advances a say node on Space or Enter only', () => {
    expect(dialogueKeyAction(' ', say)).toEqual({ type: 'advance' });
    expect(dialogueKeyAction('Enter', say)).toEqual({ type: 'advance' });
    expect(dialogueKeyAction('1', say)).toBeNull();
    expect(dialogueKeyAction('a', say)).toBeNull();
  });
  it('picks choices by number, skipping locked and missing ones', () => {
    expect(dialogueKeyAction('1', choice)).toEqual({ type: 'choose', index: 0 });
    expect(dialogueKeyAction('3', choice)).toEqual({ type: 'choose', index: 2 });
    expect(dialogueKeyAction('2', choice)).toBeNull();
    expect(dialogueKeyAction('4', choice)).toBeNull();
    expect(dialogueKeyAction('0', choice)).toBeNull();
    expect(dialogueKeyAction('Enter', choice)).toBeNull();
  });
  it('Escape closes in both modes', () => {
    expect(dialogueKeyAction('Escape', say)).toEqual({ type: 'close' });
    expect(dialogueKeyAction('Escape', choice)).toEqual({ type: 'close' });
  });
  it('tap advances only say nodes', () => {
    expect(tapAdvances(say)).toBe(true);
    expect(tapAdvances(choice)).toBe(false);
  });
});
