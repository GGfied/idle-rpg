import React from 'react';
import { 
  VStack, 
  HStack, 
  Text, 
  Box,
  Badge,
  Tooltip
} from '@chakra-ui/react';
import { StarIcon } from '@chakra-ui/icons';
import { 
  Trees, 
  Pickaxe, 
  Fish,
  Coins,
  Zap
} from 'lucide-react';
import { Upgrades } from '@/types/skills';
import { GameState } from '@/types/gameState';
import { SectionHeader } from './SectionHeader';

interface UpgradesSectionProps {
  state: GameState;
  buyUpgrade: (upgrade: keyof Upgrades) => void;
}

export function UpgradesSection({ 
  state, 
  buyUpgrade 
}: UpgradesSectionProps) {
  const upgrades = [
    { 
      key: 'betterAxe' as keyof Upgrades, 
      icon: Trees, 
      label: 'Better Axe',
      color: 'teal',
      description: 'Increases woodcutting efficiency'
    },
    { 
      key: 'steelPickaxe' as keyof Upgrades, 
      icon: Pickaxe, 
      label: 'Steel Pickaxe',
      color: 'gray',
      description: 'Increases mining efficiency'
    },
    { 
      key: 'fishingNet' as keyof Upgrades, 
      icon: Fish, 
      label: 'Fishing Net',
      color: 'blue',
      description: 'Increases fishing efficiency'
    }
  ];

  const maxLevel = 5;

  return (
    <VStack 
      spacing={4} 
      align="start" 
      width="full"
      bg="purple.50"
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
        background: "linear-gradient(135deg, rgba(159, 122, 234, 0.1), transparent 60%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
    >
      <SectionHeader title="Upgrades" icon={Zap} color="purple" />
      
      {upgrades.map(({ key, icon: Icon, label, color, description }) => {
        const currentLevel = state.upgrades[key];
        const cost = state.upgradesCost[key](currentLevel);
        const canAfford = state.gold >= cost;
        const isMaxLevel = currentLevel >= maxLevel;

        return (
          <Box 
            key={key}
            width="100%"
            p={4}
            borderRadius="lg"
            boxShadow="md"
            transition="all 0.2s"
            cursor={!isMaxLevel && canAfford ? 'pointer' : 'not-allowed'}
            onClick={() => !isMaxLevel && canAfford && buyUpgrade(key)}
            _hover={!isMaxLevel && canAfford ? { 
              transform: 'scale(1.02)',
              boxShadow: 'lg'
            } : undefined}
            bg={currentLevel > 0 ? `${color}.100` : `${color}.50`}
            borderWidth="1px"
            borderColor={`${color}.200`}
            opacity={isMaxLevel ? 0.7 : 1}
            position="relative"
          >
            <VStack align="stretch" spacing={3}>
              <HStack justifyContent="space-between">
                <HStack spacing={3}>
                  <Box
                    p={2}
                    borderRadius="md"
                    bg={`${color}.100`}
                    className={currentLevel > 0 ? 'animate-pulse' : ''}
                  >
                    <Icon className={`h-5 w-5 text-${color}-600`} />
                  </Box>
                  <VStack align="start" spacing={0}>
                    <Text 
                      fontWeight="bold" 
                      fontSize="lg"
                      color={`${color}.800`}
                    >
                      {label}
                    </Text>
                    <Text 
                      fontSize="sm" 
                      color={`${color}.600`}
                    >
                      {description}
                    </Text>
                  </VStack>
                </HStack>
                {!isMaxLevel && (
                  <HStack 
                    spacing={2} 
                    bg={canAfford ? 'green.100' : 'red.100'} 
                    p={2} 
                    borderRadius="md"
                    boxShadow="sm"
                  >
                    <Coins className={`h-4 w-4 ${canAfford ? 'text-green-600' : 'text-red-600'}`} />
                    <Text 
                      fontSize="sm" 
                      fontWeight="bold"
                      color={canAfford ? 'green.600' : 'red.600'}
                    >
                      {cost}g
                    </Text>
                  </HStack>
                )}
                {isMaxLevel && (
                  <Badge 
                    colorScheme="purple" 
                    px={3} 
                    py={1} 
                    borderRadius="full"
                    boxShadow="sm"
                  >
                    MAX LEVEL
                  </Badge>
                )}
              </HStack>

              <HStack spacing={1} justify="center">
                {[...Array(maxLevel)].map((_, i) => (
                  <Tooltip 
                    key={i} 
                    label={`Level ${i + 1}`} 
                    placement="top"
                  >
                    <Box>
                      <StarIcon
                        boxSize={6}
                        color={i < currentLevel ? `${color}.500` : 'gray.300'}
                        fill={i < currentLevel ? `${color}.500` : 'none'}
                        transition="all 0.2s"
                        _hover={{
                          transform: 'scale(1.1)'
                        }}
                      />
                    </Box>
                  </Tooltip>
                ))}
              </HStack>
            </VStack>
          </Box>
        );
      })}
    </VStack>
  );
}