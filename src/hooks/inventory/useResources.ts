import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { Skills, Upgrades } from '@/types/skills';
import { BaseInventory, ResourceCosts } from '@/types/inventory';
import { 
  getSkillTypeForActivity, 
  getUpgradeForActivity 
} from '@/utils/gameUtils';
import { RESOURCE_COSTS } from '@/constants/gameConstants';

export interface UseResourcesResult {
  startActivity: (activity: string) => void;
  stopActivity: () => void;
  processResourceGain: (activity: string, baseGain: number, playSound?: boolean) => void;
}

export function useResources(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  addFloatingResource: (amount: number, type: string, playSound?: boolean) => void,
  addExperience: (skillType: keyof Skills, amount: number) => void,
  resourceCosts: ResourceCosts = RESOURCE_COSTS
): UseResourcesResult {
  const startActivity = useCallback((activity: string) => {
    setState(prev => ({ 
      ...prev, 
      currentActivity: activity 
    }));
  }, [setState]);

  const stopActivity = useCallback(() => {
    setState(prev => {
      // Reset current activity and clear all related state changes
      return { 
        ...prev, 
        currentActivity: null,
        resourceGains: [], // Clear floating resources
        // Optionally reset any other activity-specific state here
      };
    });
  }, [setState]);

  const processResourceGain = useCallback((
    activity: string, 
    baseGain: number,
    playSound = true
  ) => {
    // Only process resource gain if the activity is currently active
    setState(prev => {
      if (prev.currentActivity !== activity) return prev;

      const skillType = getSkillTypeForActivity(activity);
      
      // Get current skill and level
      const currentSkill = prev.skills[skillType as keyof Skills];
      const skillLevel = currentSkill.level;

      // Aggressive scaling factors
      const levelMultiplier = Math.pow(1.5, skillLevel - 1);
      
      // Get upgrade bonus
      const upgradeKey = getUpgradeForActivity(activity) || 'betterAxe';
      const upgradeLevel = prev.upgrades[upgradeKey as keyof Upgrades] || 0;
      const upgradeBonus = 1 + (upgradeLevel * 1); // 100% increase per upgrade level
      
      // Calculate total gain with very dynamic scaling
      const baseResourceGain = Math.max(1, baseGain * levelMultiplier * upgradeBonus);
      const resourceGain = Math.floor(baseResourceGain);

      // Create a deep copy of inventory
      const newInventory = {
        ...prev.inventory,
        [activity]: (prev.inventory[activity as keyof BaseInventory] as number) + resourceGain
      };

      // Subtract resource costs if any
      const costs = resourceCosts[skillType];
      if (costs) {
        for (const [resource, amount] of Object.entries(costs)) {
          if (resource in newInventory) {
            const key = resource as keyof BaseInventory;
            newInventory[key] = (newInventory[key] as number) - amount;
          }
        }
      }

      // Add floating resource animation with sound control
      addFloatingResource(resourceGain, activity, playSound);

      // XP gain with very aggressive scaling
      const baseXP = Math.max(5, baseGain * 1.5); // Minimum 5 XP, multiplied by 1.5
      const xpGain = Math.floor(
        baseXP * 
        levelMultiplier * 
        upgradeBonus * 
        (1 + (skillLevel * 0.1)) // 10% bonus per level
      );
      
      // Add XP gain
      addExperience(skillType as keyof Skills, xpGain);

      return {
        ...prev,
        inventory: newInventory
      };
    });
  }, [setState, addFloatingResource, addExperience, resourceCosts]);

  return { startActivity, stopActivity, processResourceGain };
}