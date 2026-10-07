export const INVENTORY_SIZE = 28;
/** Largest quantity a single stack may hold (2^31 - 1). */
export const MAX_STACK = 2147483647;

export interface ItemStack {
  itemId: string;
  quantity: number;
}

/** Plain JSON: always exactly INVENTORY_SIZE slots. */
export interface InventoryState {
  slots: (ItemStack | null)[];
}

export type AddError = 'inventoryFull' | 'unknownItem' | 'invalidQuantity';
export type RemoveError = 'notEnough';

/** Max distinct item ids the bank holds. */
export const BANK_CAPACITY = 400;

/** Plain JSON. Every item stacks; entries are ordered by first deposit and never hold quantity 0. */
export interface BankState {
  items: ItemStack[];
}

export type DepositError = 'emptySlot' | 'bankFull' | 'invalidQuantity';
export type WithdrawError = 'notInBank' | 'inventoryFull' | 'invalidQuantity';
