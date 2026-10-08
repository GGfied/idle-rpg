import type { MouseEvent } from 'react';
import type { ItemStack } from '@core/inventory';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { Panel } from '@app/ui/components/Panel';

/** 'full' = bank grid + inventory; 'depositOnly' = deposit chest: inventory and "Deposit all" only. */
export type BankMode = 'full' | 'depositOnly';

export interface BankViewProps {
  mode: BankMode;
  bank: readonly { itemId: string; quantity: number }[];
  slots: readonly (ItemStack | null | undefined)[];
  capacity: number;
  nameOf: (id: string) => string;
  onWithdraw: (e: MouseEvent, itemId: string) => void;
  onDepositSlot: (e: MouseEvent, slot: number) => void;
  onDepositAll: () => void;
  onClose: () => void;
}

/** Presentational bank / deposit chest. Pure props in, callbacks out (tested without a store). */
export function BankView(p: BankViewProps) {
  const full = p.mode === 'full';
  const title = full ? 'Bank' : 'Deposit chest';
  const carrying = p.slots.some((s) => s);
  return (
    <div className="bank-overlay" role="dialog" aria-label={title} data-mode={p.mode}>
      <Panel title={title}>
        <div className="bank-head">
          {full ? (
            <span className="bank-capacity">
              {p.bank.length} / {p.capacity} slots used
            </span>
          ) : (
            <span className="bank-capacity">Items go straight to your bank.</span>
          )}
          <button
            type="button"
            className="bank-btn"
            aria-disabled={!carrying}
            data-dim={!carrying || undefined}
            onClick={() => carrying && p.onDepositAll()}
          >
            {full ? 'Deposit inventory' : 'Deposit all'}
          </button>
          <button type="button" className="bank-btn" onClick={p.onClose}>
            Close
          </button>
        </div>
        {full ? (
          <>
            <h3 className="bank-sub">In the bank</h3>
            <div className="slot-grid bank-grid">
              {p.bank.length === 0 ? (
                <p className="bank-empty">Empty. Deposit something below.</p>
              ) : null}
              {p.bank.map((stack) => (
                <ItemSlot
                  key={stack.itemId}
                  itemId={stack.itemId}
                  name={p.nameOf(stack.itemId)}
                  quantity={stack.quantity}
                  onActivate={(e) => p.onWithdraw(e, stack.itemId)}
                />
              ))}
            </div>
          </>
        ) : null}
        <h3 className="bank-sub">Your inventory</h3>
        <div className="slot-grid bank-grid">
          {full || carrying ? null : <p className="bank-empty">Nothing to deposit.</p>}
          {p.slots.map((stack, i) => (
            <ItemSlot
              key={i}
              itemId={stack?.itemId}
              name={stack ? p.nameOf(stack.itemId) : undefined}
              quantity={stack?.quantity}
              onActivate={(e) => stack && p.onDepositSlot(e, i)}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
