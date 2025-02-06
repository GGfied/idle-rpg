import React from 'react';
import { 
  VStack, 
  Heading, 
  Grid,
  GridItem
} from '@chakra-ui/react';
import { Swords } from 'lucide-react';
import { GameState } from '@/types/gameState';
import { EquipmentUpgrade } from '@/types/combat';
import { SectionHeader } from '@/components/SectionHeader';
import { ArmorCard } from '@/components/combat/ArmorCard';
import { BattleControls } from '@/components/combat/BattleControls';
import { BattleLog } from '@/components/combat/BattleLog';
import { EnemyCard } from '@/components/combat/EnemyCard';
import { PlayerStats } from '@/components/combat/PlayerStats';
import { WeaponCard } from '@/components/combat/WeaponCard';

interface CombatSectionProps {
  state: GameState;
  startCombat: () => void;
  performAttack: () => void;
  buyEquipment: (type: 'weapon' | 'armor', newEquipment: EquipmentUpgrade) => void;
}

export function CombatSection({ 
  state, 
  startCombat, 
  performAttack,
  buyEquipment 
}: CombatSectionProps) {
  const handleWeaponUpgrade = (name: string, attackBonus: number) => {
    buyEquipment('weapon', { name, attackBonus });
  };

  const handleArmorUpgrade = (name: string, defenseBonus: number) => {
    buyEquipment('armor', { name, defenseBonus });
  };

  return (
    <VStack 
      spacing={6} 
      align="start" 
      width="full"
      bg="red.50"
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
        background: "radial-gradient(circle at center, rgba(245, 101, 101, 0.1), transparent 70%)",
        borderRadius: "2xl",
        pointerEvents: "none"
      }}
      borderWidth="1px"
      borderColor="red.200"
    >
      <SectionHeader title="Combat" icon={Swords} color="red" />
      
      {/* Player Stats */}
      <PlayerStats 
        stats={state.playerStats}
        equipment={state.equipment}
      />

      {/* Combat Section */}
      {state.combat.isInCombat && state.combat.currentEnemy ? (
        <VStack spacing={4} width="full">
          <EnemyCard enemy={state.combat.currentEnemy} />
          <BattleControls
            isInCombat={true}
            onStartCombat={startCombat}
            onAttack={performAttack}
            combatLevel={state.skills.combat.level}
          />
          <BattleLog logs={state.combat.battleLog} />
        </VStack>
      ) : (
        <BattleControls
          isInCombat={false}
          onStartCombat={startCombat}
          onAttack={performAttack}
          combatLevel={state.skills.combat.level}
        />
      )}

      {/* Equipment Section */}
      <VStack spacing={4} align="start" width="full">
        <Heading size="md" color="red.700">Equipment</Heading>
        
        <Grid templateColumns="repeat(2, 1fr)" gap={4} width="full">
          {/* Weapons */}
          <GridItem>
            <WeaponCard
              currentWeapon={state.equipment.weapon.name}
              currentBonus={state.equipment.weapon.attackBonus}
              onUpgrade={handleWeaponUpgrade}
              gold={state.gold}
            />
          </GridItem>

          {/* Armor */}
          <GridItem>
            <ArmorCard
              currentArmor={state.equipment.armor.name}
              currentBonus={state.equipment.armor.defenseBonus}
              onUpgrade={handleArmorUpgrade}
              gold={state.gold}
            />
          </GridItem>
        </Grid>
      </VStack>
    </VStack>
  );
}