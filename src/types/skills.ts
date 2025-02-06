// src/types/skills.ts
export interface Skill {
    level: number;
    xp: number;
  }
  
  export interface Skills {
    woodcutting: Skill;
    mining: Skill;
    fishing: Skill;
    herbalism: Skill;
    alchemy: Skill;
    combat: Skill;
    smithing: Skill;
    enchanting: Skill;
  }
  
  export interface SkillRequirements {
    [skill: string]: { [dependentSkill: string]: number };
  }
  
  export interface Upgrades {
    betterAxe: number;
    steelPickaxe: number;
    fishingNet: number;
  }
  
  export type UpgradeCostFunction = (level: number) => number;
  
  export interface UpgradeCosts {
    [upgrade: string]: UpgradeCostFunction;
  }