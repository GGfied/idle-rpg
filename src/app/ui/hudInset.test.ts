import { describe, expect, it } from 'vitest';
import { bottomInset } from './hudInset';

const sheet = { top: 780, width: 390, height: 64 };
const chat = { top: 720, width: 390, height: 60 };

describe('bottomInset', () => {
  it('covers sheet plus chat strip on phone portrait', () => {
    expect(bottomInset(844, [sheet, chat], true)).toBe(124);
  });
  it('shrinks when the chat is minimized (hidden rect has zero size)', () => {
    expect(bottomInset(844, [sheet, { top: 0, width: 0, height: 0 }], true)).toBe(64);
  });
  it('is 0 on desktop and phone landscape', () => {
    expect(bottomInset(800, [sheet, chat], false)).toBe(0);
  });
  it('is 0 with nothing visible', () => {
    expect(bottomInset(844, [], true)).toBe(0);
  });
});
