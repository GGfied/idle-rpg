import { 
  Enemy, 
  EquipmentCosts, 
  PlayerStats,
  Equipment
} from '@/types/combat';
import { 
  ResourceCosts, 
  ResourcePrices, 
} from '@/types/inventory';
import { 
  SkillRequirements, 
  UpgradeCosts, 
} from '@/types/skills';

export const ENEMIES: Enemy[] = [
  // Beginner Area (Levels 1-5)
  {
    name: 'Forest Goblin',
    maxHealth: 20,
    currentHealth: 20,
    attack: 3,
    defense: 1,
    xpReward: 15,
    goldReward: 10
  },
  {
    name: 'Wild Boar',
    maxHealth: 30,
    currentHealth: 30,
    attack: 5,
    defense: 2,
    xpReward: 25,
    goldReward: 15
  },
  // Intermediate Area (Levels 5-10)
  {
    name: 'Mountain Bandit',
    maxHealth: 40,
    currentHealth: 40,
    attack: 7,
    defense: 3,
    xpReward: 35,
    goldReward: 25
  },
  {
    name: 'Cave Troll',
    maxHealth: 60,
    currentHealth: 60,
    attack: 10,
    defense: 5,
    xpReward: 50,
    goldReward: 40
  },
  // Advanced Area (Levels 10-15)
  {
    name: 'Dark Elf Scout',
    maxHealth: 75,
    currentHealth: 75,
    attack: 12,
    defense: 6,
    xpReward: 65,
    goldReward: 55
  },
  {
    name: 'Werewolf',
    maxHealth: 90,
    currentHealth: 90,
    attack: 15,
    defense: 7,
    xpReward: 80,
    goldReward: 70
  },
  // Expert Area (Levels 15-20)
  {
    name: 'Ancient Golem',
    maxHealth: 120,
    currentHealth: 120,
    attack: 18,
    defense: 12,
    xpReward: 100,
    goldReward: 90
  },
  {
    name: 'Frost Giant',
    maxHealth: 150,
    currentHealth: 150,
    attack: 20,
    defense: 15,
    xpReward: 120,
    goldReward: 100
  },
  // Elite Area (Levels 20+)
  {
    name: 'Dragon Wyrmling',
    maxHealth: 200,
    currentHealth: 200,
    attack: 25,
    defense: 18,
    xpReward: 150,
    goldReward: 130
  },
  {
    name: 'Undead Knight',
    maxHealth: 180,
    currentHealth: 180,
    attack: 22,
    defense: 20,
    xpReward: 140,
    goldReward: 120
  },
  // Boss Monsters (Special encounters)
  {
    name: 'Ancient Dragon',
    maxHealth: 500,
    currentHealth: 500,
    attack: 40,
    defense: 30,
    xpReward: 300,
    goldReward: 250
  },
  {
    name: 'Demon Lord',
    maxHealth: 400,
    currentHealth: 400,
    attack: 45,
    defense: 25,
    xpReward: 280,
    goldReward: 230
  }
];

export const SKILL_REQUIREMENTS: SkillRequirements = {
  herbalism: { woodcutting: 3 },
  alchemy: { herbalism: 5 }
};

export const RESOURCE_COSTS: ResourceCosts = {
  alchemy: { herbs: 2 }
};

export const UPGRADE_COSTS: UpgradeCosts = {
  betterAxe: (level: number) => 100 * Math.pow(2, level),
  steelPickaxe: (level: number) => 150 * Math.pow(2, level),
  fishingNet: (level: number) => 125 * Math.pow(2, level)
};

export const RESOURCE_PRICES: ResourcePrices = {
  wood: 5,
  ore: 10,
  fish: 8,
  herbs: 15,
  potions: 25
};

export const EQUIPMENT_PROGRESSION = {
  weapon: ['Rusty Sword', 'Iron Sword', 'Steel Sword', 'Enchanted Sword'],
  armor: ['Leather Armor', 'Chain Mail', 'Plate Armor', 'Magical Armor']
};

export const EQUIPMENT_COSTS: EquipmentCosts = {
  weapon: {
    'Rusty Sword': 0,
    'Iron Sword': 100,
    'Steel Sword': 250,
    'Enchanted Sword': 500
  },
  armor: {
    'Leather Armor': 0,
    'Chain Mail': 150,
    'Plate Armor': 300,
    'Magical Armor': 600
  }
};

export const INITIAL_PLAYER_STATS: PlayerStats = {
  maxHealth: 100,
  currentHealth: 100,
  attack: 5,
  defense: 2
};

export const INITIAL_EQUIPMENT: Equipment = {
  weapon: { 
    name: 'Rusty Sword', 
    attackBonus: 1 
  },
  armor: { 
    name: 'Leather Armor', 
    defenseBonus: 1 
  }
};