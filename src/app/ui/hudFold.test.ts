import { describe, expect, it, vi } from 'vitest';
import { applyFold, isFolded, persistsFold, readMode } from './hudFold';

const local = { sheetFold: 'auto', chatFold: 'collapsed' } as const;

describe('hudFold', () => {
  it('defaults to collapsed on phone and expanded on desktop (auto)', () => {
    expect(isFolded('auto', true)).toBe(true);
    expect(isFolded('auto', false)).toBe(false);
  });
  it('an explicit choice beats the layout default on both', () => {
    expect(isFolded('expanded', true)).toBe(false);
    expect(isFolded('collapsed', false)).toBe(true);
  });
  it('falls back to the session value while the pref key is absent', () => {
    expect(persistsFold({ chatbox: true }, 'chatFold')).toBe(false);
    expect(readMode({ chatbox: true }, 'chatFold', local)).toBe('collapsed');
    expect(readMode({}, 'sheetFold', local)).toBe('auto');
  });
  it('reads the pref once the key exists', () => {
    const hud = { sheetFold: 'expanded', chatFold: 'auto' };
    expect(readMode(hud, 'sheetFold', local)).toBe('expanded');
    expect(readMode(hud, 'chatFold', local)).toBe('auto');
  });
  it('writes the pref when persisted and the session otherwise', () => {
    const io = { setPref: vi.fn(), setLocal: vi.fn() };
    applyFold({ sheetFold: 'auto' }, 'sheetFold', false, io);
    expect(io.setPref).toHaveBeenCalledWith({ hud: { sheetFold: 'expanded' } });
    expect(io.setLocal).not.toHaveBeenCalled();
    applyFold({}, 'chatFold', true, io);
    expect(io.setLocal).toHaveBeenCalledWith('chatFold', 'collapsed');
    expect(io.setPref).toHaveBeenCalledTimes(1);
  });
});
