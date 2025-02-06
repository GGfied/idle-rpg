import { GameState } from '@/types/gameState';
import { INITIAL_GAME_STATE } from '@/constants/initialGameState';
import { UPGRADE_COSTS } from '@/constants/gameConstants';

const GAME_SAVE_KEY = 'idle-rpg-save';

export const GameSaveManager = {
  // Save the entire game state to localStorage
  saveGame(state: GameState) {
    try {
      const serializedState = JSON.stringify(state);
      localStorage.setItem(GAME_SAVE_KEY, serializedState);
      console.info('Game state saved successfully');
    } catch (error) {
      console.error('Failed to save game state:', error);
    }
  },

  // Load game state from localStorage
  loadGame(): GameState | null {
    try {
      const savedGame = localStorage.getItem(GAME_SAVE_KEY);
      if (savedGame) {
        const parsedState = JSON.parse(savedGame);
        console.info('Game state loaded successfully');
        return this.validateAndRepairState(parsedState);
      }
      return null;
    } catch (error) {
      console.error('Failed to load game state:', error);
      return null;
    }
  },

  // Validate and repair loaded state to ensure compatibility
  validateAndRepairState(loadedState: Partial<GameState>): GameState {
    // Ensure upgrades object exists and has all keys
    const repairs: GameState = {
      ...INITIAL_GAME_STATE,
      ...loadedState,
      upgrades: {
        ...INITIAL_GAME_STATE.upgrades,
        ...loadedState.upgrades
      },
      upgradesCost: typeof loadedState.upgradesCost === 'object' 
        ? {
            ...INITIAL_GAME_STATE.upgradesCost,
            ...loadedState.upgradesCost
          }
        : INITIAL_GAME_STATE.upgradesCost,
      inventory: {
        ...INITIAL_GAME_STATE.inventory,
        ...loadedState.inventory,
        materials: {
          ...INITIAL_GAME_STATE.inventory.materials,
          ...loadedState.inventory?.materials
        }
      },
      skills: loadedState.skills || INITIAL_GAME_STATE.skills,
      combat: loadedState.combat || INITIAL_GAME_STATE.combat,
      equipment: loadedState.equipment || INITIAL_GAME_STATE.equipment,
      playerStats: loadedState.playerStats || INITIAL_GAME_STATE.playerStats,
      crafting: {
        ...INITIAL_GAME_STATE.crafting,
        ...loadedState.crafting,
        unlockedRecipes: loadedState.crafting?.unlockedRecipes || []
      }
    };

    // Add a dynamic upgrades cost function to the state
    repairs.upgradesCost = {
      betterAxe: (level: number) => UPGRADE_COSTS.betterAxe(level),
      steelPickaxe: (level: number) => UPGRADE_COSTS.steelPickaxe(level),
      fishingNet: (level: number) => UPGRADE_COSTS.fishingNet(level)
    };

    return repairs;
  },

  // Clear saved game data
  clearSavedGame() {
    localStorage.removeItem(GAME_SAVE_KEY);
    console.info('Saved game data cleared');
  }
};