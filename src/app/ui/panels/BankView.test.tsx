import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BankView, type BankViewProps } from './BankView';

const base: BankViewProps = {
  mode: 'full',
  bank: [{ itemId: 'oak_logs', quantity: 3 }],
  slots: [{ itemId: 'logs', quantity: 2 }, null, null],
  capacity: 800,
  nameOf: (id) => `N:${id}`,
  onWithdraw: () => undefined,
  onDepositSlot: () => undefined,
  onDepositAll: () => undefined,
  onClose: () => undefined,
};
const html = (p: Partial<BankViewProps>) =>
  renderToStaticMarkup(<BankView {...base} {...p} />).replace(/<!-- -->/g, '');

describe('BankView', () => {
  it('full mode shows the bank grid, withdraw items and Deposit inventory', () => {
    const h = html({});
    expect(h).toContain('aria-label="Bank"');
    expect(h).toContain('In the bank');
    expect(h).toContain('N:oak_logs x3');
    expect(h).toContain('Deposit inventory');
    expect(h).toContain('1 / 800 slots used');
  });
  it('depositOnly shows a titled inventory with Deposit all, no bank grid or withdraw items', () => {
    const h = html({ mode: 'depositOnly' });
    expect(h).toContain('aria-label="Deposit chest"');
    expect(h).toContain('Deposit all');
    expect(h).toContain('Your inventory');
    expect(h).toContain('N:logs x2');
    expect(h).not.toContain('In the bank');
    expect(h).not.toContain('N:oak_logs');
    expect(h).not.toContain('slots used');
  });
  it('depositOnly with an empty inventory says so and dims Deposit all', () => {
    const h = html({ mode: 'depositOnly', slots: [null, null] });
    expect(h).toContain('Nothing to deposit.');
    expect(h).toContain('aria-disabled="true"');
  });
});
