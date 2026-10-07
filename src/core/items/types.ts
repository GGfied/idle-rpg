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
