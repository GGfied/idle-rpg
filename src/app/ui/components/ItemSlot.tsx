import type { MouseEvent, PointerEvent } from 'react';
import { itemIconUrl } from '@render/index';

export interface ItemSlotProps {
  /** Item id, used to look up the icon. Without an icon the first letters of `name` are shown. */
  itemId?: string;
  name?: string;
  quantity?: number;
  /** Tap, click or keyboard activation. */
  onActivate?: (e: MouseEvent) => void;
  /** Slot index, exposed as data-slot-index so a drag can find the slot under the pointer. */
  index?: number;
  onPointerDown?: (e: PointerEvent) => void;
  /** Ring for the item selected by "Use". */
  selected?: boolean;
  /** This slot is being dragged (icon dimmed; the ghost follows the pointer). */
  dragging?: boolean;
  /** This slot is the current drop target. */
  dropTarget?: boolean;
}

/** One inventory-style square. Empty when `name` is undefined. */
export function ItemSlot({
  itemId,
  name,
  quantity = 1,
  onActivate,
  index,
  onPointerDown,
  selected,
  dragging,
  dropTarget,
}: ItemSlotProps) {
  const icon = itemId ? itemIconUrl(itemId) : undefined;
  const label = name ? `${name}${quantity > 1 ? ` x${quantity}` : ''}` : 'Empty slot';
  return (
    <button
      type="button"
      className={name ? 'slot slot-full' : 'slot'}
      data-slot-index={index}
      data-selected={selected || undefined}
      data-dragging={dragging || undefined}
      data-drop={dropTarget || undefined}
      aria-label={label}
      aria-pressed={selected || undefined}
      disabled={!name}
      onPointerDown={onPointerDown}
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
