import React from 'react';
import { 
  Progress, 
  VStack, 
  HStack, 
  Text, 
  Box, 
  Badge 
} from '@chakra-ui/react';
import { 
  Trees, 
  Pickaxe, 
  Fish, 
  Leaf, 
  Flame,
  Swords,
  Hammer,
  Sparkles,
  Trophy,
  LucideIcon
} from 'lucide-react';
import { Skills } from '@/types/skills';
import { calculateXPForLevel } from '@/utils/gameUtils';
import { SectionHeader } from './SectionHeader';

interface SkillsSectionProps {
  skills: Skills;
}

interface SkillInfo {
  color: string;
  icon: LucideIcon;
  label?: string;
}

type SkillInfoMap = {
  [K in keyof Skills]: SkillInfo;
}

export function SkillsSection({ skills }: SkillsSectionProps) {
  const skillInfo: SkillInfoMap = {
    woodcutting: { color: 'teal', icon: Trees },
    mining: { color: 'gray', icon: Pickaxe },
    fishing: { color: 'blue', icon: Fish },
    herbalism: { color: 'green', icon: Leaf },
    alchemy: { color: 'purple', icon: Flame },
    combat: { color: 'red', icon: Swords },
    smithing: { color: 'orange', icon: Hammer },
    enchanting: { color: 'pink', icon: Sparkles }
  };

  return (
    <VStack 
      spacing={4} 
      align="start" 
      width="full"
      bg="green.50"
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
        background: "linear-gradient(45deg, rgba(72, 187, 120, 0.1), transparent 70%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
    >
      <SectionHeader title="Skills" icon={Trophy} color="green" />
      
      {Object.entries(skills).map(([skill, { level, xp }]) => {
        const { color, icon: Icon } = skillInfo[skill as keyof Skills];
        const xpForNextLevel = calculateXPForLevel(level);

        return (
          <Box 
            key={skill} 
            width="100%"
            p={4}
            borderRadius="lg"
            boxShadow="md"
            transition="all 0.2s"
            _hover={{ 
              transform: 'scale(1.02)',
              boxShadow: 'lg'
            }}
            bg={`${color}.50`}
            borderWidth="1px"
            borderColor={`${color}.200`}
            position="relative"
          >
            <HStack justifyContent="space-between" mb={3}>
              <HStack spacing={3}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={`${color}.100`}
                  className="animate-pulse"
                >
                  <Icon className={`h-5 w-5 text-${color}-600`} />
                </Box>
                <Text 
                  fontWeight="bold" 
                  textTransform="capitalize"
                  fontSize="lg"
                  color={`${color}.800`}
                >
                  {skill}
                </Text>
                <Badge 
                  bg={`${color}.100`}
                  color={`${color}.800`}
                  borderRadius="full" 
                  px={3} 
                  py={1}
                  fontSize="sm"
                  boxShadow="sm"
                >
                  Level {level}
                </Badge>
              </HStack>
              <Text 
                fontSize="sm" 
                color={`${color}.700`} 
                fontWeight="medium"
                bg={`${color}.100`}
                px={3}
                py={1}
                borderRadius="md"
              >
                {xp.toLocaleString()} / {xpForNextLevel.toLocaleString()} XP
              </Text>
            </HStack>
            <Box
              position="relative"
              borderRadius="full"
              bg={`${color}.100`}
              p={1}
              boxShadow="inner"
            >
              <Progress 
                value={(xp / xpForNextLevel) * 100} 
                height="6px"
                borderRadius="full"
                colorScheme={color}
                bg="transparent"
                hasStripe
                isAnimated
                sx={{
                  '& > div': {
                    transition: 'all 0.3s ease-in-out'
                  }
                }}
              />
            </Box>
            {/* Level up flash effect */}
            {xp >= xpForNextLevel && (
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                borderRadius="lg"
                bg={`${color}.200`}
                opacity={0.5}
                animation="pulse 1s infinite"
                pointerEvents="none"
              />
            )}
          </Box>
        );
      })}
    </VStack>
  );
}