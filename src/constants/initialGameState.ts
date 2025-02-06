import { GameState } from '@/types/gameState';
import { 
  INITIAL_PLAYER_STATS, 
  INITIAL_EQUIPMENT,
  SKILL_REQUIREMENTS, 
  UPGRADE_COSTS,
} from '@/constants/gameConstants';
import { CRAFTING_RECIPES } from './craftingConstants';

export const INITIAL_GAME_STATE: GameState = {
  gold: 0,
  inventory: {
    wood: 0,
    ore: 0,
    fish: 0,
    herbs: 0,
    potions: 0,
    materials: {}
  },
  skills: {
    woodcutting: { level: 1, xp: 0 },
    mining: { level: 1, xp: 0 },
    fishing: { level: 1, xp: 0 },
    herbalism: { level: 1, xp: 0 },
    alchemy: { level: 1, xp: 0 },
    combat: { level: 1, xp: 0 },
    smithing: { level: 1, xp: 0 },
    enchanting: { level: 1, xp: 0 }
  },
  currentActivity: null,
  upgrades: {
    betterAxe: 0,
    steelPickaxe: 0,
    fishingNet: 0
  },
  combat: {
    currentEnemy: null,
    battleLog: [],
    isInCombat: false
  },
  equipment: INITIAL_EQUIPMENT,
  playerStats: INITIAL_PLAYER_STATS,
  skillRequirements: SKILL_REQUIREMENTS,
  upgradesCost: UPGRADE_COSTS,
  crafting: {
    recipes: CRAFTING_RECIPES,
    unlockedRecipes: [],
    currentlyCrafting: null,
    craftingProgress: 0
  }
};