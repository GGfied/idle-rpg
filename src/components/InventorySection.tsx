import React from 'react';
import { 
  Button, 
  VStack, 
  HStack, 
  Text, 
  Box, 
  Badge,
  Divider,
  Tooltip
} from '@chakra-ui/react';
import { 
  Trees, 
  Pickaxe, 
  Fish, 
  Leaf, 
  Flame,
  Backpack,
  Coins
} from 'lucide-react';
import { BaseInventory, Inventory } from '@/types/inventory';
import { SectionHeader } from './SectionHeader';
import { RESOURCE_PRICES } from '@/constants/gameConstants';
import { ITEM_CONFIG } from '@/constants/itemConstants';

interface InventorySectionProps {
  inventory: Inventory;
  sellResources: (resource: keyof BaseInventory) => void;
  sellMaterial: (material: string) => void;
}

export function InventorySection({ 
  inventory, 
  sellResources,
  sellMaterial
}: InventorySectionProps) {
  const baseResourceInfo = {
    wood: { icon: Trees, color: 'teal', label: 'Wood', price: RESOURCE_PRICES.wood },
    ore: { icon: Pickaxe, color: 'gray', label: 'Ore', price: RESOURCE_PRICES.ore },
    fish: { icon: Fish, color: 'blue', label: 'Fish', price: RESOURCE_PRICES.fish },
    herbs: { icon: Leaf, color: 'green', label: 'Herbs', price: RESOURCE_PRICES.herbs },
    potions: { icon: Flame, color: 'purple', label: 'Potions', price: RESOURCE_PRICES.potions }
  } as const;

  return (
    <VStack 
      spacing={4} 
      align="start" 
      width="full"
      bg="blue.50"
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
        background: "radial-gradient(circle at top right, rgba(66, 153, 225, 0.1), transparent 70%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
    >
      <SectionHeader title="Inventory" icon={Backpack} color="blue" />
      
      {/* Base Resources */}
      {Object.entries(baseResourceInfo).map(([resource, { icon: Icon, color, label, price }]) => {
        const amount = inventory[resource as keyof BaseInventory];
        const totalValue = amount * price;
        
        return (
          <Box 
            key={resource} 
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
          >
            <HStack justifyContent="space-between">
              <HStack spacing={3}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={`${color}.100`}
                >
                  <Icon className={`h-5 w-5 text-${color}-600`} />
                </Box>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" fontSize="lg">
                    {label}
                  </Text>
                  <HStack spacing={2}>
                    <Badge colorScheme={color} fontSize="sm">
                      {amount.toLocaleString()} in stock
                    </Badge>
                    <Badge colorScheme="yellow" fontSize="sm">
                      {price.toLocaleString()}g each
                    </Badge>
                  </HStack>
                </VStack>
              </HStack>
              <Tooltip 
                label={`Sell all for ${totalValue.toLocaleString()} gold`}
                isDisabled={amount === 0}
              >
                <Button 
                  onClick={() => sellResources(resource as keyof BaseInventory)}
                  isDisabled={amount === 0}
                  colorScheme={color}
                  size="sm"
                  variant="solid"
                  _hover={{ 
                    transform: 'scale(1.05)',
                  }}
                  transition="all 0.2s"
                  leftIcon={<Coins className="h-4 w-4" />}
                >
                  Sell All
                </Button>
              </Tooltip>
            </HStack>
          </Box>
        );
      })}

      {/* Divider for materials */}
      {Object.keys(inventory.materials || {}).length > 0 && (
        <>
          <Divider borderColor="blue.200" />
          <Text fontSize="lg" fontWeight="bold" color="blue.700">
            Crafted Items & Materials
          </Text>
        </>
      )}

      {/* Crafting Materials and Items */}
      {Object.entries(inventory.materials || {}).map(([materialId, amount]) => {
        const itemConfig = ITEM_CONFIG[materialId as keyof typeof ITEM_CONFIG] || {
          icon: ITEM_CONFIG.goblinHide.icon,
          color: 'purple',
          name: materialId.replace(/([A-Z])/g, ' $1').trim(),
          price: 50
        };
        
        const totalValue = amount * itemConfig.price;
        const Icon = itemConfig.icon;
        
        return (
          <Box 
            key={materialId} 
            width="100%"
            p={4}
            borderRadius="lg"
            boxShadow="md"
            transition="all 0.2s"
            _hover={{ 
              transform: 'scale(1.02)',
              boxShadow: 'lg'
            }}
            bg={`${itemConfig.color}.50`}
            borderWidth="1px"
            borderColor={`${itemConfig.color}.200`}
          >
            <HStack justifyContent="space-between">
              <HStack spacing={3}>
                <Box
                  p={2}
                  borderRadius="md"
                  bg={`${itemConfig.color}.100`}
                >
                  <Icon className={`h-5 w-5 text-${itemConfig.color}-600`} />
                </Box>
                <VStack align="start" spacing={0}>
                  <Text fontWeight="bold" fontSize="lg">
                    {itemConfig.name}
                  </Text>
                  <HStack spacing={2}>
                    <Badge colorScheme={itemConfig.color} fontSize="sm">
                      {amount.toLocaleString()} in stock
                    </Badge>
                    <Badge colorScheme="yellow" fontSize="sm">
                      {itemConfig.price.toLocaleString()}g each
                    </Badge>
                  </HStack>
                </VStack>
              </HStack>
              <Tooltip 
                label={`Sell all for ${totalValue.toLocaleString()} gold`}
                isDisabled={amount === 0}
              >
                <Button
                  onClick={() => sellMaterial(materialId)}
                  isDisabled={amount === 0}
                  colorScheme={itemConfig.color}
                  size="sm"
                  leftIcon={<Coins className="h-4 w-4" />}
                >
                  Sell All
                </Button>
              </Tooltip>
            </HStack>
          </Box>
        );
      })}
    </VStack>
  );
}