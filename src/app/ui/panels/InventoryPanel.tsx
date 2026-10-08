import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { Panel } from '@app/ui/components/Panel';
import { dragStarted, dropTarget, tapWhileUsing } from '@app/ui/slotDrag';
import {
  useCancelUse,
  useSwapSlots,
  useUseItem,
  useUseItemOn,
  useUseSelection,
} from '@app/ui/useItemState';
import { itemIconUrl } from '@render/index';
import { isLightable } from '@app/game/firemaking';
import { itemMenuOptions } from '@app/ui/itemMenu';

interface DragState {
  from: number;
  itemId: string;
  x: number;
  y: number;
  over: number | null;
}
interface Press {
  from: number;
  itemId: string;
  x: number;
  y: number;
  id: number;
  dragging: boolean;
}

const slotUnder = (x: number, y: number): number | null => {
  const el = document.elementFromPoint(x, y)?.closest('[data-slot-index]');
  const n = el ? Number(el.getAttribute('data-slot-index')) : NaN;
  return Number.isInteger(n) ? n : null;
};

export function InventoryPanel() {
  const slots = useApp((s) => s.game.inventory.slots);
  const openMenu = useApp((s) => s.openMenu);
  const rawDrop = useApp((s) => s.dropSlot);
  const { audio } = useRuntime();
  const swap = useSwapSlots();
  const useItem = useUseItem();
  const useItemOn = useUseItemOn();
  const cancelUse = useCancelUse();
  const selection = useUseSelection();
  const selected = selection?.slot ?? null;
  const dropSlot = (i: number): void => {
    audio.play('itemDrop');
    rawDrop(i);
  };
  const examineItem = useApp((s) => s.examineItem);
  const lightSlot = useApp((s) => s.lightSlot);

  const [drag, setDrag] = useState<DragState | null>(null);
  const press = useRef<Press | null>(null);
  const swallowClick = useRef(false);
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (e: PointerEvent, from: number, itemId: string): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cleanup.current?.();
    const p: Press = { from, itemId, x: e.clientX, y: e.clientY, id: e.pointerId, dragging: false };
    press.current = p;
    const move = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== p.id) return;
      if (!p.dragging && !dragStarted(ev.clientX - p.x, ev.clientY - p.y)) return;
      p.dragging = true;
      setDrag({
        from,
        itemId,
        x: ev.clientX,
        y: ev.clientY,
        over: slotUnder(ev.clientX, ev.clientY),
      });
    };
    const end = (ev: globalThis.PointerEvent): void => {
      if (ev.pointerId !== p.id) return;
      const target =
        ev.type === 'pointerup' && p.dragging
          ? dropTarget(from, slotUnder(ev.clientX, ev.clientY))
          : null;
      if (p.dragging) {
        swallowClick.current = true;
        window.setTimeout(() => (swallowClick.current = false), 0);
        if (target !== null) swap?.(from, target);
      }
      cleanup.current?.();
    };
    cleanup.current = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      press.current = null;
      cleanup.current = null;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const ghostIcon = drag ? itemIconUrl(drag.itemId) : undefined;
  return (
    <Panel title="Inventory">
      <div className="slot-grid" data-dragging={drag ? true : undefined}>
        {slots.map((stack, i) => {
          const name = stack ? (CONTENT.items.get(stack.itemId)?.name ?? stack.itemId) : undefined;
          return (
            <ItemSlot
              key={i}
              index={i}
              itemId={stack?.itemId}
              name={name}
              quantity={stack?.quantity}
              selected={selected === i}
              dragging={drag?.from === i}
              dropTarget={!!drag && drag.over === i && drag.from !== i}
              onPointerDown={stack ? (e) => onPointerDown(e, i, stack.itemId) : undefined}
              onActivate={(e) => {
                if (!name) return;
                if (swallowClick.current || press.current?.dragging) return;
                // A real tap (click) while using: item-on-item or cancel. Right-click / long-press still opens the menu.
                const tap = e.type === 'click' ? tapWhileUsing(selected, i) : null;
                if (tap === 'cancel') return cancelUse?.();
                if (tap === 'useOn') return useItemOn?.({ kind: 'item', slot: i });
                openMenu({
                  x: e.clientX,
                  y: e.clientY,
                  title: name,
                  options: itemMenuOptions(
                    {
                      use: useItem ? () => useItem(i) : undefined,
                      drop: () => dropSlot(i),
                      examine: () => examineItem(i),
                      light: () => lightSlot(i),
                    },
                    isLightable(stack?.itemId ?? ''),
                  ),
                });
              }}
            />
          );
        })}
      </div>
      {drag ? (
        <div className="slot-ghost" style={{ left: drag.x, top: drag.y }} aria-hidden="true">
          {ghostIcon ? <img src={ghostIcon} alt="" draggable={false} /> : null}
        </div>
      ) : null}
    </Panel>
  );
}
