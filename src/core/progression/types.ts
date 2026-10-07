export type SkillId =
  | 'attack'
  | 'strength'
  | 'defence'
  | 'hitpoints'
  | 'ranged'
  | 'prayer'
  | 'magic'
  | 'cooking'
  | 'woodcutting'
  | 'fishing'
  | 'mining'
  | 'smithing'
  | 'crafting';

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  /** Hex '#rrggbb' colour, readable on a dark HUD. */
  readonly color: string;
}

export interface ProgressionState {
  xp: Record<SkillId, number>;
}

export type ProgressionEvent =
  | { type: 'xpGained'; skill: SkillId; amount: number; total: number }
  | { type: 'levelUp'; skill: SkillId; level: number };
