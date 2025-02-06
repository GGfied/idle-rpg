// src/types/game-state.ts
import { Inventory, ResourceGain } from './inventory';
import { Skills, Upgrades, SkillRequirements, UpgradeCosts } from './skills';
import { CombatState, Equipment, PlayerStats } from './combat';
import { CraftingState } from './crafting';

export interface GameState {
  gold: number;
  inventory: Inventory;
  skills: Skills;
  currentActivity: string | null;
  upgrades: Upgrades;
  combat: CombatState;
  equipment: Equipment;
  playerStats: PlayerStats;
  skillRequirements: SkillRequirements;
  upgradesCost: UpgradeCosts;
  crafting: CraftingState;
  resourceGains?: ResourceGain[];
}