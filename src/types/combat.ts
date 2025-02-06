export interface Enemy {
    name: string;
    maxHealth: number;
    currentHealth: number;
    attack: number;
    defense: number;
    xpReward: number;
    goldReward: number;
  }
  
  export interface CombatState {
    currentEnemy: Enemy | null;
    battleLog: string[];
    isInCombat: boolean;
  }
  
  export interface PlayerStats {
    maxHealth: number;
    currentHealth: number;
    attack: number;
    defense: number;
  }
  
  export interface WeaponEquipment {
    name: string;
    attackBonus: number;
  }
  
  export interface ArmorEquipment {
    name: string;
    defenseBonus: number;
  }
  
  export interface Equipment {
    weapon: WeaponEquipment;
    armor: ArmorEquipment;
  }
  
  export interface EquipmentUpgrade {
    name: string;
    attackBonus?: number;
    defenseBonus?: number;
  }
  
  export interface EquipmentCosts {
    [type: string]: { [equipmentName: string]: number };
  }