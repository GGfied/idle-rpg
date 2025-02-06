// src/types/inventory.ts
export interface BaseInventory {
    wood: number;
    ore: number;
    fish: number;
    herbs: number;
    potions: number;
  }
  
  export interface Materials {
    [key: string]: number;  // For crafting materials like goblinHide, trollBone, etc.
  }
  
  export interface Inventory extends BaseInventory {
    materials: Materials;
  }
  
  export interface ResourceCosts {
    [activity: string]: { [resource: string]: number };
  }
  
  export interface ResourcePrices {
    [resource: string]: number;
  }
  
  export interface ResourceGain {
    id: string;
    amount: number;
    type: string;
    x: number;
  }