/** A skilling tool's data. Keyed by item id in a tool table; never a field on ItemDef. */
export interface ToolDef {
  /** Tool category, e.g. 'axe', 'pickaxe'. */
  readonly kind: string;
  /** Skill id whose level gates use of the tool. */
  readonly skill: string;
  readonly levelRequired: number;
  /** Ticks shaved off the action; higher is better. */
  readonly ticksSaved: number;
}

/** A validated set of tools, keyed by item id. */
export type ToolTable = ReadonlyMap<string, ToolDef>;

export interface ToolRegistry {
  get(itemId: string): ToolDef | undefined;
  all(): readonly (readonly [itemId: string, def: ToolDef])[];
  itemIds(): readonly string[];
}

export interface OwnedTool {
  readonly itemId: string;
  readonly def: ToolDef;
}
