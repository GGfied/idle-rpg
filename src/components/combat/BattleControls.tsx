import React from 'react';
import { Button } from '@chakra-ui/react';
import { Swords } from 'lucide-react';

interface BattleControlsProps {
  isInCombat: boolean;
  onStartCombat: () => void;
  onAttack: () => void;
  combatLevel: number;
}

export function BattleControls({ 
  isInCombat, 
  onStartCombat, 
  onAttack,
  combatLevel 
}: BattleControlsProps) {
  if (isInCombat) {
    return (
      <Button 
        onClick={onAttack} 
        width="full"
        colorScheme="red"
        size="lg"
        height="16"
        fontSize="xl"
        leftIcon={<Swords className="h-6 w-6" />}
        _hover={{ 
          transform: 'scale(1.02)',
          boxShadow: 'lg'
        }}
        transition="all 0.2s"
      >
        Attack!
      </Button>
    );
  }

  return (
    <Button 
      onClick={onStartCombat} 
      width="full"
      size="lg"
      colorScheme="red"
      height="16"
      fontSize="xl"
      isDisabled={combatLevel < 1}
      leftIcon={<Swords className="h-6 w-6" />}
      _hover={{ 
        transform: 'scale(1.02)',
        boxShadow: 'lg'
      }}
      transition="all 0.2s"
    >
      Start Combat
    </Button>
  );
}