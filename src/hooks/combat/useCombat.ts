import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { CombatState, Enemy } from '@/types/combat';
import { calculateSkillLevelUp } from '@/utils/gameUtils';
import { ENEMIES } from '@/constants/gameConstants';

interface CombatSoundCallbacks {
  onAttack?: () => void;
  onHit?: () => void;
  onLevelUp?: () => void;
}

export interface UseCombatResult {
  startCombat: (enemies?: Enemy[]) => void;
  performAttack: () => void;
  combatState: CombatState;
}

const XP_BASE = 20;
const XP_MULTIPLIER = 1.5;
const DIFFICULTY_MULTIPLIERS = {
  beginner: 1,
  intermediate: 1.5,
  advanced: 2,
  expert: 2.5,
  elite: 3
};

export function useCombat(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  initialState: GameState,
  soundCallbacks: CombatSoundCallbacks = {},
  enemyPool: Enemy[] = ENEMIES
): UseCombatResult {
  const startCombat = useCallback((enemies?: Enemy[]) => {
    const availableEnemies = (enemies || enemyPool).filter(enemy => 
      enemy.xpReward <= initialState.skills.combat.level * 30
    );
    
    // Categorize enemies by difficulty
    const categorizedEnemies = {
      beginner: availableEnemies.filter(e => e.xpReward <= 30),
      intermediate: availableEnemies.filter(e => e.xpReward > 30 && e.xpReward <= 60),
      advanced: availableEnemies.filter(e => e.xpReward > 60 && e.xpReward <= 90),
      expert: availableEnemies.filter(e => e.xpReward > 90 && e.xpReward <= 150),
      elite: availableEnemies.filter(e => e.xpReward > 150)
    };

    // Select enemy based on current skill level
    let selectedCategory: keyof typeof categorizedEnemies = 'beginner';
    if (initialState.skills.combat.level >= 5) selectedCategory = 'intermediate';
    if (initialState.skills.combat.level >= 10) selectedCategory = 'advanced';
    if (initialState.skills.combat.level >= 15) selectedCategory = 'expert';
    if (initialState.skills.combat.level >= 20) selectedCategory = 'elite';

    const categoryEnemies = categorizedEnemies[selectedCategory];
    const selectedEnemy = categoryEnemies[Math.floor(Math.random() * categoryEnemies.length)];

    setState(prev => ({
      ...prev,
      combat: {
        currentEnemy: { ...selectedEnemy },
        battleLog: [`You encounter a ${selectedEnemy.name}!`],
        isInCombat: true
      }
    }));
  }, [setState, initialState.skills.combat.level, enemyPool]);

  const performAttack = useCallback(() => {
    // Trigger attack sound if callback is provided
    soundCallbacks.onAttack?.();

    setState(prev => {
      const currentEnemy = prev.combat.currentEnemy;
      if (!currentEnemy) return prev;

      const playerAttack = prev.playerStats.attack + prev.equipment.weapon.attackBonus;
      const enemyDefense = currentEnemy.defense;
      
      // Calculate player damage with randomness and skill influence
      const skillMultiplier = 1 + (prev.skills.combat.level * 0.05); // 5% bonus per level
      const playerDamage = Math.max(0, Math.floor(
        (playerAttack - enemyDefense / 2) * 
        (0.8 + Math.random() * 0.4) * 
        skillMultiplier
      ));

      const newEnemyHealth = Math.max(0, currentEnemy.currentHealth - playerDamage);
      const newBattleLog = [
        ...prev.combat.battleLog,
        `You deal ${playerDamage} damage to the ${currentEnemy.name}!`
      ];

      // Trigger hit sound if callback is provided
      soundCallbacks.onHit?.();

      // Enemy defeated
      if (newEnemyHealth === 0) {
        // Dynamic XP calculation based on enemy difficulty
        const difficultyMultiplier = 
          Object.entries(DIFFICULTY_MULTIPLIERS)
            .reverse()
            .find(([, multiplier]) => currentEnemy.xpReward > XP_BASE * multiplier)?.[1] || 1;
        
        const combatXP = Math.floor(
          XP_BASE * 
          difficultyMultiplier * 
          Math.pow(XP_MULTIPLIER, prev.skills.combat.level - 1)
        );
        const combatGold = currentEnemy.goldReward;

        // Level up skill
        const newCombatSkill = calculateSkillLevelUp(prev.skills.combat, combatXP);
        
        // Trigger level up sound if skill leveled up
        if (newCombatSkill.level > prev.skills.combat.level) {
          soundCallbacks.onLevelUp?.();
        }

        return {
          ...prev,
          gold: prev.gold + combatGold,
          skills: {
            ...prev.skills,
            combat: newCombatSkill
          },
          combat: {
            currentEnemy: null,
            battleLog: [...newBattleLog, 
              `You defeated the ${currentEnemy.name}!`,
              `You earned ${combatXP} XP and ${combatGold} gold.`
            ],
            isInCombat: false
          }
        };
      }

      // Enemy's counterattack
      const enemyAttack = currentEnemy.attack;
      const playerDefense = prev.playerStats.defense + prev.equipment.armor.defenseBonus;
      const skillDefenseMultiplier = 1 + (prev.skills.combat.level * 0.03); // 3% defense bonus per level
      const enemyDamage = Math.max(0, Math.floor(
        (enemyAttack - playerDefense / 2) * 
        (0.8 + Math.random() * 0.4) / 
        skillDefenseMultiplier
      ));

      const newPlayerHealth = Math.max(0, prev.playerStats.currentHealth - enemyDamage);
      const updatedBattleLog = [
        ...newBattleLog,
        `The ${currentEnemy.name} attacks you for ${enemyDamage} damage!`
      ];

      // Trigger hit sound if callback is provided
      soundCallbacks.onHit?.();

      // Player defeated
      if (newPlayerHealth === 0) {
        return {
          ...prev,
          playerStats: { ...prev.playerStats, currentHealth: prev.playerStats.maxHealth },
          combat: {
            currentEnemy: null,
            battleLog: [...updatedBattleLog, 'You were defeated!'],
            isInCombat: false
          }
        };
      }

      // Continue combat
      return {
        ...prev,
        playerStats: { ...prev.playerStats, currentHealth: newPlayerHealth },
        combat: {
          currentEnemy: { ...currentEnemy, currentHealth: newEnemyHealth },
          battleLog: updatedBattleLog,
          isInCombat: true
        }
      };
    });
  }, [setState, soundCallbacks]);

  return { 
    startCombat, 
    performAttack,
    combatState: initialState.combat 
  };
}