import React from 'react';
import {
  VStack,
  HStack,
  Text,
  Box,
  Badge,
  SimpleGrid,
  Tooltip
} from '@chakra-ui/react';
import { Package } from 'lucide-react';
import { GameState } from '@/types/gameState';
import { SectionHeader } from '@/components/SectionHeader';
import { ITEM_CONFIG } from '@/constants/itemConstants';

interface CraftedItemsSectionProps {
  state: GameState;
}

export function CraftedItemsSection({ state }: CraftedItemsSectionProps) {
  return (
    <VStack
      spacing={4}
      align="start"
      width="full"
      bg="cyan.50"
      p={6}
      borderRadius="2xl"
      boxShadow="xl"
      position="relative"
      _before={{
        content: '""',
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        background: "linear-gradient(135deg, rgba(6, 182, 212, 0.1), transparent 70%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
    >
      <SectionHeader title="Crafted Items" icon={Package} color="cyan" />

      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} width="full">
        {/* Crafted Materials */}
        {Object.entries(state.inventory.materials || {}).map(([materialId, amount]) => {
          const itemConfig = ITEM_CONFIG[materialId as keyof typeof ITEM_CONFIG] || {
            icon: ITEM_CONFIG.goblinHide.icon,
            color: 'purple',
            name: materialId.replace(/([A-Z])/g, ' $1').trim(),
            type: 'material'
          };
          
          const Icon = itemConfig.icon;

          return (
            <Tooltip
              key={materialId}
              label={`Type: ${itemConfig.type}`}
              placement="top"
            >
              <Box
                p={4}
                borderRadius="lg"
                bg="white"
                borderWidth="1px"
                borderColor={`${itemConfig.color}.200`}
                transition="all 0.2s"
                _hover={{ transform: 'scale(1.02)', boxShadow: 'md' }}
              >
                <HStack spacing={3}>
                  <Box p={2} bg={`${itemConfig.color}.100`} borderRadius="md">
                    <Icon className={`h-5 w-5 text-${itemConfig.color}-600`} />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text fontWeight="bold" color={`${itemConfig.color}.800`}>
                      {itemConfig.name}
                    </Text>
                    <Badge colorScheme={itemConfig.color}>
                      {amount} Available
                    </Badge>
                  </VStack>
                </HStack>
              </Box>
            </Tooltip>
          );
        })}
      </SimpleGrid>
    </VStack>
  );
}