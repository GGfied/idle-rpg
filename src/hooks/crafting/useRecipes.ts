import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { CraftingRecipe } from '@/types/crafting';
import { Skills } from '@/types/skills';
import { BaseInventory } from '@/types/inventory';
import { CRAFTING_RECIPES } from '@/constants/craftingConstants';

export interface UseRecipesResult {
  getAvailableRecipes: () => CraftingRecipe[];
  findRecipeById: (recipeId: string) => CraftingRecipe | undefined;
}

export function useRecipes(
  state: GameState
): UseRecipesResult {
  const findRecipeById = useCallback((recipeId: string) => {
    const recipe = CRAFTING_RECIPES.find(recipe => recipe.id === recipeId);
    return recipe;
  }, []);

  const getAvailableRecipes = useCallback(() => {
    const availableRecipes = CRAFTING_RECIPES.filter(recipe => 
      // Check skill requirements
      Object.entries(recipe.skillRequirements).every(([skill, level]) => 
        state.skills[skill as keyof Skills].level >= level
      ) &&
      // Check material requirements
      Object.entries(recipe.materials).every(([material, amount]) => {
        // Check if material is in base inventory or crafting materials
        const materialCount = material in state.inventory 
          ? state.inventory[material as keyof BaseInventory] 
          : (state.inventory.materials?.[material] || 0);
        
        return materialCount >= amount;
      })
    );

    return availableRecipes;
  }, [state]);

  return { 
    getAvailableRecipes, 
    findRecipeById 
  };
}