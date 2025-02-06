import React from 'react';
import {
  VStack, 
  HStack, 
  Box,
  Text,
  Progress,
  Grid,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  useToast,
  Badge
} from '@chakra-ui/react';
import { 
  Hammer,
  FlaskConical,
  Sparkles
} from 'lucide-react';
import { CraftingRecipe } from '@/types/crafting';
import { GameState } from '@/types/gameState';
import { CRAFTING_CATEGORIES, CRAFTING_RECIPES } from '@/constants/craftingConstants';
import { ITEM_CONFIG } from '@/constants/itemConstants';
import { SectionHeader } from '@/components/SectionHeader';
import { CraftingRecipeCard } from '@/components/crafting/CraftingRecipeCard';

interface CraftingSectionProps {
    state: GameState;
    startCrafting: (recipeId: string) => void;
    checkRecipeRequirements: (recipe: CraftingRecipe, state: GameState) => {
        canCraft: boolean;
        missingRequirements: string[];
    };
}

export function CraftingSection({ 
    state, 
    startCrafting, 
    checkRecipeRequirements 
}: CraftingSectionProps) {
    const toast = useToast();

    const handleCraft = (recipe: CraftingRecipe) => {
        const { canCraft, missingRequirements } = checkRecipeRequirements(recipe, state);
        
        if (canCraft) {
            startCrafting(recipe.id);
            toast({
                title: `Crafting ${recipe.name}`,
                description: "Crafting has begun. Check the progress below.",
                status: "success",
                duration: 3000,
                isClosable: true,
                position: "top-right"
            });
        } else {
            toast({
                title: "Cannot Craft",
                description: `Missing requirements: ${missingRequirements.join(", ")}`,
                status: "error",
                duration: 5000,
                isClosable: true,
                position: "top-right"
            });
        }
    };

    const getIconComponent = (iconName: string) => {
        switch (iconName) {
            case 'Hammer': return Hammer;
            case 'FlaskConical': return FlaskConical;
            case 'Sparkles': return Sparkles;
            default: return Hammer;
        }
    };

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
                background: "radial-gradient(circle at top right, rgba(159, 122, 234, 0.1), transparent 70%)",
                borderRadius: "2xl",
                pointerEvents: "none"
            }}
        >
            <SectionHeader title="Crafting" icon={Hammer} color="purple" />

            <Tabs width="full" colorScheme="purple" isLazy>
                <TabList>
                    {CRAFTING_CATEGORIES.map(category => {
                        const Icon = getIconComponent(category.icon);
                        return (
                            <Tab key={category.id}>
                                <HStack spacing={2}>
                                    <Icon className="h-4 w-4" />
                                    <Text>{category.name}</Text>
                                </HStack>
                            </Tab>
                        );
                    })}
                </TabList>

                <TabPanels>
                    {CRAFTING_CATEGORIES.map(category => (
                        <TabPanel key={category.id} px={0}>
                            <Grid 
                                templateColumns={{
                                    base: "1fr",
                                    md: "repeat(auto-fill, minmax(300px, 1fr))"
                                }}
                                gap={4}
                            >
                                {CRAFTING_RECIPES
                                    .filter(recipe => recipe.category === category.id)
                                    .map(recipe => {
                                        // Get item config for the recipe result
                                        const itemConfig = ITEM_CONFIG[recipe.id as keyof typeof ITEM_CONFIG] || {
                                            color: 'purple',
                                            type: recipe.result.type
                                        };

                                        return (
                                            <CraftingRecipeCard
                                                key={recipe.id}
                                                recipe={recipe}
                                                state={state}
                                                onCraft={() => handleCraft(recipe)}
                                                checkRequirements={checkRecipeRequirements}
                                                color={itemConfig.color}
                                            />
                                        );
                                    })}
                            </Grid>
                        </TabPanel>
                    ))}
                </TabPanels>
            </Tabs>

            {state.crafting.currentlyCrafting && (
                <Box
                    width="full"
                    p={4}
                    borderRadius="lg"
                    bg="white"
                    borderWidth="1px"
                    borderColor="purple.200"
                    boxShadow="sm"
                >
                    <VStack spacing={3}>
                        <HStack width="full" justify="space-between">
                            <Text fontWeight="bold" color="purple.700">
                                Currently Crafting: {
                                    CRAFTING_RECIPES.find(
                                        r => r.id === state.crafting.currentlyCrafting
                                    )?.name
                                }
                            </Text>
                            <Badge colorScheme="purple">
                                {Math.round(state.crafting.craftingProgress)}%
                            </Badge>
                        </HStack>
                        <Progress
                            value={state.crafting.craftingProgress}
                            width="full"
                            size="lg"
                            colorScheme="purple"
                            hasStripe
                            isAnimated
                            borderRadius="full"
                            bg="purple.100"
                            sx={{
                                '& > div': {
                                    transition: 'all 0.1s ease-in-out'
                                }
                            }}
                        />
                    </VStack>
                </Box>
            )}
        </VStack>
    );
}