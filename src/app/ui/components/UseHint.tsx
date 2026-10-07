import { CONTENT } from '@app/registry';
import { useCancelUse, useUseSelection } from '@app/ui/useItemState';
import { useHintText } from '@app/ui/slotDrag';

/** "Use <Item> -> ..." bar while an item is selected for use. The X cancels. */
export function UseHint() {
  const sel = useUseSelection();
  const cancel = useCancelUse();
  if (!sel) return null;
  const name = CONTENT.items.get(sel.itemId)?.name ?? sel.itemId;
  return (
    <div className="use-hint" role="status">
      <span>{useHintText(name)}</span>
      <button type="button" aria-label="Cancel use" onClick={() => cancel?.()}>
        {'✕'}
      </button>
    </div>
  );
}
