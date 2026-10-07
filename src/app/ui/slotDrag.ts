/** Pure helpers for inventory drag-to-swap and the "Use" flow (the DOM glue lives in InventoryPanel). */

/** Pointer must move this many CSS px before a press becomes a drag (a tap or long-press stays one). */
export const DRAG_THRESHOLD_PX = 8;

export function dragStarted(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(dx, dy) >= threshold;
}

/** A drop is a swap/move only onto a different slot index inside the grid; anything else cancels. */
export function dropTarget(from: number, over: number | null): number | null {
  return over === null || over === from ? null : over;
}

export type UseTap = 'cancel' | 'useOn';

/** What a tap on inventory slot `slot` means while `selected` is the slot being used (null = not using). */
export function tapWhileUsing(selected: number | null, slot: number): UseTap | null {
  if (selected === null) return null;
  return selected === slot ? 'cancel' : 'useOn';
}

export function useHintText(itemName: string): string {
  return `Use ${itemName} → …`;
}
