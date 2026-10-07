import { describe, expect, it } from 'vitest';
import { isAtBottom } from './chatScroll';

describe('isAtBottom', () => {
  it('is true at the very bottom', () => {
    expect(isAtBottom({ scrollTop: 221, clientHeight: 125, scrollHeight: 346 })).toBe(true);
  });
  it('tolerates sub-pixel slack', () => {
    expect(isAtBottom({ scrollTop: 218, clientHeight: 125, scrollHeight: 346 })).toBe(true);
  });
  it('is false once scrolled up to read history', () => {
    expect(isAtBottom({ scrollTop: 100, clientHeight: 125, scrollHeight: 346 })).toBe(false);
  });
  it('is true when the content fits without scrolling', () => {
    expect(isAtBottom({ scrollTop: 0, clientHeight: 125, scrollHeight: 60 })).toBe(true);
  });
});
