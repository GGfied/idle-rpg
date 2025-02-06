import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { Upgrades } from '@/types/skills';
import { UPGRADE_COSTS } from '@/constants/gameConstants';

interface UpgradeSoundCallbacks {
  onUpgrade?: () => void;
}

export interface UseUpgradesResult {
  buyUpgrade: (upgrade: keyof Upgrades) => void;
}

export function useUpgrades(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  state: GameState,
  soundCallbacks: UpgradeSoundCallbacks = {}
): UseUpgradesResult {
  const buyUpgrade = useCallback((upgrade: keyof Upgrades) => {
    const currentLevel = state.upgrades[upgrade];
    const cost = UPGRADE_COSTS[upgrade](currentLevel);

    if (state.gold >= cost && currentLevel < 5) {
      setState(prev => {
        // Play upgrade sound if callback is provided
        soundCallbacks.onUpgrade?.();

        return {
          ...prev,
          gold: prev.gold - cost,
          upgrades: {
            ...prev.upgrades,
            [upgrade]: prev.upgrades[upgrade] + 1
          }
        };
      });
    }
  }, [setState, state.gold, state.upgrades, soundCallbacks]);

  return { buyUpgrade };
}