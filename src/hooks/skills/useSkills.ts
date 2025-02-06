import { useCallback } from 'react';
import { GameState } from '@/types/gameState';
import { Skills } from '@/types/skills';
import { calculateXPForLevel } from '@/utils/gameUtils';

interface SkillSoundCallbacks {
  onLevelUp?: () => void;
}

export interface UseSkillsResult {
  addExperience: (skillType: keyof Skills, amount: number) => void;
  checkSkillRequirements: (requiredSkills: Partial<Record<keyof Skills, number>>) => boolean;
}

export function useSkills(
  setState: React.Dispatch<React.SetStateAction<GameState>>,
  soundCallbacks: SkillSoundCallbacks = {}
): UseSkillsResult {
  const addExperience = useCallback((skillType: keyof Skills, amount: number) => {
    setState(prev => {
      const currentSkill = prev.skills[skillType];
      
      // Basic XP calculation with consistent multiplier
      const xpMultiplier = 1 + (currentSkill.level * 0.1); // 10% bonus per level
      const adjustedAmount = Math.max(1, Math.floor(amount * xpMultiplier));
      
      const newXP = currentSkill.xp + adjustedAmount;
      const xpForNextLevel = calculateXPForLevel(currentSkill.level);
      
      let newSkill = { 
        level: currentSkill.level, 
        xp: newXP 
      };
      
      // Level up mechanism
      if (newXP >= xpForNextLevel) {
        newSkill.level++;
        newSkill.xp = newXP - xpForNextLevel;
        
        // Trigger level up sound
        soundCallbacks.onLevelUp?.();
      }
      
      return {
        ...prev,
        skills: {
          ...prev.skills,
          [skillType]: newSkill
        }
      };
    });
  }, [setState, soundCallbacks]);

  const checkSkillRequirements = useCallback((requiredSkills: Partial<Record<keyof Skills, number>>) => {
    const checkReqs = (state: GameState) => {
      for (const [skill, requiredLevel] of Object.entries(requiredSkills)) {
        const currentSkill = state.skills[skill as keyof Skills];
        if (currentSkill.level < (requiredLevel || 0)) {
          return false;
        }
      }
      return true;
    };

    let result = false;
    setState(prev => {
      result = checkReqs(prev);
      return prev;
    });

    return result;
  }, [setState]);

  return { addExperience, checkSkillRequirements };
}