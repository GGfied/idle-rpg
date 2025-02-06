import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { CraftingRecipe } from '@/types/crafting';
import { BaseInventory } from '@/types/inventory';
import { Skills } from '@/types/skills';
import { EQUIPMENT_PROGRESSION } from '@/constants/gameConstants';
import { calculateSkillLevelUp } from '@/utils/gameUtils';

interface CraftingSoundCallbacks {
  onCraft?: () => void;
  onLevelUp?: () => void;
}

export interface UseCraftingResult {
  checkRecipeRequirements: (
    recipe: CraftingRecipe, 
    state: GameState
  ) => { 
    canCraft: boolean; 
    missingRequirements: string[] 
  };
  startCrafting: (recipeId: string) => void;
  completeCrafting: (recipe: CraftingRecipe, state: GameState) => GameState;
  sellCraftedItem: (itemId: string) => void;
  useCraftedItem: (itemId: string) => void;
}

const MAX_CRAFTED_ITEMS = 5;
const BASE_CRAFT_XP = 20;
const XP_MULTIPLIER = 1.5;

// Prices for crafted items
const CRAFTED_ITEM_PRICES = {
  basicSword: 100,
  reinforcedArmor: 150,
  healingPotion: 25,
  goblinHide: 50,
  trollBone: 75
};

export function useCrafting(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  soundCallbacks: CraftingSoundCallbacks = {}
): UseCraftingResult {
  const checkRecipeRequirements = useCallback((
    recipe: CraftingRecipe, 
    state: GameState
  ) => {
    const missingRequirements: string[] = [];

    // Check crafting limit
    const currentCount = state.inventory.materials[recipe.id] || 0;
    if (currentCount >= MAX_CRAFTED_ITEMS) {
      missingRequirements.push(`Cannot craft more than ${MAX_CRAFTED_ITEMS} of this item`);
    }

    // Check skill requirements
    Object.entries(recipe.skillRequirements).forEach(([skill, level]) => {
      const currentSkillLevel = state.skills[skill as keyof Skills]?.level || 0;
      if (currentSkillLevel < level) {
        missingRequirements.push(`${skill} level ${level}`);
      }
    });

    // Check material requirements
    Object.entries(recipe.materials).forEach(([material, amount]) => {
      let available = 0;
      
      if (material in state.inventory) {
        available = state.inventory[material as keyof BaseInventory] as number;
      } else if (state.inventory.materials && material in state.inventory.materials) {
        available = state.inventory.materials[material] || 0;
      }

      if (available < amount) {
        missingRequirements.push(`${amount}x ${material}`);
      }
    });

    return {
      canCraft: missingRequirements.length === 0,
      missingRequirements
    };
  }, []);

  const startCrafting = useCallback((recipeId: string) => {
    setState(prev => {
      const currentCount = prev.inventory.materials[recipeId] || 0;
      if (!prev.crafting.currentlyCrafting && currentCount < MAX_CRAFTED_ITEMS) {
        return {
          ...prev,
          crafting: {
            ...prev.crafting,
            currentlyCrafting: recipeId,
            craftingProgress: 0
          }
        };
      }
      return prev;
    });
  }, [setState]);

  const completeCrafting = useCallback((recipe: CraftingRecipe, state: GameState) => {
    soundCallbacks.onCraft?.();

    const newInventory = { 
      ...state.inventory, 
      materials: { ...state.inventory.materials || {} } 
    };

    // Subtract crafting materials
    Object.entries(recipe.materials).forEach(([material, amount]) => {
      if (material in newInventory) {
        const key = material as keyof BaseInventory;
        newInventory[key] = (newInventory[key] as number) - amount;
      } else if (newInventory.materials) {
        newInventory.materials[material] = (newInventory.materials[material] || 0) - amount;
      }
    });

    // Add crafted item to inventory
    if (!newInventory.materials) newInventory.materials = {};
    newInventory.materials[recipe.id] = Math.min(
      (newInventory.materials[recipe.id] || 0) + 1,
      MAX_CRAFTED_ITEMS
    );

    // Prevent downgrading equipment if it's an equipment recipe
    if (recipe.result.type === 'equipment') {
      const isWeapon = recipe.result.name.toLowerCase().includes('sword');
      const currentEquipment = isWeapon ? state.equipment.weapon : state.equipment.armor;
      const progression = isWeapon 
        ? EQUIPMENT_PROGRESSION.weapon 
        : EQUIPMENT_PROGRESSION.armor;
      
      const currentIndex = progression.indexOf(currentEquipment.name);
      const newIndex = progression.indexOf(recipe.result.name);

      // Only upgrade if new item is higher tier
      if (newIndex > currentIndex) {
        state.equipment = {
          ...state.equipment,
          ...(isWeapon 
            ? { weapon: { 
                name: recipe.result.name, 
                attackBonus: recipe.result.stats?.attackBonus || 0 
              }} 
            : { armor: { 
                name: recipe.result.name, 
                defenseBonus: recipe.result.stats?.defenseBonus || 0 
              }})
        };
      }
    }

    // Skill XP and leveling
    const skillType = recipe.category as keyof Skills;
    const currentSkill = state.skills[skillType];
    const complexity = Object.keys(recipe.materials).length + Object.keys(recipe.skillRequirements).length;
    
    const xpGain = Math.floor(
      BASE_CRAFT_XP * 
      complexity * 
      Math.pow(XP_MULTIPLIER, currentSkill.level - 1)
    );

    const newSkill = calculateSkillLevelUp(currentSkill, xpGain);
    
    if (newSkill.level > currentSkill.level) {
      soundCallbacks.onLevelUp?.();
    }

    return {
      ...state,
      inventory: newInventory,
      skills: {
        ...state.skills,
        [skillType]: newSkill
      },
      crafting: {
        ...state.crafting,
        currentlyCrafting: null,
        craftingProgress: 0,
        unlockedRecipes: state.crafting.unlockedRecipes.includes(recipe.id) 
          ? state.crafting.unlockedRecipes 
          : [...state.crafting.unlockedRecipes, recipe.id]
      }
    };
  }, [soundCallbacks]);

  // Sell crafted item
  const sellCraftedItem = useCallback((itemId: string) => {
    setState(prev => {
      const itemCount = prev.inventory.materials[itemId] || 0;
      if (itemCount > 0) {
        const price = CRAFTED_ITEM_PRICES[itemId as keyof typeof CRAFTED_ITEM_PRICES] || 50;
        
        return {
          ...prev,
          gold: prev.gold + price,
          inventory: {
            ...prev.inventory,
            materials: {
              ...prev.inventory.materials,
              [itemId]: itemCount - 1
            }
          }
        };
      }
      return prev;
    });
  }, [setState]);

  // Use crafted item (placeholder - implement specific use cases)
  const useCraftedItem = useCallback((itemId: string) => {
    setState(prev => {
      const itemCount = prev.inventory.materials[itemId] || 0;
      if (itemCount > 0) {
        // Add specific item use logic here
        // For example, healing potion might restore health
        return {
          ...prev,
          inventory: {
            ...prev.inventory,
            materials: {
              ...prev.inventory.materials,
              [itemId]: itemCount - 1
            }
          }
        };
      }
      return prev;
    });
  }, [setState]);

  return { 
    checkRecipeRequirements, 
    startCrafting,
    completeCrafting,
    sellCraftedItem,
    useCraftedItem
  };
}