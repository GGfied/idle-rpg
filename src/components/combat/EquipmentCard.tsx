import React from 'react';
import { 
  Box, 
  VStack, 
  HStack, 
  Text, 
  Badge, 
  Button, 
  Tooltip 
} from '@chakra-ui/react';
import { LucideIcon } from 'lucide-react';

interface EquipmentUpgrade {
  name: string;
  bonus: number;
}

interface EquipmentCardProps {
  type: 'weapon' | 'armor';
  icon: LucideIcon;
  color: string;
  currentName: string;
  currentBonus: number;
  upgrades: EquipmentUpgrade[];
  onUpgrade: (name: string, bonus: number) => void;
  gold: number;
  costs: { [key: string]: number };
}

export function EquipmentCard({
  type,
  icon: Icon,
  color,
  currentName,
  currentBonus,
  upgrades,
  onUpgrade,
  gold,
  costs
}: EquipmentCardProps) {
  const statType = type === 'weapon' ? 'Attack' : 'Defense';

  return (
    <Box 
      height="full"
      p={4} 
      borderRadius="xl" 
      bg="white"
      borderWidth="1px"
      borderColor={`${color}.200`}
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
        bg={`${color}.50`}
        opacity={0.5}
        style={{
          backgroundImage: `url('data:image/svg+xml,%3Csvg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="%23${color === 'orange' ? 'ED8936' : '4299E1'}" fill-opacity="0.1" fill-rule="evenodd"%3E%3Ccircle cx="3" cy="3" r="3"/%3E%3Ccircle cx="13" cy="13" r="3"/%3E%3C/g%3E%3C/svg%3E')`
        }}
      />
      <HStack spacing={3} mb={4}>
        <Box p={2} bg={`${color}.100`} borderRadius="md">
          <Icon className={`h-5 w-5 text-${color}-600`} />
        </Box>
        <VStack align="start" spacing={0}>
          <Text fontWeight="bold" color={`${color}.800`}>
            {currentName}
          </Text>
          <Badge colorScheme={color}>
            +{currentBonus} {statType}
          </Badge>
        </VStack>
      </HStack>
      <VStack spacing={2} align="stretch">
        {upgrades.map(({ name, bonus }) => {
          const isOwned = currentName === name;
          const cost = costs[name];
          const canAfford = gold >= cost;
          
          return (
            <Tooltip 
              key={name}
              label={isOwned ? 'Already equipped' : 
                     !canAfford ? 'Not enough gold' :
                     `Cost: ${cost} gold | +${bonus} ${statType}`}
              placement="top"
            >
              <Button 
                size="sm"
                onClick={() => onUpgrade(name, bonus)}
                isDisabled={isOwned || !canAfford}
                colorScheme={color}
                variant={isOwned ? 'solid' : 'outline'}
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