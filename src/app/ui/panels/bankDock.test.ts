import { describe, expect, it } from 'vitest';
import hud from '@app/ui/Hud.tsx?raw';

// The CSS half (phone hides `.hud[data-bank='true']`) is checked in a browser by
// tests/e2e/hudBankDock.e2e.mjs: vitest does not return raw CSS text.
describe('docked inventory while the bank overlay is open', () => {
  it('Hud marks the dock with data-bank from game.bankOpen', () => {
    expect(hud).toContain('data-bank={bankOpen}');
    expect(hud).toContain('useApp((s) => s.game.bankOpen)');
  });
});
