import React from 'react';
import { 
  Box, 
  VStack, 
  HStack, 
  Text, 
  Badge, 
  Progress 
} from '@chakra-ui/react';
import { Skull, Sword, Shield } from 'lucide-react';
import { Enemy } from '@/types/combat';

interface EnemyCardProps {
  enemy: Enemy;
}

export function EnemyCard({ enemy }: EnemyCardProps) {
  return (
    <Box 
      bg="white" 
      p={6} 
      borderRadius="xl" 
      width="full"
      borderWidth="1px"
      borderColor="red.200"
      boxShadow="lg"
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top={0}
        right={0}
        bottom={0}
        left={0}
        bg="red.50"
        opacity={0.5}
        style={{
          backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"%23FF0000\" fill-opacity=\"0.1\" fill-rule=\"evenodd\"%3E%3Ccircle cx=\"3\" cy=\"3\" r=\"3\"/%3E%3Ccircle cx=\"13\" cy=\"13\" r=\"3\"/%3E%3C/g%3E%3C/svg%3E')"
        }}
      />
      <VStack spacing={4}>
        <HStack justifyContent="space-between" width="full">
          <HStack spacing={3}>
            <Box p={3} bg="red.100" borderRadius="lg">
              <Skull className="h-6 w-6 text-red-600 animate-pulse" />
            </Box>
            <VStack align="start" spacing={0}>
              <Text fontSize="2xl" fontWeight="bold" color="red.700">
                {enemy.name}
              </Text>
              <HStack spacing={4}>
                <HStack spacing={1}>
                  <Sword className="h-4 w-4 text-orange-600" />
                  <Text fontSize="sm" color="orange.600">
                    {enemy.attack}
                  </Text>
                </HStack>
                <HStack spacing={1}>
                  <Shield className="h-4 w-4 text-blue-600" />
                  <Text fontSize="sm" color="blue.600">
                    {enemy.defense}
                  </Text>
                </HStack>
              </HStack>
            </VStack>
          </HStack>
          <VStack align="end" spacing={1}>
            <Badge 
              colorScheme="red" 
              fontSize="md" 
              px={3} 
              py={1}
              borderRadius="full"
            >
              {enemy.currentHealth} / {enemy.maxHealth} HP
            </Badge>
            <HStack spacing={2}>
              <Text fontSize="sm" color="purple.600">XP: {enemy.xpReward}</Text>
              <Text fontSize="sm" color="yellow.600">Gold: {enemy.goldReward}</Text>
            </HStack>
          </VStack>
        </HStack>

        <Box width="full" position="relative">
          <Progress 
            value={(enemy.currentHealth / enemy.maxHealth) * 100} 
            height="8px"
            borderRadius="full"
            colorScheme="red"
            bg="red.100"
            hasStripe
            isAnimated
            sx={{
              '& > div': {
                transition: 'all 0.3s ease-in-out'
              }
            }}
          />
        </Box>
      </VStack>
    </Box>
  );
}