export interface CraftingRecipe {
  id: string;
  name: string;
  description: string;
  materials: {
    [key: string]: number;  // material name -> amount required
  };
  skillRequirements: {
    [key: string]: number;  // skill name -> level required
  };
  result: {
    type: 'equipment' | 'material' | 'consumable';
    name: string;
    amount: number;
    stats?: {
      attackBonus?: number;
      defenseBonus?: number;
      healthBonus?: number;
    };
  };
  category: 'smithing' | 'alchemy' | 'enchanting';
}

export interface CraftingCategory {
  id: string;
  name: string;
  description: string;
  baseSkill: string;
  icon: string;
}

export interface CraftingState {
  recipes: CraftingRecipe[];
  unlockedRecipes: string[];  // Array of recipe IDs
  currentlyCrafting: string | null;  // Recipe ID
  craftingProgress: number;
}