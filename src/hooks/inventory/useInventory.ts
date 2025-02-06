import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { BaseInventory, ResourcePrices } from '@/types/inventory';
import { RESOURCE_PRICES } from '@/constants/gameConstants';

export interface UseInventoryResult {
  sellResources: (resource: keyof BaseInventory) => void;
  addResource: (resource: keyof BaseInventory, amount: number) => void;
}

export function useInventory(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  resourcePrices: ResourcePrices = RESOURCE_PRICES
): UseInventoryResult {
  const sellResources = useCallback((resource: keyof BaseInventory) => {
    setState(prev => ({
      ...prev,
      gold: prev.gold + (prev.inventory[resource] * resourcePrices[resource]),
      inventory: {
        ...prev.inventory,
        [resource]: 0
      }
    }));
  }, [setState, resourcePrices]);

  const addResource = useCallback((resource: keyof BaseInventory, amount: number) => {
    setState(prev => ({
      ...prev,
      inventory: {
        ...prev.inventory,
        [resource]: prev.inventory[resource] + amount
      }
    }));
  }, [setState]);

  return { sellResources, addResource };
}