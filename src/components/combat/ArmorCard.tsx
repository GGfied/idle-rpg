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
import { Shield } from 'lucide-react';
import { EQUIPMENT_COSTS, EQUIPMENT_PROGRESSION } from '@/constants/gameConstants';

interface ArmorCardProps {
  currentArmor: string;
  currentBonus: number;
  onUpgrade: (name: string, bonus: number) => void;
  gold: number;
}

export function ArmorCard({
  currentArmor,
  currentBonus,
  onUpgrade,
  gold
}: ArmorCardProps) {
  // Get index of current armor in progression
  const currentIndex = EQUIPMENT_PROGRESSION.armor.indexOf(currentArmor);

  // Filter upgrades to only show options after current armor
  const armorUpgrades = EQUIPMENT_PROGRESSION.armor
    .slice(currentIndex + 1)
    .map((name, index) => ({
      name,
      bonus: (currentIndex + index + 2) * 2
    }));

  return (
    <Box 
      height="full"
      p={4} 
      borderRadius="xl" 
      bg="white"
      borderWidth="1px"
      borderColor="blue.200"
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
        bg="blue.50"
        opacity={0.5}
      />
      <HStack spacing={3} mb={4}>
        <Box p={2} bg="blue.100" borderRadius="md">
          <Shield className="h-5 w-5 text-blue-600" />
        </Box>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold" color="blue.800">
            {currentArmor}
          </Text>
          <Badge colorScheme="blue">
            +{currentBonus} Defense
          </Badge>
        </VStack>
      </HStack>
      <VStack spacing={2} align="stretch">
        {armorUpgrades.map(({ name, bonus }) => {
          const cost = EQUIPMENT_COSTS.armor[name];
          const canAfford = gold >= cost;
          
          return (
            <Tooltip 
              key={name}
              label={!canAfford ? 'Not enough gold' :
                     `Cost: ${cost} gold | +${bonus} Defense`}
              placement="top"
            >
              <Button 
                size="sm"
                onClick={() => onUpgrade(name, bonus)}
                isDisabled={!canAfford}
                colorScheme="blue"
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