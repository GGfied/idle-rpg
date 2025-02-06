import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { EquipmentCosts, EquipmentUpgrade } from '@/types/combat';
import { EQUIPMENT_COSTS, EQUIPMENT_PROGRESSION } from '@/constants/gameConstants';

interface EquipmentSoundCallbacks {
  onUpgrade?: () => void;
}

export interface UseEquipmentResult {
  buyEquipment: (type: 'weapon' | 'armor', newEquipment: EquipmentUpgrade) => void;
}

export function useEquipment(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  state: GameState,
  soundCallbacks: EquipmentSoundCallbacks = {},
  equipmentCosts: EquipmentCosts = EQUIPMENT_COSTS
): UseEquipmentResult {
  const buyEquipment = useCallback((type: 'weapon' | 'armor', newEquipment: EquipmentUpgrade) => {
    const cost = equipmentCosts[type][newEquipment.name];
    const progression = type === 'weapon' ? EQUIPMENT_PROGRESSION.weapon : EQUIPMENT_PROGRESSION.armor;
    
    // Check current equipment index
    const currentIndex = progression.indexOf(state.equipment[type].name);
    const newIndex = progression.indexOf(newEquipment.name);

    // Ensure equipment can only be upgraded sequentially
    if (newIndex <= currentIndex) {
      return;
    }
    
    // Check if player can afford
    if (state.gold >= cost) {
      setState(prev => {
        // Play upgrade sound if callback is provided
        soundCallbacks.onUpgrade?.();

        return {
          ...prev,
          gold: prev.gold - cost,
          equipment: {
            ...prev.equipment,
            [type]: {
              name: newEquipment.name,
              ...(type === 'weapon' ? { attackBonus: newEquipment.attackBonus || 0 } : {}),
              ...(type === 'armor' ? { defenseBonus: newEquipment.defenseBonus || 0 } : {})
            }
          },
          // Update player stats based on equipment
          playerStats: {
            ...prev.playerStats,
            ...(type === 'weapon' ? { 
              attack: prev.playerStats.attack - 
                      (prev.equipment.weapon.attackBonus || 0) + 
                      (newEquipment.attackBonus || 0) 
            } : {}),
            ...(type === 'armor' ? { 
              defense: prev.playerStats.defense - 
                       (prev.equipment.armor.defenseBonus || 0) + 
                       (newEquipment.defenseBonus || 0) 
            } : {})
          }
        };
      });
    }
  }, [setState, state.gold, state.equipment, soundCallbacks, equipmentCosts]);

  return { buyEquipment };
}