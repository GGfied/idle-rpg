import { BANK_CAPACITY } from '@core/inventory';
import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { Panel } from '@app/ui/components/Panel';

const nameOf = (id: string): string => CONTENT.items.get(id)?.name ?? id;

/** The bank: what is stored (tap to withdraw) above what you carry (tap to deposit). */
export function BankPanel() {
  const open = useApp((s) => s.game.bankOpen);
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
    <div className="bank-overlay" role="dialog" aria-label="Bank">
      <Panel title="Bank">
        <div className="bank-head">
          <span className="bank-capacity">
            {bank.length} / {BANK_CAPACITY} slots used
          </span>
          <button
            type="button"
            className="bank-btn"
            onClick={() => {
              audio.play('uiClick');
              depositAll();
            }}
          >
            Deposit inventory
          </button>
          <button
            type="button"
            className="bank-btn"
            onClick={() => {
              audio.play('uiClick');
              close();
            }}
          >
            Close
          </button>
        </div>
        <h3 className="bank-sub">In the bank</h3>
        <div className="slot-grid bank-grid">
          {bank.length === 0 ? <p className="bank-empty">Empty. Deposit something below.</p> : null}
          {bank.map((stack) => (
            <ItemSlot
              key={stack.itemId}
              itemId={stack.itemId}
              name={nameOf(stack.itemId)}
              quantity={stack.quantity}
              onActivate={(e) =>
                openMenu({
                  x: e.clientX,
                  y: e.clientY,
                  title: nameOf(stack.itemId),
                  options: [
                    { label: 'Withdraw 1', onSelect: () => withdraw(stack.itemId, 1) },
                    { label: 'Withdraw all', onSelect: () => withdraw(stack.itemId, 'all') },
                    { label: 'Cancel', onSelect: () => undefined },
                  ],
                })
              }
            />
          ))}
        </div>
        <h3 className="bank-sub">Your inventory</h3>
        <div className="slot-grid bank-grid">
          {slots.map((stack, i) => (
            <ItemSlot
              key={i}
              itemId={stack?.itemId}
              name={stack ? nameOf(stack.itemId) : undefined}
              quantity={stack?.quantity}
              onActivate={(e) =>
                stack &&
                openMenu({
                  x: e.clientX,
                  y: e.clientY,
                  title: nameOf(stack.itemId),
                  options: [
                    { label: 'Deposit 1', onSelect: () => deposit(i, 1) },
                    { label: 'Deposit all', onSelect: () => deposit(i, 'all') },
                    { label: 'Cancel', onSelect: () => undefined },
                  ],
                })
              }
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
