import { BANK_CAPACITY } from '@core/inventory';
import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';
import { BankView, type BankMode } from '@app/ui/panels/BankView';

const nameOf = (id: string): string => CONTENT.items.get(id)?.name ?? id;

/**
 * Bank (default) or deposit chest. The mode comes from `game.bankMode` ('full' | 'depositOnly');
 * the optional `mode` prop overrides it.
 */
export function BankPanel({ mode }: { mode?: BankMode }) {
  const open = useApp((s) => s.game.bankOpen);
  const stateMode = useApp((s) => s.game.bankMode);
  const bank = useApp((s) => s.game.bank.items);
  const slots = useApp((s) => s.game.inventory.slots);
  const { audio } = useRuntime();
  const openMenu = useApp((s) => s.openMenu);
  const withdraw = useApp((s) => s.bankWithdraw);
  const deposit = useApp((s) => s.bankDeposit);
  const depositAll = useApp((s) => s.bankDepositAll);
  const close = useApp((s) => s.closeBank);
  if (!open) return null;
  return (
    <BankView
      mode={mode ?? stateMode ?? 'full'}
      bank={bank}
      slots={slots}
      capacity={BANK_CAPACITY}
      nameOf={nameOf}
      onWithdraw={(e, itemId) =>
        openMenu({
          x: e.clientX,
          y: e.clientY,
          title: nameOf(itemId),
          options: [
            { label: 'Withdraw 1', onSelect: () => withdraw(itemId, 1) },
            { label: 'Withdraw all', onSelect: () => withdraw(itemId, 'all') },
            { label: 'Cancel', onSelect: () => undefined },
          ],
        })
      }
      onDepositSlot={(e, i) => {
        const stack = slots[i];
        if (!stack) return;
        openMenu({
          x: e.clientX,
          y: e.clientY,
          title: nameOf(stack.itemId),
          options: [
            { label: 'Deposit 1', onSelect: () => deposit(i, 1) },
            { label: 'Deposit all', onSelect: () => deposit(i, 'all') },
            { label: 'Cancel', onSelect: () => undefined },
          ],
        });
      }}
      onDepositAll={() => {
        audio.play('uiClick');
        depositAll();
      }}
      onClose={() => {
        audio.play('uiClick');
        close();
      }}
    />
  );
}
