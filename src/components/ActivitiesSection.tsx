import React from 'react';
import { 
  VStack, 
  Text, 
  HStack, 
  Box,
  Badge,
  Button
} from '@chakra-ui/react';
import { 
  Trees, 
  Pickaxe, 
  Fish, 
  Leaf, 
  Flame,
  Lock,
  Activity,
  StopCircle
} from 'lucide-react';
import { GameState } from '@/types/gameState';
import { ResourceGain } from '@/types/inventory';
import { Skills } from '@/types/skills';
import { SectionHeader } from './SectionHeader';

interface ActivitiesSectionProps {
  state: GameState;
  resourceGains: ResourceGain[];
  startActivity: (activity: string) => void;
  stopActivity: () => void;
}

export function ActivitiesSection({ 
  state, 
  resourceGains, 
  startActivity,
  stopActivity 
}: ActivitiesSectionProps) {
  const activities = [
    { activity: 'wood', icon: Trees, skillType: 'Woodcutting', color: 'teal' },
    { activity: 'ore', icon: Pickaxe, skillType: 'Mining', color: 'gray' },
    { activity: 'fish', icon: Fish, skillType: 'Fishing', color: 'blue' },
    { activity: 'herbs', icon: Leaf, skillType: 'Herbalism', color: 'green' },
    { activity: 'potions', icon: Flame, skillType: 'Alchemy', color: 'purple' }
  ];

  return (
    <VStack 
      spacing={4} 
      align="start" 
      width="full" 
      bg="orange.50" 
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
        background: "linear-gradient(135deg, rgba(251, 146, 60, 0.15), transparent 50%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
      borderWidth="1px"
      borderColor="orange.200"
    >
      <SectionHeader title="Activities" icon={Activity} color="orange" />

      {state.currentActivity && (
        <Button
          leftIcon={<StopCircle className="h-5 w-5" />}
          onClick={stopActivity}
          colorScheme="red"
          size="md"
          width="full"
          variant="solid"
          _hover={{ transform: 'scale(1.02)' }}
          transition="all 0.2s"
        >
          Stop Current Activity
        </Button>
      )}
      
      {activities.map(({ activity, icon: Icon, skillType, color }) => {
        const requirements = state.skillRequirements[skillType.toLowerCase()];
        let requirementsMet = true;
        let requirementText = '';
        
        if (requirements) {
          for (const [reqSkill, reqLevel] of Object.entries(requirements)) {
            if (state.skills[reqSkill as keyof Skills].level < reqLevel) {
              requirementsMet = false;
              requirementText = `Requires ${reqSkill} level ${reqLevel}`;
            }
          }
        }

        const isActive = state.currentActivity === activity;
        const currentSkill = state.skills[skillType.toLowerCase() as keyof Skills];

        return (
          <Box 
            key={activity}
            width="100%"
            p={4}
            borderRadius="xl"
            boxShadow={isActive ? 'lg' : 'md'}
            transition="all 0.2s"
            cursor={requirementsMet && !isActive ? 'pointer' : 'not-allowed'}
            onClick={() => requirementsMet && !isActive && startActivity(activity)}
            _hover={requirementsMet && !isActive ? { 
              transform: 'scale(1.02)',
              boxShadow: 'xl',
              bg: `${color}.100`
            } : undefined}
            bg={isActive ? `${color}.100` : 'white'}
            borderWidth="1px"
            borderColor={isActive ? `${color}.300` : `${color}.200`}
            position="relative"
            opacity={isActive ? 1 : (requirementsMet ? 1 : 0.7)}
          >
            <HStack justifyContent="space-between">
              <HStack spacing={3}>
                <Box
                  p={2}
                  borderRadius="lg"
                  bg={isActive ? `${color}.200` : `${color}.50`}
                  className={isActive ? 'animate-bounce' : ''}
                  transition="all 0.2s"
                >
                  <Icon className={`h-5 w-5 ${isActive ? `text-${color}-700` : `text-${color}-600`}`} />
                </Box>
                <VStack align="start" spacing={0}>
                  <Text 
                    fontWeight="bold" 
                    fontSize="lg"
                    color={requirementsMet ? (isActive ? `${color}.900` : `${color}.800`) : 'gray.400'}
                  >
                    {skillType}
                  </Text>
                  <Badge 
                    colorScheme={color}
                    fontSize="sm"
                    bg={isActive ? `${color}.200` : `${color}.50`}
                    px={2}
                    py={0.5}
                    borderRadius="md"
                  >
                    Level {currentSkill.level}
                  </Badge>
                </VStack>
              </HStack>
              {!requirementsMet && (
                <HStack 
                  spacing={2} 
                  bg="red.50" 
                  p={2} 
                  borderRadius="lg"
                  borderWidth="1px"
                  borderColor="red.200"
                >
                  <Lock className="h-4 w-4 text-red-500" />
                  <Text fontSize="sm" color="red.500" fontWeight="medium">
                    {requirementText}
                  </Text>
                </HStack>
              )}
              {isActive && (
                <Badge 
                  colorScheme={color} 
                  variant="solid" 
                  px={3} 
                  py={1}
                  borderRadius="full"
                  boxShadow="sm"
                >
                  Active
                </Badge>
              )}
            </HStack>

            {resourceGains
              .filter(gain => gain.type === activity)
              .map(gain => (
                <Box
                  key={`${activity}-${gain.id}`}
                  position="absolute"
                  top="-1rem"
                  left="50%"
                  transform={`translateX(${gain.x}px)`}
                  color={`${color}.600`}
                  fontWeight="bold"
                  className="animate-float"
                >
                  <HStack spacing={1}>
                    <Icon className="h-4 w-4" />
                    <Text>+{gain.amount}</Text>
                  </HStack>
                </Box>
              ))}
          </Box>
        );
      })}
    </VStack>
  );
}