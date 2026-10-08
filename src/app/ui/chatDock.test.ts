import { describe, expect, it } from 'vitest';
import { hasUnread, peekLine } from './chatDock';

const chat = [
  { id: 1, text: 'a' },
  { id: 2, text: 'warn', important: true as const },
  { id: 3, text: 'b' },
];

describe('chatDock', () => {
  it('flags unread only for lines newer than the last seen id', () => {
    expect(hasUnread(chat, 2)).toBe(true);
    expect(hasUnread(chat, 3)).toBe(false);
    expect(hasUnread([], 0)).toBe(false);
  });
  it('peeks the newest important line after the given id', () => {
    expect(peekLine(chat, 1)?.text).toBe('warn');
    expect(peekLine(chat, 2)).toBeNull();
    expect(peekLine([{ id: 4, text: 'x' }], 0)).toBeNull();
  });
});
