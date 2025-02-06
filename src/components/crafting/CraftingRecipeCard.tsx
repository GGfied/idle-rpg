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
import { AlertCircle } from 'lucide-react';
import { CraftingRecipe } from '@/types/crafting';
import { GameState } from '@/types/gameState';
import { Skills } from '@/types/skills';
import { ITEM_CONFIG } from '@/constants/itemConstants';
import { BaseInventory } from '@/types';

interface CraftingRecipeCardProps {
  recipe: CraftingRecipe;
  state: GameState;
  onCraft: () => void;
  checkRequirements: (recipe: CraftingRecipe, state: GameState) => {
    canCraft: boolean;
    missingRequirements: string[];
  };
  color?: string;
}

export function CraftingRecipeCard({
  recipe,
  state,
  onCraft,
  checkRequirements,
  color
}: CraftingRecipeCardProps) {
  const { canCraft, missingRequirements } = checkRequirements(recipe, state);
  const isCrafting = state.crafting.currentlyCrafting === recipe.id;

  // Use item config color if not provided
  const cardColor = color || 
    (ITEM_CONFIG[recipe.id as keyof typeof ITEM_CONFIG]?.color || 'purple');

  return (
    <Box
      p={4}
      borderRadius="lg"
      bg="white"
      borderWidth="1px"
      borderColor={`${cardColor}.200`}
      boxShadow={isCrafting ? "md" : "sm"}
      position="relative"
      transition="all 0.2s"
      _hover={{ transform: 'scale(1.02)', boxShadow: 'md' }}
    >
      <VStack align="stretch" spacing={3}>
        <HStack justify="space-between">
          <Text fontWeight="bold" fontSize="lg">{recipe.name}</Text>
          <Badge colorScheme={cardColor}>
            {recipe.category.charAt(0).toUpperCase() + recipe.category.slice(1)}
          </Badge>
        </HStack>

        <Text fontSize="sm" color="gray.600">{recipe.description}</Text>

        <VStack align="start" spacing={1}>
          <Text fontWeight="semibold" fontSize="sm">Required Materials:</Text>
          {Object.entries(recipe.materials).map(([material, amount]) => (
            <HStack key={material} spacing={2} width="full" justify="space-between">
              <Text fontSize="sm">
                {amount}x {material.charAt(0).toUpperCase() + material.slice(1)}
              </Text>
              <Badge 
                colorScheme={
                  (state.inventory[material as keyof BaseInventory] || 
                   (state.inventory.materials && state.inventory.materials[material]) || 0) >= amount 
                    ? "green" 
                    : "red"
                }
              >
                {(state.inventory[material as keyof BaseInventory] || 
                  (state.inventory.materials && state.inventory.materials[material]) || 0)} 
                owned
              </Badge>
            </HStack>
          ))}
        </VStack>

        <VStack align="start" spacing={1}>
          <Text fontWeight="semibold" fontSize="sm">Required Skills:</Text>
          {Object.entries(recipe.skillRequirements).map(([skill, level]) => {
            const skillType = skill as keyof Skills;
            return (
            <HStack key={skill} spacing={2} width="full" justify="space-between">
              <Text fontSize="sm">
                {skill.charAt(0).toUpperCase() + skill.slice(1)} Level {level}
              </Text>
              <Badge 
                colorScheme={state.skills[skillType].level >= level ? "green" : "red"}
              >
                Current: {state.skills[skillType].level}
              </Badge>
            </HStack>
            );
          })}
        </VStack>

        <Tooltip
          label={!canCraft ? `Missing: ${missingRequirements.join(", ")}` : "Start crafting"}
          placement="top"
        >
          <Button
            onClick={onCraft}
            isDisabled={!canCraft || isCrafting}
            colorScheme={cardColor}
            size="sm"
            width="full"
            leftIcon={<AlertCircle className="h-4 w-4" />}
          >
            {isCrafting ? "Crafting..." : "Craft"}
          </Button>
        </Tooltip>
      </VStack>
    </Box>
  );
}