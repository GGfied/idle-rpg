import React, { useState, useCallback, useRef } from 'react';
import { 
  Card, 
  CardBody, 
  VStack, 
  HStack, 
  Heading, 
  Text, 
  Grid, 
  GridItem, 
  Box,
  Spacer,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
  Tooltip,
  Button,
  useDisclosure,
  AlertDialog,
  AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogContent,
  AlertDialogOverlay,
} from '@chakra-ui/react';
import { Coins, Volume2, VolumeX, RotateCcw } from 'lucide-react';

import { useGameLogic } from './hooks/useGameLogic';
import { ENEMIES } from './constants/gameConstants';

import { ActivitiesSection } from './components/ActivitiesSection';
import { UpgradesSection } from './components/UpgradesSection';
import { InventorySection } from './components/InventorySection';
import { SkillsSection } from './components/SkillsSection';
import { CombatSection } from './components/combat/CombatSection';
import { CraftingSection } from './components/crafting/CraftingSection';
import { CraftedItemsSection } from './components/crafting/CraftedItemsSection';

export default function IdleRPG() {
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const gameLogic = useGameLogic(ENEMIES);

  const handleVolumeChange = useCallback((value: number) => {
    setVolume(value);
    gameLogic.setVolume(value / 100);
  }, [gameLogic]);

  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuteState = !prev;
      gameLogic.toggleMute();
      return newMuteState;
    });
  }, [gameLogic]);

  const handleResetGame = useCallback(() => {
    gameLogic.clearSavedGame();
    onClose();
  }, [gameLogic, onClose]);

  return (
    <Box 
      minHeight="100vh" 
      width="100%" 
      bg="gray.100" 
      p={4}
      position="relative"
    >
      <Card 
        maxW="1400px"
        mx="auto"
        bg="white" 
        borderRadius="2xl"
        boxShadow="2xl"
        overflow="visible"
      >
        <CardBody p={8}>
          <VStack spacing={8} align="start" width="full">
            {/* Sticky Header */}
            <Box 
              ref={headerRef}
              position="sticky" 
              top={0} 
              zIndex={1000}
              bg="white" 
              pb={6}
              width="full"
              borderBottom="2px solid"
              borderColor="gray.100"
              style={{
                position: '-webkit-sticky',
                backdropFilter: 'blur(8px)',
              }}
            >
              <HStack width="full" spacing={4}>
                <Heading
                  bgGradient="linear(to-r, red.600, purple.600)"
                  bgClip="text"
                  fontSize="4xl"
                  fontWeight="extrabold"
                >
                  Idle RPG
                </Heading>
                <Spacer />
                
                {/* Sound Controls */}
                <HStack spacing={3}>
                  <Tooltip 
                    label={isMuted ? "Unmute" : "Mute"} 
                    placement="top"
                  >
                    <Button 
                      onClick={handleToggleMute} 
                      variant="ghost"
                      size="sm"
                    >
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </Button>
                  </Tooltip>
                  
                  <Box width="150px">
                    <Slider 
                      value={volume}
                      onChange={handleVolumeChange}
                      isDisabled={isMuted}
                    >
                      <SliderTrack>
                        <SliderFilledTrack bg="purple.400" />
                      </SliderTrack>
                      <SliderThumb boxSize={4} bg="purple.600" />
                    </Slider>
                  </Box>
                </HStack>

                {/* Reset Game Button */}
                <Tooltip label="Reset Game" placement="top">
                  <Button
                    onClick={onOpen}
                    colorScheme="red"
                    variant="ghost"
                    size="sm"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </Button>
                </Tooltip>

                {/* Gold Display */}
                <Box
                  bg="yellow.400"
                  p={3} 
                  borderRadius="xl" 
                  boxShadow="lg"
                  _hover={{
                    transform: 'translateY(-2px)',
                    boxShadow: 'xl'
                  }}
                  transition="all 0.2s"
                >
                  <HStack spacing={2}>
                    <Coins className="h-6 w-6 text-yellow-700" />
                    <Text 
                      fontSize="xl" 
                      fontWeight="bold" 
                      color="yellow.800"
                    >
                      {gameLogic.state.gold.toLocaleString()} Gold
                    </Text>
                  </HStack>
                </Box>
              </HStack>
            </Box>

            {/* Reset Game Alert Dialog */}
            <AlertDialog
              isOpen={isOpen}
              leastDestructiveRef={cancelRef}
              onClose={onClose}
            >
              <AlertDialogOverlay>
                <AlertDialogContent>
                  <AlertDialogHeader fontSize="lg" fontWeight="bold">
                    Reset Game
                  </AlertDialogHeader>

                  <AlertDialogBody>
                    Are you sure? This will reset all your progress and cannot be undone.
                  </AlertDialogBody>

                  <AlertDialogFooter>
                    <Button ref={cancelRef} onClick={onClose}>
                      Cancel
                    </Button>
                    <Button colorScheme="red" onClick={handleResetGame} ml={3}>
                      Reset Game
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialogOverlay>
            </AlertDialog>

            {/* Main Game Grid */}
            <Grid 
              templateColumns={{ base: "1fr", lg: "repeat(2, 1fr)" }} 
              gap={8}
              width="full"
            >
              {/* Left Column */}
              <GridItem>
                <VStack spacing={6} align="start" width="full">
                  <ActivitiesSection 
                    state={gameLogic.state} 
                    resourceGains={gameLogic.resourceGains}
                    startActivity={gameLogic.startActivity}
                    stopActivity={gameLogic.stopActivity}
                  />
                  <InventorySection 
                    inventory={gameLogic.state.inventory}
                    sellResources={gameLogic.sellResources}
                    sellMaterial={gameLogic.sellMaterial}
                  />
                  <UpgradesSection 
                    state={gameLogic.state}
                    buyUpgrade={gameLogic.buyUpgrade}
                  />
                  <CraftingSection 
                    state={gameLogic.state}
                    startCrafting={gameLogic.startCrafting}
                    checkRecipeRequirements={gameLogic.checkRecipeRequirements}
                  />
                </VStack>
              </GridItem>

              {/* Right Column */}
              <GridItem>
                <VStack spacing={6} align="start" width="full">
                  <SkillsSection 
                    skills={gameLogic.state.skills}
                  />
                  <CombatSection 
                    state={gameLogic.state}
                    startCombat={gameLogic.startCombat}
                    performAttack={gameLogic.performAttack}
                    buyEquipment={gameLogic.buyEquipment}
                  />
                  <CraftedItemsSection 
                    state={gameLogic.state}
                  />
                </VStack>
              </GridItem>
            </Grid>
          </VStack>
        </CardBody>
      </Card>
    </Box>
  );
}