// Utility Functions for Idle RPG
import { Skill } from '@/types/skills';

// Calculates XP required for next level with exponential growth
export const calculateXPForLevel = (level: number): number => 
  Math.floor(100 * Math.pow(2, level - 1));

// Handle skill leveling with dynamic XP gain
export const calculateSkillLevelUp = (currentSkill: Skill, xpGain: number): Skill => {
  const newXP = currentSkill.xp + xpGain;
  const xpForNextLevel = calculateXPForLevel(currentSkill.level);
  
  // Level up mechanism
  if (newXP >= xpForNextLevel) {
    return { 
      level: currentSkill.level + 1, 
      xp: newXP - xpForNextLevel 
    };
  }
  
  return { 
    ...currentSkill, 
    xp: newXP 
  };
};

// Map activities to their corresponding upgrades
export const getUpgradeForActivity = (activity: string): string | undefined => ({
  wood: 'betterAxe',
  ore: 'steelPickaxe',
  fish: 'fishingNet'
})[activity];

// Map activities to their corresponding skill types
export const getSkillTypeForActivity = (activity: string): string => 
  activity === 'wood' ? 'woodcutting' : 
  activity === 'ore' ? 'mining' : 
  activity === 'fish' ? 'fishing' :
  activity === 'herbs' ? 'herbalism' :
  activity === 'potions' ? 'alchemy' :
  activity;

// Calculate skill bonus based on level
export const calculateSkillBonus = (level: number, baseBonus: number = 0.05): number => 
  1 + (level * baseBonus);

// Generate randomness for game mechanics
export const generateRandomFactor = (min: number = 0.8, max: number = 1.2): number => 
  min + (Math.random() * (max - min));