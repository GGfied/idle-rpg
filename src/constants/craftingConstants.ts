import { CraftingRecipe, CraftingCategory } from '@/types/crafting';

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  {
    id: 'basicSword',
    name: 'Iron Sword',
    description: 'A simple but reliable iron sword.',
    materials: {
      ore: 3,
      wood: 1
    },
    skillRequirements: {
      smithing: 1,
      mining: 2
    },
    result: {
      type: 'equipment',
      name: 'Iron Sword',
      amount: 1,
      stats: {
        attackBonus: 2
      }
    },
    category: 'smithing'
  },
  {
    id: 'reinforcedArmor',
    name: 'Reinforced Chain Mail',
    description: 'Armor reinforced with high-quality metals.',
    materials: {
      ore: 5,
      trollBone: 1
    },
    skillRequirements: {
      smithing: 3,
      mining: 3,
      combat: 2
    },
    result: {
      type: 'equipment',
      name: 'Reinforced Chain Mail',
      amount: 1,
      stats: {
        defenseBonus: 3
      }
    },
    category: 'smithing'
  },
  {
    id: 'healingPotion',
    name: 'Healing Potion',
    description: 'Restores health in combat.',
    materials: {
      herbs: 3,
      goblinHide: 1
    },
    skillRequirements: {
      alchemy: 2,
      herbalism: 3
    },
    result: {
      type: 'consumable',
      name: 'Healing Potion',
      amount: 1,
      stats: {
        healthBonus: 20
      }
    },
    category: 'alchemy'
  }
];

export const CRAFTING_CATEGORIES: CraftingCategory[] = [
  {
    id: 'smithing',
    name: 'Smithing',
    description: 'Craft weapons and armor',
    baseSkill: 'smithing',
    icon: 'Hammer'
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    description: 'Create potions and elixirs',
    baseSkill: 'alchemy',
    icon: 'FlaskConical'
  },
  {
    id: 'enchanting',
    name: 'Enchanting',
    description: 'Enhance equipment with magical properties',
    baseSkill: 'enchanting',
    icon: 'Sparkles'
  }
];

export const CRAFTED_ITEM_PRICES = {
  basicSword: 100,
  reinforcedArmor: 150,
  healingPotion: 25,
  goblinHide: 50,
  trollBone: 75
};