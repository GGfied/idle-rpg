import { CONTENT } from '@app/registry';
import { useApp, useRuntime } from '@app/ui/context';
import { ItemSlot } from '@app/ui/components/ItemSlot';
import { Panel } from '@app/ui/components/Panel';

export function InventoryPanel() {
  const slots = useApp((s) => s.game.inventory.slots);
  const openMenu = useApp((s) => s.openMenu);
  const rawDrop = useApp((s) => s.dropSlot);
  const { audio } = useRuntime();
  const dropSlot = (i: number): void => {
    audio.play('itemDrop');
    rawDrop(i);
  };
  const examineItem = useApp((s) => s.examineItem);
  return (
    <Panel title="Inventory">
      <div className="slot-grid">
        {slots.map((stack, i) => {
          const name = stack ? (CONTENT.items.get(stack.itemId)?.name ?? stack.itemId) : undefined;
          return (
            <ItemSlot
              key={i}
              itemId={stack?.itemId}
              name={name}
              quantity={stack?.quantity}
              onActivate={(e) =>
                name &&
                openMenu({
                  x: e.clientX,
                  y: e.clientY,
                  title: name,
                  options: [
                    { label: 'Drop', onSelect: () => dropSlot(i) },
                    { label: 'Examine', onSelect: () => examineItem(i) },
                    { label: 'Cancel', onSelect: () => undefined },
                  ],
                })
              }
            />
          );
        })}
      </div>
    </Panel>
  );
}
