import React from 'react';
import { 
  Box, 
  VStack, 
  HStack, 
  Text, 
  Badge, 
  Button, 
  Tooltip,
} from '@chakra-ui/react';
import { Sword } from 'lucide-react';
import { EQUIPMENT_COSTS, EQUIPMENT_PROGRESSION } from '@/constants/gameConstants';

export interface WeaponCardProps {
  currentWeapon: string;
  currentBonus: number;
  onUpgrade: (name: string, bonus: number) => void;
  gold: number;
}

export function WeaponCard({
  currentWeapon,
  currentBonus,
  onUpgrade,
  gold
}: WeaponCardProps) {
  // Get index of current weapon in progression
  const currentIndex = EQUIPMENT_PROGRESSION.weapon.indexOf(currentWeapon);

  // Filter upgrades to only show options after current weapon
  const weaponUpgrades = EQUIPMENT_PROGRESSION.weapon
    .slice(currentIndex + 1)
    .map((name, index) => ({
      name,
      bonus: (currentIndex + index + 2) * 2
    }));

  const isUpgradeAllowed = (current: string, target: string) => {
    const currentIndex = EQUIPMENT_PROGRESSION.weapon.indexOf(current);
    const targetIndex = EQUIPMENT_PROGRESSION.weapon.indexOf(target);
    return targetIndex === currentIndex + 1;
  };

  return (
    <Box 
      height="full"
      p={4} 
      borderRadius="xl" 
      bg="white"
      borderWidth="1px"
      borderColor="orange.200"
      transition="all 0.2s"
      _hover={{ boxShadow: 'md' }}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top={0}
        right={0}
        bottom={0}
        left={0}
        bg="orange.50"
        opacity={0.5}
      />
      <HStack spacing={3} mb={4}>
        <Box p={2} bg="orange.100" borderRadius="md">
          <Sword className="h-5 w-5 text-orange-600" />
        </Box>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold" color="orange.800">
            {currentWeapon}
          </Text>
          <Badge colorScheme="orange">
            +{currentBonus} Attack
          </Badge>
        </VStack>
      </HStack>
      <VStack spacing={2} align="stretch">
        {weaponUpgrades.map(({ name, bonus }) => {
          const cost = EQUIPMENT_COSTS.weapon[name];
          const canAfford = gold >= cost;
          
          return (
            <Tooltip 
              key={name}
              label={!canAfford ? 'Not enough gold' :
                     `Cost: ${cost} gold | +${bonus} Attack`}
              placement="top"
            >
              <Button 
                size="sm"
                onClick={() => onUpgrade(name, bonus)}
                isDisabled={!canAfford}
                colorScheme="orange"
                variant="outline"
                _hover={{ transform: 'scale(1.02)' }}
                transition="all 0.2s"
                position="relative"
                overflow="hidden"
              >
                <HStack spacing={2} width="full" justify="space-between">
                  <Text>{name}</Text>
                  <Badge colorScheme={canAfford ? 'green' : 'red'}>
                    {cost}g
                  </Badge>
                </HStack>
              </Button>
            </Tooltip>
          );
        })}
      </VStack>
    </Box>
  );
}