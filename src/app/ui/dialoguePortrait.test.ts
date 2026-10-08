import { describe, expect, it, vi } from 'vitest';
import { speakerLookId, speakerPortrait } from '@app/ui/dialoguePortrait';

describe('dialogue speaker look', () => {
  it('the player speaker follows the chosen look, unknown falls back to male', () => {
    expect(speakerLookId('player', null, 'player_f')).toBe('player_f');
    expect(speakerLookId('player', null, 'player')).toBe('player');
    expect(speakerLookId('player', null, 'dragon')).toBe('player');
    expect(speakerLookId('player')).toBe('player');
  });

  it('an NPC ignores the player look', () => {
    expect(speakerLookId('banker', 'banker_f', 'player_f')).toBe('banker_f');
    expect(speakerLookId('banker', undefined, 'player_f')).toBe('banker');
  });

  it('the portrait function receives the chosen look id', () => {
    const fn = vi.fn(() => 'data:x');
    expect(speakerPortrait('player', 24, fn, null, 'player_f')).toBe('data:x');
    expect(fn).toHaveBeenCalledWith('player_f', 24);
  });
});
