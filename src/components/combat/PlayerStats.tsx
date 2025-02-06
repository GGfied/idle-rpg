import React from 'react';
import { Box, HStack, VStack, Text, Tooltip } from '@chakra-ui/react';
import { Heart, Sword, Shield } from 'lucide-react';
import { PlayerStats as PlayerStatsType, Equipment } from '@/types/combat';

interface PlayerStatsProps {
  stats: PlayerStatsType;
  equipment: Equipment;
}

export function PlayerStats({ stats, equipment }: PlayerStatsProps) {
  return (
    <Box 
      width="full" 
      bg="white" 
      p={4} 
      borderRadius="xl"
      boxShadow="md"
      borderWidth="1px"
      borderColor="red.200"
    >
      <HStack spacing={4} justify="space-between">
        <HStack spacing={3}>
          <Box p={2} bg="red.100" borderRadius="md">
            <Heart className="h-5 w-5 text-red-600" />
          </Box>
          <VStack align="start" spacing={0}>
            <Text fontSize="sm" color="gray.600">Your Health</Text>
            <Text fontSize="xl" fontWeight="bold" color="red.600">
              {stats.currentHealth} / {stats.maxHealth}
            </Text>
          </VStack>
        </HStack>
        <HStack spacing={4}>
          <Tooltip label="Attack Power" placement="top">
            <HStack spacing={2}>
              <Sword className="h-4 w-4 text-orange-600" />
              <Text fontWeight="bold" color="orange.600">
                {stats.attack + equipment.weapon.attackBonus}
              </Text>
            </HStack>
          </Tooltip>
          <Tooltip label="Defense" placement="top">
            <HStack spacing={2}>
              <Shield className="h-4 w-4 text-blue-600" />
              <Text fontWeight="bold" color="blue.600">
                {stats.defense + equipment.armor.defenseBonus}
              </Text>
            </HStack>
          </Tooltip>
        </HStack>
      </HStack>
    </Box>
  );
}