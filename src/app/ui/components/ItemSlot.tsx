import type { MouseEvent } from 'react';
import { itemIconUrl } from '@render/index';

export interface ItemSlotProps {
  /** Item id, used to look up the icon. Without an icon the first letters of `name` are shown. */
  itemId?: string;
  name?: string;
  quantity?: number;
  /** Tap, click or keyboard activation. */
  onActivate?: (e: MouseEvent) => void;
}

/** One inventory-style square. Empty when `name` is undefined. */
export function ItemSlot({ itemId, name, quantity = 1, onActivate }: ItemSlotProps) {
  const icon = itemId ? itemIconUrl(itemId) : undefined;
  const label = name ? `${name}${quantity > 1 ? ` x${quantity}` : ''}` : 'Empty slot';
  return (
    <button
      type="button"
      className={name ? 'slot slot-full' : 'slot'}
      aria-label={label}
      disabled={!name}
      onClick={onActivate}
      onContextMenu={(e) => {
        e.preventDefault();
        if (name) onActivate?.(e);
      }}
    >
      {name ? (
        icon ? (
          <img className="slot-icon" src={icon} alt="" draggable={false} />
        ) : (
          <span className="slot-name">{name.slice(0, 2)}</span>
        )
      ) : null}
      {quantity > 1 ? <span className="slot-qty">{quantity}</span> : null}
    </button>
  );
}
