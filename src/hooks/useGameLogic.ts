import { useState, useEffect, useCallback, useRef } from 'react';
import { GameState } from '@/types/gameState';
import { Enemy } from '@/types/combat';
import { CraftingRecipe } from '@/types/crafting';
import { ResourceGain } from '@/types/inventory';
import { ENEMIES } from '@/constants/gameConstants';
import { INITIAL_GAME_STATE } from '@/constants/initialGameState';
import { GameSaveManager } from '@/utils/gameSaveMgr';

import { useSounds } from '@/hooks/general/useSounds';
import { useCombat } from '@/hooks/combat/useCombat';
import { useEquipment } from '@/hooks/combat/useEquipment';
import { useInventory } from '@/hooks/inventory/useInventory';
import { useResources } from '@/hooks/inventory/useResources';
import { useSkills } from '@/hooks/skills/useSkills';
import { useUpgrades } from '@/hooks/skills/useUpgrades';
import { useCrafting } from '@/hooks/crafting/useCrafting';
import { useRecipes } from '@/hooks/crafting/useRecipes';

const MATERIAL_PRICES = {
  goblinHide: 50,
  trollBone: 75,
  basicSword: 100,
  reinforcedArmor: 150,
  healingPotion: 25
} as const;

export function useGameLogic(defaultEnemies: Enemy[] = ENEMIES) {
  const { playSound, toggleMute, setVolume } = useSounds();
  const [state, setState] = useState<GameState>(() => 
    GameSaveManager.loadGame() || INITIAL_GAME_STATE
  );
  const [resourceGains, setResourceGains] = useState<ResourceGain[]>([]);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(0);

  const stateRef = useRef(state);
  const processResourceGainRef = useRef<((activity: string, amount: number, playSound?: boolean) => void) | null>(null);
  const completeCraftingRef = useRef<((recipe: CraftingRecipe, state: GameState) => GameState) | null>(null);
  const findRecipeByIdRef = useRef<((id: string) => CraftingRecipe | undefined) | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const addFloatingResource = useCallback((amount: number, type: string, shouldPlaySound = true) => {
    const id = `${Date.now()}-${type}-${Math.random().toString(36).substr(2, 9)}`;
    setResourceGains(prev => {
      // Ensure prev is an array, default to empty array if undefined
      const currentGains = prev || [];
      return [...currentGains, { 
        id, 
        amount, 
        type, 
        x: Math.random() * 40 - 20 
      }];
    });
    
    if (shouldPlaySound) {
      playSound('resourceGather', { volume: 0.4 });
    }
  
    setTimeout(() => {
      setResourceGains(prev => {
        // Again, ensure prev is an array
        const currentGains = prev || [];
        return currentGains.filter(gain => gain.id !== id);
      });
    }, 1000);
  }, [playSound]);

  const sellMaterial = useCallback((material: string) => {
    setState(prev => {
      const amount = prev.inventory.materials[material] || 0;
      const price = MATERIAL_PRICES[material as keyof typeof MATERIAL_PRICES] || 50;
      return {
        ...prev,
        gold: prev.gold + (amount * price),
        inventory: {
          ...prev.inventory,
          materials: {
            ...prev.inventory.materials,
            [material]: 0
          }
        }
      };
    });
  }, []);

  const { addExperience, checkSkillRequirements } = useSkills(
    setState,
    {
      onLevelUp: () => playSound('levelUp', { volume: 0.6 })
    }
  );

  const { 
    startActivity, 
    stopActivity, 
    processResourceGain 
  } = useResources(
    setState, 
    addFloatingResource,
    addExperience
  );

  // Debug logging
  useEffect(() => {
    console.log('Current Activity:', state.currentActivity);
  }, [state.currentActivity]);

  useEffect(() => {
    processResourceGainRef.current = processResourceGain;
  }, [processResourceGain]);

  const { sellResources, addResource } = useInventory(setState);
  
  const { buyUpgrade } = useUpgrades(
    setState, 
    state, 
    {
      onUpgrade: () => playSound('upgrade', { volume: 0.5 })
    }
  );

  const { checkRecipeRequirements, startCrafting, completeCrafting } = useCrafting(
    setState,
    {
      onCraft: () => playSound('craft', { volume: 0.5 })
    }
  );

  useEffect(() => {
    completeCraftingRef.current = completeCrafting;
  }, [completeCrafting]);

  const { getAvailableRecipes, findRecipeById } = useRecipes(state);

  useEffect(() => {
    findRecipeByIdRef.current = findRecipeById;
  }, [findRecipeById]);

  const combatHook = useCombat(
    setState, 
    state, 
    {
      onAttack: () => playSound('combatAttack', { volume: 0.5 }),
      onHit: () => playSound('combatHit', { volume: 0.4 })
    }
  );

  const { buyEquipment } = useEquipment(
    setState, 
    state, 
    {
      onUpgrade: () => playSound('upgrade', { volume: 0.5 })
    }
  );

  const startCombat = useCallback(() => {
    combatHook.startCombat(defaultEnemies);
  }, [combatHook, defaultEnemies]);

  const clearSavedGame = useCallback(() => {
    GameSaveManager.clearSavedGame();
    setState(INITIAL_GAME_STATE);
  }, []);

  // Auto-save game state
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      GameSaveManager.saveGame(state);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [state]);

  // Game loop
  useEffect(() => {
    const gameLoop = setInterval(() => {
      setTick(prev => {
        const newTick = prev + 1;
        tickRef.current = newTick;
        return newTick;
      });

      setState(prev => {
        // Only process if current activity is set
        if (!prev.currentActivity) {
          // Clear any lingering resource gains when no activity is active
          if (prev.resourceGains && prev.resourceGains.length > 0) {
            return {
              ...prev,
              resourceGains: []
            };
          }
          return prev;
        }

        // Process resource gain every 4th tick
        if (tickRef.current % 4 === 0 && processResourceGainRef.current) {
          processResourceGainRef.current(prev.currentActivity, 1, true);
        }

        // Handle crafting progress
        if (prev.crafting.currentlyCrafting) {
          const newProgress = prev.crafting.craftingProgress + 1.25; // 5% over 4 ticks
          
          if (newProgress >= 100) {
            const recipe = findRecipeByIdRef.current?.(prev.crafting.currentlyCrafting);
            if (recipe && completeCraftingRef.current) {
              return completeCraftingRef.current(recipe, prev);
            }
          }

          return {
            ...prev,
            crafting: {
              ...prev.crafting,
              craftingProgress: Math.min(newProgress, 100)
            }
          };
        }

        return prev;
      });
    }, 250); // Run 4 times per second

    return () => clearInterval(gameLoop);
  }, []);

  return {
    state: {
      ...state,
      resourceGains  // Add resourceGains to the state object
    },
    resourceGains,  // Keep resourceGains as a separate prop
    startActivity,
    stopActivity,
    processResourceGain,
    sellResources,
    sellMaterial,
    addResource,
    startCombat,
    performAttack: combatHook.performAttack,
    buyEquipment,
    addExperience,
    checkSkillRequirements,
    buyUpgrade,
    startCrafting,
    checkRecipeRequirements,
    getAvailableRecipes,
    findRecipeById,
    clearSavedGame,
    playSound,
    toggleMute,
    setVolume
  };
}