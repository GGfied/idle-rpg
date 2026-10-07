/** Static definition of an item. Tool/equipment data lives in core/equipment, keyed by item id. */
export interface ItemDef {
  id: string;
  name: string;
  examine: string;
  value: number;
  stackable: boolean;
  /** Key for the render layer's icon lookup. */
  icon?: string;
}

export interface ItemRegistry {
  get(id: string): ItemDef | undefined;
  /** Like get, but throws for unknown ids. */
  require(id: string): ItemDef;
  has(id: string): boolean;
  all(): readonly ItemDef[];
  isStackable(id: string): boolean;
}

/** An item lying on a tile. Not persisted: ground items are cleared on reload. */
export interface GroundItem {
  id: string;
  itemId: string;
  qty: number;
  x: number;
  y: number;
  spawnTick: number;
  /** Removed once `tick >= despawnTick`. */
  despawnTick: number;
}

export interface GroundItemsState {
  items: GroundItem[];
  nextId: number;
}

export interface DropGroundItemInput {
  itemId: string;
  qty: number;
  x: number;
  y: number;
  tick: number;
}

interface GroundItemEventBase {
  id: string;
  itemId: string;
  qty: number;
  x: number;
  y: number;
}

export type GroundItemEvent =
  | ({ type: 'groundItemDropped' } & GroundItemEventBase)
  | ({ type: 'groundItemTaken' } & GroundItemEventBase)
  | ({ type: 'groundItemDespawned' } & GroundItemEventBase);
