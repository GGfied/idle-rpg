import { useApp } from '@app/ui/context';

/** The store contract the integrator adds for inventory extras (task #41). Read through guards until it lands. */
export interface UseSelection {
  slot: number;
  itemId: string;
}
export interface InventoryExtrasActions {
  swapInventorySlots?: (from: number, to: number) => void;
  useItem?: (slot: number) => void;
  useItemOn?: (target: { kind: 'item'; slot: number }) => void;
  cancelUse?: () => void;
}
interface Maybe extends InventoryExtrasActions {
  useSelection?: UseSelection | null;
}

export const useUseSelection = (): UseSelection | null =>
  useApp((s) => (s as unknown as Maybe).useSelection ?? null);
export const useSwapSlots = () => useApp((s) => (s as unknown as Maybe).swapInventorySlots);
export const useUseItem = () => useApp((s) => (s as unknown as Maybe).useItem);
export const useUseItemOn = () => useApp((s) => (s as unknown as Maybe).useItemOn);
export const useCancelUse = () => useApp((s) => (s as unknown as Maybe).cancelUse);
